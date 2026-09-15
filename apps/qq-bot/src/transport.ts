import { createHmac } from 'node:crypto';
import type { ReplyTarget } from '@tencent-connect/qqbot-nodejs';
import type { AnswerAttachment,AnswerResult,FallbackReason,QqSender,UnmatchedPreferences } from '@campus/contracts';
import { UNAVAILABLE_ANSWER } from '@campus/contracts';
export const shouldRecallForbidden=(source:AnswerResult['source'],kind:string)=>kind==='group'&&(source==='forbidden_keyword'||source==='forbidden_semantic');
export const shouldHandleQuestionEvent=(kind:string,rawEventType?:string)=>kind==='c2c'||(kind==='group'&&(rawEventType==='GROUP_AT_MESSAGE_CREATE'||rawEventType==='GROUP_MESSAGE_CREATE'));
export const shouldSendQuestionReply=(kind:'c2c'|'group',source?:AnswerResult['source'],directAnswer=false,fallbackReason?:FallbackReason|null)=>kind==='c2c'||directAnswer||(source!==undefined&&source!=='fallback')||fallbackReason==='manual_transfer';
export function formatNicknameReply(senderName:string|undefined,answer:string) {
  const nickname=senderName?.replace(/[\p{Cc}\p{Cf}]/gu,'').replace(/\s+/g,' ').trim().slice(0,80);
  if(!nickname)return answer;
  const escaped=nickname.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const repeated=new RegExp(`^(?:@${escaped}(?:[\\s，,：:]+|$))+`,'u');
  const rest=answer.replace(repeated,'').trimStart();
  return rest?`@${nickname} ${rest}`:`@${nickname}`;
}
export interface QuestionReplyClient {
  sendText(target:ReplyTarget,content:string):Promise<unknown>;
}
export async function sendQuestionReply(client:QuestionReplyClient,target:ReplyTarget,kind:'c2c'|'group',senderName:string|undefined,answer:string) {
  if(kind==='c2c')return client.sendText(target,answer);
  // A passive group reply carrying msg_id is rendered by QQ with the source
  // member mention already attached. Prefixing the nickname again produces
  // “@昵称 @昵称”. Proactive/delayed replies have no msg_id, so add exactly one
  // visible nickname prefix there. Keep both paths on ordinary text for desktop
  // QQ compatibility.
  return client.sendText(target,target.msgId?answer:formatNicknameReply(senderName,answer));
}
export function messageRequestId(token:string,kind:string,messageId:string) {return createHmac('sha256',token).update(`${kind}:${messageId}`).digest('hex');}
export function cleanQuestion(text:string) {return text.replace(/<qqbot-at-user\s+id="[A-Za-z0-9_-]{1,160}"\s*\/>/gi,'').replace(/<@!?[A-Za-z0-9_-]+>/g,'').replace(/[\p{Cc}\p{Cf}]/gu,'').trim();}
export function qqSenderFromMessage(message:{senderId:string;senderName?:string;raw?:unknown}):QqSender {
  const author=(message.raw as {author?:Record<string,unknown>}|undefined)?.author;
  const explicitNumber=[author?.qq_number,author?.qqNumber,author?.uin].find(value=>typeof value==='string'&&/^[1-9]\d{4,11}$/.test(value)) as string|undefined;
  const rawName=[message.senderName,author?.username,author?.nickname].find(value=>typeof value==='string'&&value.trim()) as string|undefined;
  return {id:message.senderId,...(rawName?{name:rawName.trim().slice(0,80)}:{}),...(explicitNumber?{qqNumber:explicitNumber}:{})};
}
export async function requestAnswerResult(baseUrl:string,token:string,question:string,requestId:string,fetcher:typeof fetch=fetch,images:string[]=[],qqSender?:QqSender):Promise<AnswerResult|null> {
  try {
    const url=new URL('/api/v1/internal/qq/answer',baseUrl);
    if(url.protocol!=='https:' && !(url.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw new Error('不安全的 API 地址');
    const response=await fetcher(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(95000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...(process.env.CAMPUS_QQ_APP_ID?{'X-QQ-App-Id':process.env.CAMPUS_QQ_APP_ID}:{})},body:JSON.stringify({question,requestId,...(images.length?{images}:{}),...(qqSender?{qqSender}:{})})});
    if(!response.ok)return null;
    const body=await response.json() as AnswerResult;
    if(body.requestId!==requestId || typeof body.answer!=='string' || !body.answer || body.answer.length>1800 || !['faq_keyword','faq_semantic','forbidden_keyword','forbidden_semantic','rag','fallback'].includes(body.source))return null;
    if(body.attachments&&!Array.isArray(body.attachments))return null;return body;
  } catch {return null;}
}
export async function requestAnswer(baseUrl:string,token:string,question:string,requestId:string,fetcher:typeof fetch=fetch,images:string[]=[],qqSender?:QqSender):Promise<string> {
  const body=await requestAnswerResult(baseUrl,token,question,requestId,fetcher,images,qqSender);return body?(body.isDemo?'【演示内容，请由老师核实】\n':'')+body.answer:UNAVAILABLE_ANSWER;
}
export interface OutboundNotification {id:string;notificationId:string;groupOpenId:string;text:string;claimToken:string;attachments?:AnswerAttachment[]}
export interface OutboundUnmatchedReply {id:string;questionId:string;targetId:string;kind:'c2c'|'group';senderName:string|null;answer:string;claimToken:string;attachments?:AnswerAttachment[]}
const headers=(token:string)=>({'Content-Type':'application/json',Authorization:`Bearer ${token}`,...(process.env.CAMPUS_QQ_APP_ID?{'X-QQ-App-Id':process.env.CAMPUS_QQ_APP_ID}:{})});
export async function offlinePreferences(baseUrl:string,token:string,fetcher:typeof fetch=fetch):Promise<UnmatchedPreferences>{const response=await fetcher(new URL('/api/v1/internal/qq/offline/preferences',baseUrl),{redirect:'error',signal:AbortSignal.timeout(5000),headers:headers(token)});if(!response.ok)throw new Error('OFFLINE_PREFERENCES_UNAVAILABLE');return response.json() as Promise<UnmatchedPreferences>;}
export async function recordOfflineQuestion(baseUrl:string,token:string,question:string,qqSender:QqSender|undefined,fetcher:typeof fetch=fetch):Promise<{id:string}>{const response=await fetcher(new URL('/api/v1/internal/qq/offline/questions',baseUrl),{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:headers(token),body:JSON.stringify({question,...(qqSender?{qqSender}:{})})});if(!response.ok)throw new Error('OFFLINE_QUESTION_SYNC_FAILED');return response.json() as Promise<{id:string}>;}
export async function completeOfflineQuestion(baseUrl:string,token:string,id:string,fetcher:typeof fetch=fetch){const response=await fetcher(new URL(`/api/v1/internal/qq/offline/questions/${encodeURIComponent(id)}/complete`,baseUrl),{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:headers(token),body:'{}'});if(!response.ok)throw new Error('OFFLINE_QUESTION_COMPLETE_FAILED');}
export async function registerGroup(baseUrl:string,token:string,openId:string,fetcher:typeof fetch=fetch) {
  const response=await fetcher(new URL('/api/v1/internal/qq/groups',baseUrl),{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:headers(token),body:JSON.stringify({openId})});if(!response.ok)throw new Error('GROUP_REGISTER_FAILED');
}
export async function claimNotifications(baseUrl:string,token:string,fetcher:typeof fetch=fetch):Promise<OutboundNotification[]> {
  const response=await fetcher(new URL('/api/v1/internal/qq/notifications/claim',baseUrl),{method:'POST',body:JSON.stringify({limit:1}),redirect:'error',signal:AbortSignal.timeout(5000),headers:headers(token)});if(!response.ok)throw new Error('QUEUE_UNAVAILABLE');const body=await response.json() as {items?:OutboundNotification[]};return Array.isArray(body.items)?body.items.filter(item=>typeof item.claimToken==='string'&&typeof item.id==='string'&&typeof item.groupOpenId==='string'&&typeof item.text==='string'&&item.text.length<=1700&&(!item.attachments||Array.isArray(item.attachments))):[];
}
export async function completeNotification(baseUrl:string,token:string,id:string,claimToken:string,status:'sent'|'failed',fetcher:typeof fetch=fetch,details:{errorCode?:string;messageId?:string}={}) {
  const response=await fetcher(new URL(`/api/v1/internal/qq/notifications/${encodeURIComponent(id)}/result`,baseUrl),{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:headers(token),body:JSON.stringify({claimToken,status,errorCode:status==='failed'?(details.errorCode||'发送结果未确认，请核对群聊后再发送'):undefined,messageId:status==='sent'?details.messageId:undefined})});if(!response.ok)throw new Error('QUEUE_ACK_FAILED');
}

export async function beginNotification(baseUrl:string,token:string,item:OutboundNotification,fetcher:typeof fetch=fetch) {
  const response=await fetcher(new URL('/api/v1/internal/qq/notifications/'+encodeURIComponent(item.id)+'/begin',baseUrl),{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:headers(token),body:JSON.stringify({claimToken:item.claimToken})});
  return response.ok&&(await response.json() as {canSend:boolean}).canSend===true;
}
export async function claimUnmatchedReplies(baseUrl:string,token:string,fetcher:typeof fetch=fetch):Promise<OutboundUnmatchedReply[]> {
  const response=await fetcher(new URL('/api/v1/internal/qq/unmatched-replies/claim',baseUrl),{method:'POST',body:JSON.stringify({limit:5}),redirect:'error',signal:AbortSignal.timeout(5000),headers:headers(token)});if(!response.ok)throw new Error('UNMATCHED_REPLY_QUEUE_UNAVAILABLE');
  const body=await response.json() as {items?:OutboundUnmatchedReply[]};return Array.isArray(body.items)?body.items.filter(item=>typeof item.id==='string'&&typeof item.claimToken==='string'&&['c2c','group'].includes(item.kind)&&typeof item.targetId==='string'&&typeof item.answer==='string'&&item.answer.length<=1700&&(!item.attachments||Array.isArray(item.attachments))):[];
}
export async function beginUnmatchedReply(baseUrl:string,token:string,item:OutboundUnmatchedReply,fetcher:typeof fetch=fetch) {
  const response=await fetcher(new URL(`/api/v1/internal/qq/unmatched-replies/${encodeURIComponent(item.id)}/begin`,baseUrl),{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:headers(token),body:JSON.stringify({claimToken:item.claimToken})});return response.ok&&(await response.json() as {canSend:boolean}).canSend===true;
}
export async function completeUnmatchedReply(baseUrl:string,token:string,id:string,claimToken:string,status:'sent'|'failed',fetcher:typeof fetch=fetch,details:{errorCode?:string;messageId?:string}={}) {
  const response=await fetcher(new URL(`/api/v1/internal/qq/unmatched-replies/${encodeURIComponent(id)}/result`,baseUrl),{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:headers(token),body:JSON.stringify({claimToken,status,errorCode:status==='failed'?(details.errorCode||'发送失败'):undefined,messageId:status==='sent'?details.messageId:undefined})});if(!response.ok)throw new Error('UNMATCHED_REPLY_ACK_FAILED');
}
