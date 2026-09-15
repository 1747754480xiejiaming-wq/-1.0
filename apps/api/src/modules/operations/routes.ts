import type { FastifyInstance } from 'fastify';
import { AppError } from '../../errors.js';
import { API_PREFIX, type RouteContext } from '../../http/context.js';
import { createGuards } from '../../http/guards.js';
import { BotControlError } from '../../services/bot-control.js';

export function registerOperationRoutes(app: FastifyInstance, context: RouteContext, phase:'public'|'internal'|'admin'|'openapi'|'all'='all') {
  const {config,store,models,botController,publicStatus,getBotState,setBotState}=context,{bot,admin,adminWrite}=createGuards(context),prefix=API_PREFIX;
  if(phase==='public'||phase==='all') {
  app.get(prefix+'/health/live',{config:{rateLimit:false}},async()=>({ok:true}));
  app.get(prefix+'/health/ready',{config:{rateLimit:false}},async()=>{try{store.sqlite.prepare('SELECT 1').get();return {ok:true};}catch{throw new AppError(503,'DATABASE_UNAVAILABLE','数据库尚未就绪。');}});
  app.get(prefix+'/status',async()=>publicStatus());
  }
  if(phase==='internal'||phase==='all') {
  app.post<{Body:{state:'connected'|'offline'}}>(prefix+'/internal/qq/heartbeat',{preHandler:bot,schema:{hide:true,body:{type:'object',additionalProperties:false,required:['state'],properties:{state:{enum:['connected','offline']}}}}},async req=>{setBotState({state:req.body.state,lastSeen:Date.now()});return {ok:true};});
  }
  if(phase==='admin'||phase==='all') {
  app.get(prefix+'/admin/status',{preHandler:admin,config:{rateLimit:{max:120,timeWindow:'1 minute'}},schema:{tags:['开发管理系统']}},async()=>{const botConfig=botController.status(),botState=getBotState();return {...store.stats(),...publicStatus(),modelDailyLimit:config.modelDailyLimit,botConfigured:!!config.botToken,botCredentialsConfigured:botConfig.appSecretConfigured,botProcessRunning:botConfig.processRunning,qqAnswerEnabled:botConfig.processRunning&&store.servicePreference('qq_answer_enabled'),botAppId:botConfig.appId,botState:botState?.state==='connected'&&Date.now()-botState.lastSeen<45000?'connected':'offline',botLastSeen:botState?.lastSeen||null};});
  app.get(prefix+'/admin/bot/config',{preHandler:admin,schema:{tags:['QQ']}},async()=>botController.status());
  app.post<{Body:{appId:string;appSecret?:string}}>(prefix+'/admin/bot/config',{
    preHandler:adminWrite,schema:{tags:['QQ'],body:{type:'object',additionalProperties:false,required:['appId'],properties:{appId:{type:'string',pattern:'^\\d{5,20}$'},appSecret:{type:'string',minLength:0,maxLength:200}}}},
  },async req=>{store.setBotWorkspace(store.currentWorkspace());const result=botController.save(req.body);if(!result.processRunning)setBotState(null);if(result.appSecretConfigured)try{await botController.start();}catch(error){app.log.warn({code:error instanceof BotControlError?error.code:'BOT_AUTO_START_FAILED'},'QQ 消息接收进程自动启动未完成');}return botController.status();});
  app.post(prefix+'/admin/bot/start',{preHandler:adminWrite,config:{rateLimit:{max:5,timeWindow:'1 minute'}},schema:{tags:['QQ']}},async()=>{store.setBotWorkspace(store.currentWorkspace());const result=await botController.start();store.setServicePreference('qq_auto_start',true);store.setServicePreference('qq_answer_enabled',true);return {...result,answeringEnabled:true,message:'已恢复回答，暂停期间收到的问题将按顺序补答。'};});
  app.post(prefix+'/admin/bot/stop',{preHandler:adminWrite,config:{rateLimit:{max:5,timeWindow:'1 minute'}},schema:{tags:['QQ']}},async()=>{let status=botController.status();if(!status.processRunning&&status.appSecretConfigured){await botController.start();status=botController.status();}store.setServicePreference('qq_auto_start',true);store.setServicePreference('qq_answer_enabled',false);return {ok:true,message:'已暂停回答，QQ 消息接收仍保持在线。',processRunning:status.processRunning,answeringEnabled:false};});
  }
  if(phase==='openapi'||phase==='all') {
  app.get(prefix+'/admin/openapi',{preHandler:admin,schema:{hide:true}},async()=>app.swagger());
  }
}
