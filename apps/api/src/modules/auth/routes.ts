import type { FastifyInstance } from 'fastify';
import { AppError } from '../../errors.js';
import { API_PREFIX, ID_PARAMS_SCHEMA, type RouteContext } from '../../http/context.js';
import { createGuards } from '../../http/guards.js';
import { constantEqual, hashPassword, login } from '../../services/auth.js';

export function registerAuthRoutes(app: FastifyInstance, context: RouteContext, phase:'session'|'admin'|'all'='all') {
  const {config,store,models}=context,{origin,session,sessionWrite,developerAccount,developerAccountWrite,admin,adminWrite}=createGuards(context),prefix=API_PREFIX;
  const sessionCookie={path:'/',httpOnly:true,sameSite:'lax' as const,secure:config.cookieSecure,maxAge:8*3600};
  if(phase==='session'||phase==='all') {
  app.post<{Body:{username:string;password:string}}>(prefix+'/auth/login',{
    schema:{tags:['认证'],body:{type:'object',additionalProperties:false,required:['username','password'],properties:{username:{type:'string',minLength:1,maxLength:40},password:{type:'string',minLength:1,maxLength:128}}}},
    preHandler:async(req)=>origin(req),config:{rateLimit:{max:config.loginRateLimit,timeWindow:'1 minute'}},
  },async(req,reply)=>{const result=await login(store,req.body.username,req.body.password);reply.setCookie('campus_session',result.token,sessionCookie);return {user:result.user,csrfToken:result.csrfToken};});
  app.post<{Body:{username:string;password:string;registrationCode:string}}>(prefix+'/auth/register',{preHandler:async req=>origin(req),config:{rateLimit:{max:3,timeWindow:'1 minute'}},schema:{tags:['认证'],body:{type:'object',additionalProperties:false,required:['username','password','registrationCode'],properties:{username:{type:'string',minLength:2,maxLength:40},password:{type:'string',minLength:12,maxLength:128},registrationCode:{type:'string',minLength:1,maxLength:32}}}}},async(req,reply)=>{if(!constantEqual(req.body.registrationCode,config.registrationCode))throw new AppError(403,'INVALID_REGISTRATION_CODE','注册码不正确。');const account=store.registerAdmin(req.body.username,await hashPassword(req.body.password));const result=await login(store,account.username,req.body.password);reply.setCookie('campus_session',result.token,sessionCookie).code(201);return {user:result.user,csrfToken:result.csrfToken};});
  app.get(prefix+'/auth/session',{preHandler:session,schema:{tags:['认证']}},async req=>req.campusSession);
  app.post(prefix+'/auth/logout',{preHandler:sessionWrite,schema:{tags:['认证']}},async(req,reply)=>{store.deleteSession(req.cookies.campus_session!);reply.clearCookie('campus_session',{path:'/'});return {ok:true};});
  app.get(prefix+'/developer/accounts',{preHandler:developerAccount,schema:{tags:['账户管理']}},async()=>({items:store.listRegisteredAccounts()}));
  app.post<{Params:{id:string};Body:{password:string}}>(prefix+'/developer/accounts/:id/reset-password',{preHandler:developerAccountWrite,config:{rateLimit:{max:5,timeWindow:'1 minute'}},schema:{tags:['账户管理'],params:ID_PARAMS_SCHEMA,body:{type:'object',additionalProperties:false,required:['password'],properties:{password:{type:'string',minLength:12,maxLength:128}}}}},async req=>store.resetRegisteredAccount(req.params.id,await hashPassword(req.body.password)));
  }
  if(phase==='admin'||phase==='all') {
  app.get(prefix+'/admin/developer/access',{preHandler:admin,schema:{tags:['认证']}},async req=>store.developerAccess(req.cookies.campus_session!));
  app.post<{Body:{key:string}}>(prefix+'/admin/developer/unlock',{preHandler:adminWrite,config:{rateLimit:{max:5,timeWindow:'1 minute'}},schema:{tags:['认证'],body:{type:'object',additionalProperties:false,required:['key'],properties:{key:{type:'string',minLength:8,maxLength:128}}}}},async req=>{
    if(!constantEqual(req.body.key,config.developerKey))throw new AppError(403,'INVALID_DEVELOPER_KEY','开发者密匙不正确。');
    return store.unlockDeveloper(req.cookies.campus_session!);
  });
  app.get(prefix+'/admin/account',{preHandler:admin,config:{rateLimit:{max:120,timeWindow:'1 minute'}},schema:{tags:['账户']}},async()=>{const plan=models.budget.plan();return {...plan,usage:models.status().usage};});
  app.post<{Body:{key:string}}>(prefix+'/admin/account/upgrade',{preHandler:adminWrite,config:{rateLimit:{max:5,timeWindow:'1 minute'}},schema:{tags:['账户'],body:{type:'object',additionalProperties:false,required:['key'],properties:{key:{type:'string',minLength:8,maxLength:128}}}}},async req=>{
    if(!constantEqual(req.body.key,config.developerKey))throw new AppError(403,'INVALID_UPGRADE_KEY','升级密匙不正确。');
    const plan=models.budget.upgradeToPro();return {...plan,usage:models.status().usage};
  });
  }
}
