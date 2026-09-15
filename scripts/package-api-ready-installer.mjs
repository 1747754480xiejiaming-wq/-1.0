import {build,Platform,Arch} from 'electron-builder';
import {createHash} from 'node:crypto';
import {existsSync,mkdtempSync,readFileSync,writeFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=process.env.CAMPUS_MODEL_BOOTSTRAP_FILE;
if(!source||!existsSync(source))throw new Error('请用 CAMPUS_MODEL_BOOTSTRAP_FILE 指定双模型配置。');
// Probe with the same implementation used by the connection buttons.
const verify=spawnSync(process.execPath,['--import','tsx',join(root,'scripts/verify-model-bootstrap.ts')],{cwd:root,env:process.env,stdio:'inherit',windowsHide:true});
if(verify.status!==0)throw new Error('双模型真实连接验证失败，未生成安装包。');
const saved=JSON.parse(readFileSync(source,'utf8'));
const empty=()=>({apiKey:'',connected:false,checkedAt:null});
const seed={activeTextProvider:'deepseek',providers:{qwen:empty(),deepseek:{...empty(),apiKey:saved.providers.deepseek.apiKey},zhipu:{...empty(),apiKey:saved.providers.zhipu.apiKey}}};
const temp=mkdtempSync(join(tmpdir(),'campus-model-installer-'));
try{
 const bootstrap=join(temp,'model-connections.bootstrap.json');
 writeFileSync(bootstrap,JSON.stringify(seed),{mode:0o600});
 const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
 const output=join(root,'release','desktop-'+pkg.version);
 await build({projectDir:root,targets:Platform.WINDOWS.createTarget('nsis',Arch.x64),publish:'never',config:{
  directories:{output},electronDist:join(root,'node_modules/electron/dist'),
  extraResources:[{from:bootstrap,to:'model-connections.bootstrap.json'}],
  nsis:{artifactName:'校园教务小助手-双模型已配置安装包-${version}.${ext}',deleteAppDataOnUninstall:false},
  afterPack:async context=>{
   const appRoot=join(context.appOutDir,'resources/app');
   for(const name of Object.keys(pkg.dependencies))if(!existsSync(join(appRoot,'node_modules',name,'package.json')))throw new Error('安装包缺少依赖：'+name);
   for(const name of ['data','.local','.env','qq-credentials.json'])if(existsSync(join(appRoot,name)))throw new Error('安装包混入本机数据：'+name);
   if(!existsSync(join(context.appOutDir,'resources/model-connections.bootstrap.json')))throw new Error('安装包遗漏双模型初始配置');
  }
 }});
 const name='校园教务小助手-双模型已配置安装包-'+pkg.version+'.exe',artifact=join(output,name);
 const hash=createHash('sha256').update(readFileSync(artifact)).digest('hex');writeFileSync(artifact+'.sha256',hash+'  '+name+'\n');
 console.log(JSON.stringify({artifact,sizeBytes:statSync(artifact).size,sha256:hash,providers:['deepseek','zhipu'],requiresManualApiKeyEntry:false}));
}finally{rmSync(temp,{recursive:true,force:true});}
