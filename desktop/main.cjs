const { app,BrowserWindow,Menu,dialog,shell } = require('electron');
const { spawn,spawnSync } = require('node:child_process');
const { createWriteStream,existsSync,mkdirSync,copyFileSync,readFileSync,unlinkSync } = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const {provisionModels}=require('./model-bootstrap.cjs');

let mainWindow=null,stackProcess=null,shuttingDown=false,revealRequested=false,startupLogPath='';
app.setPath('userData',process.env.CAMPUS_DESKTOP_USER_DATA?path.resolve(process.env.CAMPUS_DESKTOP_USER_DATA):path.join(app.getPath('appData'),'校园教务小助手'));

function revealMainWindow(){
  if(!mainWindow||mainWindow.isDestroyed()){revealRequested=true;return;}
  revealRequested=false;
  if(mainWindow.isMinimized())mainWindow.restore();
  mainWindow.setSkipTaskbar(false);
  if(!mainWindow.isVisible())mainWindow.show();
  mainWindow.moveTop();
  mainWindow.focus();
}

const singleInstance=app.requestSingleInstanceLock();
if(!singleInstance)app.quit();
else app.on('second-instance',()=>revealMainWindow());

function freePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.unref();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const address=server.address();const port=typeof address==='object'&&address?address.port:0;server.close(error=>error?reject(error):resolve(port));});});}
function stopStack(){if(!stackProcess)return;const current=stackProcess;stackProcess=null;if(current.exitCode!==null)return;const pid=current.pid;if(process.platform==='win32')spawnSync('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else{try{process.kill(pid,'SIGTERM');}catch{}}}
function logTail(pathname){try{const text=readFileSync(pathname,'utf8').replace(/\r/g,'').trim(),lines=text.split('\n').filter(Boolean);return lines.slice(-24).join('\n').slice(-6000);}catch{return'';}}
function startupFailure(error){const message=error instanceof Error?error.message:String(error),tail=startupLogPath?logTail(startupLogPath):'';return [message,tail?'\n最近的后台日志：\n'+tail:'',startupLogPath?'\n完整日志：'+startupLogPath:''].filter(Boolean).join('\n');}
async function waitReady(url,process,errorState){for(let attempt=0;attempt<120;attempt++){if(errorState.value)throw errorState.value;if(process.exitCode!==null)throw new Error(`后台服务提前退出（退出码 ${process.exitCode}${process.signalCode?`，信号 ${process.signalCode}`:''}）`);try{const response=await fetch(url,{signal:AbortSignal.timeout(1000)});if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,500));}throw new Error('后台服务未能在 60 秒内就绪');}
async function launchStack(runtimeRoot,dataDirectory,localDirectory,configuredEnvironment,log){
  const bundledNode=path.join(process.resourcesPath,'runtime','node.exe'),executable=existsSync(bundledNode)?bundledNode:process.execPath;
  let lastError=new Error('后台服务启动失败');
  for(let attempt=1;attempt<=3;attempt++){
    const apiPort=await freePort();let webPort=await freePort();while(webPort===apiPort)webPort=await freePort();const url=`http://127.0.0.1:${webPort}`;
    const environment={...configuredEnvironment,CAMPUS_DESKTOP:'1',CAMPUS_ROOT:runtimeRoot,CAMPUS_DATA_DIR:dataDirectory,CAMPUS_LOCAL_DIR:localDirectory,DATABASE_PATH:path.join(dataDirectory,'campus.db'),API_HOST:'127.0.0.1',API_PORT:String(apiPort),WEB_HOST:'127.0.0.1',WEB_PORT:String(webPort),ALLOWED_ORIGINS:url,COOKIE_SECURE:'0',QQBOT_CREDENTIALS_FILE:path.join(dataDirectory,'qq-credentials.json'),BOT_API_BASE_URL:`http://127.0.0.1:${apiPort}`};
    if(executable===process.execPath)environment.ELECTRON_RUN_AS_NODE='1';else delete environment.ELECTRON_RUN_AS_NODE;
    log.write(`\n${new Date().toISOString()} 后台启动尝试 ${attempt}/3，运行时：${executable}\n`);
    const errorState={value:null};stackProcess=spawn(executable,[path.join(runtimeRoot,'scripts','stack.mjs')],{cwd:runtimeRoot,env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});const launched=stackProcess;launched.stdout.pipe(log);launched.stderr.pipe(log);launched.once('error',error=>{errorState.value=error;log.write(`\n${new Date().toISOString()} ${error.stack||error.message}\n`);});
    try{await waitReady(`${url}/api/v1/health/ready`,launched,errorState);return url;}catch(error){lastError=error instanceof Error?error:new Error(String(error));if(stackProcess===launched)stopStack();log.write(`${new Date().toISOString()} 启动尝试 ${attempt}/3 失败：${lastError.message}\n`);if(attempt<3)await new Promise(resolve=>setTimeout(resolve,500));}
  }
  throw lastError;
}
function createMenu(localDirectory,userData){Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'系统',submenu:[{label:'打开老师登录信息',click:()=>void shell.openPath(path.join(localDirectory,'首次登录.txt'))},{label:'打开本机数据目录',click:()=>void shell.openPath(userData)},{type:'separator'},{label:'退出',role:'quit'}]},{label:'视图',submenu:[{label:'刷新页面',role:'reload'},{label:'切换全屏',role:'togglefullscreen'}]},{label:'帮助',submenu:[{label:'关于校园教务小助手',click:()=>void dialog.showMessageBox({type:'info',title:'校园教务小助手',message:'校园教务小助手 桌面版',detail:'教师工作台、双模型管理、知识维护、QQ 机器人与多群通知。'})}]}]));}

function provisionModelSettings(runtimeRoot,dataDirectory,settings){
  const bootstrapPath=path.join(process.resourcesPath,'model-connections.bootstrap.json');
  if(!existsSync(bootstrapPath))return;
  const modelStateDirectory=settings.CAMPUS_MODEL_STATE_DIR?path.resolve(runtimeRoot,settings.CAMPUS_MODEL_STATE_DIR):dataDirectory;
  const destination=path.join(modelStateDirectory,'model-connections.json');
  provisionModels(bootstrapPath,destination);
}

async function start(){
  const runtimeRoot=app.getAppPath(),userData=app.getPath('userData'),dataDirectory=path.join(userData,'data'),localDirectory=path.join(userData,'.local'),logDirectory=path.join(userData,'logs');mkdirSync(dataDirectory,{recursive:true});mkdirSync(localDirectory,{recursive:true});mkdirSync(logDirectory,{recursive:true});
  const settingsPath=path.join(userData,'.env');if(!existsSync(settingsPath))copyFileSync(path.join(runtimeRoot,'.env.example'),settingsPath);
  const settings=require('dotenv').parse(readFileSync(settingsPath)),configuredEnvironment={...process.env,...settings};provisionModelSettings(runtimeRoot,dataDirectory,configuredEnvironment);
  const firstRun=!existsSync(path.join(localDirectory,'首次登录.txt'));startupLogPath=path.join(logDirectory,'desktop-stack.log');const log=createWriteStream(startupLogPath,{flags:'a'}),url=await launchStack(runtimeRoot,dataDirectory,localDirectory,configuredEnvironment,log);
  mainWindow=new BrowserWindow({title:'校园教务小助手',width:1440,height:960,minWidth:1024,minHeight:700,show:false,backgroundColor:'#ffffff',autoHideMenuBar:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
  mainWindow.webContents.setWindowOpenHandler(({url:target})=>{if(/^https?:\/\//.test(target))void shell.openExternal(target);return {action:'deny'};});
  mainWindow.webContents.on('will-navigate',(event,target)=>{if(new URL(target).origin!==url)event.preventDefault();});
  mainWindow.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  mainWindow.webContents.session.on('will-download',(event,item)=>{const selected=dialog.showSaveDialogSync(mainWindow,{title:'保存资料',defaultPath:item.getFilename(),buttonLabel:'保存'});if(!selected){event.preventDefault();item.cancel();return;}item.setSavePath(selected);});
  mainWindow.on('close',event=>{if(shuttingDown)return;event.preventDefault();mainWindow.hide();mainWindow.setSkipTaskbar(true);});
  mainWindow.on('closed',()=>{mainWindow=null;});await mainWindow.loadURL(`${url}/login`);revealMainWindow();createMenu(localDirectory,userData);
  if(firstRun){const result=await dialog.showMessageBox(mainWindow,{type:'info',title:'首次启动',message:'老师账号已经生成',detail:`登录信息保存在：\n${path.join(localDirectory,'首次登录.txt')}`,buttons:['打开登录信息','稍后'],defaultId:0,cancelId:1});if(result.response===0)void shell.openPath(path.join(localDirectory,'首次登录.txt'));}
}

if(singleInstance)app.whenReady().then(()=>start()).catch(async error=>{await dialog.showMessageBox({type:'error',title:'启动失败',message:'校园教务小助手未能启动',detail:startupFailure(error)});app.quit();});
app.on('activate',()=>revealMainWindow());
app.on('window-all-closed',()=>{});
app.on('before-quit',event=>{if(shuttingDown)return;shuttingDown=true;event.preventDefault();stopStack();app.exit(0);});
