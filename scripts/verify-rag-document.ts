import { copyFileSync,existsSync,mkdirSync } from 'node:fs';
import { basename,extname,join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AnswerService } from '../apps/api/src/services/answer.js';
import { loadConfig,projectRoot } from '../apps/api/src/config.js';
import { Store } from '../apps/api/src/db/store.js';
import { Models } from '../apps/api/src/services/models.js';
import { RagService } from '../apps/api/src/services/rag.js';

const value=(name:string)=>{const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:'';};
const file=value('--file'),documentId=value('--document-id'),question=value('--question');
if(!question||(!documentId&&(!file||!existsSync(file))))throw new Error('用法：--document-id <已上传资料 ID> 或 --file <资料文件>，并提供 --question <测试问题>');
const root=projectRoot(),desktopData=join(process.env.APPDATA||'', '校园教务小助手','data'),dataDir=value('--data-dir')||desktopData,modelStateDir=join(dataDir,'model-state'),config=loadConfig({root,dataDir,localDir:join(process.env.APPDATA||'','校园教务小助手','.local'),modelStateDir,dbPath:join(dataDir,'campus.db'),logger:false}),store=new Store(config.dbPath,root),models=new Models(config),answers=new AnswerService(store,config,undefined,models),rag=new RagService(store,config,models);answers.rag=rag;
try{
  if(!models.available())throw new Error('当前选择的文字模型尚未连接，无法执行真实知识图谱测试。');
  let document;
  if(documentId){
    const row=store.sqlite.prepare('SELECT owner_id FROM rag_documents WHERE id=?').get(documentId) as {owner_id:string}|undefined;
    if(!row)throw new Error('指定的资料不存在。');
    store.enterWorkspace(row.owner_id);document=store.getRagDocument(documentId);
    if(!document)throw new Error('指定的资料不属于当前工作区。');
  }else{
    mkdirSync(rag.directory,{recursive:true});const stored=`${randomUUID()}${extname(file).toLowerCase()}`,destination=join(rag.directory,stored);copyFileSync(file,destination);
    document=store.createRagDocument({folderId:null,name:basename(file),storedName:stored,mime:'application/pdf',size:(await import('node:fs')).statSync(file).size});
  }
  await rag.parse(document.id);const parsed=store.getRagDocument(document.id)!;
  if(parsed.status!=='ready')throw new Error(parsed.error||'资料解析失败。');
  const result=await answers.answer({question,requestId:randomUUID()},'qq');
  if(result.source!=='rag')throw new Error(`机器人未走知识图谱兜底，实际来源：${result.source}`);
  console.log(JSON.stringify({document:{id:parsed.id,name:parsed.name,status:parsed.status,chunks:parsed.chunkCount,tokens:parsed.tokenCount,graphNodes:parsed.graphNodeCount,graphEdges:parsed.graphEdgeCount},question,source:result.source,answer:result.answer},null,2));
}finally{models.close();store.close();}
