import { existsSync,readFileSync }  from 'node:fs';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');config({path:resolve(root,'.env'),quiet:true});
console.log(`Node ${process.version}`);if(Number(process.versions.node.split('.')[0])<22)process.exitCode=1;
for(const [name,file] of [['后端构建','apps/api/dist/server.js'],['前端构建','apps/web/dist/index.html'],['QQ 构建','apps/qq-bot/dist/index.js'],['依赖','node_modules'],['老师登录信息','.local/首次登录.txt']])console.log(`${name}：${existsSync(resolve(root,file))?'存在':'尚未生成'}`);
const modelFile=resolve(root,process.env.CAMPUS_MODEL_STATE_DIR||process.env.CAMPUS_DATA_DIR||'data','model-connections.json');let models={};if(existsSync(modelFile))models=JSON.parse(readFileSync(modelFile,'utf8')).providers||{};for(const [id,name] of [['deepseek','千源·启智 D1 flash'],['zhipu','千源·启智 Z1 flash']])console.log(`${name}：${models[id]?.connected?'已连接':models[id]?.apiKey?'已保存，待连接':'未配置，请在开发管理系统连接'}`);
const qqFile=resolve(root,process.env.QQBOT_CREDENTIALS_FILE||resolve(process.env.CAMPUS_DATA_DIR||'data','qq-credentials.json'));console.log(`QQ 凭证：${existsSync(qqFile)?'已保存（不回显）':'未配置'}`);
try{const r=await fetch(`http://127.0.0.1:${process.env.API_PORT||3001}/api/v1/health/ready`,{signal:AbortSignal.timeout(2000)});console.log(`API：${r.ok?'运行正常':'未就绪'}`);}catch{console.log('API：尚未启动');}
