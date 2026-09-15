import { existsSync,mkdirSync,readFileSync,writeFileSync,renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ModelProvider,ModelsStatus,TextModelProvider } from '@campus/contracts';
import type { Config } from '../config.js';
import { AppError } from '../errors.js';
import { ModelBudget } from './model-budget.js';

interface ProviderConfig {apiKey:string;connected:boolean;checkedAt:number|null}
interface Settings {activeTextProvider:TextModelProvider;providers:Record<ModelProvider,ProviderConfig>}
const providers:ModelProvider[]=['qwen','deepseek','zhipu'];
const textProviders:TextModelProvider[]=['deepseek','zhipu'];
const empty=():ProviderConfig=>({apiKey:'',connected:false,checkedAt:null});
export const modelDisplayName=(provider:ModelProvider)=>provider==='deepseek'?'千源·启智 D1 flash':provider==='zhipu'?'千源·启智 Z1 flash':'Qwen 视觉识别';
export const modelCode=(provider:ModelProvider)=>provider==='deepseek'?'deepseek-v4-flash':provider==='zhipu'?'glm-5.3-flash':'qwen-vl-plus';

export class ModelSettings {
  private state:Settings;private file:string|null;
  constructor(readonly config:Config,inMemory=false){
    this.file=inMemory?null:join(config.modelStateDir,'model-connections.json');
    this.state={activeTextProvider:'deepseek',providers:{qwen:empty(),deepseek:{...empty(),apiKey:config.modelKey,connected:inMemory&&!!config.modelKey},zhipu:{...empty(),apiKey:config.zhipuKey,connected:inMemory&&!!config.zhipuKey}}};
    if(this.file&&existsSync(this.file)){const migrated=this.refresh();if(migrated)this.write();}
  }
  private refresh(){
    if(!this.file||!existsSync(this.file))return false;
    const data=JSON.parse(readFileSync(this.file,'utf8')) as Partial<Settings>&{activeTextProvider?:string;providers?:Partial<Record<ModelProvider,ProviderConfig>>};
    if(!data.providers?.deepseek||!data.providers?.qwen)throw new Error('MODEL_SETTINGS_INVALID');
    let migrated=false;
    const active=textProviders.includes(data.activeTextProvider as TextModelProvider)?data.activeTextProvider as TextModelProvider:'deepseek';
    if(active!==data.activeTextProvider)migrated=true;
    const normalized={} as Record<ModelProvider,ProviderConfig>;
    for(const provider of providers){
      const saved=data.providers[provider];
      if(saved)normalized[provider]={apiKey:String(saved.apiKey||''),connected:!!saved.connected,checkedAt:typeof saved.checkedAt==='number'?saved.checkedAt:null};
      else {normalized[provider]=empty();migrated=true;}
    }
    if(!normalized.deepseek.apiKey&&this.config.modelKey){normalized.deepseek.apiKey=this.config.modelKey;migrated=true;}
    if(!normalized.zhipu.apiKey&&this.config.zhipuKey){normalized.zhipu.apiKey=this.config.zhipuKey;migrated=true;}
    this.state={activeTextProvider:active,providers:normalized};return migrated;
  }
  private write(){if(!this.file)return;mkdirSync(this.config.modelStateDir,{recursive:true});const temp=this.file+'.'+randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify(this.state),{mode:0o600});renameSync(temp,this.file);}
  read(provider:ModelProvider){this.refresh();return {...this.state.providers[provider]};}
  active(){this.refresh();return this.state.activeTextProvider;}
  saveKey(provider:ModelProvider,key?:string){this.refresh();if(key){key=key.trim();if(key.length<8||key.length>512||/\s/.test(key))throw new AppError(400,'INVALID_MODEL_KEY','API Key 格式不正确。');this.state.providers[provider]={apiKey:key,connected:false,checkedAt:null};this.write();}}
  connected(provider:ModelProvider,connected:boolean){this.refresh();this.state.providers[provider].connected=connected;this.state.providers[provider].checkedAt=Date.now();this.write();}
  select(provider:TextModelProvider){this.refresh();if(!textProviders.includes(provider))throw new AppError(400,'INVALID_MODEL_PROVIDER','请选择可用的回答模型。');this.state.activeTextProvider=provider;this.write();}
  status(budget:ModelBudget):ModelsStatus {
    this.refresh();return {activeTextProvider:this.state.activeTextProvider,providers:providers.map(provider=>({provider,name:modelDisplayName(provider),model:modelCode(provider),keyConfigured:!!this.state.providers[provider].apiKey,connected:this.state.providers[provider].connected,checkedAt:this.state.providers[provider].checkedAt})),usage:budget.usage()};
  }
}
