import type { FastifyInstance } from 'fastify';
import type { AnswerInput, TextModelProvider } from '@campus/contracts';
import { ANSWER_INPUT_SCHEMA, ANSWER_RESPONSE_SCHEMA } from '@campus/contracts';
import { AppError } from '../../errors.js';
import { API_PREFIX, type RouteContext } from '../../http/context.js';
import { createGuards } from '../../http/guards.js';
import { partBuffer, safeName } from '../../services/uploads.js';

export function registerAnsweringRoutes(app: FastifyInstance, context: RouteContext, phase:'internal'|'admin'|'all'='all') {
  const {store,answers,models}=context,{bot,admin,adminWrite,developerWrite}=createGuards(context),prefix=API_PREFIX;
  if(phase==='internal'||phase==='all') {
  app.post<{Body:AnswerInput}>(prefix+'/internal/qq/answer',{bodyLimit:8500000,preHandler:bot,schema:{tags:['QQ'],body:ANSWER_INPUT_SCHEMA,response:{200:ANSWER_RESPONSE_SCHEMA}},config:{rateLimit:{max:120,timeWindow:'1 minute'}}},req=>answers.answer(req.body,'qq'));
  app.post(prefix+'/internal/qq/transcribe',{bodyLimit:27*1024*1024,preHandler:bot,config:{rateLimit:{max:60,timeWindow:'1 minute'}},schema:{hide:true}},async req=>{let audio:{buffer:Buffer;mime:string;name:string}|null=null;for await(const part of req.parts()){if(part.type!=='file'||part.fieldname!=='audio')continue;if(audio)throw new AppError(400,'AUDIO_LIMIT','每次只能识别一条语音。');audio={buffer:await partBuffer(part,25*1024*1024),mime:part.mimetype||'application/octet-stream',name:safeName(part.filename)};}if(!audio)throw new AppError(400,'EMPTY_AUDIO','没有收到语音文件。');return {text:await models.transcribeAudio(audio.buffer,audio.mime,audio.name)};});
  }
  if(phase==='admin'||phase==='all') {
  const providerParams={type:'object',required:['provider'],properties:{provider:{enum:['deepseek','zhipu']}}};
  app.get(prefix+'/admin/models',{preHandler:admin,config:{rateLimit:{max:120,timeWindow:'1 minute'}},schema:{tags:['模型']}},async()=>models.status());
  app.post<{Params:{provider:TextModelProvider};Body:{apiKey?:string}}>(prefix+'/admin/models/:provider/connect',{preHandler:developerWrite,config:{rateLimit:{max:5,timeWindow:'1 minute'}},schema:{tags:['模型'],params:providerParams,body:{type:'object',additionalProperties:false,properties:{apiKey:{type:'string',maxLength:512}}}}},async req=>{const result=await models.connect(req.params.provider,req.body.apiKey);store.setServicePreference(`${req.params.provider}_auto_start`,true);return result;});
  app.post<{Params:{provider:TextModelProvider}}>(prefix+'/admin/models/:provider/disconnect',{preHandler:developerWrite,schema:{tags:['模型'],params:providerParams}},async req=>{models.settings.connected(req.params.provider,false);store.setServicePreference(`${req.params.provider}_auto_start`,false);return models.status();});
  app.post<{Body:{provider:TextModelProvider}}>(prefix+'/admin/models/select',{preHandler:adminWrite,schema:{tags:['模型'],body:{type:'object',additionalProperties:false,required:['provider'],properties:{provider:{enum:['deepseek','zhipu']}}}}},async req=>{models.settings.select(req.body.provider);return models.status();});
  app.post<{Body:AnswerInput}>(prefix+'/admin/answer/test',{bodyLimit:8500000,preHandler:adminWrite,schema:{tags:['模型'],body:ANSWER_INPUT_SCHEMA,response:{200:ANSWER_RESPONSE_SCHEMA}}},req=>answers.answer(req.body,'web'));
  }
}
