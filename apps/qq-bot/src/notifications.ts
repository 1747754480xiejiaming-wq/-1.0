import type {OutboundNotification} from './transport.js';
export interface DeliveryResult {status:'sent'|'failed';errorCode?:string;messageId?:string}
const UNKNOWN='发送结果未确认，请先核对群聊，避免重复发送。';
export function notificationFailure(error:unknown):DeliveryResult {
  const details=error&&typeof error==='object'?error as {bizCode?:unknown;httpStatus?:unknown}:{};
  const code=Number.isSafeInteger(details.bizCode)?Number(details.bizCode):undefined;
  const status=Number.isSafeInteger(details.httpStatus)?Number(details.httpStatus):0;
  // Never persist raw SDK errors: they may contain request paths, text or credentials.
  const message=code===40034105?'QQ 未授予主动群消息权限（40034105），请群主在手机 QQ 的该群机器人设置中开启“机器人主动在群聊内发言”。':
    status===401?'QQ 凭证验证失败（401），请检查 AppID 和 AppSecret 后重启机器人。':
    status===403?'QQ 拒绝发送（403），请检查机器人权限和目标群配置。':
    status===429?'QQ 发送频率或额度受限（429），请稍后重试。':
    status>=400&&status<500?`QQ 明确拒绝本次发送（${code||status}），请核实平台权限、群配置和内容。`:UNKNOWN;
  return {status:'failed',errorCode:message};
}
export async function deliverNotification(item:OutboundNotification,send:(target:{scope:'group';targetId:string},text:string)=>Promise<{id?:string}>,sendAttachment?:(target:{scope:'group';targetId:string},attachment:NonNullable<OutboundNotification['attachments']>[number])=>Promise<void>):Promise<DeliveryResult>{
  try{const target={scope:'group' as const,targetId:item.groupOpenId},response=await send(target,'@全体成员\n'+item.text);
    if(typeof response?.id!=='string'||!response.id||response.id.length>200||/[\p{Cc}\s]/u.test(response.id))return {status:'failed',errorCode:UNKNOWN};
    if(item.attachments?.length){if(!sendAttachment)throw new Error('ATTACHMENT_SENDER_UNAVAILABLE');for(const attachment of item.attachments)await sendAttachment(target,attachment);}
    return {status:'sent',messageId:response.id};
  }catch(error){return notificationFailure(error);}
}
