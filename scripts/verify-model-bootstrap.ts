import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadConfig} from '../apps/api/src/config.js';
import {Models} from '../apps/api/src/services/models.js';

const source=process.env.CAMPUS_MODEL_BOOTSTRAP_FILE;
if(!source)throw new Error('Missing CAMPUS_MODEL_BOOTSTRAP_FILE');
const seed=JSON.parse(readFileSync(source,'utf8'));
const dir=mkdtempSync(join(tmpdir(),'campus-model-probe-'));
const models=new Models(loadConfig({modelStateDir:dir,modelKey:'',zhipuKey:'',modelTimeout:15000}));
try{
  for(const provider of ['deepseek','zhipu'] as const){
    const key=seed.providers?.[provider]?.apiKey;
    if(!key)throw new Error(provider+' configuration missing');
    const result=await models.connect(provider,key);
    const item=result.providers.find(p=>p.provider===provider)!;
    console.log(JSON.stringify({provider,ok:result.ok,keyConfigured:item.keyConfigured,connected:item.connected,model:item.model}));
  }
}finally{models.close();rmSync(dir,{recursive:true,force:true});}
