const {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync}=require('node:fs');
const {join,dirname}=require('node:path');
const {randomUUID}=require('node:crypto');

// Only fill missing credentials; preserve the user's selection and existing keys.
function provisionModels(bootstrapPath,destination){
  if(!existsSync(bootstrapPath))return false;
  const seed=JSON.parse(readFileSync(bootstrapPath,'utf8'));
  for(const provider of ['deepseek','zhipu']){
    const key=seed.providers?.[provider]?.apiKey;
    if(typeof key!=='string'||key.length<8||/\s/.test(key))throw new Error('安装包双模型配置不完整，请重新下载安装包。');
  }
  const state=existsSync(destination)?JSON.parse(readFileSync(destination,'utf8')):{activeTextProvider:'deepseek',providers:{}};
  if(!state.providers||typeof state.providers!=='object')throw new Error('本机模型配置格式无效，请联系维护人员。');
  let changed=false;
  for(const provider of ['qwen','deepseek','zhipu']){
    if(state.providers[provider]?.apiKey)continue;
    const key=provider==='qwen'?'':seed.providers[provider].apiKey;
    if(!state.providers[provider]||key){state.providers[provider]={apiKey:key,connected:false,checkedAt:null};changed=true;}
  }
  if(!['deepseek','zhipu'].includes(state.activeTextProvider)){state.activeTextProvider='deepseek';changed=true;}
  if(changed){mkdirSync(dirname(destination),{recursive:true});const temp=destination+'.'+randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify(state),{mode:0o600});renameSync(temp,destination);}
  return changed;
}
module.exports={provisionModels};
