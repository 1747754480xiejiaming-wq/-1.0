import { join } from 'node:path';
import type { Faq,ModelProvider,TextModelProvider } from '@campus/contracts';
import type { Config } from '../config.js';
import { AppError } from '../errors.js';
import { ModelBudget } from './model-budget.js';
import { ModelSettings,modelDisplayName } from './model-settings.js';
import { callModel,inputUpperBound,modelBody,type ModelMode,type ModelSelector } from './model.js';

export class Models {
  readonly budget:ModelBudget;readonly settings:ModelSettings;
  constructor(private config:Config,inMemory=false,private fetcher:typeof fetch=fetch,private selector?:ModelSelector){this.budget=new ModelBudget(inMemory?':memory:':join(config.modelStateDir,'model-budget.db'),config.modelConcurrency);this.settings=new ModelSettings(config,inMemory);}
  close(){this.budget.close();}
  status(){return this.settings.status(this.budget);}
  private model(provider:ModelProvider){return provider==='deepseek'?this.config.model:provider==='zhipu'?this.config.zhipuModel:'qwen-vl-plus';}
  private endpoint(provider:ModelProvider){const base=provider==='deepseek'?this.config.modelUrl:provider==='zhipu'?this.config.zhipuUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1';return base.replace(/\/+$/,'')+'/chat/completions';}
  available(provider:ModelProvider=this.settings.active()){if(provider!=='qwen'&&provider!==this.settings.active())return false;const settings=this.settings.read(provider);return !!settings.apiKey&&settings.connected;}
  private requirePermission(provider:ModelProvider,probe=false,mode:ModelMode='match'){
    const settings=this.settings.read(provider);
    // Image recognition is an input preprocessor: it may use the connected
    // Zhipu vision endpoint while the one selected text-answer model remains
    // DeepSeek. All answer generation still obeys the single-model selection.
    if(!probe&&mode!=='recognize'&&provider!=='qwen'&&provider!==this.settings.active())throw new AppError(403,'MODEL_NOT_SELECTED','该模型无权限');
    if(!settings.apiKey||(!probe&&!settings.connected))throw new AppError(403,'MODEL_NOT_CONNECTED',provider==='qwen'?'图片识别模型尚未连接。':'该模型无权限');
    return settings;
  }
  async run(provider:ModelProvider,question:string,candidates:Faq[],images:string[]=[],mode:ModelMode='match',probe=false){
    const settings=this.requirePermission(provider,probe,mode),body=modelBody(provider,question,candidates,images,mode,this.model(provider)),id=this.budget.reserve(provider,body.model,inputUpperBound(body,images.length),body.max_tokens);
    if(this.selector&&mode==='match'){try{const result=await this.selector(question,candidates);this.budget.settle(id,{inputTokens:result.inputTokens||0,outputTokens:result.outputTokens||0});return result;}catch(error){this.budget.settle(id,null);throw error;}}
    try{return await callModel(provider,settings.apiKey,body,candidates,mode,provider==='qwen'?40000:this.config.modelTimeout,this.fetcher,(usage,rejected)=>this.budget.settle(id,usage,rejected),this.endpoint(provider));}
    catch(error){if(error instanceof Error&&(/MODEL_(AUTH_FAILED|ACCESS_DENIED|NOT_FOUND|HTTP_ERROR)/.test(error.message)||['AbortError','TimeoutError','TypeError'].includes(error.name)))this.settings.connected(provider,false);throw error;}
  }
  async completeJson<T>(system:string,payload:unknown,maxTokens=900,provider:TextModelProvider=this.settings.active()):Promise<T>{
    const settings=this.requirePermission(provider),model=this.model(provider),user=JSON.stringify(payload);if(Buffer.byteLength(system+user,'utf8')>64000)throw new AppError(400,'MODEL_INPUT_TOO_LARGE','提交给模型的资料过长。');
    const id=this.budget.reserve(provider,model,Buffer.byteLength(system+user,'utf8')+2048,maxTokens);
    try{
      const response=await this.fetcher(this.endpoint(provider),{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${settings.apiKey}`},redirect:'error',signal:AbortSignal.timeout(40000),body:JSON.stringify({model,stream:false,temperature:0,max_tokens:maxTokens,response_format:{type:'json_object'},...(provider==='zhipu'?{reasoning_effort:'low'}:{thinking:{type:'disabled'}}),messages:[{role:'system',content:system},{role:'user',content:user}]})});
      if(!response.ok){this.budget.settle(id,null,[400,401,403,404,422,429].includes(response.status));if([401,403,404].includes(response.status))this.settings.connected(provider,false);throw new Error('MODEL_HTTP_ERROR');}
      const data=await response.json() as any,content=data.choices?.[0]?.message?.content;if(typeof content!=='string')throw new Error('MODEL_EMPTY');
      const usage=data.usage&&Number.isInteger(data.usage.prompt_tokens)&&Number.isInteger(data.usage.completion_tokens)?{inputTokens:data.usage.prompt_tokens,outputTokens:data.usage.completion_tokens}:null;this.budget.settle(id,usage);const clean=content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');return JSON.parse(clean) as T;
    }catch(error){this.budget.settle(id,null);throw error;}
  }
  async completeVisionJson<T>(system:string,imageInput:string|string[],maxTokens=1800,userText='解析图片内容，只输出指定 JSON。'):Promise<T>{
    const provider='zhipu' as const,settings=this.requirePermission(provider,false,'recognize'),model=this.config.zhipuVisionModel;
    const imageDataUrls=Array.isArray(imageInput)?imageInput:[imageInput];
    if(!imageDataUrls.length||imageDataUrls.length>3||imageDataUrls.some(value=>!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)))throw new AppError(400,'INVALID_IMAGE','图片格式无效。');
    const id=this.budget.reserve(provider,model,Math.max(4096,Math.ceil(imageDataUrls.reduce((total,value)=>total+value.length,0)/3)),maxTokens);
    try{
      const response=await this.fetcher(this.endpoint(provider),{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${settings.apiKey}`},redirect:'error',signal:AbortSignal.timeout(60000),body:JSON.stringify({model,stream:false,temperature:0,max_tokens:maxTokens,messages:[{role:'system',content:system},{role:'user',content:[...imageDataUrls.map(url=>({type:'image_url',image_url:{url}})),{type:'text',text:userText.slice(0,500)}]}]})});
      if(!response.ok){this.budget.settle(id,null,[400,401,403,404,422,429].includes(response.status));if([401,403,404].includes(response.status))this.settings.connected(provider,false);throw new AppError(503,'VISION_MODEL_FAILED','智谱图片解析失败，请检查视觉模型权限和连接。');}
      const data=await response.json() as any,content=data.choices?.[0]?.message?.content;if(typeof content!=='string')throw new Error('VISION_MODEL_EMPTY');
      const usage=data.usage&&Number.isInteger(data.usage.prompt_tokens)&&Number.isInteger(data.usage.completion_tokens)?{inputTokens:data.usage.prompt_tokens,outputTokens:data.usage.completion_tokens}:null;this.budget.settle(id,usage);return JSON.parse(content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')) as T;
    }catch(error){this.budget.settle(id,null);throw error;}
  }
  async transcribeAudio(buffer:Buffer,mime:string,name:string):Promise<string>{
    const provider='zhipu' as const,settings=this.requirePermission(provider,false,'recognize'),model=this.config.zhipuAsrModel;
    if(!buffer.length||buffer.length>25*1024*1024||!['audio/wav','audio/x-wav','audio/mpeg','audio/mp3'].includes(mime))throw new AppError(400,'INVALID_AUDIO','语音仅支持 25 MB 以内的 WAV 或 MP3。');
    const id=this.budget.reserve(provider,model,Math.max(1024,Math.ceil(buffer.length/8)),1200),form=new FormData(),bytes=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength) as ArrayBuffer;form.append('model',model);form.append('file',new Blob([bytes],{type:mime}),name.slice(0,160));
    try{const response=await this.fetcher(this.config.zhipuUrl.replace(/\/+$/,'')+'/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${settings.apiKey}`},body:form,redirect:'error',signal:AbortSignal.timeout(60000)});if(!response.ok){this.budget.settle(id,null,[400,401,403,404,413,422,429].includes(response.status));if([401,403,404].includes(response.status))this.settings.connected(provider,false);throw new AppError(503,'AUDIO_MODEL_FAILED','语音识别失败，请检查智谱语音模型权限和连接。');}const data=await response.json() as any,textValue=typeof data.text==='string'?data.text:data.choices?.[0]?.message?.content;if(typeof textValue!=='string'||!textValue.trim())throw new AppError(422,'AUDIO_UNRECOGNIZED','没有识别到有效语音内容。');const usage=data.usage&&Number.isInteger(data.usage.prompt_tokens)&&Number.isInteger(data.usage.completion_tokens)?{inputTokens:data.usage.prompt_tokens,outputTokens:data.usage.completion_tokens}:null;this.budget.settle(id,usage);return textValue.trim().replace(/[\p{Cc}\p{Cf}]/gu,' ').replace(/\s+/g,' ').slice(0,200);}catch(error){this.budget.settle(id,null);throw error;}
  }
  async connect(provider:ModelProvider,key?:string){
    this.settings.saveKey(provider,key);const candidate={id:'connection-check',question:'如何咨询教务老师？',answer:'联系学院教务办公室。',keywords:['教务咨询'],category:'校园服务',status:'active',version:1,isDemo:false,createdAt:0,updatedAt:0} as Faq;
    try{const result=await this.run(provider,candidate.question,[candidate],[],'match',true);if(result.faqId!==candidate.id||result.match!=='clear')throw new Error('MODEL_MATCH_FAILED');this.settings.connected(provider,true);return {ok:true,message:`${modelDisplayName(provider)} 已连接。`,...this.status()};}
    catch(error){this.settings.connected(provider,false);if(error instanceof AppError)throw error;const reason=error instanceof Error?error.message:'';throw new AppError(503,'MODEL_CONNECTION_FAILED',reason==='MODEL_AUTH_FAILED'?'连接失败：API Key 无效或与服务地域不匹配。':reason==='MODEL_ACCESS_DENIED'?'连接失败：当前密钥没有该模型权限。':reason==='MODEL_NOT_FOUND'?'连接失败：当前账号或地域未提供该模型。':'模型连接失败，请检查密钥、权限、账号额度和网络。');}
  }
}
