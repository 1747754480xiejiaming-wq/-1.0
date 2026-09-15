import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync,mkdirSync,rmSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { Store } from '../apps/api/src/db/store.js';
import { loadConfig } from '../apps/api/src/config.js';
import { AnswerService } from '../apps/api/src/services/answer.js';
import { hasRagEvidence,pdfPageNeedsOcr,RagService } from '../apps/api/src/services/rag.js';
import { localVector } from '../apps/api/src/services/hybrid-retriever.js';
import { Models } from '../apps/api/src/services/models.js';
import { createFaqWorkbook,parseFaqWorkbook } from '../apps/api/src/services/faq-workbook.js';
import { createRagWorkbook } from '../apps/api/src/services/rag-workbook.js';
import { extractOlePackage,renderAttachmentPreview } from '../apps/api/src/services/ooxml-ole.js';
import { createExportPackage,faqPackagePath,ragPackagePath } from '../apps/api/src/services/export-package.js';
import { createApp } from '../apps/api/src/app.js';
import { attachmentKind } from '../apps/api/src/services/uploads.js';
import { AnswerOptimizer } from '../apps/api/src/services/answer-optimizer.js';
import { hashPassword } from '../apps/api/src/services/auth.js';

const root=process.cwd();

test('智能优化只调用设置中选中且已连接的模型',async t=>{
  let requestBody:any=null;
  const config=loadConfig({root,dbPath:':memory:',modelKey:'deepseek-key',zhipuKey:'zhipu-key',logger:false}),fakeFetch=async(_url:URL|string|Request,init?:RequestInit)=>{requestBody=JSON.parse(String(init?.body));return Response.json({choices:[{message:{content:JSON.stringify({answer:'第一步，提交申请。\n第二步，等待审核。'})}}],usage:{prompt_tokens:30,completion_tokens:16}});},models=new Models(config,true,fakeFetch as typeof fetch),optimizer=new AnswerOptimizer(models);
  t.after(()=>models.close());models.settings.select('zhipu');
  const result=await optimizer.optimize('如何办理？','等待审核，然后要先提交申请。');
  assert.equal(requestBody.model,'glm-5.3-flash');assert.match(result.answer,/第一步/);assert.match(requestBody.messages[0].content,/不得增加原文没有的政策/);
  models.settings.connected('zhipu',false);await assert.rejects(()=>optimizer.optimize('如何办理？','先申请。'),/该模型无权限/);
});

test('待解答问题支持原子批量忽略和永久删除',()=>{
  const store=new Store(':memory:',root);try{
    store.recordOfflineQuestion('离线问题一',{id:'sender_one',name:'学生一'});store.recordOfflineQuestion('离线问题二',{id:'sender_two',name:'学生二'});
    const ids=store.listUnmatched({status:'pending',unmatchedType:'offline'}).items.map(item=>item.id);assert.equal(ids.length,2);
    assert.throws(()=>store.batchUnmatched([ids[0],'missing-id'],'ignore','teacher'),/不存在/);assert.equal(store.listUnmatched({status:'pending'}).total,2);
    assert.deepEqual(store.batchUnmatched(ids,'ignore','teacher'),{ok:true,count:2});assert.equal(store.listUnmatched({status:'ignored'}).total,2);
    assert.deepEqual(store.batchUnmatched(ids,'delete','teacher'),{ok:true,count:2});assert.equal(store.listUnmatched({}).total,0);assert.equal((store.sqlite.prepare('SELECT count(*) n FROM unmatched_qq_students').get() as {n:number}).n,0);
  }finally{store.close();}
});

test('截图型 PDF 按页触发 OCR，知识证据阻止无关资料进入回答',()=>{
  assert.equal(pdfPageNeedsOcr('目录'),true);assert.equal(pdfPageNeedsOcr('完整正文'.repeat(30)),false);
  const content='广西民族大学教学评价系统支持网页端和手机移动端登录并完成问卷评价。';
  assert.equal(hasRagEvidence('教学评价系统怎么使用',content),true);
  assert.equal(hasRagEvidence('附近有什么好吃的餐厅',content),false);
});

test('题库未命中时先进入知识库技能，再做无关问题分类',async t=>{
  const store=new Store(':memory:',root),config=loadConfig({root,dbPath:':memory:',modelKey:'',logger:false}),answers=new AnswerService(store,config);t.after(()=>store.close());
  answers.rag={answer:async (question:string)=>question==='教学评价系统怎么使用'?{answer:'先登录教学评价系统，再进入问卷评价完成提交。',hits:[],attachments:[]}:null} as unknown as RagService;
  const result=await answers.answer({question:'教学评价系统怎么使用',requestId:randomUUID()},'qq');assert.equal(result.source,'rag');assert.match(result.answer,/问卷评价/);assert.equal(store.listUnmatched({status:'pending'}).total,0);
});

test('自定义分类、敏感词优先级和答疑附件进入统一回答链路',async t=>{
  const store=new Store(':memory:',root),config=loadConfig({root,dbPath:':memory:',modelKey:'',logger:false}),answers=new AnswerService(store,config);
  t.after(()=>store.close());
  const category=store.createCategory('成绩人工服务','answer');assert.equal(category.name,'成绩人工服务');store.renameCategory(category.id,'成绩咨询');
  store.saveFaq({question:'成绩复核流程在哪里下载',answer:'请查看随答案发送的流程附件。',keywords:['成绩复核'],category:'成绩咨询',status:'active',confirmed:true,libraryType:'answer'},'teacher');
  store.saveFaq({question:'请提供我的成绩数据',answer:'涉及个人成绩，机器人不能代查，请联系教务老师。',keywords:['代查'],category:'安全与隐私',status:'active',confirmed:true,libraryType:'forbidden'},'teacher');
  const answerFaq=store.listFaqs({libraryType:'answer'}).items[0];store.addFaqAttachment(answerFaq.id,{name:'成绩复核流程.pdf',storedName:'test.pdf',kind:'pdf',mime:'application/pdf',size:128});
  const safe=await answers.answer({question:'成绩代查怎么办',requestId:randomUUID()},'qq');assert.equal(safe.source,'forbidden_keyword');assert.match(safe.answer,/不能代查/);assert.equal(safe.attachments?.length,0);
  const direct=await answers.answer({question:'成绩复核流程在哪里下载',requestId:randomUUID()},'qq');assert.equal(direct.source,'faq_keyword');assert.equal(direct.attachments?.[0].name,'成绩复核流程.pdf');
  assert.equal(store.listFaqs({libraryType:'forbidden'}).total,1);assert.equal(store.listFaqs({libraryType:'answer'}).total,1);
});

test('删除答疑题目会级联删除附件并解除待解答关联',()=>{
  const store=new Store(':memory:',root);try{
    const faq=store.saveFaq({question:'需要删除的题目',answer:'旧答案',keywords:['删除题目'],category:'考试与成绩',status:'active',confirmed:true,libraryType:'answer'},'teacher');
    store.addFaqAttachment(faq.id,{name:'旧附件.pdf',storedName:'old.pdf',kind:'pdf',mime:'application/pdf',size:3});
    store.sqlite.prepare("INSERT INTO unmatched_questions(id,question_key,question,reason,status,resolved_faq_id,first_seen,last_seen) VALUES('unmatched-delete','unmatched-delete-key','旧问题','no_match','resolved',?,?,?)").run(faq.id,Date.now(),Date.now());
    assert.throws(()=>store.deleteFaq(faq.id,'teacher',faq.version+1),/已更新/);
    const removed=store.deleteFaq(faq.id,'teacher',faq.version);assert.equal(removed.attachments[0].storedName,'old.pdf');assert.equal(store.getFaq(faq.id),undefined);
    assert.equal((store.sqlite.prepare('SELECT count(*) n FROM faq_attachments WHERE faq_id=?').get(faq.id) as {n:number}).n,0);
    assert.equal((store.sqlite.prepare("SELECT resolved_faq_id id FROM unmatched_questions WHERE id='unmatched-delete'").get() as {id:null}).id,null);
  }finally{store.close();}
});

test('资料目录可重命名并阻止同级重名',()=>{
  const store=new Store(':memory:',root);try{const first=store.saveRagFolder('毕业资料'),second=store.saveRagFolder('学生工作');assert.equal(store.renameRagFolder(first.id,'毕业生资料').name,'毕业生资料');assert.throws(()=>store.renameRagFolder(second.id,'毕业生资料'),/同级目录/);}finally{store.close();}
});

test('Excel 资料解析为切片后可召回，并作为题库未命中后的 RAG 答案',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'campus-rag-')),store=new Store(':memory:',root),config=loadConfig({root,dbPath:':memory:',dataDir:directory,modelStateDir:directory,modelKey:'test-deepseek-key',logger:false}),fakeFetch=async(_url:URL|string|Request,init?:RequestInit)=>{const body=JSON.parse(String(init?.body||'{}')),system=String(body.messages?.[0]?.content||''),content=system.includes('知识图谱构建器')?JSON.stringify({summary:'毕业材料办理说明',keywords:['毕业材料','补交'],nodes:[{key:'material',label:'毕业材料补交',type:'事项',description:'需要到学院教务办公室办理'},{key:'office',label:'学院教务办公室',type:'地点',description:'接收纸质材料并登记'}],edges:[{sourceKey:'material',targetKey:'office',relation:'办理地点'}]}):JSON.stringify({answer:'请到学院教务办公室提交纸质材料并登记。\n\n资料来源：《毕业办理说明.xlsx》'});return new Response(JSON.stringify({choices:[{message:{content},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:50}}),{status:200,headers:{'Content-Type':'application/json'}});},models=new Models(config,true,fakeFetch as typeof fetch),answers=new AnswerService(store,config,undefined,models),rag=new RagService(store,config,models);answers.rag=rag;
  t.after(()=>{models.close();store.close();rmSync(directory,{recursive:true,force:true});});mkdirSync(rag.directory,{recursive:true});
  const stored='graduate.xlsx',book=new ExcelJS.Workbook(),sheet=book.addWorksheet('毕业材料');sheet.addRow(['事项','办理说明']);sheet.addRow(['毕业材料补交','在学院教务办公室提交纸质材料并登记']);await book.xlsx.writeFile(join(rag.directory,stored));
  const document=store.createRagDocument({folderId:null,name:'毕业办理说明.xlsx',storedName:stored,mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',size:256});await rag.parse(document.id);
  assert.equal(store.getRagDocument(document.id)?.status,'ready');assert.ok(store.getRagDocument(document.id)!.chunkCount>0);assert.equal(store.getRagDocument(document.id)!.graphNodeCount,2);assert.equal(store.getRagGraph(document.id).edges.length,1);assert.ok((await rag.search('学校毕业材料补交')).length>0);
  const result=await answers.answer({question:'学校毕业材料补交在哪里办理',requestId:randomUUID()},'web');assert.equal(result.source,'rag');assert.match(result.answer,/教务办公室/);assert.equal(result.attachments?.[0].name,'毕业办理说明.xlsx');assert.equal(result.attachments?.[0].id,document.id);assert.equal(store.stats().hitRate,1);
});

test('超长资料分段构图覆盖后半部分，并合并到同一资料图谱',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'campus-long-rag-')),store=new Store(':memory:',root),config=loadConfig({root,dbPath:':memory:',dataDir:directory,modelStateDir:directory,modelKey:'test-deepseek-key',logger:false}),segments:string[]=[],fakeFetch=async(_url:URL|string|Request,init?:RequestInit)=>{const body=JSON.parse(String(init?.body||'{}')),payload=JSON.parse(String(body.messages?.[1]?.content||'{}')),text=String(payload.text||'');segments.push(text);const late=text.includes('后半段专属办理窗口'),content=JSON.stringify({summary:late?'后半段办理要求':'前段通用要求',keywords:[late?'后半段专属办理':'通用办理'],nodes:[{key:late?'late':'common',label:late?'后半段专属办理窗口':'通用办理要求',type:'事项',description:late?'必须到新校区服务中心办理':'按学校要求提交材料'}],edges:[]});return new Response(JSON.stringify({choices:[{message:{content},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:50}}),{status:200,headers:{'Content-Type':'application/json'}});},models=new Models(config,true,fakeFetch as typeof fetch),rag=new RagService(store,config,models);
  t.after(()=>{models.close();store.close();rmSync(directory,{recursive:true,force:true});});mkdirSync(rag.directory,{recursive:true});
  const stored='long.xlsx',book=new ExcelJS.Workbook(),sheet=book.addWorksheet('长资料');sheet.addRow(['章节','内容']);for(let index=0;index<2600;index++)sheet.addRow([`通用章节${index}`,`这是前段和中段的教务办理说明 ${index}，用于验证分段解析能够覆盖整份资料。`]);sheet.addRow(['最终补充规定','后半段专属办理窗口必须到新校区服务中心办理']);await book.xlsx.writeFile(join(rag.directory,stored));
  const document=store.createRagDocument({folderId:null,name:'超长教务资料.xlsx',storedName:stored,mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',size:1024});await rag.parse(document.id);const graph=store.getRagGraph(document.id);
  assert.equal(graph.document.status,'ready');assert.ok(segments.length>1);assert.ok(segments.every(segment=>Buffer.byteLength(segment,'utf8')<=42_000));assert.ok(segments.some(segment=>segment.includes('后半段专属办理窗口')));assert.ok(graph.nodes.some(node=>node.label==='后半段专属办理窗口'));
});

test('图片资料由智谱视觉模型识别后进入 Chunk 和知识图谱',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'campus-image-rag-')),store=new Store(':memory:',root),config=loadConfig({root,dbPath:':memory:',dataDir:directory,modelStateDir:directory,modelKey:'test-deepseek-key',zhipuKey:'test-zhipu-key',zhipuVisionModel:'glm-4.6v-flash',logger:false}),requests:any[]=[],fakeFetch=async(_url:URL|string|Request,init?:RequestInit)=>{const body=JSON.parse(String(init?.body||'{}'));requests.push(body);const system=String(body.messages?.[0]?.content||'');const content=body.model==='glm-4.6v-flash'?JSON.stringify({description:'学院办事大厅的团组织关系转接流程图',visibleText:'团组织关系转接，提交申请，等待审核',knowledgePoints:['学生应先提交转接申请','目标团组织审核后完成转接'],keywords:['团组织关系','转接申请','审核']}):system.includes('知识图谱构建器')?JSON.stringify({summary:'团组织关系转接流程',keywords:['团组织关系'],nodes:[{key:'transfer',label:'团组织关系转接',type:'事项',description:'提交申请后等待目标组织审核'}],edges:[]}):JSON.stringify({answer:''});return Response.json({choices:[{message:{content}}],usage:{prompt_tokens:80,completion_tokens:30}});},models=new Models(config,true,fakeFetch as typeof fetch),rag=new RagService(store,config,models);
  models.settings.select('zhipu');
  t.after(()=>{models.close();store.close();rmSync(directory,{recursive:true,force:true});});mkdirSync(rag.directory,{recursive:true});
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jqV8AAAAASUVORK5CYII=','base64'),stored='transfer.png';writeFileSync(join(rag.directory,stored),bytes);
  const document=store.createRagDocument({folderId:null,name:'团组织关系转接流程.png',storedName:stored,mime:'image/png',size:bytes.length});await rag.parse(document.id);
  assert.equal(store.getRagDocument(document.id)?.status,'ready');assert.match(store.listRagChunks(document.id)[0].content,/提交转接申请/);assert.equal(store.getRagGraph(document.id).nodes[0].label,'团组织关系转接');
  const vision=requests.find(body=>body.model==='glm-4.6v-flash');assert.ok(vision);assert.match(vision.messages[1].content[0].image_url.url,/^data:image\/jpeg;base64,/);
});

test('LangChain EnsembleRetriever 在统一 Chunk 集合中融合 BM25 与向量召回',async()=>{
  const store=new Store(':memory:',root),config=loadConfig({root,dbPath:':memory:',modelKey:'',logger:false}),models=new Models(config,true),rag=new RagService(store,config,models);
  try{
    for(const [index,name] of ['转接指引一.pdf','转接指引二.pdf'].entries()){const document=store.createRagDocument({folderId:null,name,storedName:`same-${index}.pdf`,mime:'application/pdf',size:10}),content='团组织关系转接需要提交申请并等待目标组织审核';store.replaceRagChunks(document.id,[{content,tokenCount:16,keywords:['团组织关系','转接审核'],embedding:localVector(content)}]);store.updateRagDocument(document.id,{status:'ready',progress:100,chunkCount:1});}
    const hits=await rag.search('团组织关系转接怎么审核',5);assert.equal(hits.length,2);assert.ok(hits.every(hit=>hit.keywordScore>0));assert.ok(hits.every(hit=>hit.vectorScore>0));assert.ok(hits.every(hit=>hit.rerankScore>0));assert.equal(new Set(hits.map(hit=>hit.documentId)).size,2);
  }finally{models.close();store.close();}
});

test('QQ 内部附件通道可以下载 RAG 命中的原始资料',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'campus-rag-download-')),{app,store}=await createApp({root,dataDir:directory,localDir:join(directory,'.local'),modelStateDir:directory,dbPath:join(directory,'campus.db'),modelKey:'',botToken:'rag-download-token',logger:false});
  t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
  const content=Buffer.from('rag source file'),ragDirectory=join(directory,'rag-files');mkdirSync(ragDirectory,{recursive:true});writeFileSync(join(ragDirectory,'source.pdf'),content);
  const document=store.createRagDocument({folderId:null,name:'来源资料.pdf',storedName:'source.pdf',mime:'application/pdf',size:content.length});store.updateRagDocument(document.id,{status:'ready',progress:100});
  const response=await app.inject({method:'GET',url:`/api/v1/internal/qq/attachments/${document.id}`,headers:{authorization:'Bearer rag-download-token'}});assert.equal(response.statusCode,200);assert.deepEqual(response.rawPayload,content);assert.match(decodeURIComponent(String(response.headers['content-disposition'])),/来源资料\.pdf/);
});

test('答疑题库只通过固定 Excel 模板导入导出',async()=>{
  const item={id:'faq-xlsx',question:'如何办理缓考？',answer:'提交缓考申请。',keywords:['缓考','申请'],category:'考试与成绩',status:'active' as const,version:1,isDemo:false,createdAt:1,updatedAt:1,libraryType:'answer' as const,attachments:[]},created=await createFaqWorkbook([item],'answer');
  assert.equal(created.buffer.subarray(0,2).toString(),'PK');const exported=new ExcelJS.Workbook();await exported.xlsx.load(created.buffer as unknown as ExcelJS.Buffer);assert.equal(exported.getWorksheet('答疑题库')!.getCell('F1').text,'状态');assert.equal(exported.getWorksheet('答疑题库')!.getCell('G1').text,'');
  const parsed=await parseFaqWorkbook(created.buffer,'answer');assert.equal(parsed.length,1);assert.equal(parsed[0].question,item.question);assert.deepEqual(parsed[0].keywords,item.keywords);assert.equal(parsed[0].status,'disabled');
  const broken=new ExcelJS.Workbook();await broken.xlsx.load(created.buffer as unknown as ExcelJS.Buffer);broken.getWorksheet('答疑题库')!.getCell('B1').value='随意表头';const buffer=Buffer.from(await broken.xlsx.writeBuffer());await assert.rejects(()=>parseFaqWorkbook(buffer,'answer'),/固定模板/);
});

test('一键导出 Excel 不读取或嵌入答疑附件',async t=>{
  const dataDir=mkdtempSync(join(tmpdir(),'campus-question-only-export-')),{app,store}=await createApp({dbPath:':memory:',dataDir,logger:false,modelKey:''});
  t.after(async()=>{await app.close();rmSync(dataDir,{recursive:true,force:true});});
  store.setAdmin('export-teacher',await hashPassword('test-password-123'));
  const sign=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:'export-teacher',password:'test-password-123'}}),cookie=sign.cookies[0].name+'='+sign.cookies[0].value;
  store.createCategory('教学评价','answer');
  const faq=store.saveFaq({question:'教学评价系统怎么使用？',answer:'登录后进入评价任务并提交。',keywords:['教学评价'],category:'教学评价',status:'active',confirmed:true,libraryType:'answer'},'export-teacher');
  store.addFaqAttachment(faq.id,{name:'不存在但不应读取的附件.pdf',storedName:'missing.pdf',kind:'pdf',mime:'application/pdf',size:20*1024*1024});
  const response=await app.inject({method:'GET',url:'/api/v1/faqs/export.xlsx?libraryType=answer',headers:{cookie}});assert.equal(response.statusCode,200,response.body);
  const book=new ExcelJS.Workbook();await book.xlsx.load(response.rawPayload as unknown as ExcelJS.Buffer);const sheet=book.getWorksheet('答疑题库')!;assert.equal(sheet.getCell('B2').text,'教学评价系统怎么使用？');assert.equal(sheet.getCell('F1').text,'状态');assert.equal(sheet.getCell('G1').text,'');
  const zip=await JSZip.loadAsync(response.rawPayload);assert.equal(zip.file(/^xl\/embeddings\//).length,0);assert.equal(response.headers['cache-control'],'no-store');
});

test('答疑附件支持视频，敏感词库使用独立固定 Excel 模板',async()=>{
  assert.equal(attachmentKind('新生报到.mp4','video/mp4'),'video');
  assert.equal(attachmentKind('操作演示.webm','application/octet-stream'),'video');
  const item={id:'forbidden-xlsx',question:'能帮我查询个人成绩吗？',answer:'请勿在群内发送个人信息，请联系学院教务老师。',keywords:['个人成绩'],category:'安全与隐私',status:'active' as const,version:1,isDemo:false,createdAt:1,updatedAt:1,libraryType:'forbidden' as const,attachments:[]};
  const created=await createFaqWorkbook([item],'forbidden'),parsed=await parseFaqWorkbook(created.buffer,'forbidden');
  assert.equal(created.buffer.subarray(0,2).toString(),'PK');assert.equal(parsed.length,1);assert.equal(parsed[0].libraryType,'forbidden');assert.equal(parsed[0].status,'disabled');
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(created.buffer as unknown as ExcelJS.Buffer);assert.ok(workbook.getWorksheet('敏感词库'));assert.equal(workbook.getWorksheet('敏感词库')!.getCell('B1').text,'敏感词');
});

test('答疑题库 Excel 同行嵌入可打开的 OLE 原始附件',async()=>{
  const item={id:'faq-with-file',question:'团组织关系怎么转接？',answer:'按附件指引办理。',keywords:['团组织关系'],category:'毕业与材料',status:'active' as const,version:1,isDemo:false,createdAt:1,updatedAt:1,libraryType:'answer' as const,attachments:[]},content=Buffer.from('attachment-content');
  const created=await createFaqWorkbook([item],'answer',[{faqId:item.id,name:'办理指引.pdf',kind:'pdf',mime:'application/pdf',content}]),book=new ExcelJS.Workbook();await book.xlsx.load(created.buffer as unknown as ExcelJS.Buffer);
  const sheet=book.getWorksheet('答疑题库')!;assert.equal(sheet.getCell('G2').text,'办理指引.pdf');assert.equal(sheet.getCell('H2').text,'双击附件条打开');assert.equal(book.getWorksheet('附件数据'),undefined);
  const zip=await JSZip.loadAsync(created.buffer),ole=zip.file('xl/embeddings/oleObject1.bin');assert.ok(ole);const packageBuffer=await ole.async('nodebuffer');assert.deepEqual(packageBuffer.subarray(0,8),Buffer.from('d0cf11e0a1b11ae1','hex'));
  const restored=extractOlePackage(packageBuffer);assert.equal(restored.name,'办理指引.pdf');assert.deepEqual(restored.content,content);
  const sheetXml=await zip.file('xl/worksheets/sheet1.xml')!.async('string'),rels=await zip.file('xl/worksheets/_rels/sheet1.xml.rels')!.async('string');assert.match(sheetXml,/<oleObject[^>]+progId="Package"/);assert.match(sheetXml,/<from xmlns:xdr="http:\/\/schemas\.openxmlformats\.org\/drawingml\/2006\/spreadsheetDrawing"><xdr:col>/);assert.match(sheetXml,/<drawing r:id=/);assert.match(rels,/relationships\/oleObject/);
});

test('OLE 附件条显示序号和文件名，完整资料包保留真实附件与 Excel 链接',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'campus-export-package-')),source=join(directory,'guide.pdf'),content=Buffer.from('%PDF-1.7\nreal attachment');writeFileSync(source,content);
  try{
    const item={id:'faq-package',question:'团组织关系怎么转接？',answer:'请查看附件。',keywords:['团组织关系'],category:'毕业与材料',status:'active' as const,version:1,isDemo:false,createdAt:1,updatedAt:1,libraryType:'answer' as const,attachments:[]},packagePath=faqPackagePath(1,item.question,1,'工作指引.pdf'),attachment={faqId:item.id,name:'工作指引.pdf',kind:'pdf' as const,mime:'application/pdf',content:Buffer.alloc(0),packagePath};
    const preview=renderAttachmentPreview({...attachment,slot:0});assert.deepEqual(preview.subarray(0,8),Buffer.from('89504e470d0a1a0a','hex'));assert.ok(preview.length>3000);
    const workbook=await createFaqWorkbook([item],'answer',[attachment],{embedAttachments:false,includePackageLinks:true}),book=new ExcelJS.Workbook();await book.xlsx.load(workbook.buffer as unknown as ExcelJS.Buffer);assert.equal(book.getWorksheet('附件清单')!.getCell('F2').text,'双击打开真实附件');assert.equal((book.getWorksheet('附件清单')!.getCell('F2').value as ExcelJS.CellHyperlinkValue).hyperlink,packagePath);
    const archive=createExportPackage('答疑题库清单.xlsx',workbook.buffer,[{sourcePath:source,packagePath}]),chunks:Buffer[]=[];for await(const chunk of archive)chunks.push(Buffer.from(chunk));const zip=await JSZip.loadAsync(Buffer.concat(chunks));assert.ok(zip.file('答疑题库清单.xlsx'));assert.deepEqual(await zip.file(packagePath)!.async('nodebuffer'),content);
    assert.equal(ragPackagePath(2,'团学资料','工作指引.pdf'),'真实附件/知识库技能/团学资料/0002-工作指引.pdf');
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('知识库技能导出包含目录、切片、图谱和原始资料',async()=>{
  const document={id:'rag-doc',folderId:'folder-1',name:'工作指引.pdf',mime:'application/pdf',size:7,status:'ready' as const,progress:100,chunkCount:1,tokenCount:10,graphNodeCount:1,graphEdgeCount:0,error:null,createdAt:1,updatedAt:2},graph={document,nodes:[{id:'node-1',documentId:document.id,label:'组织关系转接',type:'事项',description:'办理说明'}],edges:[]};
  const result=await createRagWorkbook({folders:[{id:'folder-1',name:'团学资料',parentId:null,createdAt:1,updatedAt:1}],documents:[document],chunks:[{id:'chunk-1',documentId:document.id,documentName:document.name,position:0,content:'办理说明',tokenCount:10,keywords:['转接']}],graphs:[graph],files:[{documentId:document.id,name:document.name,mime:document.mime,content:Buffer.from('pdfdata')}]});
  const book=new ExcelJS.Workbook();await book.xlsx.load(result.buffer as unknown as ExcelJS.Buffer);assert.equal(book.getWorksheet('资料目录')!.getCell('C2').text,'团学资料');assert.equal(book.getWorksheet('资料目录')!.getCell('K2').text,'双击资料条打开');assert.equal(book.getWorksheet('Chunk切片')!.getCell('E2').text,'办理说明');assert.equal(book.getWorksheet('知识图谱节点')!.getCell('B2').text,'组织关系转接');assert.equal(book.getWorksheet('原始资料数据'),undefined);
  const zip=await JSZip.loadAsync(result.buffer),ole=zip.file('xl/embeddings/oleObject1.bin');assert.ok(ole);const restored=extractOlePackage(await ole.async('nodebuffer'));assert.equal(restored.name,'工作指引.pdf');assert.deepEqual(restored.content,Buffer.from('pdfdata'));
});
