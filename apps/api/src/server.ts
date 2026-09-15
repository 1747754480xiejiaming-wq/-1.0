import { createApp } from './app.js';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { acquireProcessLock } from './process-lock.js';
const {app,store,config}=await createApp();
const pidFile=join(config.dataDir,'api.pid');mkdirSync(config.dataDir,{recursive:true});
const processLock=acquireProcessLock(pidFile);
if(!processLock){console.error('该工程的 API 已在运行。');await app.close();process.exit(1);}
process.once('exit',()=>processLock.release());
const cleanup=setInterval(()=>{try{store.cleanup();}catch{app.log.error('数据清理暂未完成。');}},3600000);cleanup.unref();
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{clearInterval(cleanup);processLock.release();void app.close();});
try {await app.listen({host:config.host,port:config.port,backlog:4096});}
catch{app.log.error('API 启动失败，请检查端口和配置。');await app.close();process.exitCode=1;}
