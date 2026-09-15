import { mkdirSync, rmSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { NotificationInput } from '@campus/contracts';
import { AppError } from '../../errors.js';
import { API_PREFIX, ID_PARAMS_SCHEMA, type RouteContext } from '../../http/context.js';
import { createGuards } from '../../http/guards.js';
import { notificationAttachmentKind, partBuffer, safeName, saveBuffer, saveFolderZip } from '../../services/uploads.js';

export function registerNotificationRoutes(app: FastifyInstance, context: RouteContext, phase:'internal'|'groups'|'admin'|'all'='all') {
  const {config,store,botController,qqGroups,dependencies}=context,{bot,admin,adminWrite}=createGuards(context),prefix=API_PREFIX;
  if(phase==='internal'||phase==='all') {
  app.post<{Body:{openId:string}}>(prefix+'/internal/qq/groups',{preHandler:bot,schema:{hide:true,body:{type:'object',additionalProperties:false,required:['openId'],properties:{openId:{type:'string',minLength:6,maxLength:160,pattern:'^[A-Za-z0-9_-]+$'}}}}},async req=>{const group=store.registerQqGroup(req.body.openId,botController.status().appId);if(!group.nameSynced)qqGroups.invalidate();return group;});
  app.post<{Body:{limit?:number}}>(prefix+'/internal/qq/notifications/claim',{preHandler:bot,schema:{hide:true,body:{type:'object',additionalProperties:false,properties:{limit:{type:'integer',minimum:1,maximum:20,default:5}}}}},async req=>({items:store.claimNotificationTargets(req.body.limit,botController.status().appId||undefined)}));
  app.post<{Params:{id:string};Body:{claimToken:string}}>(prefix+'/internal/qq/notifications/:id/begin',{preHandler:bot,schema:{hide:true,params:ID_PARAMS_SCHEMA,body:{type:'object',additionalProperties:false,required:['claimToken'],properties:{claimToken:{type:'string',minLength:36,maxLength:36}}}}},async req=>store.beginNotificationTarget(req.params.id,req.body.claimToken));
  app.post<{Params:{id:string};Body:{claimToken:string;status:'sent'|'failed';errorCode?:string;messageId?:string}}>(prefix+'/internal/qq/notifications/:id/result',{preHandler:bot,schema:{hide:true,params:ID_PARAMS_SCHEMA,body:{type:'object',additionalProperties:false,required:['claimToken','status'],properties:{claimToken:{type:'string',minLength:36,maxLength:36},status:{enum:['sent','failed']},errorCode:{type:'string',maxLength:120},messageId:{type:'string',minLength:1,maxLength:200}}}}},async req=>store.completeNotificationTarget(req.params.id,req.body.claimToken,req.body.status,req.body.errorCode,req.body.messageId));
  }
  if(phase==='groups'||phase==='all') {
  app.get(prefix+'/admin/qq/groups',{preHandler:admin,config:{rateLimit:{max:120,timeWindow:'1 minute'}},schema:{tags:['QQ 通知']}},async()=>{if(config.dbPath!==':memory:'&&!dependencies.botController)await qqGroups.sync();return {items:store.listQqGroups(botController.status().appId||undefined)};});
  app.patch<{Params:{id:string};Body:{label:string;enabled:boolean;groupNumber?:string}}>(prefix+'/admin/qq/groups/:id',{preHandler:adminWrite,schema:{tags:['QQ 通知'],params:ID_PARAMS_SCHEMA,body:{type:'object',additionalProperties:false,required:['label','enabled'],properties:{label:{type:'string',minLength:1,maxLength:100},enabled:{type:'boolean'},groupNumber:{type:'string',maxLength:15,pattern:'^([1-9][0-9]{4,14})?$'}}}}},async req=>store.updateQqGroup(req.params.id,req.body,req.campusSession!.user.id));
  app.delete<{Params:{id:string}}>(prefix+'/admin/qq/groups/:id',{preHandler:adminWrite,schema:{tags:['QQ 通知'],params:ID_PARAMS_SCHEMA}},async req=>store.deleteQqGroup(req.params.id,req.campusSession!.user.id));
  }
  if(phase==='admin'||phase==='all') {
  app.get<{Querystring:{limit?:number}}>(prefix+'/admin/notifications',{preHandler:admin,config:{rateLimit:{max:120,timeWindow:'1 minute'}},schema:{tags:['QQ 通知'],querystring:{type:'object',additionalProperties:false,properties:{limit:{type:'integer',minimum:1,maximum:50,default:20}}}}},async req=>({items:store.listNotifications(req.query.limit)}));
  app.delete<{Params:{id:string}}>(prefix+'/admin/notifications/:id',{preHandler:adminWrite,schema:{tags:['QQ 通知'],params:ID_PARAMS_SCHEMA}},async req=>store.deleteNotification(req.params.id,req.campusSession!.user.id));
  app.post(prefix+'/admin/notifications',{bodyLimit:70*1024*1024,preHandler:adminWrite,config:{rateLimit:{max:10,timeWindow:'1 minute'}},schema:{tags:['QQ 通知']}},async(req,reply)=>{
    if(!req.isMultipart()){const result=store.createNotification(req.body as NotificationInput,req.campusSession!.user.id,botController.status().appId||undefined);reply.code(202);return result;}
    let payloadText='';const files:{name:string;mime:string;buffer:Buffer}[]=[],folderFiles:{name:string;mime:string;buffer:Buffer}[]=[];let total=0;
    for await(const part of req.parts()){if(part.type==='field'){if(part.fieldname==='payload')payloadText=String(part.value);continue;}const buffer=await partBuffer(part);total+=buffer.length;if(total>60*1024*1024)throw new AppError(413,'FILE_TOO_LARGE','通知附件合计不能超过 60 MB。');const item={name:safeName(part.filename),mime:part.mimetype||'application/octet-stream',buffer};if(part.fieldname==='folder')folderFiles.push(item);else if(part.fieldname==='files')files.push(item);else throw new AppError(400,'INVALID_UPLOAD','通知附件字段无效。');}
    let input:NotificationInput;try{input=JSON.parse(payloadText) as NotificationInput;}catch{throw new AppError(400,'INVALID_NOTIFICATION','通知内容格式无效。');}
    if(files.length+(folderFiles.length?1:0)>10)throw new AppError(400,'ATTACHMENT_LIMIT','每条通知最多添加 10 个附件。');
    const directory=join(config.dataDir,'notification-attachments');mkdirSync(directory,{recursive:true});const saved:{name:string;storedName:string;kind:ReturnType<typeof notificationAttachmentKind>|'folder';mime:string;size:number}[]=[];
    try{for(const file of files){const kind=notificationAttachmentKind(file.name,file.mime),storedName=saveBuffer(directory,file.buffer,extname(file.name).slice(1));saved.push({name:file.name,storedName,kind,mime:file.mime,size:file.buffer.length});}if(folderFiles.length){const archive=await saveFolderZip(directory,folderFiles),root=safeName(folderFiles[0].name.split('/')[0]||'资料文件夹');saved.push({name:`${root}.zip`,storedName:archive.stored,kind:'folder',mime:'application/zip',size:archive.size});}const result=store.createNotification(input,req.campusSession!.user.id,botController.status().appId||undefined,saved);for(const item of saved)if(!store.notificationAttachmentStored(item.storedName))rmSync(join(directory,item.storedName),{force:true});reply.code(202);return result;}catch(error){for(const item of saved)if(!store.notificationAttachmentStored(item.storedName))rmSync(join(directory,item.storedName),{force:true});throw error;}
  });
  }
}
