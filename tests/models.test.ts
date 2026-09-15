import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { ModelBudget,WEEKLY_LIMIT_NANO,weekWindow } from '../apps/api/src/services/model-budget.js';
import { Models } from '../apps/api/src/services/models.js';
import { loadConfig } from '../apps/api/src/config.js';
import { Store } from '../apps/api/src/db/store.js';
import { AnswerService,combineImageAndTextQuestion } from '../apps/api/src/services/answer.js';
import { createApp } from '../apps/api/src/app.js';
import { hashPassword } from '../apps/api/src/services/auth.js';
import { validateImages } from '../apps/api/src/services/images.js';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jqV8AAAAASUVORK5CYII=';
function reply(content:unknown,status=200,usage:unknown={prompt_tokens:300,completion_tokens:25}){return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)}}],usage}),{status,headers:{'Content-Type':'application/json'}});}
const root=process.cwd();
test('两个模型、两个数据库连接共用周额度，并发预留不能越界',t=>{
 const file=join(mkdtempSync(join(tmpdir(),'campus-budget-')),'ledger.db'),a=new ModelBudget(file,4),b=new ModelBudget(file,4);t.after(()=>{a.close();b.close();});
 assert.equal(WEEKLY_LIMIT_NANO,20_000_000_000);
 const first=a.reserve('deepseek','deepseek-v4-flash',4_000_000,0),second=b.reserve('qwen','qwen-vl-plus',10_000_000,0);
 assert.equal(a.usage().consumedPercent,100);assert.throws(()=>b.reserve('qwen','qwen-vl-plus',1,1),/本周模型额度/);
 a.settle(first,{inputTokens:4_000_000,outputTokens:0});b.settle(second,{inputTokens:10_000_000,outputTokens:0});
 assert.equal(a.usage().totalTokens,14_000_000);assert.equal(a.usage().exhausted,true);assert.equal((a.db.prepare('SELECT sum(charged_nano) AS n FROM model_calls').get() as {n:number}).n,WEEKLY_LIMIT_NANO);
 const json=JSON.stringify(a.usage());assert.ok(!/charged|nano|apiKey|amount|price/i.test(json));
});
test('北京时间周一重置；超时预占跨重启保留；正常回执只结算一次',()=>{
 const file=join(mkdtempSync(join(tmpdir(),'campus-budget-restart-')),'ledger.db'),sunday=Date.parse('2026-09-06T15:59:00Z'),monday=Date.parse('2026-09-06T16:00:00Z');
 assert.equal(weekWindow(sunday).key,'2026-08-31');assert.equal(weekWindow(monday).key,'2026-09-07');let b=new ModelBudget(file);const id=b.reserve('qwen','qwen-vl-plus',1000,256,sunday);b.close();b=new ModelBudget(file);
 try{assert.equal(b.usage(sunday+30000).activeCalls,1);assert.equal(b.usage(monday).consumedPercent,0);assert.equal(b.usage(sunday+121000).unknownCalls,0);assert.equal((b.db.prepare('SELECT status FROM model_calls WHERE id=?').get(id) as {status:string}).status,'unknown');b.settle(id,{inputTokens:100,outputTokens:10},false,monday);b.settle(id,{inputTokens:999,outputTokens:999},false,monday);assert.equal((b.db.prepare('SELECT input_tokens FROM model_calls WHERE id=?').get(id) as {input_tokens:number}).input_tokens,100);}finally{b.close();}
});
test('Plus 升级 Pro 后周额度扩大为 5 倍并持久保留',()=>{
 const file=join(mkdtempSync(join(tmpdir(),'campus-plan-')),'ledger.db');let budget=new ModelBudget(file);assert.deepEqual(budget.plan(),{plan:'plus',quotaMultiplier:1,updatedAt:0});
 const id=budget.reserve('deepseek','deepseek-v4-flash',4_000_000,0);budget.settle(id,{inputTokens:4_000_000,outputTokens:0});assert.equal(budget.usage().consumedPercent,60);const upgraded=budget.upgradeToPro(1234);assert.deepEqual(upgraded,{plan:'pro',quotaMultiplier:5,updatedAt:1234});assert.equal(budget.usage().consumedPercent,12);budget.close();budget=new ModelBudget(file);try{assert.equal(budget.plan().plan,'pro');const extra=budget.reserve('deepseek','deepseek-v4-flash',20_000_000,0);assert.ok(extra);}finally{budget.close();}
});
test('设置只启用一个文字模型；QQ 图片由智谱视觉模型转成问题后进入回答管道',async t=>{
 const requests:{url:string;body:any}[]=[],fetcher:typeof fetch=async(url,init)=>{const body=JSON.parse(init?.body as string);requests.push({url:String(url),body});return body.messages[0].content.includes('图片问题识别器')?reply({question:'如何申请缓考？',sensitive:false}):reply({faqId:'exam-deferral',match:'clear'});};
 const config=loadConfig({modelKey:'fake-deepseek-key',model:'deepseek-v4-flash',logger:false}),store=new Store(':memory:',root),models=new Models(config,true,fetcher);store.seedDemo();models.settings.saveKey('qwen','fake-qwen-key');models.settings.connected('qwen',true);t.after(()=>{models.close();store.close();});const service=new AnswerService(store,config,undefined,models);
 assert.equal((await service.answer({question:'考试当天有事不能到场怎么处理',requestId:randomUUID()},'qq')).faqId,'exam-deferral');assert.equal(requests.at(-1)!.body.model,'deepseek-v4-flash');
 models.settings.saveKey('zhipu','fake-zhipu-key');models.settings.connected('zhipu',true);assert.equal(models.settings.active(),'deepseek');models.settings.select('zhipu');assert.equal((await service.answer({question:'考试当天有事不能到场怎么处理',requestId:randomUUID()},'qq')).faqId,'exam-deferral');assert.equal(requests.at(-1)!.body.model,'glm-5.3-flash');assert.equal(requests.at(-1)!.body.reasoning_effort,'low');assert.equal(requests.at(-1)!.body.thinking,undefined);assert.match(requests.at(-1)!.url,/open\.bigmodel\.cn/);
 models.settings.connected('deepseek',true);models.settings.select('deepseek');assert.equal(models.settings.active(),'deepseek');
 const input={question:'请识别图片里的问题',images:[png],requestId:randomUUID()},result=await service.answer(input,'qq');assert.equal(requests.at(-1)!.body.model,'glm-4.6v-flash');assert.equal(result.answer,store.getFaq('exam-deferral')!.answer);assert.equal(requests.at(-1)!.body.messages[1].content[0].image_url.url,png);
 const n=requests.length;assert.deepEqual(await service.answer(input,'qq'),result);assert.equal(requests.length,n);await assert.rejects(service.answer({...input,images:[png+'x']},'qq'));
 assert.equal(models.status().usage.totalTokens,975);
 models.settings.connected('zhipu',false);assert.equal((await service.answer({...input,requestId:randomUUID()},'qq')).fallbackReason,'image_model_not_connected');
});
test('同一条私聊消息的图片语义和学生文字合并后再进入正常检索',()=>{
 assert.equal(combineImageAndTextQuestion('这个怎么去申请','图片为推荐优秀应届本科毕业生免试攻读研究生管理办法通知'),'图片为推荐优秀应届本科毕业生免试攻读研究生管理办法通知；学生补充：这个怎么去申请');
 assert.equal(combineImageAndTextQuestion('如何申请缓考','图片显示如何申请缓考及材料清单'),'图片显示如何申请缓考及材料清单');
 assert.equal(combineImageAndTextQuestion('','图片显示推免申请条件'),'图片显示推免申请条件');
});
test('识别敏感图片拒绝后续匹配；无效图片地址不能进入模型',async t=>{
 let calls=0;const config=loadConfig({modelKey:'',zhipuKey:'fake-key',logger:false}),store=new Store(':memory:',root),models=new Models(config,true,async()=>{calls++;return reply({question:'',sensitive:true});});models.settings.select('zhipu');models.settings.connected('zhipu',true);t.after(()=>{models.close();store.close();});
 const result=await new AnswerService(store,config,undefined,models).answer({question:'',images:[png],requestId:randomUUID()},'qq');assert.equal(result.fallbackReason,'sensitive_input');assert.equal(calls,1);assert.equal(store.listUnmatched({}).total,0);
 for(const url of ['http://127.0.0.1/private','https://multimedia.nt.qq.com.evil.test/a.png','https://user:pass@gchat.qpic.cn/a.png','data:image/png;base64,YWJj'])assert.throws(()=>validateImages([url]));
 assert.match(validateImages(['http://gchat.qpic.cn/a.png'])[0],/^https:/);
});
test('返回无效 JSON 仍计 Token；401 不占额度；网络结果不明保留额度',async t=>{
 const config=loadConfig({modelKey:'fake-key',logger:false});let mode='json';const models=new Models(config,true,async()=>{if(mode==='network')throw new Error('timeout');return mode==='auth'?reply({},401):reply({bad:'format'});});t.after(()=>models.close());
 await assert.rejects(models.run('deepseek','教务问题',[]));assert.equal(models.status().usage.totalTokens,325);const before=models.status().usage.consumedPercent;
 mode='auth';await assert.rejects(models.run('deepseek','教务问题',[]));assert.equal(models.status().usage.consumedPercent,before);
 assert.equal(models.available('deepseek'),false);models.settings.connected('deepseek',true);
 mode='network';await assert.rejects(models.run('deepseek','教务问题',[]));assert.equal(models.status().usage.unknownCalls,1);
});
test('设置可选择未连接模型，但调用必须同时满足选择与连接',async t=>{
 const config=loadConfig({modelKey:'fake-deepseek-key',logger:false}),models=new Models(config,true,async()=>reply({faqId:null,match:'none'}));t.after(()=>models.close());
 models.settings.saveKey('zhipu','fake-zhipu-key');models.settings.select('zhipu');assert.equal(models.settings.active(),'zhipu');
 await assert.rejects(models.run('zhipu','教务问题',[]),/该模型无权限/);
 models.settings.connected('zhipu',true);models.settings.select('deepseek');await assert.rejects(models.run('zhipu','教务问题',[]),/该模型无权限/);
});
test('API 进程重新启动后清除开发管理系统解锁状态',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'campus-developer-reset-')),options={dbPath:join(directory,'campus.db'),dataDir:directory,modelStateDir:join(directory,'models'),logger:false,modelKey:'',developerKey:'test-developer-key-123'};
 const first=await createApp(options);first.store.setAdmin('teacher',await hashPassword('test-password-123'));const login=await first.app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:'teacher',password:'test-password-123'}}),cookie=login.cookies[0].name+'='+login.cookies[0].value,headers={cookie,'x-csrf-token':login.json().csrfToken};
 assert.equal((await first.app.inject({method:'POST',url:'/api/v1/admin/developer/unlock',headers,payload:{key:'test-developer-key-123'}})).statusCode,200);assert.equal((await first.app.inject({url:'/api/v1/admin/developer/access',headers:{cookie}})).json().unlocked,true);await first.app.close();
 const second=await createApp(options);try{const access=await second.app.inject({url:'/api/v1/admin/developer/access',headers:{cookie}});assert.equal(access.statusCode,200);assert.equal(access.json().unlocked,false);}finally{await second.app.close();}
});
test('开发者解锁后才能连接模型；API 不泄露密钥或金额；旧学生接口已删除',async t=>{
 let calls=0;const {app,store,models}=await createApp({dbPath:':memory:',logger:false,modelKey:'',botToken:'fake-bot',developerKey:'test-developer-key-123'},{modelFetch:async()=>{calls++;return reply({faqId:'connection-check',match:'clear'});}});t.after(()=>app.close());
 store.setAdmin('teacher',await hashPassword('test-password-123'));const login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:'teacher',password:'test-password-123'}}),cookie=login.cookies[0].name+'='+login.cookies[0].value,headers={cookie,'x-csrf-token':login.json().csrfToken};
 assert.equal((await app.inject('/api/v1/admin/models')).statusCode,401);assert.equal((await app.inject({method:'POST',url:'/api/v1/admin/models/zhipu/connect',headers:{cookie},payload:{apiKey:'sensitive-test-key'}})).statusCode,403);
 assert.equal((await app.inject({method:'POST',url:'/api/v1/admin/models/zhipu/connect',headers,payload:{apiKey:'sensitive-test-key'}})).statusCode,403);assert.equal((await app.inject({method:'POST',url:'/api/v1/admin/developer/unlock',headers,payload:{key:'test-developer-key-123'}})).statusCode,200);
 const connected=await app.inject({method:'POST',url:'/api/v1/admin/models/zhipu/connect',headers,payload:{apiKey:'sensitive-test-key'}});assert.equal(connected.statusCode,200);assert.equal(connected.json().providers.find((item:any)=>item.provider==='zhipu').connected,true);assert.equal(connected.json().activeTextProvider,'deepseek');assert.ok(!connected.body.includes('sensitive-test-key'));assert.ok(!/charged_nano|amount|cost|price/i.test(connected.body));
 models.settings.select('zhipu');
 models.budget.db.prepare("UPDATE model_calls SET charged_nano=? WHERE status='completed'").run(WEEKLY_LIMIT_NANO);
 const before=calls,result=await app.inject({method:'POST',url:'/api/v1/internal/qq/answer',headers:{authorization:'Bearer fake-bot'},payload:{question:'',images:[png],requestId:randomUUID()}});assert.equal(result.json().fallbackReason,'weekly_limit');assert.match(result.json().answer,/拒绝调用/);assert.equal(calls,before);
 assert.equal((await app.inject({method:'POST',url:'/api/v1/answer',payload:{question:'公开流程',requestId:randomUUID()}})).statusCode,404);assert.equal((await app.inject('/api/v1/suggestions')).statusCode,404);
});
