import Fastify, { LogController } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import multipart from '@fastify/multipart';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, type Config } from './config.js';
import { Store, hash } from './db/store.js';
import { AppError } from './errors.js';
import { registerErrorHandlers } from './http/errors.js';
import type { CreateAppDependencies, RouteContext } from './http/context.js';
import { hashPassword } from './services/auth.js';
import { AnswerService } from './services/answer.js';
import { AnswerOptimizer } from './services/answer-optimizer.js';
import { BotControlError, LocalBotController } from './services/bot-control.js';
import { MaterialInboxService } from './services/materials.js';
import { Models } from './services/models.js';
import { QqGroups } from './services/qq-groups.js';
import { RagService } from './services/rag.js';
import { registerAuthRoutes } from './modules/auth/routes.js';
import { registerKnowledgeRoutes } from './modules/knowledge/routes.js';
import { registerAnsweringRoutes } from './modules/answering/routes.js';
import { registerConversationRoutes } from './modules/conversations/routes.js';
import { registerUnmatchedRoutes } from './modules/unmatched/routes.js';
import { registerNotificationRoutes } from './modules/notifications/routes.js';
import { registerOperationRoutes } from './modules/operations/routes.js';

export async function createApp(overrides:Partial<Config>={},dependencies:CreateAppDependencies={}) {
  const config=loadConfig(overrides),store=dependencies.store||new Store(config.dbPath,config.root);
  store.lockDeveloperAccess();
  if(config.developerPassword)await store.ensureDeveloper(config.developerUsername,await hashPassword(config.developerPassword));
  const app=Fastify({bodyLimit:32768,logger:config.logger,logController:new LogController({disableRequestLogging:true}),genReqId:()=>randomUUID(),trustProxy:['127.0.0.1','::1'],ajv:{customOptions:{removeAdditional:false,coerceTypes:'array',allErrors:false}}});
  app.decorateRequest('campusSession',undefined);
  app.decorateRequest('campusContext',undefined);
  await app.register(cookie);
  await app.register(multipart,{limits:{files:200,fileSize:25*1024*1024,parts:220},preservePath:true});
  await app.register(cors,{origin:(origin,cb)=>cb(null,!origin||config.origins.includes(origin)),credentials:true,methods:['GET','POST','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','X-CSRF-Token','Authorization']});
  await app.register(helmet);
  await app.register(rateLimit,{max:Math.max(120,config.rateLimit),timeWindow:'1 minute',keyGenerator:req=>hash(req.ip),errorResponseBuilder:()=>new AppError(429,'RATE_LIMITED','操作过于频繁，请稍后重试。')});
  await app.register(swagger,{openapi:{info:{title:'校园教务小助手 API',version:'1.0.0'},servers:[{url:'/'}]}});
  registerErrorHandlers(app);
  app.addHook('onResponse',async(req,reply)=>{req.log.info({requestId:req.id,method:req.method,route:req.routeOptions.url||'unknown',status:reply.statusCode,elapsedMs:Math.round(reply.elapsedTime)},'请求完成');});

  const models=new Models(config,config.dbPath===':memory:',dependencies.modelFetch||fetch,dependencies.select);
  if(config.dbPath!==':memory:')for(const provider of ['deepseek','zhipu'] as const)if(store.servicePreference(`${provider}_auto_start`)&&models.settings.read(provider).apiKey)models.settings.connected(provider,true);
  const answers=new AnswerService(store,config,dependencies.select,models),answerOptimizer=new AnswerOptimizer(models);
  const rag=new RagService(store,config,models);answers.rag=rag;
  const materials=new MaterialInboxService(store,models),materialDirectory=join(config.dataDir,'material-inbox');mkdirSync(materialDirectory,{recursive:true});
  const botController=dependencies.botController||new LocalBotController(config.root,config.botToken,config.dataDir,config.localDir);
  const qqGroups=new QqGroups(store,config.dataDir);
  let botState:{state:'connected'|'offline';lastSeen:number}|null=null;
  const context:RouteContext={
    app,config,store,answers,answerOptimizer,models,rag,materials,materialDirectory,botController,qqGroups,dependencies,
    publicStatus:()=>{const s=store.stats();return {activeFaqs:s.activeFaqs,demoMode:s.demoMode,modelConfigured:models.available(),mode:models.available()?'semantic':'faq',service:'校园教务小助手'};},
    getBotState:()=>botState,
    setBotState:state=>{botState=state;},
  };

  registerOperationRoutes(app,context,'public');
  registerAuthRoutes(app,context,'session');
  registerAnsweringRoutes(app,context,'internal');
  registerKnowledgeRoutes(app,context,'internal');
  registerOperationRoutes(app,context,'internal');
  registerUnmatchedRoutes(app,context,'offline');
  registerNotificationRoutes(app,context,'internal');
  registerUnmatchedRoutes(app,context,'replies');
  registerKnowledgeRoutes(app,context,'knowledge');
  registerConversationRoutes(app,context);
  registerUnmatchedRoutes(app,context,'admin');
  registerAuthRoutes(app,context,'admin');
  registerOperationRoutes(app,context,'admin');
  registerNotificationRoutes(app,context,'groups');
  registerKnowledgeRoutes(app,context,'materials');
  registerNotificationRoutes(app,context,'admin');
  registerAnsweringRoutes(app,context,'admin');
  registerOperationRoutes(app,context,'openapi');

  app.addHook('onClose',async()=>{models.close();if(!dependencies.store)store.close();});
  await app.ready();
  if(config.dbPath!==':memory:'&&!dependencies.botController&&botController.status().appSecretConfigured)void botController.start().catch(error=>app.log.warn({code:error instanceof BotControlError?error.code:'BOT_AUTO_START_FAILED'},'QQ 消息接收进程自动启动未完成'));
  return {app,store,answers,config,models};
}
