import { QQBot,type ReplyTarget } from '@tencent-connect/qqbot-nodejs';
import { config as dotenv } from 'dotenv';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beginNotification,beginUnmatchedReply,claimNotifications,claimUnmatchedReplies,cleanQuestion,completeNotification,completeOfflineQuestion,completeUnmatchedReply,messageRequestId,offlinePreferences,qqSenderFromMessage,recordOfflineQuestion,registerGroup,requestAnswerResult,sendQuestionReply,shouldHandleQuestionEvent,shouldRecallForbidden,shouldSendQuestionReply } from './transport.js';
import { downloadQuestionImages,IMAGE_DOWNLOAD_ERROR } from './images.js';
import { deliverNotification } from './notifications.js';
import { identityReply } from './identity.js';
import { createFileSessionPersistence } from './session.js';
import { acceptsPrivateMedia,cleanAsrText,downloadIncomingAttachment,materialAttachments,requestTranscription,uploadMaterial,voiceAttachment,type IncomingAttachment } from './media.js';
import type { AnswerAttachment,QqSender } from '@campus/contracts';
let root=dirname(fileURLToPath(import.meta.url));while(!existsSync(join(root,'migrations/001_initial.sql'))){const parent=dirname(root);if(parent===root)throw new Error('找不到工程根目录。');root=parent;}
dotenv({path:join(root,'.env'),quiet:true});
function credentials() {
  const path=process.env.QQBOT_CREDENTIALS_FILE||join(root,'data/qq-credentials.json');if(!existsSync(resolve(root,path)))throw new Error('请先在老师工作台填写并保存 QQ 机器人凭证。');
  const raw=readFileSync(resolve(root,path),'utf8').replace(/^\uFEFF/,'').trim();let values:Record<string,string>={};
  if(raw.startsWith('{'))values=JSON.parse(raw);else {const lines=raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);for(let i=0;i<lines.length;i++){const pair=lines[i].match(/^(appid|appsecret)\s*[:=：]\s*(.+)$/i);if(pair)values[pair[1]]=pair[2];else if(/^(appid|appsecret)$/i.test(lines[i]) && lines[i+1])values[lines[i]]=lines[++i];}if(!Object.keys(values).length&&lines.length===2)values={appId:lines[0],appSecret:lines[1]};}
  const entry=(name:string)=>Object.entries(values).find(([k])=>k.toLowerCase()===name)?.[1];const appId=entry('appid'),appSecret=entry('appsecret');
  if(!appId || !/^\d{5,20}$/.test(appId) || typeof appSecret!=='string' || appSecret.length<8 || /\s/.test(appSecret))throw new Error('QQ 凭证格式无效，请参考 README。');return {appId,appSecret};
}
async function main() {
  const dataDirectory=resolve(process.env.CAMPUS_DATA_DIR||join(root,'data'));
  const token=process.env.BOT_API_TOKEN || (existsSync(join(dataDirectory,'runtime-secrets.json'))?JSON.parse(readFileSync(join(dataDirectory,'runtime-secrets.json'),'utf8')).botToken:'');
  if(!token)throw new Error('请先执行 npm run setup。');
  const base=process.env.BOT_API_BASE_URL||'http://127.0.0.1:3001';const target=new URL(base);
  if(target.protocol!=='https:' && !(target.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(target.hostname)))throw new Error('远程 API 必须使用 HTTPS。');
  const creds=credentials(),cachePath=join(dataDirectory,'qq-delivery.json'),offlinePath=join(dataDirectory,'qq-offline-questions.json'),sessionPath=join(dataDirectory,'qq-gateway-session.json');
  const bot=new QQBot({...creds,intents:(1<<25)|(1<<12),markdownSupport:false,sessionPersistence:createFileSessionPersistence(sessionPath,creds.appId)});process.env.CAMPUS_QQ_APP_ID=creds.appId;
  let connected=false;mkdirSync(dirname(cachePath),{recursive:true});
  let delivered:Record<string,number>={};if(existsSync(cachePath))delivered=JSON.parse(readFileSync(cachePath,'utf8'));
  type OfflineItem={requestId:string;question:string;replyTarget:ReplyTarget;messageId:string;kind:'c2c'|'group';sender?:QqSender;createdAt:number;serverId?:string};
  let offlineQueue:OfflineItem[]=[];if(existsSync(offlinePath))try{const saved=JSON.parse(readFileSync(offlinePath,'utf8'));if(Array.isArray(saved))offlineQueue=saved.filter(item=>item&&typeof item.question==='string'&&item.replyTarget&&typeof item.replyTarget==='object').slice(-1000);}catch{/* A damaged recovery queue is replaced on the next write. */}
  const busy=new Set<string>(),limits=new Map<string,{n:number,until:number}>();
  const receiveAttachment=async(item:AnswerAttachment)=>{const directory=join(dataDirectory,'qq-answer-cache');mkdirSync(directory,{recursive:true});const path=join(directory,`${item.id}-${item.name.replace(/[<>:"/\\|?*\p{Cc}]/gu,'_').slice(0,100)}`);const response=await fetch(new URL(`/api/v1/internal/qq/attachments/${encodeURIComponent(item.id)}`,base),{headers:{Authorization:`Bearer ${token}`,'X-QQ-App-Id':creds.appId},redirect:'error',signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error('ATTACHMENT_DOWNLOAD_FAILED');const content=Buffer.from(await response.arrayBuffer());if(content.length>65*1024*1024)throw new Error('ATTACHMENT_TOO_LARGE');writeFileSync(path,content,{flag:'wx'});return path;};
  const persist=()=>{const now=Date.now();delivered=Object.fromEntries(Object.entries(delivered).filter(([,at])=>now-at<86400000).slice(-20000));writeFileSync(cachePath,JSON.stringify(delivered),{mode:0o600});};
  const persistOffline=()=>{const cutoff=Date.now()-30*86400000;offlineQueue=offlineQueue.filter(item=>item.createdAt>cutoff).slice(-1000);writeFileSync(offlinePath,JSON.stringify(offlineQueue),{mode:0o600});};
  const enqueueOffline=async(item:OfflineItem)=>{const current=offlineQueue.find(saved=>saved.requestId===item.requestId);if(!current){offlineQueue.push(item);persistOffline();}const queued=current||item;if(!queued.serverId)try{queued.serverId=(await recordOfflineQuestion(base,token,queued.question,queued.sender)).id;persistOffline();}catch{/* The local queue remains authoritative until the API is back. */}};
  const heartbeat=async()=>{try{await fetch(new URL('/api/v1/internal/qq/heartbeat',base),{method:'POST',redirect:'error',signal:AbortSignal.timeout(3000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,'X-QQ-App-Id':creds.appId},body:JSON.stringify({state:connected?'connected':'offline'})});}catch{/* API status expires after missed heartbeats. */}};
  let draining=false;const drain=async()=>{if(!connected||draining)return;draining=true;
    try{for(const item of await claimNotifications(base,token)){
      if(!await beginNotification(base,token,item))continue;
      const result=await deliverNotification(item,(target,text)=>bot.sendText(target,text),async(target,attachment)=>{let path='';try{path=await receiveAttachment(attachment);if(attachment.kind==='image')await bot.sendImage(target,{localPath:path});else await bot.sendFile(target,{localPath:path},{fileName:attachment.name});}finally{if(path)rmSync(path,{force:true});}});
      // Only retry the local acknowledgement. An uncertain platform send is never replayed.
      for(let attempt=0;attempt<3;attempt++){try{await completeNotification(base,token,item.id,item.claimToken,result.status,fetch,result);break;}catch{if(attempt===2)console.error('通知结果回写失败，请在工作台核对该群状态。');}}
    }}catch{/* The next poll recovers unstarted claims; started sends cannot replay. */}finally{draining=false;}
  };
  let drainingUnmatched=false;const drainUnmatched=async()=>{if(!connected||drainingUnmatched)return;drainingUnmatched=true;try{
    if(!(await offlinePreferences(base,token)).qqAnswerEnabled)return;
    for(const item of await claimUnmatchedReplies(base,token)){
      if(!await beginUnmatchedReply(base,token,item))continue;
      let status:'sent'|'failed'='failed',messageId:string|undefined,errorCode:string|undefined;
      try{
        const target:ReplyTarget={scope:item.kind,targetId:item.targetId};
        // Teacher answers arrive after the original passive-reply window. QQ's
        // C2C wakeup route is specifically intended for users who initiated a
        // conversation within the previous 30 days; plain proactive sendText
        // can be rejected even though the OpenID is correct.
        const sent=(item.kind==='c2c'?await bot.sendWakeup(target,item.answer):await sendQuestionReply(bot,target,item.kind,item.senderName||undefined,item.answer)) as {id?:string};messageId=sent?.id;
        for(const attachment of item.attachments||[]){let path='';try{path=await receiveAttachment(attachment);if(attachment.kind==='image')await bot.sendImage(target,{localPath:path});else await bot.sendFile(target,{localPath:path},{fileName:attachment.name});}finally{if(path)rmSync(path,{force:true});}}
        status='sent';
      }catch(error){errorCode=(error instanceof Error?error.message:'QQ_SEND_FAILED').slice(0,120);console.error('老师解答回发失败：'+errorCode);}
      for(let attempt=0;attempt<3;attempt++){try{await completeUnmatchedReply(base,token,item.id,item.claimToken,status,fetch,{errorCode,messageId});break;}catch{if(attempt===2)console.error('老师解答回发结果写入失败，请核对聊天记录。');}}
    }
  }catch{/* The next poll recovers unstarted claims; started sends cannot replay. */}finally{drainingUnmatched=false;}};
  let drainingOffline=false;const drainOffline=async()=>{if(!connected||drainingOffline||!offlineQueue.length)return;drainingOffline=true;try{const preference=await offlinePreferences(base,token);for(const item of [...offlineQueue]){if(!item.serverId){item.serverId=(await recordOfflineQuestion(base,token,item.question,item.sender)).id;persistOffline();}if(!preference.qqAnswerEnabled||!preference.offlineAutoReply)break;const result=await requestAnswerResult(base,token,item.question,`${item.requestId}-offline`,fetch,[],item.sender);if(!result)break;if(shouldRecallForbidden(result.source,item.kind))try{await bot.recallMessage(item.replyTarget,item.messageId);}catch{console.error('敏感词消息撤回失败，请检查机器人撤回消息权限。');}if(shouldSendQuestionReply(item.kind,result.source,false,result.fallbackReason)&&(item.kind==='c2c'||item.sender?.id)){await sendQuestionReply(bot,item.replyTarget,item.kind,item.sender?.name,`${result.isDemo?'【演示内容，请由老师核实】\n':''}${result.answer}`);for(const attachment of result.attachments||[]){let path='';try{path=await receiveAttachment(attachment);if(attachment.kind==='image')await bot.sendImage(item.replyTarget,{localPath:path});else await bot.sendFile(item.replyTarget,{localPath:path},{fileName:attachment.name});}finally{if(path)rmSync(path,{force:true});}}}await completeOfflineQuestion(base,token,item.serverId);offlineQueue=offlineQueue.filter(saved=>saved.requestId!==item.requestId);persistOffline();}}catch{/* Wait for the next online poll. */}finally{drainingOffline=false;}};
  bot.on('ready',()=>{connected=true;console.log('QQ 连接已建立。');void heartbeat();void drain();void drainOffline();void drainUnmatched();});bot.on('resumed',()=>{connected=true;void heartbeat();void drain();void drainOffline();void drainUnmatched();});
  bot.on('error',()=>{connected=false;console.error('QQ 连接或消息服务发生错误，请检查平台权限与网络。');void heartbeat();});
  bot.on('message',async(_context,message)=>{
    if(message.senderIsBot || !message.messageId || !['c2c','group'].includes(message.kind))return;
    if(!shouldHandleQuestionEvent(message.kind,message.rawEventType))return;
    if(message.kind==='group'&&message.groupOpenid)try{await registerGroup(base,token,message.groupOpenid);}catch{console.error('群聊登记暂未完成，将在下次群消息时重试。');}
    const id=messageRequestId(token,message.kind,message.messageId);if(busy.has(id)||delivered[id])return;
    const sender=messageRequestId(token,'sender',message.senderId),now=Date.now();let window=limits.get(sender);if(!window||window.until<now){window={n:0,until:now+60000};limits.set(sender,window);}if(window.n++>=10)return;
    for(const [key,item] of limits)if(item.until<now)limits.delete(key);
    busy.add(id);
    try {
      const sender:QqSender={...qqSenderFromMessage(message),chatKind:message.kind as 'c2c'|'group',targetId:message.replyTarget.targetId,messageId:message.messageId},incoming=(message.attachments||[]) as IncomingAttachment[];let question=cleanQuestion(message.content);
      if(acceptsPrivateMedia(message.kind))try{
        const voice=voiceAttachment(incoming);if(voice){const transcript=cleanAsrText(voice.asr_refer_text)||await requestTranscription(base,token,creds.appId,await downloadIncomingAttachment(voice,()=>bot.tokenManager.getAccessToken(creds.appId,creds.appSecret),25*1024*1024,fetch,true),voice.voice_wav_url?'audio/wav':voice.content_type,voice.voice_wav_url?'qq-voice.wav':voice.filename||'qq-voice.mp3');question=cleanQuestion([question,transcript].filter(Boolean).join(' '));}
        const documents=materialAttachments(incoming);for(const document of documents)await uploadMaterial(base,token,creds.appId,document,await downloadIncomingAttachment(document,()=>bot.tokenManager.getAccessToken(creds.appId,creds.appSecret),25*1024*1024),message.messageId,sender);
        if(documents.length&&!question){delivered[id]=Date.now();persist();return;}
      }catch(error){const code=error instanceof Error?error.message:'UNKNOWN_MEDIA_ERROR';console.error(`私聊资料接收失败：${code}`);await bot.sendText(message.replyTarget,code.startsWith('语音')?code:'资料接收失败，请稍后重试。');delivered[id]=Date.now();persist();return;}
      const queueItem:OfflineItem={requestId:id,question,replyTarget:message.replyTarget,messageId:message.messageId,kind:message.kind as 'c2c'|'group',sender,createdAt:Date.now()};
      if(question){try{const preference=await offlinePreferences(base,token);if(!preference.qqAnswerEnabled){await enqueueOffline(queueItem);return;}}catch{/* The normal request path below records API outages. */}}
      const intro=identityReply(question);let answer:string,attachments:AnswerAttachment[]=[],recallForbidden=false,answerSource:Parameters<typeof shouldSendQuestionReply>[1],answerReason:Parameters<typeof shouldSendQuestionReply>[3];
      try{if(intro)answer=intro;else{const images=acceptsPrivateMedia(message.kind)?await downloadQuestionImages(incoming,()=>bot.tokenManager.getAccessToken(creds.appId,creds.appSecret)):[];if((!question&&!images.length)||question.length>200)answer='请发送 1-200 个字符的教务问题，每次只问一件事。';else{const result=await requestAnswerResult(base,token,question,id,fetch,images,sender);if(!result&&question)await enqueueOffline(queueItem);answer=result?`${result.isDemo?'【演示内容，请由老师核实】\n':''}${result.answer}`:'服务暂不可用，问题已记录，恢复连接后将按设置补答。';answerSource=result?.source;answerReason=result?.fallbackReason;attachments=result?.attachments||[];recallForbidden=!!result&&shouldRecallForbidden(result.source,message.kind);}}}
      catch(error){answer=error instanceof Error?error.message:IMAGE_DOWNLOAD_ERROR;}
      if(recallForbidden)try{await bot.recallMessage(message.replyTarget,message.messageId);}catch{console.error('敏感词消息撤回失败，请检查机器人撤回消息权限。');}
      if(shouldSendQuestionReply(message.kind as 'c2c'|'group',answerSource,!!intro,answerReason)){await sendQuestionReply(bot,message.replyTarget,message.kind as 'c2c'|'group',sender.name,answer);
      for(const item of attachments){let path='';try{path=await receiveAttachment(item);if(item.kind==='image')await bot.sendImage(message.replyTarget,{localPath:path});else await bot.sendFile(message.replyTarget,{localPath:path},{fileName:item.name});}catch{console.error('答案附件发送失败：'+item.name);}finally{if(path)rmSync(path,{force:true});}}}
      delivered[id]=Date.now();persist();
    }catch{console.error('QQ 回复发送失败；未记录消息正文。');}finally{busy.delete(id);}
  });
  const timer=setInterval(()=>void heartbeat(),15000);timer.unref();const queueTimer=setInterval(()=>void drain(),5000);queueTimer.unref();const unmatchedTimer=setInterval(()=>void drainUnmatched(),5000);unmatchedTimer.unref();const offlineTimer=setInterval(()=>void drainOffline(),7000);offlineTimer.unref();
  for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{connected=false;clearInterval(timer);clearInterval(queueTimer);clearInterval(unmatchedTimer);clearInterval(offlineTimer);void heartbeat().finally(()=>bot.stop());});
  await bot.start();
}
main().catch(()=>{console.error('QQ 机器人未启动：请检查本机凭证文件、服务令牌、网络和平台权限。详细配置见 README。');process.exitCode=1;});
