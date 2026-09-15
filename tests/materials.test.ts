import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../apps/api/src/app.js';
import {Store} from '../apps/api/src/db/store.js';
import {MaterialInboxService,materialSourceKey} from '../apps/api/src/services/materials.js';
import {acceptsPrivateMedia,cleanAsrText,downloadIncomingAttachment,materialAttachments,requestTranscription,voiceAttachment} from '../apps/qq-bot/src/media.js';

const root=process.cwd();
test('资料整理按账号隔离、文件名分类、十条分页并在删除类别后转入无关类别',async t=>{
  const store=new Store(':memory:',root);t.after(()=>store.close());store.enterWorkspace('teacher-a');const category=store.createMaterialCategory('教学评价');
  let modelCalls=0;const service=new MaterialInboxService(store,{completeJson:async()=>{modelCalls++;return {categoryId:null};}} as any);
  assert.equal(await service.classify('广西民族大学教学评价系统指南.pdf',[category]),category.id);assert.equal(modelCalls,1);
  for(let index=0;index<12;index++)store.createMaterialItem({sourceKey:materialSourceKey('message-'+index,'教学评价资料'+index+'.pdf',100+index),categoryId:category.id,name:'教学评价资料'+index+'.pdf',storedName:'file-'+index+'.pdf',mime:'application/pdf',size:100+index,senderId:'student_123456',senderName:'同学甲'});
  assert.equal(store.listMaterialItems({page:1,pageSize:10}).items.length,10);assert.equal(store.listMaterialItems({page:2,pageSize:10}).items.length,2);assert.equal(store.listMaterialItems({status:'pending_confirm'}).total,12);assert.equal(store.stats().pendingMaterials,12);
  const item=store.listMaterialItems({page:1,pageSize:10}).items[0];assert.equal(store.updateMaterialItem(item.id,category.id).status,'archived');store.deleteMaterialCategory(category.id);assert.equal(store.getMaterialItem(item.id)?.status,'pending_confirm');assert.equal(store.getMaterialItem(item.id)?.categoryName,'无关类别');
  assert.throws(()=>store.deleteMaterialCategory(store.listMaterialCategories().find(entry=>entry.name==='无关类别')!.id),/系统保留分类/);
  assert.equal(store.listMaterialItems({q:'同学甲'}).total,0);
  store.enterWorkspace('teacher-b');assert.equal(store.listMaterialItems({}).total,0);assert.deepEqual(store.listMaterialCategories().map(entry=>entry.name),['无关类别']);
});

test('群聊媒体全部忽略，私聊可识别语音和资料类型',()=>{
  assert.equal(acceptsPrivateMedia('c2c'),true);assert.equal(acceptsPrivateMedia('group'),false);
  const attachments=[{content_type:'audio/wav',url:'https://multimedia.nt.qq.com.cn/a',voice_wav_url:'https://multimedia.nt.qq.com.cn/a.wav',asr_refer_text:'  教学评价\u0000 怎么使用  '},{content_type:'application/pdf',url:'https://multimedia.nt.qq.com.cn/b',filename:'指南.pdf'},{content_type:'image/png',url:'https://gchat.qpic.cn/c',filename:'截图.png'}];
  assert.equal(cleanAsrText(voiceAttachment(attachments)?.asr_refer_text),'教学评价 怎么使用');assert.deepEqual(materialAttachments(attachments).map(item=>item.filename),['指南.pdf']);
});

test('语音转写请求使用本地鉴权接口且只返回清洗后的文本',async()=>{
  const result=await requestTranscription('http://127.0.0.1:3001','local-token','123456789',Buffer.from('wav'), 'audio/wav','voice.wav',async(url,init)=>{assert.equal(String(url),'http://127.0.0.1:3001/api/v1/internal/qq/transcribe');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer local-token');assert.ok(init?.body instanceof FormData);return Response.json({text:'  如何办理\u0000 缓考？  '});});assert.equal(result,'如何办理 缓考？');
});

test('QQ 私聊文件 CDN 使用签名地址无凭证下载并安全跟随腾讯跳转',async()=>{
  const calls:{url:string;authorization:string|null}[]=[];
  const bytes=await downloadIncomingAttachment({content_type:'file',url:'http://grouptalk.c2c.qq.com/asn.com/qqdownloadftnv5?sign=secret',filename:'教学评价指南.pdf'},async()=>{throw new Error('文件 CDN 不应读取机器人令牌');},1024,async(url,init)=>{
    calls.push({url:String(url),authorization:new Headers(init?.headers).get('Authorization')});
    if(calls.length===1)return new Response(null,{status:302,headers:{location:'https://download.qq.com/files/signed-document'}});
    return new Response(Buffer.from('real-file'),{status:200,headers:{'content-length':'9'}});
  });
  assert.equal(bytes.toString(),'real-file');assert.deepEqual(calls.map(call=>call.authorization),[null,null]);assert.equal(calls[0].url.startsWith('http://grouptalk.c2c.qq.com/'),true);
});

test('QQ 私聊资料经鉴权入库，老师可分页查看、下载和删除真实文件',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'campus-materials-')),{app}=await createApp({root,dbPath:':memory:',dataDir:directory,localDir:join(directory,'local'),modelStateDir:directory,logger:false,botToken:'material-bot-token',registrationCode:'test-registration-code'});t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
  const register=await app.inject({method:'POST',url:'/api/v1/auth/register',payload:{username:'资料老师',password:'material-password-123',registrationCode:'test-registration-code'}}),headers={cookie:register.cookies[0].name+'='+register.cookies[0].value,'x-csrf-token':register.json().csrfToken};
  const category=await app.inject({method:'POST',url:'/api/v1/admin/materials/categories',headers,payload:{name:'教学评价'}});assert.equal(category.statusCode,201);
  const boundary='campus-material-boundary',metadata=JSON.stringify({messageId:'message:with:separator',senderId:'student_123456',senderName:'Irene'}),content=Buffer.from('real-pdf-bytes'),payload=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="教学评价指南.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),content,Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const uploaded=await app.inject({method:'POST',url:'/api/v1/internal/qq/materials',headers:{authorization:'Bearer material-bot-token','content-type':`multipart/form-data; boundary=${boundary}`},payload});assert.equal(uploaded.statusCode,201);assert.equal(uploaded.json().status,'pending_confirm');
  const list=await app.inject({url:'/api/v1/admin/materials?page=1&pageSize=10',headers});assert.equal(list.statusCode,200);assert.equal(list.json().total,1);assert.equal(list.json().items[0].categoryName,'教学评价');
  const downloaded=await app.inject({url:`/api/v1/admin/materials/${uploaded.json().id}/download`,headers});assert.equal(downloaded.statusCode,200);assert.deepEqual(downloaded.rawPayload,content);
  assert.equal((await app.inject({method:'DELETE',url:`/api/v1/admin/materials/${uploaded.json().id}`,headers})).statusCode,200);assert.equal((await app.inject({url:'/api/v1/admin/materials',headers})).json().total,0);
});
