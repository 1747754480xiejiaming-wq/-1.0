import { chromium,expect } from '@playwright/test';
import { spawn,spawnSync,execFileSync } from 'node:child_process';
import { mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync } from 'node:fs';
import { resolve,join,dirname } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const root=process.cwd(),runtime=mkdtempSync(join(tmpdir(),'campus-desktop-smoke-')),data=join(runtime,'data'),local=join(runtime,'.local');mkdirSync(data);mkdirSync(local);
const environment={...process.env,CAMPUS_DESKTOP_USER_DATA:runtime,CAMPUS_MODEL_STATE_DIR:join(runtime,'models'),CAMPUS_DATA_DIR:data,CAMPUS_LOCAL_DIR:local,DATABASE_PATH:join(data,'campus.db'),DEEPSEEK_API_KEY:'',BOT_API_TOKEN:''};
const setup=spawnSync(process.execPath,['apps/api/dist/cli.js','setup','--demo'],{cwd:root,env:environment,windowsHide:true,encoding:'utf8'});assert.equal(setup.status,0);
const credentials=readFileSync(join(local,'首次登录.txt'),'utf8'),username=credentials.match(/账号：(.*)/)[1].trim(),password=credentials.match(/口令：(.*)/)[1].trim();
const version=JSON.parse(readFileSync(resolve('package.json'),'utf8')).version;
const exe=resolve(`release/desktop/校园教务小助手-桌面版-${version}.exe`);
let child,browser,origin;const checks=[];
async function launch(){
 child=spawn(exe,['--remote-debugging-port=9339'],{cwd:root,env:environment,windowsHide:true,stdio:'ignore'});
 let ready=false;for(let i=0;i<360;i++){try{ready=(await fetch('http://127.0.0.1:9339/json/version',{signal:AbortSignal.timeout(500)})).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,500));}assert.equal(ready,true,'portable starts');
 browser=await chromium.connectOverCDP('http://127.0.0.1:9339');let page;
 for(let i=0;i<360;i++){page=browser.contexts()[0]?.pages().find(p=>/^http:\/\/127\.0\.0\.1:/.test(p.url()));if(page)break;await new Promise(r=>setTimeout(r,500));}assert.ok(page,'desktop login loaded');origin=new URL(page.url()).origin;return page;
}
async function login(page){await page.getByLabel('账号').fill(username);await page.getByLabel('口令').fill(password);await page.getByRole('button',{name:'进入工作台'}).click();await expect(page.getByRole('heading',{name:'工作概览'})).toBeVisible();}
async function close(){
 const session=await browser.newBrowserCDPSession();await Promise.race([session.send('Browser.close').catch(()=>{}),new Promise(r=>setTimeout(r,1500))]);await Promise.race([browser.close().catch(()=>{}),new Promise(r=>setTimeout(r,1500))]);browser=null;
 for(let i=0;i<50;i++){try{await fetch(origin+'/api/v1/health/ready',{signal:AbortSignal.timeout(300)});}catch{return;}await new Promise(r=>setTimeout(r,200));}throw new Error('关闭后本机 API 仍在运行');
}
try{
 let page=await launch();checks.push('便携 EXE 解压并打开独立窗口');await login(page);checks.push('内置 API、SQLite、老师登录');
 await expect(page.locator('.theme-root')).toHaveClass(/ink-study/);await expect(page.locator('.theme-root')).toHaveCSS('background-color','rgb(255, 255, 255)');assert.equal((await page.request.get(origin+'/art/ink-study.png')).status(),200);checks.push('白底水墨主题与内置山水素材');
 await page.goto(origin+'/');await expect(page.getByRole('heading',{name:'工作概览'})).toBeVisible();assert.equal((await page.request.post(origin+'/api/v1/answer',{data:{question:'如何申请缓考？',requestId:'removed-student-api'}})).status(),404);checks.push('首页进入教师工作台；学生公开问答接口已删除');
 await page.goto(origin+'/admin/settings');for(const name of ['Qwen','DeepSeek']){const card=page.getByRole('region',{name:name+'模型',exact:true});await expect(card.getByRole('heading',{name,exact:true})).toBeVisible();await expect(card.getByRole('button',{name:'连接',exact:true})).toBeVisible();await expect(card.getByLabel(name+' API Key')).toHaveCount(0);}await expect(page.getByRole('region',{name:'本周模型用量'})).toBeVisible();await expect(page.getByRole('heading',{name:'问答规则'})).toHaveCount(0);await page.screenshot({path:'qa/screenshots/desktop-exe-models.png',fullPage:true});checks.push('后台模型连接、无密钥输入和无问答规则展示');
 // A second click must not clean files used by the already-running desktop.
 const apiPid=Number(readFileSync(join(data,'api.pid'),'utf8'));
 const executable=execFileSync('powershell.exe',['-NoProfile','-Command',`[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); (Get-CimInstance Win32_Process -Filter 'ProcessId = ${apiPid}').ExecutablePath`],{encoding:'utf8',windowsHide:true}).trim();
 const runner=join(dirname(executable),'resources/app/apps/qq-bot/dist/index.js');assert.ok(existsSync(runner),'packaged bot exists before second launch');
 const repeated=spawn(exe,[],{cwd:root,env:environment,windowsHide:true,stdio:'ignore'});
 await new Promise((done,reject)=>{const timer=setTimeout(()=>reject(new Error('重复打开未在限定时间退出')),180000);repeated.once('exit',code=>{clearTimeout(timer);code===0?done():reject(new Error('重复打开退出异常 '+code));});repeated.once('error',reject);});
 assert.ok(existsSync(runner),'second launcher must preserve the first bot file');assert.equal((await page.request.get(origin+'/art/ink-study.png')).status(),200);const statusProbe=await page.request.get(origin+'/api/v1/admin/status');assert.equal(statusProbe.status(),200,await statusProbe.text());checks.push('重复打开 EXE 后主窗口的机器人文件、页面资源与 API 仍完整');await page.goto(origin+'/admin/settings');await page.reload({waitUntil:'networkidle'});await expect(page.getByRole('heading',{name:'运行状态'})).toBeVisible();
 // Replace only this isolated test runtime's worker to test actual process start/stop without contacting QQ.
 const originalRunner=readFileSync(runner);writeFileSync(runner,'setInterval(() => {}, 1000);\n');
 try{await page.getByPlaceholder('请输入 AppID',{exact:true}).fill('123456789');await page.getByPlaceholder('请输入 AppSecret',{exact:true}).fill('isolated-desktop-test-secret');await page.getByRole('button',{name:'保存凭证',exact:true}).click();await expect(page.getByText('凭证已保存，QQ 消息接收进程将自动连接。')).toBeVisible();
 const control=page.getByRole('region',{name:'服务连接'}).getByRole('switch',{name:'QQ机器人开关'});await expect(control).toBeEnabled();await control.click();await expect(control).toBeChecked();await expect(control).toBeEnabled();await control.click();await expect(control).not.toBeChecked();checks.push('重复打开后侧栏实际启动和停止本机机器人进程（隔离替身）');
 }finally{writeFileSync(runner,originalRunner);}
 const token=JSON.parse(readFileSync(join(data,'runtime-secrets.json'),'utf8')).botToken,botHeaders={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const sourceQuestion='学校新生实验服领取流程在哪里查看';
 assert.equal((await fetch(origin+'/api/v1/internal/qq/answer',{method:'POST',headers:botHeaders,body:JSON.stringify({question:sourceQuestion,requestId:'desktop-student-source-1',qqSender:{id:'desktop_student_openid_123456',name:'材料一班小林'}})})).status,200);
 assert.equal((await fetch(origin+'/api/v1/internal/qq/answer',{method:'POST',headers:botHeaders,body:JSON.stringify({question:sourceQuestion,requestId:'desktop-student-source-2',qqSender:{id:'desktop_student_openid_654321'}})})).status,200);
 await page.goto(origin+'/admin/unmatched');const sourceItem=page.getByRole('article').filter({hasText:sourceQuestion});await expect(sourceItem).toContainText('材料一班小林');await expect(sourceItem).toContainText('QQ号待核实');await expect(sourceItem).not.toContainText('desktop_student_openid_123456');const sourceCard=sourceItem.locator('.qq-student').filter({hasText:'材料一班小林'});await sourceCard.getByRole('button',{name:'补录QQ号'}).click();const identityDialog=page.getByRole('dialog',{name:'核实学生 QQ 资料'});await identityDialog.getByLabel('QQ 昵称').fill('Irene');await identityDialog.getByLabel('QQ号').fill('3556762784');await identityDialog.getByRole('button',{name:'保存资料'}).click();await expect(sourceItem).toContainText('Irene');await expect(sourceItem).toContainText('QQ号：3556762784');checks.push('待处理问题展示 QQ 昵称并可核实号码，不显示 OpenID');
 for(const openId of ['desktop_test_123456','desktop_test_654321'])assert.equal((await fetch(origin+'/api/v1/internal/qq/groups',{method:'POST',headers:botHeaders,body:JSON.stringify({openId})})).status,200);
 await page.getByRole('link',{name:'一键通知',exact:true}).click();await page.getByRole('combobox',{name:'选择通知群聊'}).click();await page.getByRole('menuitemcheckbox').nth(0).click();await page.getByRole('menuitemcheckbox').nth(1).click();await page.keyboard.press('Escape');await page.getByLabel('通知标题').fill('桌面版隔离验证');await page.getByLabel('通知内容').fill('此消息仅在临时数据库验证，不向真实 QQ 群发送。');
 // Simulate an accepted POST whose response is lost, then retry from the UI.
 let dropped=false;await page.route('**/api/v1/admin/notifications',async route=>{if(route.request().method()==='POST'&&!dropped){dropped=true;await route.fetch();await route.abort('failed');}else await route.continue();});
 await page.getByRole('button',{name:'发送到 2 个群'}).click();await expect(page.getByRole('button',{name:'发送到 2 个群'})).toBeEnabled();await page.getByRole('button',{name:'发送到 2 个群'}).click();await expect(page.getByText('通知已进入发送队列，共 2 个群聊。')).toBeVisible();
 const records=await page.request.get(origin+'/api/v1/admin/notifications');assert.equal((await records.json()).items.length,1);checks.push('两个群选择；丢失响应后重试仅生成一条通知');
 const response=await fetch(origin+'/api/v1/internal/qq/notifications/claim',{method:'POST',headers:botHeaders,body:JSON.stringify({limit:5})}),items=(await response.json()).items;assert.equal(items.length,2);
 for(const item of items){assert.equal((await (await fetch(origin+`/api/v1/internal/qq/notifications/${item.id}/begin`,{method:'POST',headers:botHeaders,body:JSON.stringify({claimToken:item.claimToken})})).json()).canSend,true);assert.equal((await fetch(origin+`/api/v1/internal/qq/notifications/${item.id}/result`,{method:'POST',headers:botHeaders,body:JSON.stringify({claimToken:item.claimToken,status:'sent'})})).status,200);}
 await expect(page.getByText('全部已发送',{exact:true})).toBeVisible({timeout:12000});checks.push('模拟逐群回执及自动刷新');
 await page.getByRole('button',{name:'复制通知',exact:true}).click();await expect(page.getByText('通知已复制',{exact:true})).toBeVisible();checks.push('实际 Electron 窗口复制通知');
 await page.screenshot({path:'qa/screenshots/desktop-exe-notifications.png',fullPage:true});await close();checks.push('关闭窗口释放 API 端口');
 page=await launch();await expect(page.getByRole('heading',{name:'工作概览'})).toBeVisible();await page.goto(origin+'/admin/notifications');await expect(page.getByText('桌面版隔离验证',{exact:true})).toBeVisible();await expect(page.getByText('全部已发送',{exact:true})).toBeVisible();checks.push('重启保留账号、群聊和发送记录');
 await page.getByRole('button',{name:'删除记录',exact:true}).click();const deletion=page.getByRole('dialog',{name:'删除发送记录'});await expect(deletion).toBeVisible();await deletion.getByRole('button',{name:'确认删除',exact:true}).click();await expect(page.getByText('发送记录已删除。',{exact:true})).toBeVisible();await expect(page.getByText('桌面版隔离验证',{exact:true})).toHaveCount(0);await page.reload();await expect(page.getByRole('heading',{name:'一键发送通知'})).toBeVisible();await expect(page.getByText('桌面版隔离验证',{exact:true})).toHaveCount(0);checks.push('桌面删除发送记录并刷新后保持删除');await close();
 writeFileSync('qa/desktop-smoke.json',JSON.stringify({passed:true,date:new Date().toISOString(),executable:exe,checks},null,2));console.log(JSON.stringify({passed:true,checks},null,2));
}finally{if(browser)await close().catch(()=>{});if(child&&child.exitCode===null)spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}
