import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../apps/api/src/app.js';
import {qqSenderFromMessage,requestAnswer} from '../apps/qq-bot/src/transport.js';

test('QQ 未命中问题保存昵称、OpenID 和逐人咨询次数',async t=>{
  const {app,store}=await createApp({dbPath:':memory:',logger:false,modelKey:'',botToken:'student-source-token',rateLimit:100});
  t.after(()=>app.close());
  const headers={authorization:'Bearer student-source-token'};
  const ask=(requestId:string,qqSender:{id:string;name?:string})=>app.inject({method:'POST',url:'/api/v1/internal/qq/answer',headers,payload:{question:'学校新生实验服怎么领取',requestId,qqSender}});
  assert.equal((await ask('qq-source-request-1',{id:'member_openid_alice',name:'小林'})).statusCode,200);
  assert.equal((await ask('qq-source-request-2',{id:'member_openid_alice',name:'林同学'})).statusCode,200);
  assert.equal((await ask('qq-source-request-3',{id:'member_openid_bob'})).statusCode,200);
  const record=store.listUnmatched({status:'pending'}).items[0];
  assert.equal(record.qqCount,3);
  assert.deepEqual(record.qqStudents.map(student=>({id:student.id,name:student.name,qqNumber:student.qqNumber,questionCount:student.questionCount})),[
    {id:'member_openid_bob',name:null,qqNumber:null,questionCount:1},
    {id:'member_openid_alice',name:'林同学',qqNumber:null,questionCount:2},
  ]);
  assert.deepEqual(store.updateUnmatchedQqStudent(record.id,'member_openid_alice',{name:'Irene',qqNumber:'3556762784'},'teacher'),{id:'member_openid_alice',name:'Irene',qqNumber:'3556762784',questionCount:2,firstSeen:record.qqStudents[1].firstSeen,lastSeen:record.qqStudents[1].lastSeen});
  store.sqlite.prepare('UPDATE unmatched_questions SET last_seen=0').run();
  store.cleanup();
  assert.equal((store.sqlite.prepare('SELECT count(*) AS n FROM unmatched_qq_students').get() as {n:number}).n,0);
});

test('QQ 机器人把消息事件中的学生信息随问题上报',async()=>{
  let received:Record<string,unknown>={};
  const fetcher=(async(_url:unknown,init?:RequestInit)=>{received=JSON.parse(String(init?.body));return Response.json({requestId:'sender-forward-request',answer:'请联系教务老师。',faqId:null,faqVersion:null,source:'fallback',fallbackReason:'no_match',isDemo:false});}) as typeof fetch;
  assert.equal(await requestAnswer('http://127.0.0.1:3001','token','实验服怎么领取','sender-forward-request',fetcher,[],{id:'member_openid_123456',name:'材料小王'}),'请联系教务老师。');
  assert.deepEqual(received.qqSender,{id:'member_openid_123456',name:'材料小王'});
  assert.deepEqual(qqSenderFromMessage({senderId:'openid_hex_value',senderName:'Irene',raw:{author:{id:'3556762784'}}}),{id:'openid_hex_value',name:'Irene'});
  assert.deepEqual(qqSenderFromMessage({senderId:'openid_hex_value',raw:{author:{username:'Irene',qq_number:'3556762784'}}}),{id:'openid_hex_value',name:'Irene',qqNumber:'3556762784'});
});

test('QQ 学生的未知问法即使不含预设教务词也进入待解答列表',async t=>{
  const {app,store}=await createApp({dbPath:':memory:',logger:false,modelKey:'',botToken:'unknown-question-token',rateLimit:100});t.after(()=>app.close());
  const response=await app.inject({method:'POST',url:'/api/v1/internal/qq/answer',headers:{authorization:'Bearer unknown-question-token'},payload:{question:'实验服怎么领取',requestId:'unknown-question-request',qqSender:{id:'member_openid_unknown',name:'新生'}}});
  assert.equal(response.statusCode,200);assert.equal(response.json().source,'fallback');
  const pending=store.listUnmatched({status:'pending'});assert.equal(pending.total,1);assert.equal(pending.items[0].question,'实验服怎么领取');assert.equal(pending.items[0].type,'manual');assert.equal(pending.items[0].qqCount,1);assert.equal(pending.items[0].qqStudents[0].name,'新生');
});

test('待解答问题区分转人工、无关和离线未答，离线开关持久化',async t=>{
  const {app,store}=await createApp({dbPath:':memory:',logger:false,modelKey:'',botToken:'unmatched-types-token',rateLimit:100});t.after(()=>app.close());const botHeaders={authorization:'Bearer unmatched-types-token'};
  await app.inject({method:'POST',url:'/api/v1/internal/qq/answer',headers:botHeaders,payload:{question:'学校实验室开放时间怎么查询',requestId:'manual-question-request',qqSender:{id:'member_manual_123'}}});
  await app.inject({method:'POST',url:'/api/v1/internal/qq/answer',headers:botHeaders,payload:{question:'给我推荐一部电影',requestId:'unrelated-question-request',qqSender:{id:'member_unrelated_123'}}});
  const offline=await app.inject({method:'POST',url:'/api/v1/internal/qq/offline/questions',headers:botHeaders,payload:{question:'离线期间的选课问题',qqSender:{id:'member_offline_123'}}});assert.equal(offline.statusCode,201);
  assert.equal(store.listUnmatched({status:'pending',unmatchedType:'manual'}).total,1);assert.equal(store.listUnmatched({status:'pending',unmatchedType:'unrelated'}).total,1);assert.equal(store.listUnmatched({status:'pending',unmatchedType:'offline'}).total,1);
  store.setOfflineAutoReply(false);assert.equal(store.unmatchedPreferences().offlineAutoReply,false);store.setOfflineAutoReply(true);assert.equal(store.unmatchedPreferences().offlineAutoReply,true);
  assert.equal((await app.inject({method:'POST',url:`/api/v1/internal/qq/offline/questions/${offline.json().id}/complete`,headers:botHeaders,payload:{}})).statusCode,200);assert.equal(store.listUnmatched({status:'resolved',unmatchedType:'offline'}).total,1);
});

test('老师补充或关联答案后生成可恢复的 QQ 回发任务',async t=>{
  const {app,store}=await createApp({dbPath:':memory:',logger:false,modelKey:'',botToken:'resolved-reply-token',rateLimit:100});t.after(()=>app.close());
  const response=await app.inject({method:'POST',url:'/api/v1/internal/qq/answer',headers:{authorization:'Bearer resolved-reply-token'},payload:{question:'学校新生实验服怎么领取',requestId:'resolved-reply-request-1',qqSender:{id:'member_resolved_123',name:'Irene',chatKind:'group',targetId:'group_resolved_123',messageId:'source-message-1'}}});
  assert.equal(response.statusCode,200);
  const record=store.listUnmatched({status:'pending'}).items[0];
  const resolved=store.resolveUnmatched(record.id,'create','teacher',{question:record.question,answer:'请到学院教务办公室领取。',keywords:['实验服','领取'],category:'校园服务',status:'active',confirmed:true,libraryType:'answer'});
  assert.equal(resolved.queuedReplies,1);
  const task=store.claimUnmatchedReplies()[0];
  assert.deepEqual({questionId:task.questionId,targetId:task.targetId,kind:task.kind,senderName:task.senderName,answer:task.answer},{questionId:record.id,targetId:'group_resolved_123',kind:'group',senderName:'Irene',answer:'请到学院教务办公室领取。'});
  assert.equal(store.beginUnmatchedReply(task.id,task.claimToken).canSend,true);
  assert.deepEqual(store.completeUnmatchedReply(task.id,task.claimToken,'sent',undefined,'qq-receipt-1'),{ok:true});
  assert.deepEqual(store.claimUnmatchedReplies(),[]);
});
