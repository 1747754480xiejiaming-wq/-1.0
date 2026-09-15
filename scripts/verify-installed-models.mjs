import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,mkdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
const payload=resolve(process.argv[2]),root=join(payload,'resources/app');
const data=mkdtempSync(join(tmpdir(),'campus-installed-model-check-'));
const req=createRequire(join(root,'package.json'));
req('./desktop/model-bootstrap.cjs').provisionModels(join(payload,'resources/model-connections.bootstrap.json'),join(data,'model-connections.json'));
async function port(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const apiPort=await port(),webPort=await port(),origin='http://127.0.0.1:'+webPort;
const env={};for(const k of ['SystemRoot','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[k])env[k]=process.env[k];
Object.assign(env,{PATH:join(process.env.SystemRoot,'System32'),CAMPUS_DESKTOP:'1',CAMPUS_ROOT:root,CAMPUS_DATA_DIR:data,CAMPUS_MODEL_STATE_DIR:data,CAMPUS_LOCAL_DIR:join(data,'.local'),DATABASE_PATH:join(data,'campus.db'),API_PORT:String(apiPort),WEB_PORT:String(webPort),API_HOST:'127.0.0.1',WEB_HOST:'127.0.0.1',ALLOWED_ORIGINS:origin,COOKIE_SECURE:'0'});
const child=spawn(join(payload,'resources/runtime/node.exe'),[join(root,'scripts/stack.mjs')],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.on('data',b=>stderr=(stderr+b.toString()).slice(-2000));child.stdout.resume();
let cookie='',csrf='';
async function request(path,body){const r=await fetch(origin+'/api/v1'+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie,'X-CSRF-Token':csrf}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const result=await r.json();if(!r.ok)throw Error(path+' status '+r.status+' '+result.error?.code);if(result.csrfToken)csrf=result.csrfToken;return result;}
try{
 let ready=false;for(let i=0;i<60;i++){try{const r=await fetch(origin+'/api/v1/health/ready',{signal:AbortSignal.timeout(500)});if(r.ok){ready=true;break}}catch{}if(child.exitCode!==null)throw Error('Packaged service exited');await new Promise(r=>setTimeout(r,500));}assert(ready,'startup timeout');
 const secrets=JSON.parse(readFileSync(join(data,'runtime-secrets.json'),'utf8'));
 await request('/auth/register',{username:'package-check',password:'package-check-password-2026',registrationCode:secrets.registrationCode});
 await request('/admin/developer/unlock',{key:secrets.developerKey});
 let status=await request('/admin/models');
 for(const p of ['deepseek','zhipu'])assert(status.providers.find(x=>x.provider===p)?.keyConfigured,p+' missing key');
 for(const provider of ['deepseek','zhipu']){
  // Empty body is exactly the UI connect action; do not supply a test API key.
  const result=await request('/admin/models/'+provider+'/connect',{});
  assert(result.ok);assert(result.providers.find(x=>x.provider===provider).connected);
  console.log(JSON.stringify({provider,keyPreconfigured:true,connectHttp:200,connected:true}));
 }
 const html=await (await fetch(origin+'/login')).text();assert(html.includes('/assets/'));
 status=await request('/admin/models');assert(status.providers.filter(x=>['deepseek','zhipu'].includes(x.provider)).every(x=>x.connected));
 console.log(JSON.stringify({healthReady:true,registration:true,developerUnlock:true,bothConnected:true,activeTextProvider:status.activeTextProvider,isolatedData:data}));
}finally{
 if(child.exitCode===null)spawnSync(join(process.env.SystemRoot,'System32/taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
}
