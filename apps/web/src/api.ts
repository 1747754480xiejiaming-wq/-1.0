import type { ApiErrorBody } from '@campus/contracts';
export class ApiError extends Error { constructor(public status:number,public code:string,message:string){super(message);} }
let csrf='';export const setCsrf=(value:string)=>{csrf=value;};
export async function api<T>(path:string,options:{method?:string;body?:unknown;signal?:AbortSignal}={}):Promise<T> {
  let response:Response;
  try {response=await fetch((import.meta.env.VITE_API_BASE_URL||'/api/v1')+path,{method:options.method||'GET',credentials:'include',signal:options.signal||AbortSignal.timeout(100000),headers:{...(options.body!==undefined?{'Content-Type':'application/json'}:{}),...(options.method && options.method!=='GET'?{'X-CSRF-Token':csrf}:{})},body:options.body===undefined?undefined:JSON.stringify(options.body)});}
  catch{throw new ApiError(0,'NETWORK_ERROR','暂时无法连接服务，请检查网络后重试。');}
  const data=await response.json().catch(()=>null);
  if(!response.ok){if(response.status===401 && path!=='/auth/login')window.dispatchEvent(new Event('session-expired'));const error=(data as ApiErrorBody|null)?.error;throw new ApiError(response.status,error?.code||'REQUEST_FAILED',error?.message||'服务暂不可用，请稍后重试。');}
  if(options.method&&options.method!=='GET'&&/^\/admin\/(bot|models)/.test(path))window.dispatchEvent(new Event('services-updated'));
  return data as T;
}
export async function apiUpload<T>(path:string,body:FormData):Promise<T>{let response:Response;try{response=await fetch((import.meta.env.VITE_API_BASE_URL||'/api/v1')+path,{method:'POST',credentials:'include',signal:AbortSignal.timeout(120000),headers:{'X-CSRF-Token':csrf},body});}catch{throw new ApiError(0,'NETWORK_ERROR','上传未完成，请检查网络后重试。');}const data=await response.json().catch(()=>null);if(!response.ok){const error=(data as ApiErrorBody|null)?.error;throw new ApiError(response.status,error?.code||'UPLOAD_FAILED',error?.message||'上传未完成。');}return data as T;}
export async function apiDownload(path:string):Promise<Blob>{let response:Response;try{response=await fetch((import.meta.env.VITE_API_BASE_URL||'/api/v1')+path,{credentials:'include',signal:AbortSignal.timeout(120000)});}catch{throw new ApiError(0,'NETWORK_ERROR','下载未完成，请检查网络后重试。');}if(!response.ok){const data=await response.json().catch(()=>null),error=(data as ApiErrorBody|null)?.error;throw new ApiError(response.status,error?.code||'DOWNLOAD_FAILED',error?.message||'下载未完成。');}return response.blob();}
export const messageOf=(error:unknown)=>error instanceof Error?error.message:'操作未完成，请稍后重试。';
