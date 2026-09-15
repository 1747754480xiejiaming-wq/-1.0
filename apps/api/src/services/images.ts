import { AppError } from '../errors.js';
export function validateImages(images:string[]=[]){
  if(images.length>3)throw new AppError(400,'INVALID_IMAGES','每次最多发送 3 张图片。');
  return images.map(value=>{
    if(value.startsWith('data:')){
      const match=value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);if(!match||match[2].length>2796204)throw new AppError(400,'INVALID_IMAGES','图片需要为不超过 2MB 的 PNG、JPEG 或 WebP。');
      const bytes=Buffer.from(match[2],'base64'),valid=match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
      if(!valid||bytes.length>2*1024*1024)throw new AppError(400,'INVALID_IMAGES','图片文件格式无效或超过 2MB。');return value;
    }
    let url:URL;try{url=new URL(value.startsWith('//')?'https:'+value:value);}catch{throw new AppError(400,'INVALID_IMAGES','图片地址无效。');}
    if(url.protocol==='http:')url.protocol='https:';
    const host=url.hostname.toLowerCase(),allowed=host==='multimedia.nt.qq.com'||host==='qpic.cn'||host.endsWith('.qpic.cn');
    if(url.protocol!=='https:'||url.username||url.password||url.port||!allowed||value.length>4096)throw new AppError(400,'INVALID_IMAGES','仅接收 QQ 提供的图片附件。');return url.href;
  });
}
