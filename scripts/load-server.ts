import { randomBytes } from 'node:crypto';
import { appendFileSync,mkdirSync,writeFileSync } from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { resolve,join } from 'node:path';
import { createApp } from '../apps/api/src/app.js';
import { hashPassword } from '../apps/api/src/services/auth.js';

const root=process.cwd(),runtime=resolve(process.env.LOAD_RUNTIME||'qa/load-runtime'),port=Number(process.env.LOAD_API_PORT||3201);mkdirSync(runtime,{recursive:true});
const {app,store}=await createApp({root,modelStateDir:join(runtime,'models'),dataDir:join(runtime,'data'),localDir:join(runtime,'.local'),dbPath:join(runtime,'campus.db'),port,logger:false,modelKey:'',botToken:'load-bot-token',rateLimit:100000,origins:[`http://127.0.0.1:${port}`]});
store.seedDemo();const user=await store.setAdmin('load-teacher',await hashPassword('load-test-password-123')),token=randomBytes(24).toString('base64url'),csrf=randomBytes(24).toString('base64url');store.saveSession(token,user.id,csrf);
const now=Date.now(),insertFaq=store.sqlite.prepare("INSERT INTO faqs(id,question,question_key,answer,keywords,category,library_type,status,version,is_demo,owner_id,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,'answer','disabled',1,0,'legacy','load-test',?,?)");
store.transaction(()=>{for(let index=1;index<=5000;index++){const id=`load-export-${index}`,question=`负载测试题目 ${String(index).padStart(5,'0')}`;insertFaq.run(id,question,`legacy:loadexport${index}`,`这是第 ${index} 条用于验证 Excel 题目导出稳定性的标准答案。`.repeat(8),JSON.stringify([`负载测试${index}`,'导出稳定性']),'考试与成绩',now+index,now+index);}});
for(let index=1;index<=10;index++)store.registerQqGroup(`load_group_openid_${String(index).padStart(6,'0')}`);
writeFileSync('qa/load-session.json',JSON.stringify({baseUrl:`http://127.0.0.1:${port}`,cookie:`campus_session=${token}`,csrf,botToken:'load-bot-token',groupIds:store.listQqGroups().map(group=>group.id),exportRows:store.listFaqsForExport('answer').length},null,2));
await app.listen({host:'127.0.0.1',port,backlog:4096});console.log(`负载测试服务已就绪：http://127.0.0.1:${port}`);
const lag=monitorEventLoopDelay({resolution:20});lag.enable();
const monitor=setInterval(()=>{appendFileSync(join(runtime,'resources.jsonl'),JSON.stringify({at:Date.now(),...process.memoryUsage(),cpu:process.cpuUsage(),eventLoopP99Ms:lag.percentile(99)/1e6})+'\n');lag.reset();},5000);monitor.unref();
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>void app.close());
