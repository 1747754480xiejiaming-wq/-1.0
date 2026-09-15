export interface IncomingAttachment{content_type:string;url:string;filename?:string;size?:number;voice_wav_url?:string;asr_refer_text?:string}
const TRUSTED_AUTH_HOSTS=new Set(['multimedia.nt.qq.com.cn','multimedia.nt.qq.com','qqbot.ugcimg.cn']);
const TRUSTED_PUBLIC_HOSTS=new Set(['qpic.cn','grouptalk.c2c.qq.com']);
const MATERIAL_EXTENSIONS=new Set(['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','zip','rar','7z']);

function trustedPublicHost(host:string){return TRUSTED_PUBLIC_HOSTS.has(host)||host.endsWith('.qpic.cn')||host.endsWith('.qq.com')||host.endsWith('.qq.com.cn');}
function secureUrl(value:string){
  const url=new URL(value.startsWith('//')?'https:'+value:value),host=url.hostname.toLowerCase(),authenticated=TRUSTED_AUTH_HOSTS.has(host),trusted=authenticated||trustedPublicHost(host);
  const publicHttp=url.protocol==='http:'&&!authenticated&&trustedPublicHost(host);
  if((url.protocol!=='https:'&&!publicHttp)||url.username||url.password||url.port||value.length>4096||!trusted)throw new Error('UNTRUSTED_MEDIA_URL');
  return {url,authenticated};
}
async function fetchTencentMedia(source:string,getToken:()=>Promise<string>,fetcher:typeof fetch){
  let current=secureUrl(source);
  for(let redirect=0;redirect<=4;redirect++){
    const headers:Record<string,string>={'Accept':'*/*','User-Agent':'Campus-Secretary-QQBot/1.0'};
    if(current.authenticated)headers.Authorization=`QQBot ${await getToken()}`;
    const response=await fetcher(current.url,{headers,redirect:'manual',signal:AbortSignal.timeout(60000)});
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get('location');
      if(!location||redirect===4)throw new Error('MEDIA_REDIRECT_FAILED');
      current=secureUrl(new URL(location,current.url).toString());
      continue;
    }
    return response;
  }
  throw new Error('MEDIA_REDIRECT_FAILED');
}
export async function downloadIncomingAttachment(attachment:IncomingAttachment,getToken:()=>Promise<string>,maxBytes:number,fetcher:typeof fetch=fetch,voice=false){
  const source=voice&&(attachment.voice_wav_url||'')||attachment.url;
  let response:Response|null=null,lastError:unknown;
  for(let attempt=0;attempt<3;attempt++)try{
    response=await fetchTencentMedia(source,getToken,fetcher);
    if(response.ok)break;
    if(response.status<429)throw new Error(`MEDIA_HTTP_${response.status}`);
    lastError=new Error(`MEDIA_HTTP_${response.status}`);
  }catch(error){lastError=error;if(error instanceof Error&&/^MEDIA_HTTP_4(?!29)/.test(error.message))throw error;}
  if(!response?.ok||!response.body)throw lastError instanceof Error?lastError:new Error('MEDIA_DOWNLOAD_FAILED');
  const declared=Number(response.headers.get('content-length')||0);if(declared>maxBytes)throw new Error('MEDIA_TOO_LARGE');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes)throw new Error('MEDIA_TOO_LARGE');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
  if(!total)throw new Error('MEDIA_EMPTY');
  return Buffer.concat(chunks);
}
export function voiceAttachment(attachments:IncomingAttachment[]){return attachments.find(item=>!!item.voice_wav_url||item.content_type.toLowerCase().startsWith('audio/')||!!item.asr_refer_text);}
export function materialAttachments(attachments:IncomingAttachment[]){return attachments.filter(item=>{const extension=item.filename?.toLowerCase().split('.').pop();return !!extension&&MATERIAL_EXTENSIONS.has(extension)&&!item.content_type.toLowerCase().startsWith('image/')&&!item.content_type.toLowerCase().startsWith('audio/');}).slice(0,10);}
export function cleanAsrText(value:string|undefined){return value?.replace(/[\p{Cc}\p{Cf}]/gu,' ').replace(/\s+/g,' ').trim().slice(0,200)||'';}
export const acceptsPrivateMedia=(kind:string)=>kind==='c2c';

const apiHeaders=(token:string,appId:string)=>({Authorization:`Bearer ${token}`,'X-QQ-App-Id':appId});
export async function requestTranscription(baseUrl:string,token:string,appId:string,buffer:Buffer,mime:string,name:string,fetcher:typeof fetch=fetch){const body=new FormData(),bytes=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength) as ArrayBuffer;body.append('audio',new Blob([bytes],{type:mime}),name);const response=await fetcher(new URL('/api/v1/internal/qq/transcribe',baseUrl),{method:'POST',headers:apiHeaders(token,appId),body,redirect:'error',signal:AbortSignal.timeout(70000)});if(!response.ok)throw new Error('语音暂时无法识别，请稍后重试或改用文字提问。');const result=await response.json() as {text?:string};const text=cleanAsrText(result.text);if(!text)throw new Error('语音中没有识别到有效问题，请改用文字提问。');return text;}
export async function uploadMaterial(baseUrl:string,token:string,appId:string,attachment:IncomingAttachment,buffer:Buffer,messageId:string,sender:{id:string;name?:string},fetcher:typeof fetch=fetch){const body=new FormData(),bytes=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength) as ArrayBuffer;body.append('metadata',JSON.stringify({messageId,senderId:sender.id,...(sender.name?{senderName:sender.name}:{})}));body.append('file',new Blob([bytes],{type:attachment.content_type||'application/octet-stream'}),attachment.filename||'未命名资料');const response=await fetcher(new URL('/api/v1/internal/qq/materials',baseUrl),{method:'POST',headers:apiHeaders(token,appId),body,redirect:'error',signal:AbortSignal.timeout(70000)});if(!response.ok){const data=await response.json().catch(()=>null) as {error?:{code?:string}}|null;throw new Error(data?.error?.code?`MATERIAL_UPLOAD_${data.error.code}`:`MATERIAL_UPLOAD_HTTP_${response.status}`);}return response.json();}
