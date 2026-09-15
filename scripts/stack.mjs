import { spawn,spawnSync } from 'node:child_process';
import { dirname,resolve,join } from 'node:path';
import { existsSync,copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const dev=process.argv.includes('--dev');const children=[];let stopping=false;
function run(args,options={}){return spawn(process.execPath,args,{cwd:root,stdio:'inherit',windowsHide:true,...options});}
if(!existsSync(join(root,'node_modules'))){console.error('请先运行 npm ci 安装依赖。');process.exit(1);}
if(!process.env.CAMPUS_DESKTOP&&!existsSync(join(root,'.env')))copyFileSync(join(root,'.env.example'),join(root,'.env'));
const npmCli=process.env.npm_execpath||join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
if(!dev&&!existsSync(join(root,'apps/api/dist/cli.js'))){if(spawnSync(process.execPath,[npmCli,'run','build'],{cwd:root,stdio:'inherit',windowsHide:true}).status!==0)process.exit(1);}
const setup=dev?['node_modules/tsx/dist/cli.mjs','apps/api/src/cli.ts','setup','--demo']:['apps/api/dist/cli.js','setup','--demo'];
if(spawnSync(process.execPath,setup,{cwd:root,stdio:'inherit',windowsHide:true}).status!==0)process.exit(1);
function stop(){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');}
const api=run(dev?['node_modules/tsx/dist/cli.mjs','watch','apps/api/src/server.ts']:['apps/api/dist/server.js']);children.push(api);
children.push(run(dev?[join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1']:['scripts/serve-web.mjs'],dev?{cwd:join(root,'apps/web')}:{}));
if(process.argv.includes('--bot'))children.push(run(['apps/qq-bot/dist/index.js']));
for(const child of children)child.on('exit',code=>{if(!stopping){process.exitCode=code||0;stop();}});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,stop);
console.log(`校园教务小助手已启动，按 Ctrl+C 停止。${dev?`开发页面：http://127.0.0.1:${process.env.WEB_PORT||5173}`:`页面：http://127.0.0.1:${process.env.WEB_PORT||8080}`}。老师口令见本机登录信息文件。`);
