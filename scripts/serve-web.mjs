import { createServer,request } from 'node:http';
import { createReadStream,existsSync,readFileSync,statSync } from 'node:fs';
import { resolve,dirname,extname,sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');config({path:resolve(root,'.env'),quiet:true});
const dist=resolve(root,'apps/web/dist'),host=process.env.WEB_HOST||'127.0.0.1',port=Number(process.env.WEB_PORT||8080),apiPort=Number(process.env.API_PORT||3001);
if(!existsSync(resolve(dist,'index.html')))throw new Error('请先运行 npm run build。');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.json':'application/json'};
const server=createServer((req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
  if(req.url?.startsWith('/api/')) {
    const headers={...req.headers,'x-forwarded-for':req.socket.remoteAddress||'127.0.0.1','x-forwarded-proto':'http'};delete headers['forwarded'];
    const upstream=request({host:'127.0.0.1',port:apiPort,path:req.url,method:req.method,headers,timeout:105000},response=>{res.writeHead(response.statusCode||502,response.headers);response.pipe(res);});
    upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'API_UNAVAILABLE',message:'服务暂不可用，请稍后重试。'}}));}else res.destroy();});
    req.on('aborted',()=>upstream.destroy());req.pipe(upstream);return;
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
  let pathname;try{pathname=decodeURIComponent(new URL(req.url||'/','http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
  let file=resolve(dist,'.'+pathname);
  if(file!==dist&&!file.startsWith(dist+sep)){res.writeHead(403);res.end();return;}
  if(!existsSync(file)||!statSync(file).isFile()){
    if(extname(pathname)){res.writeHead(404);res.end('Not found');return;}
    file=resolve(dist,'index.html');
  }
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  res.setHeader('Cache-Control',pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache');
  res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.setHeader('Content-Length',statSync(file).size);
  if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);
});
server.on('error',()=>{console.error('前端启动失败，请检查端口是否被占用。');process.exitCode=1;});
server.listen(port,host,()=>console.log(`前端服务：http://${host}:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close();server.closeAllConnections();});
