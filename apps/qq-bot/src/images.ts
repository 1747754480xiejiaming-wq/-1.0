export interface ImageAttachment {content_type:string;url:string;size?:number}
const MAX_BYTES=2*1024*1024;
export const IMAGE_DOWNLOAD_ERROR='图片暂时无法读取，请重新发送不超过 2MB 的 PNG、JPEG 或 WebP 图片，或改用文字提问。';

export async function downloadQuestionImages(attachments:ImageAttachment[],getToken:()=>Promise<string>,fetcher:typeof fetch=fetch):Promise<string[]> {
  const images=attachments.filter(item=>item.content_type.toLowerCase().startsWith('image/'));
  if(images.length>3)throw new Error('每次最多发送 3 张图片，请分次提问。');
  return Promise.all(images.map(async item=>{
    try{
      const mime=item.content_type.toLowerCase().split(';')[0].trim();
      if(!['image/png','image/jpeg','image/webp'].includes(mime)||(item.size||0)>MAX_BYTES)throw new Error();
      const url=new URL(item.url.startsWith('//')?'https:'+item.url:item.url);if(url.protocol==='http:')url.protocol='https:';
      const host=url.hostname.toLowerCase(),authenticated=['multimedia.nt.qq.com.cn','multimedia.nt.qq.com','qqbot.ugcimg.cn'].includes(host);
      if(url.protocol!=='https:'||url.username||url.password||url.port||item.url.length>4096||(!authenticated&&host!=='qpic.cn'&&!host.endsWith('.qpic.cn')))throw new Error();
      // QQ credentials stay on trusted Tencent hosts. The API receives image bytes only.
      const headers:Record<string,string>={};if(authenticated)headers.Authorization=`QQBot ${await getToken()}`;
      const response=await fetcher(url,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!response.ok||!response.body||Number(response.headers.get('content-length'))>MAX_BYTES)throw new Error();
      const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_BYTES)throw new Error();chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
      const bytes=Buffer.concat(chunks),actual=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;
      if(!actual||actual!==mime)throw new Error();return `data:${actual};base64,${bytes.toString('base64')}`;
    }catch{throw new Error(IMAGE_DOWNLOAD_ERROR);}
  }));
}
