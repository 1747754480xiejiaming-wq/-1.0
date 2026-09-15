import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';
import { BotControlError } from '../services/bot-control.js';

export function registerErrorHandlers(app: FastifyInstance) {
  app.setErrorHandler((error,req,reply)=>{
    const err=error as Error & {statusCode?:number;validation?:unknown;code?:string};
    let status=err.statusCode||500,code=err.code||'INTERNAL_ERROR',message='服务暂不可用，请稍后重试。';
    if(err.validation){status=400;code='INVALID_INPUT';message='提交内容格式不正确，请检查字段和长度。';}
    else if(err instanceof AppError)message=err.message;
    else if(err instanceof BotControlError){status=err.statusCode;code=err.code;message=err.message;}
    else if(status===429){code='RATE_LIMITED';message='操作过于频繁，请稍后重试。';}
    else if(err.code?.startsWith('SQLITE_')||/database connection is not open/i.test(err.message)){status=503;code='DATABASE_UNAVAILABLE';}
    else if(status===400||status===415){code='INVALID_INPUT';message='请使用有效的 JSON 请求。';}
    if(status>=500)req.log.error({code,status,requestId:req.id},'请求处理失败');
    reply.code(status).send({error:{code,message},requestId:req.id});
  });
  app.setNotFoundHandler((req,reply)=>reply.code(404).send({error:{code:'NOT_FOUND',message:'接口不存在。'},requestId:req.id}));
}
