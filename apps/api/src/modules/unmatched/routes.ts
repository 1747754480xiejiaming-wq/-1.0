import type { FastifyInstance } from 'fastify';
import type { AnswerInput, FaqInput } from '@campus/contracts';
import { ANSWER_INPUT_SCHEMA, FAQ_INPUT_SCHEMA, PAGE_QUERY_SCHEMA } from '@campus/contracts';
import type { ListQuery } from '../../db/store.js';
import { API_PREFIX, ID_PARAMS_SCHEMA, type RouteContext } from '../../http/context.js';
import { createGuards } from '../../http/guards.js';

export function registerUnmatchedRoutes(app: FastifyInstance, context: RouteContext, phase:'offline'|'replies'|'admin'|'all'='all') {
  const {store}=context,{bot,admin,adminWrite}=createGuards(context),prefix=API_PREFIX;
  if(phase==='offline'||phase==='all') {
  app.get(prefix+'/internal/qq/offline/preferences',{preHandler:bot,schema:{hide:true}},async()=>store.unmatchedPreferences());
  app.post<{Body:{question:string;qqSender?:AnswerInput['qqSender']}}>(prefix+'/internal/qq/offline/questions',{preHandler:bot,schema:{hide:true,body:{type:'object',additionalProperties:false,required:['question'],properties:{question:{type:'string',minLength:1,maxLength:200},qqSender:ANSWER_INPUT_SCHEMA.properties.qqSender}}}},async(req,reply)=>{const result=store.recordOfflineQuestion(req.body.question,req.body.qqSender);reply.code(201);return result;});
  app.post<{Params:{id:string}}>(prefix+'/internal/qq/offline/questions/:id/complete',{preHandler:bot,schema:{hide:true,params:ID_PARAMS_SCHEMA}},async req=>store.completeOfflineQuestion(req.params.id));
  }
  if(phase==='replies'||phase==='all') {
  app.post<{Body:{limit?:number}}>(prefix+'/internal/qq/unmatched-replies/claim',{preHandler:bot,schema:{hide:true,body:{type:'object',additionalProperties:false,properties:{limit:{type:'integer',minimum:1,maximum:20,default:5}}}}},async req=>({items:store.claimUnmatchedReplies(req.body.limit)}));
  app.post<{Params:{id:string};Body:{claimToken:string}}>(prefix+'/internal/qq/unmatched-replies/:id/begin',{preHandler:bot,schema:{hide:true,params:ID_PARAMS_SCHEMA,body:{type:'object',additionalProperties:false,required:['claimToken'],properties:{claimToken:{type:'string',minLength:36,maxLength:36}}}}},async req=>store.beginUnmatchedReply(req.params.id,req.body.claimToken));
  app.post<{Params:{id:string};Body:{claimToken:string;status:'sent'|'failed';errorCode?:string;messageId?:string}}>(prefix+'/internal/qq/unmatched-replies/:id/result',{preHandler:bot,schema:{hide:true,params:ID_PARAMS_SCHEMA,body:{type:'object',additionalProperties:false,required:['claimToken','status'],properties:{claimToken:{type:'string',minLength:36,maxLength:36},status:{enum:['sent','failed']},errorCode:{type:'string',maxLength:120},messageId:{type:'string',minLength:1,maxLength:200}}}}},async req=>store.completeUnmatchedReply(req.params.id,req.body.claimToken,req.body.status,req.body.errorCode,req.body.messageId));
  }
  if(phase==='admin'||phase==='all') {
  app.get<{Querystring:ListQuery}>(prefix+'/unmatched',{preHandler:admin,schema:{tags:['未命中'],querystring:PAGE_QUERY_SCHEMA}},async req=>store.listUnmatched(req.query));
  app.get(prefix+'/unmatched/preferences',{preHandler:admin,schema:{tags:['未命中']}},async()=>store.unmatchedPreferences());
  app.patch<{Body:{offlineAutoReply:boolean}}>(prefix+'/unmatched/preferences',{preHandler:adminWrite,schema:{tags:['未命中'],body:{type:'object',additionalProperties:false,required:['offlineAutoReply'],properties:{offlineAutoReply:{type:'boolean'}}}}},async req=>store.setOfflineAutoReply(req.body.offlineAutoReply));
  app.patch<{Params:{id:string;senderId:string};Body:{name:string;qqNumber:string}}>(prefix+'/unmatched/:id/qq-students/:senderId',{preHandler:adminWrite,schema:{tags:['未命中'],params:{type:'object',additionalProperties:false,required:['id','senderId'],properties:{id:{type:'string',minLength:1,maxLength:100},senderId:{type:'string',minLength:6,maxLength:160,pattern:'^[A-Za-z0-9_-]+$'}}},body:{type:'object',additionalProperties:false,required:['name','qqNumber'],properties:{name:{type:'string',minLength:1,maxLength:80},qqNumber:{type:'string',pattern:'^[1-9][0-9]{4,11}$'}}}}},async req=>store.updateUnmatchedQqStudent(req.params.id,req.params.senderId,req.body,req.campusSession!.user.id));
  app.post<{Params:{id:string};Body:{action:'create'|'link'|'ignore';faq?:FaqInput;faqId?:string}}>(prefix+'/unmatched/:id/resolve',{
    preHandler:adminWrite,schema:{tags:['未命中'],params:ID_PARAMS_SCHEMA,body:{type:'object',additionalProperties:false,required:['action'],properties:{action:{enum:['create','link','ignore']},faq:FAQ_INPUT_SCHEMA,faqId:{type:'string',maxLength:100}}}},
  },async req=>store.resolveUnmatched(req.params.id,req.body.action,req.campusSession!.user.id,req.body.faq,req.body.faqId));
  app.post<{Body:{ids:string[];action:'ignore'|'delete'}}>(prefix+'/unmatched/batch',{preHandler:adminWrite,schema:{tags:['未命中'],body:{type:'object',additionalProperties:false,required:['ids','action'],properties:{ids:{type:'array',minItems:1,maxItems:100,uniqueItems:true,items:{type:'string',minLength:1,maxLength:100}},action:{enum:['ignore','delete']}}}}},async req=>store.batchUnmatched(req.body.ids,req.body.action,req.campusSession!.user.id));
  }
}
