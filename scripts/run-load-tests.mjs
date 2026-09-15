import { spawn } from 'node:child_process';
import { createWriteStream,existsSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';

const root=process.cwd(),runtime=resolve('qa','load-'+new Date().toISOString().replace(/[:.]/g,'-'));
mkdirSync(runtime,{recursive:true});
const k6=process.env.K6_EXE||resolve('qa/tools/k6/k6-v2.2.0-windows-amd64/k6.exe');
if(!existsSync(k6))throw new Error('请安装 k6，并把 K6_EXE 设为 k6 可执行文件绝对路径。');
const output=createWriteStream(join(runtime,'server.log'));
const server=spawn(process.execPath,['--import','tsx','scripts/load-server.ts'],{cwd:root,env:{...process.env,LOAD_RUNTIME:runtime,LOAD_API_PORT:'3201'},windowsHide:true,stdio:['ignore','pipe','pipe']});server.stdout.pipe(output);server.stderr.pipe(output);
const results=[];
try{
 let ready=false;for(let i=0;i<60;i++){if(server.exitCode!==null)throw new Error('测试 API 启动失败');try{ready=(await fetch('http://127.0.0.1:3201/api/v1/health/ready')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,500));}if(!ready)throw new Error('测试 API 未就绪');
 const scenarios=(process.env.LOAD_SCENARIOS||'baseline,peak,spike,students2000,soak,queue').split(',').map(value=>value.trim()).filter(Boolean);
 for(const scenario of scenarios){
  console.log('开始压测：'+scenario);
  const log=createWriteStream(join(runtime,scenario+'.log')),summary=join(runtime,scenario+'.json');
  const script=scenario==='queue'?'load-tests/notification-queue.js':scenario==='export'?'load-tests/faq-export.js':'load-tests/campus-load.js';
  const child=spawn(k6,['run','--quiet','--summary-export',summary,script],{cwd:root,env:{...process.env,SCENARIO:scenario},windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.pipe(log);child.stderr.pipe(log);
  const exitCode=await new Promise((done,reject)=>{child.once('error',reject);child.once('exit',done);});log.end();
  results.push({scenario,exitCode,summary:JSON.parse(readFileSync(summary,'utf8'))});console.log('压测结束：'+scenario+'，退出码 '+exitCode);
 }
 const db=new Database(join(runtime,'campus.db'),{readonly:true});
 const integrity=db.pragma('integrity_check',{simple:true}),queue=db.prepare('SELECT status,count(*) AS count FROM notification_targets GROUP BY status').all(),duplicates=db.prepare('SELECT count(*) AS n FROM (SELECT notification_id,group_id,count(*) AS n FROM notification_targets GROUP BY notification_id,group_id HAVING n>1)').get(),notifications=db.prepare('SELECT count(*) AS n FROM notifications').get();db.close();
 const report={date:new Date().toISOString(),runtime,node:process.version,platform:process.platform,cpus:os.cpus()[0]?.model,logicalProcessors:os.cpus().length,memoryGB:os.totalmem()/1024**3,integrity,queue,duplicates,notifications,results};
 writeFileSync(join(runtime,'report.json'),JSON.stringify(report,null,2));writeFileSync('qa/latest-load-report.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({runtime,integrity,queue,duplicates,results:results.map(({scenario,exitCode,summary})=>({scenario,exitCode,requests:summary.metrics.http_reqs.count,p95:summary.metrics.http_req_duration['p(95)'],p99:summary.metrics.http_req_duration['p(99)'],failed:summary.metrics.http_req_failed.value}))},null,2));
 if(results.some(x=>x.exitCode!==0)||integrity!=='ok'||duplicates.n!==0||queue.some(x=>x.status!=='sent'))process.exitCode=1;
}finally{server.kill();output.end();}
