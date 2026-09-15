import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { and, desc, eq, sql } from 'drizzle-orm';
import { readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { AnswerResult, Channel, Faq, FaqAttachment, FaqInput, FaqLibraryType, FaqStatus, KnowledgeAttachmentKind, KnowledgeCategory, MaterialCategory, MaterialItem, MaterialStatus, NotificationAttachment, NotificationInput, NotificationRecord, NotificationTarget, PageResult, QqGroup, QqSender, RagChunk, RagDocument, RagFolder, RagGraph, RagSettings, Unmatched, UnmatchedPreferences, UnmatchedQqStudent, UnmatchedType } from '@campus/contracts';
import { faqs } from './schema.js';
import { DEMO_FAQS } from './seed.js';
import { AppError, conflict } from '../errors.js';
import { ABUSE_LEXICON_CANDIDATES } from '../services/abuse-lexicon.js';

export const DAY = 86_400_000;
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export const normalize = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\p{Z}\s]/gu, '');
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
export const dateKey = (time = Date.now()) => dayFormatter.format(time);
const publicFaq = (r: typeof faqs.$inferSelect): Faq => ({ id:r.id, question:r.question, answer:r.answer, keywords:r.keywords, category:r.category, status:r.status, version:r.version, isDemo:r.isDemo, createdAt:r.createdAt, updatedAt:r.updatedAt, libraryType:r.libraryType });
export interface ListQuery { q?: string; status?: string; category?: string; libraryType?:FaqLibraryType; unmatchedType?:UnmatchedType; page?: number; pageSize?: number }
export interface DedupRow { payload_hash: string; state: string; response_json: string | null }
interface GroupRow {id:string;open_id:string;label:string;enabled:number;first_seen:number;last_seen:number;bot_app_id:string;actual_name:string|null;group_number:string|null;metadata_synced_at:number|null;deleted_at:number|null}
export interface NotificationAttachmentInput {name:string;storedName:string;kind:KnowledgeAttachmentKind;mime:string;size:number}
export interface MaterialListQuery {q?:string;status?:MaterialStatus;categoryId?:string;page?:number;pageSize?:number}
export const MATERIAL_UNRELATED_CATEGORY='无关类别';
export class Store {
  readonly sqlite: Database.Database;
  readonly orm: ReturnType<typeof drizzle>;
  private readonly workspaceContext=new AsyncLocalStorage<string>();
  constructor(readonly path: string, root: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.sqlite = new Database(path); this.sqlite.pragma('journal_mode = WAL'); this.sqlite.pragma('busy_timeout = 5000'); this.sqlite.pragma('foreign_keys = ON');
    this.sqlite.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at INTEGER NOT NULL)');
    for (const file of readdirSync(join(root,'migrations')).filter(name=>/^\d+.*\.sql$/.test(name)).sort()) {
      const version=Number.parseInt(file,10);
      if(!this.sqlite.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get(version))this.transaction(()=>this.sqlite.exec(readFileSync(join(root,'migrations',file),'utf8')));
    }
    this.orm = drizzle(this.sqlite); this.cleanup();
  }
  close() { if (this.sqlite.open) this.sqlite.close(); }
  enterWorkspace(workspaceId:string){this.workspaceContext.enterWith(workspaceId||'legacy');}
  currentWorkspace(){return this.workspaceContext.getStore()||'legacy';}
  private scopedKey(value:string){return `${this.currentWorkspace()}:${value}`;}
  botWorkspace(){const row=this.sqlite.prepare("SELECT value FROM runtime_preferences WHERE key='bot_workspace_id' ORDER BY updated_at DESC LIMIT 1").get() as {value:string}|undefined;return row?.value||(this.sqlite.prepare("SELECT workspace_id value FROM admin_users WHERE role='teacher' ORDER BY created_at LIMIT 1").get() as {value:string}|undefined)?.value||'legacy';}
  setBotWorkspace(workspaceId:string){this.sqlite.prepare("INSERT INTO runtime_preferences(owner_id,key,value,updated_at) VALUES(?, 'bot_workspace_id',?,?) ON CONFLICT(owner_id,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(workspaceId,workspaceId,Date.now());}
  transaction<T>(fn: () => T): T { return this.sqlite.transaction(fn)(); }
  cleanup(now = Date.now()) {
    this.sqlite.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    this.sqlite.prepare('DELETE FROM request_dedup WHERE expires_at <= ?').run(now);
    this.sqlite.prepare('DELETE FROM unmatched_questions WHERE last_seen < ?').run(now - 30 * DAY);
  }
  private hydrateFaq(row:typeof faqs.$inferSelect):Faq { return {...publicFaq(row),attachments:this.listFaqAttachments(row.id)}; }
  getFaq(id: string) { const row = this.orm.select().from(faqs).where(and(eq(faqs.id,id),eq(faqs.ownerId,this.currentWorkspace()))).get(); return row ? this.hydrateFaq(row) : undefined; }
  activeFaqs(libraryType?:FaqLibraryType) { return this.orm.select().from(faqs).where(and(eq(faqs.ownerId,this.currentWorkspace()),eq(faqs.status,'active'),libraryType?eq(faqs.libraryType,libraryType):undefined)).all().map(row=>this.hydrateFaq(row)); }
  listFaqs(query: ListQuery): PageResult<Faq> {
    const { q = '', status = '', category = '', libraryType='answer', page = 1, pageSize = 20 } = query;
    const where = and(q ? sql`(instr(lower(${faqs.question}), lower(${q})) > 0 OR instr(lower(${faqs.answer}), lower(${q})) > 0)` : undefined,
      eq(faqs.ownerId,this.currentWorkspace()),status ? eq(faqs.status,status as 'active'|'disabled') : undefined, category ? eq(faqs.category,category) : undefined,eq(faqs.libraryType,libraryType));
    const total = this.orm.select({ value: sql<number>`count(*)` }).from(faqs).where(where).get()!.value;
    const items = this.orm.select().from(faqs).where(where).orderBy(desc(faqs.updatedAt),faqs.id).limit(pageSize).offset((page-1)*pageSize).all().map(row=>this.hydrateFaq(row));
    return { items, total, page, pageSize };
  }
  listFaqsForExport(libraryType:FaqLibraryType,limit=10000):Faq[] {
    return this.orm.select().from(faqs).where(and(eq(faqs.ownerId,this.currentWorkspace()),eq(faqs.libraryType,libraryType))).orderBy(desc(faqs.updatedAt),faqs.id).limit(limit).all().map(publicFaq);
  }
  validateFaq(input: FaqInput) {
    const question = input.question.trim(), answer = input.answer.trim();
    const keywords = [...new Set(input.keywords.map(x=>x.trim()).filter(Boolean))];
    const libraryType=input.libraryType||'answer';
    const category=this.sqlite.prepare('SELECT id FROM knowledge_categories WHERE owner_id=? AND name=? AND library_type=?').get(this.currentWorkspace(),input.category.trim(),libraryType);
    if (!question || !answer || !normalize(question) || question.length>200 || answer.length>1500 || !keywords.length || keywords.length>20 || keywords.some(k=>k.length>40) || !category) throw new AppError(400,'INVALID_FAQ','请完整填写问题、答案、分类及有效关键词。');
    if (input.status==='active' && !input.confirmed) throw new AppError(400,'REVIEW_REQUIRED','启用前请确认答案已核实。');
    return { question, answer, keywords, category: input.category.trim(), status: input.status,libraryType };
  }
  saveFaq(input: FaqInput, actor: string, id?: string, version?: number, importedId?: string): Faq {
    const values = this.validateFaq(input);
    return this.transaction(() => {
      const existing = id ? this.getFaq(id) : undefined;
      if (id && !existing) throw new AppError(404,'NOT_FOUND','该问题不存在。');
      if (existing && existing.version !== version) throw conflict();
      const nextId = id || importedId || randomUUID(), now=Date.now();
      const questionKey=this.scopedKey(normalize(values.question));
      const duplicate = this.orm.select({id:faqs.id}).from(faqs).where(eq(faqs.questionKey,questionKey)).get();
      if (duplicate && duplicate.id!==nextId) throw new AppError(409,'DUPLICATE_FAQ','已有相同的标准问题，请编辑现有条目。');
      if (existing) this.orm.update(faqs).set({...values,questionKey,version:existing.version+1,isDemo:false,updatedBy:actor,updatedAt:now}).where(and(eq(faqs.id,nextId),eq(faqs.ownerId,this.currentWorkspace()))).run();
      else this.orm.insert(faqs).values({...values,id:nextId,ownerId:this.currentWorkspace(),questionKey,version:1,isDemo:false,updatedBy:actor,createdAt:now,updatedAt:now}).run();
      this.sqlite.prepare('INSERT INTO admin_audit(actor_id,action,faq_id,version,created_at) VALUES(?,?,?,?,?)').run(actor,existing?'faq.update':'faq.create',nextId,existing?existing.version+1:1,now);
      return this.getFaq(nextId)!;
    });
  }
  deleteFaq(id:string,actor:string,version:number){
    return this.transaction(()=>{
      const existing=this.getFaq(id);if(!existing)throw new AppError(404,'NOT_FOUND','该条目不存在。');if(existing.version!==version)throw conflict();
      const attachments=this.sqlite.prepare('SELECT stored_name AS storedName FROM faq_attachments WHERE faq_id=?').all(id) as {storedName:string}[];
      this.sqlite.prepare('UPDATE unmatched_questions SET resolved_faq_id=NULL WHERE resolved_faq_id=?').run(id);
      this.sqlite.prepare('DELETE FROM faqs WHERE id=?').run(id);
      this.sqlite.prepare('INSERT INTO admin_audit(actor_id,action,faq_id,version,created_at) VALUES(?,?,?,?,?)').run(actor,'faq.delete',id,existing.version,Date.now());
      return {id,libraryType:existing.libraryType,attachments};
    });
  }
  batchFaqs(ids:string[],libraryType:FaqLibraryType,action:'update'|'delete',actor:string,changes:{category?:string;status?:FaqStatus}={}){
    const unique=[...new Set(ids)].slice(0,100),workspace=this.currentWorkspace();
    if(!unique.length)throw new AppError(400,'INVALID_SELECTION','请选择需要处理的知识条目。');
    if(action==='update'&&!changes.category&&!changes.status)throw new AppError(400,'EMPTY_BATCH_CHANGE','请选择要批量修改的分类或状态。');
    if(changes.category&&!this.sqlite.prepare('SELECT 1 FROM knowledge_categories WHERE owner_id=? AND name=? AND library_type=?').get(workspace,changes.category,libraryType))throw new AppError(400,'INVALID_CATEGORY','所选分类不存在，请刷新后重试。');
    return this.transaction(()=>{
      const placeholders=unique.map(()=>'?').join(','),rows=this.sqlite.prepare(`SELECT id,version FROM faqs WHERE owner_id=? AND library_type=? AND id IN (${placeholders})`).all(workspace,libraryType,...unique) as {id:string;version:number}[];
      if(rows.length!==unique.length)throw new AppError(404,'NOT_FOUND','部分知识条目不存在或不属于当前题库，请刷新后重试。');
      const now=Date.now();
      if(action==='delete'){
        const attachments=this.sqlite.prepare(`SELECT faq_id AS faqId,stored_name AS storedName FROM faq_attachments WHERE faq_id IN (${placeholders})`).all(...unique) as {faqId:string;storedName:string}[];
        this.sqlite.prepare(`UPDATE unmatched_questions SET resolved_faq_id=NULL WHERE resolved_faq_id IN (${placeholders})`).run(...unique);
        this.sqlite.prepare(`DELETE FROM faqs WHERE owner_id=? AND library_type=? AND id IN (${placeholders})`).run(workspace,libraryType,...unique);
        for(const row of rows)this.sqlite.prepare('INSERT INTO admin_audit(actor_id,action,faq_id,version,created_at) VALUES(?,?,?,?,?)').run(actor,'faq.batch.delete',row.id,row.version,now);
        return {ok:true,count:rows.length,deletedIds:rows.map(row=>row.id),attachments};
      }
      const assignments=['version=version+1','is_demo=0','updated_by=?','updated_at=?'],params:unknown[]=[actor,now];
      if(changes.category){assignments.push('category=?');params.push(changes.category);}
      if(changes.status){assignments.push('status=?');params.push(changes.status);}
      this.sqlite.prepare(`UPDATE faqs SET ${assignments.join(',')} WHERE owner_id=? AND library_type=? AND id IN (${placeholders})`).run(...params,workspace,libraryType,...unique);
      for(const row of rows)this.sqlite.prepare('INSERT INTO admin_audit(actor_id,action,faq_id,version,created_at) VALUES(?,?,?,?,?)').run(actor,'faq.batch.update',row.id,row.version+1,now);
      return {ok:true,count:rows.length,deletedIds:[] as string[],attachments:[] as {faqId:string;storedName:string}[]};
    });
  }
  seedDemo() {
    if (this.orm.select({id:faqs.id}).from(faqs).limit(1).get()) return 0;
    this.transaction(()=>{
      for (const item of DEMO_FAQS) {
        const { confirmed:_, ...value }=item; const now=Date.now();
        this.orm.insert(faqs).values({...value,ownerId:this.currentWorkspace(),questionKey:this.scopedKey(normalize(item.question)),version:1,isDemo:true,createdAt:now,updatedAt:now}).run();
      }
    }); return DEMO_FAQS.length;
  }
  importFaqs(items: (FaqInput & {id?:string})[], actor: string) {
    return this.transaction(()=>items.map(item=> {
      const current=item.id?this.getFaq(item.id):undefined;
      const data={...item,status:'disabled' as const,confirmed:false};
      if(current) return this.saveFaq(data,actor,current.id,current.version);
      if(item.id && !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id)) throw new AppError(400,'INVALID_ID','导入的 FAQ ID 格式无效。');
      return this.saveFaq(data,actor,undefined,undefined,item.id);
    }));
  }
  importAbuseLexicon(actor:string){
    return this.transaction(()=>{
      const workspace=this.currentWorkspace(),categoryName='辱骂他人';
      if(!this.sqlite.prepare('SELECT 1 FROM knowledge_categories WHERE owner_id=? AND name=? AND library_type=\'forbidden\'').get(workspace,categoryName))this.createCategory(categoryName,'forbidden');
      let imported=0,skipped=0;
      for(const candidate of ABUSE_LEXICON_CANDIDATES){
        if(this.sqlite.prepare('SELECT 1 FROM faqs WHERE question_key=?').get(this.scopedKey(normalize(candidate.question)))){skipped++;continue;}
        this.saveFaq({question:candidate.question,keywords:candidate.keywords,answer:'请注意文明交流，避免使用侮辱性或攻击性表达。',category:categoryName,status:'disabled',confirmed:false,libraryType:'forbidden'},actor);imported++;
      }
      return {ok:true,imported,skipped,status:'disabled' as const};
    });
  }
  listCategories(libraryType:FaqLibraryType):KnowledgeCategory[] { return (this.sqlite.prepare('SELECT id,name,library_type,sort_order,created_at,updated_at FROM knowledge_categories WHERE owner_id=? AND library_type=? ORDER BY sort_order,name').all(this.currentWorkspace(),libraryType) as any[]).map(r=>({id:r.id,name:r.name,libraryType:r.library_type,sortOrder:r.sort_order,createdAt:r.created_at,updatedAt:r.updated_at})); }
  createCategory(name:string,libraryType:FaqLibraryType):KnowledgeCategory { const clean=name.trim();if(!clean||clean.length>40)throw new AppError(400,'INVALID_CATEGORY','分类名称应为 1 至 40 个字符。');const now=Date.now(),id=randomUUID();try{this.sqlite.prepare('INSERT INTO knowledge_categories(id,owner_id,name,library_type,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,this.currentWorkspace(),clean,libraryType,now,now,now);}catch{throw new AppError(409,'DUPLICATE_CATEGORY','该分类已经存在。');}return this.listCategories(libraryType).find(x=>x.id===id)!; }
  renameCategory(id:string,name:string):KnowledgeCategory { const workspace=this.currentWorkspace(),row=this.sqlite.prepare('SELECT library_type FROM knowledge_categories WHERE id=? AND owner_id=?').get(id,workspace) as {library_type:FaqLibraryType}|undefined;if(!row)throw new AppError(404,'NOT_FOUND','分类不存在。');const clean=name.trim();if(!clean||clean.length>40)throw new AppError(400,'INVALID_CATEGORY','分类名称应为 1 至 40 个字符。');try{this.transaction(()=>{const old=this.sqlite.prepare('SELECT name FROM knowledge_categories WHERE id=? AND owner_id=?').get(id,workspace) as {name:string};this.sqlite.prepare('UPDATE faqs SET category=? WHERE owner_id=? AND category=? AND library_type=?').run(clean,workspace,old.name,row.library_type);this.sqlite.prepare('UPDATE knowledge_categories SET name=?,updated_at=? WHERE id=? AND owner_id=?').run(clean,Date.now(),id,workspace);});}catch{throw new AppError(409,'DUPLICATE_CATEGORY','该分类已经存在。');}return this.listCategories(row.library_type).find(x=>x.id===id)!; }
  deleteCategory(id:string) { const workspace=this.currentWorkspace(),row=this.sqlite.prepare('SELECT name,library_type FROM knowledge_categories WHERE id=? AND owner_id=?').get(id,workspace) as {name:string;library_type:FaqLibraryType}|undefined;if(!row)throw new AppError(404,'NOT_FOUND','分类不存在。');const used=(this.sqlite.prepare('SELECT count(*) n FROM faqs WHERE owner_id=? AND category=? AND library_type=?').get(workspace,row.name,row.library_type) as {n:number}).n;if(used)throw new AppError(409,'CATEGORY_IN_USE','请先移动该分类下的题目。');this.sqlite.prepare('DELETE FROM knowledge_categories WHERE id=? AND owner_id=?').run(id,workspace);return {ok:true}; }
  listFaqAttachments(faqId:string):FaqAttachment[] {return (this.sqlite.prepare('SELECT a.id,a.faq_id,a.name,a.kind,a.mime,a.size,a.created_at FROM faq_attachments a JOIN faqs f ON f.id=a.faq_id WHERE a.faq_id=? AND f.owner_id=? ORDER BY a.created_at').all(faqId,this.currentWorkspace()) as any[]).map(r=>({id:r.id,faqId:r.faq_id,name:r.name,kind:r.kind,mime:r.mime,size:r.size,createdAt:r.created_at}));}
  addFaqAttachment(faqId:string,input:{name:string;storedName:string;kind:KnowledgeAttachmentKind;mime:string;size:number}) {if(!this.getFaq(faqId))throw new AppError(404,'NOT_FOUND','知识条目不存在。');const id=randomUUID(),createdAt=Date.now();this.sqlite.prepare('INSERT INTO faq_attachments(id,faq_id,name,stored_name,kind,mime,size,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,faqId,input.name,input.storedName,input.kind,input.mime,input.size,createdAt);return {id,faqId,name:input.name,kind:input.kind,mime:input.mime,size:input.size,createdAt} satisfies FaqAttachment;}
  attachmentFile(id:string) {return this.sqlite.prepare('SELECT a.id,a.faq_id,a.name,a.stored_name,a.kind,a.mime,a.size,a.created_at FROM faq_attachments a JOIN faqs f ON f.id=a.faq_id WHERE a.id=? AND f.owner_id=?').get(id,this.currentWorkspace()) as {id:string;faq_id:string;name:string;stored_name:string;kind:KnowledgeAttachmentKind;mime:string;size:number;created_at:number}|undefined;}
  deleteFaqAttachment(id:string) {const row=this.attachmentFile(id);if(!row)throw new AppError(404,'NOT_FOUND','附件不存在。');this.sqlite.prepare('DELETE FROM faq_attachments WHERE id=?').run(id);return row;}
  listRagFolders():RagFolder[] {return (this.sqlite.prepare('SELECT id,name,parent_id,created_at,updated_at FROM rag_folders WHERE owner_id=? ORDER BY name').all(this.currentWorkspace()) as any[]).map(r=>({id:r.id,name:r.name,parentId:r.parent_id,createdAt:r.created_at,updatedAt:r.updated_at}));}
  saveRagFolder(name:string,parentId:string|null=null):RagFolder {const workspace=this.currentWorkspace(),clean=name.trim();if(!clean||clean.length>80)throw new AppError(400,'INVALID_FOLDER','目录名称应为 1 至 80 个字符。');if(parentId&&!this.sqlite.prepare('SELECT 1 FROM rag_folders WHERE id=? AND owner_id=?').get(parentId,workspace))throw new AppError(404,'NOT_FOUND','上级目录不存在。');const id=randomUUID(),now=Date.now();this.sqlite.prepare('INSERT INTO rag_folders(id,owner_id,name,parent_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,workspace,clean,parentId,now,now);return {id,name:clean,parentId,createdAt:now,updatedAt:now};}
  renameRagFolder(id:string,name:string):RagFolder {const workspace=this.currentWorkspace(),row=this.sqlite.prepare('SELECT parent_id FROM rag_folders WHERE id=? AND owner_id=?').get(id,workspace) as {parent_id:string|null}|undefined;if(!row)throw new AppError(404,'NOT_FOUND','目录不存在。');const clean=name.trim();if(!clean||clean.length>80)throw new AppError(400,'INVALID_FOLDER','目录名称应为 1 至 80 个字符。');const duplicate=this.sqlite.prepare('SELECT 1 FROM rag_folders WHERE owner_id=? AND id<>? AND name=? AND parent_id IS ?').get(workspace,id,clean,row.parent_id);if(duplicate)throw new AppError(409,'DUPLICATE_FOLDER','同级目录中已存在这个名称。');const now=Date.now();this.sqlite.prepare('UPDATE rag_folders SET name=?,updated_at=? WHERE id=? AND owner_id=?').run(clean,now,id,workspace);return this.listRagFolders().find(folder=>folder.id===id)!;}
  deleteRagFolder(id:string){const workspace=this.currentWorkspace();if(!this.sqlite.prepare('SELECT 1 FROM rag_folders WHERE id=? AND owner_id=?').get(id,workspace))throw new AppError(404,'NOT_FOUND','目录不存在。');this.sqlite.prepare('DELETE FROM rag_folders WHERE id=? AND owner_id=?').run(id,workspace);return {ok:true};}
  listRagDocuments():RagDocument[] {return (this.sqlite.prepare('SELECT id,folder_id,name,mime,size,status,progress,chunk_count,token_count,graph_node_count,graph_edge_count,error,created_at,updated_at FROM rag_documents WHERE owner_id=? ORDER BY updated_at DESC').all(this.currentWorkspace()) as any[]).map(r=>({id:r.id,folderId:r.folder_id,name:r.name,mime:r.mime,size:r.size,status:r.status,progress:r.progress,chunkCount:r.chunk_count,tokenCount:r.token_count,graphNodeCount:r.graph_node_count,graphEdgeCount:r.graph_edge_count,error:r.error,createdAt:r.created_at,updatedAt:r.updated_at}));}
  getRagDocument(id:string){return this.listRagDocuments().find(x=>x.id===id);}
  createRagDocument(input:{folderId:string|null;name:string;storedName:string;mime:string;size:number}){const id=randomUUID(),now=Date.now();this.sqlite.prepare("INSERT INTO rag_documents(id,owner_id,folder_id,name,stored_name,mime,size,status,progress,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'pending',0,?,?)").run(id,this.currentWorkspace(),input.folderId,input.name,input.storedName,input.mime,input.size,now,now);return this.getRagDocument(id)!;}
  ragStoredName(id:string){return (this.sqlite.prepare('SELECT stored_name FROM rag_documents WHERE id=? AND owner_id=?').get(id,this.currentWorkspace()) as {stored_name:string}|undefined)?.stored_name;}
  ragFile(id:string){return this.sqlite.prepare('SELECT id,name,stored_name,mime,size,created_at FROM rag_documents WHERE id=? AND owner_id=? AND status=\'ready\'').get(id,this.currentWorkspace()) as {id:string;name:string;stored_name:string;mime:string;size:number;created_at:number}|undefined;}
  updateRagDocument(id:string,patch:{status?:string;progress?:number;chunkCount?:number;tokenCount?:number;graphNodeCount?:number;graphEdgeCount?:number;error?:string|null}){const current=this.getRagDocument(id);if(!current)throw new AppError(404,'NOT_FOUND','资料不存在。');this.sqlite.prepare('UPDATE rag_documents SET status=?,progress=?,chunk_count=?,token_count=?,graph_node_count=?,graph_edge_count=?,error=?,updated_at=? WHERE id=?').run(patch.status??current.status,patch.progress??current.progress,patch.chunkCount??current.chunkCount,patch.tokenCount??current.tokenCount,patch.graphNodeCount??current.graphNodeCount,patch.graphEdgeCount??current.graphEdgeCount,patch.error===undefined?current.error:patch.error,Date.now(),id);return this.getRagDocument(id)!;}
  replaceRagChunks(documentId:string,chunks:{content:string;tokenCount:number;keywords:string[];embedding:number[]}[]){this.transaction(()=>{this.sqlite.prepare('DELETE FROM rag_chunks WHERE document_id=?').run(documentId);const insert=this.sqlite.prepare('INSERT INTO rag_chunks(id,document_id,position,content,token_count,keywords_json,embedding_json) VALUES(?,?,?,?,?,?,?)');chunks.forEach((c,i)=>insert.run(randomUUID(),documentId,i,c.content,c.tokenCount,JSON.stringify(c.keywords),JSON.stringify(c.embedding)));});}
  listRagChunks(documentId?:string):RagChunk[]{const workspace=this.currentWorkspace(),rows=(documentId?this.sqlite.prepare('SELECT c.*,d.name document_name FROM rag_chunks c JOIN rag_documents d ON d.id=c.document_id WHERE c.document_id=? AND d.owner_id=? ORDER BY c.position').all(documentId,workspace):this.sqlite.prepare('SELECT c.*,d.name document_name FROM rag_chunks c JOIN rag_documents d ON d.id=c.document_id WHERE d.owner_id=? ORDER BY d.updated_at DESC,c.position').all(workspace)) as any[];return rows.map(r=>({id:r.id,documentId:r.document_id,documentName:r.document_name,position:r.position,content:r.content,tokenCount:r.token_count,keywords:JSON.parse(r.keywords_json)}));}
  ragChunkVectors(){return (this.sqlite.prepare('SELECT c.*,d.name document_name FROM rag_chunks c JOIN rag_documents d ON d.id=c.document_id WHERE d.owner_id=? AND d.status=\'ready\'').all(this.currentWorkspace()) as any[]).map(r=>({...r,keywords:JSON.parse(r.keywords_json),embedding:JSON.parse(r.embedding_json)}));}
  ragCollectionSignature(){const row=this.sqlite.prepare("SELECT count(*) documents,coalesce(max(updated_at),0) updated,coalesce(sum(chunk_count),0) chunks FROM rag_documents WHERE owner_id=? AND status='ready'").get(this.currentWorkspace()) as {documents:number;updated:number;chunks:number};return `${this.currentWorkspace()}:${row.documents}:${row.updated}:${row.chunks}`;}
  replaceRagGraph(documentId:string,nodes:{key:string;label:string;type:string;description:string}[],edges:{sourceKey:string;targetKey:string;relation:string}[]){this.transaction(()=>{this.sqlite.prepare('DELETE FROM rag_graph_nodes WHERE document_id=?').run(documentId);const insertNode=this.sqlite.prepare('INSERT INTO rag_graph_nodes(id,document_id,node_key,label,type,description) VALUES(?,?,?,?,?,?)'),ids=new Map<string,string>();for(const node of nodes){const id=randomUUID();insertNode.run(id,documentId,node.key,node.label,node.type,node.description);ids.set(node.key,id);}const insertEdge=this.sqlite.prepare('INSERT INTO rag_graph_edges(id,document_id,source_id,target_id,relation) VALUES(?,?,?,?,?)');for(const edge of edges){const source=ids.get(edge.sourceKey),target=ids.get(edge.targetKey);if(source&&target&&source!==target)insertEdge.run(randomUUID(),documentId,source,target,edge.relation);}const counts=this.sqlite.prepare('SELECT (SELECT count(*) FROM rag_graph_nodes WHERE document_id=?) nodes,(SELECT count(*) FROM rag_graph_edges WHERE document_id=?) edges').get(documentId,documentId) as {nodes:number;edges:number};this.updateRagDocument(documentId,{graphNodeCount:counts.nodes,graphEdgeCount:counts.edges});});}
  getRagGraph(documentId:string):RagGraph {const document=this.getRagDocument(documentId);if(!document)throw new AppError(404,'NOT_FOUND','资料不存在。');const nodes=(this.sqlite.prepare('SELECT id,document_id,label,type,description FROM rag_graph_nodes WHERE document_id=? ORDER BY label').all(documentId) as any[]).map(r=>({id:r.id,documentId:r.document_id,label:r.label,type:r.type,description:r.description}));const edges=(this.sqlite.prepare('SELECT id,document_id,source_id,target_id,relation FROM rag_graph_edges WHERE document_id=? ORDER BY relation').all(documentId) as any[]).map(r=>({id:r.id,documentId:r.document_id,sourceId:r.source_id,targetId:r.target_id,relation:r.relation}));return {document,nodes,edges};}
  deleteRagDocument(id:string){const stored=this.ragStoredName(id);if(!stored)throw new AppError(404,'NOT_FOUND','资料不存在。');this.sqlite.prepare('DELETE FROM rag_documents WHERE id=?').run(id);return stored;}
  getRagSettings():RagSettings {const workspace=this.currentWorkspace();this.sqlite.prepare("INSERT OR IGNORE INTO rag_settings(owner_id,embedding_model,rerank_model,parser_mode,chunk_size,chunk_overlap,top_k,updated_at) VALUES(?,'local/hash-384','langchain/ensemble-rrf','local',700,100,5,?)").run(workspace,Date.now());const r=this.sqlite.prepare('SELECT * FROM rag_settings WHERE owner_id=?').get(workspace) as any;return {embeddingModel:r.embedding_model,rerankModel:r.rerank_model,parserMode:r.parser_mode,chunkSize:r.chunk_size,chunkOverlap:r.chunk_overlap,topK:r.top_k,updatedAt:r.updated_at};}
  saveRagSettings(input:Omit<RagSettings,'updatedAt'>):RagSettings {if(input.chunkSize<200||input.chunkSize>2400||input.chunkOverlap<0||input.chunkOverlap>=input.chunkSize||input.topK<1||input.topK>20)throw new AppError(400,'INVALID_RAG_SETTINGS','切片和召回参数不合法。');const now=Date.now();this.getRagSettings();this.sqlite.prepare('UPDATE rag_settings SET embedding_model=?,rerank_model=?,parser_mode=?,chunk_size=?,chunk_overlap=?,top_k=?,updated_at=? WHERE owner_id=?').run(input.embeddingModel,input.rerankModel,input.parserMode,input.chunkSize,input.chunkOverlap,input.topK,now,this.currentWorkspace());return this.getRagSettings();}
  saveRagEvaluation(payload:unknown){const id=randomUUID(),createdAt=Date.now();this.sqlite.prepare('INSERT INTO rag_eval_runs(id,payload_json,created_at) VALUES(?,?,?)').run(id,JSON.stringify(payload),createdAt);return {id,createdAt};}
  findAdmin(username: string) { return this.sqlite.prepare('SELECT id,username,password_hash,role,workspace_id FROM admin_users WHERE username=?').get(username) as {id:string;username:string;password_hash:string;role:'teacher'|'developer';workspace_id:string|null}|undefined; }
  adminCount() { return (this.sqlite.prepare("SELECT count(*) AS n FROM admin_users WHERE role='teacher'").get() as {n:number}).n; }
  setAdmin(username: string, passwordHash: string) {
    return this.transaction(()=>{
      const old=this.findAdmin(username), id=old?.id || randomUUID();
      if(old?.role==='developer')throw new AppError(409,'RESERVED_ACCOUNT','该账号名称已保留。');
      const workspaceId=old?.workspace_id||(this.adminCount()===0?'legacy':id);
      this.sqlite.prepare("INSERT INTO admin_users(id,username,password_hash,role,workspace_id,created_at) VALUES(?,?,?,'teacher',?,?) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash").run(id,username,passwordHash,workspaceId,Date.now());
      this.initializeWorkspace(workspaceId);
      this.sqlite.prepare('DELETE FROM sessions WHERE user_id=?').run(id); return {id,username};
    });
  }
  private initializeWorkspace(workspaceId:string){
    const now=Date.now(),categories:[string,FaqLibraryType][]=[['选课与课程','answer'],['考试与成绩','answer'],['学籍与注册','answer'],['毕业与材料','answer'],['校园服务','answer'],['政策红线','forbidden'],['安全与隐私','forbidden'],['违规内容','forbidden']];
    const insert=this.sqlite.prepare('INSERT OR IGNORE INTO knowledge_categories(id,owner_id,name,library_type,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?)');categories.forEach(([name,type],index)=>insert.run(randomUUID(),workspaceId,name,type,(index+1)*10,now,now));
    this.sqlite.prepare("INSERT OR IGNORE INTO rag_settings(owner_id,embedding_model,rerank_model,parser_mode,chunk_size,chunk_overlap,top_k,updated_at) VALUES(?,'local/hash-384','langchain/ensemble-rrf','local',700,100,5,?)").run(workspaceId,now);
    const preference=this.sqlite.prepare('INSERT OR IGNORE INTO runtime_preferences(owner_id,key,value,updated_at) VALUES(?,?,?,?)');for(const [key,value] of [['offline_auto_reply','true'],['qq_auto_start','true'],['deepseek_auto_start','true'],['qq_answer_enabled','true']])preference.run(workspaceId,key,value,now);
  }
  registerAdmin(username:string,passwordHash:string){const clean=username.trim().replace(/[\p{Cc}\p{Cf}]/gu,'');if(clean.length<2||clean.length>40)throw new AppError(400,'INVALID_USERNAME','账号名称需要为 2 至 40 个字符。');if(this.findAdmin(clean))throw new AppError(409,'ACCOUNT_EXISTS','该账号名称已被注册。');return this.setAdmin(clean,passwordHash);}
  ensureDeveloper(username:string,passwordHash:string){const old=this.findAdmin(username),id=old?.id||randomUUID();if(old?.role==='teacher')throw new AppError(409,'DEVELOPER_NAME_CONFLICT','开发者账号名称已被普通账号占用。');this.sqlite.prepare("INSERT INTO admin_users(id,username,password_hash,role,workspace_id,created_at) VALUES(?,?,?,'developer',NULL,?) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash,role='developer',workspace_id=NULL").run(id,username,passwordHash,Date.now());return {id,username};}
  listRegisteredAccounts(){return this.sqlite.prepare("SELECT id,username,created_at AS createdAt FROM admin_users WHERE role='teacher' ORDER BY created_at DESC").all() as {id:string;username:string;createdAt:number}[];}
  resetRegisteredAccount(id:string,passwordHash:string){const result=this.sqlite.prepare("UPDATE admin_users SET password_hash=? WHERE id=? AND role='teacher'").run(passwordHash,id);if(!result.changes)throw new AppError(404,'ACCOUNT_NOT_FOUND','账号不存在。');this.sqlite.prepare('DELETE FROM sessions WHERE user_id=?').run(id);return {ok:true};}
  saveSession(token: string,userId: string,csrfToken: string) { this.sqlite.prepare('INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES(?,?,?,?)').run(hash(token),userId,csrfToken,Date.now()+8*3600000); }
  getSession(token: string) {
    const r=this.sqlite.prepare('SELECT u.id,u.username,u.role,u.workspace_id,s.csrf_token FROM sessions s JOIN admin_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(hash(token),Date.now()) as {id:string;username:string;role:'teacher'|'developer';workspace_id:string|null;csrf_token:string}|undefined;
    return r ? {user:{id:r.id,username:r.username,role:r.role},csrfToken:r.csrf_token,workspaceId:r.workspace_id} : undefined;
  }
  developerAccess(token:string) {
    const row=this.sqlite.prepare('SELECT developer_until FROM sessions WHERE token_hash=? AND expires_at>?').get(hash(token),Date.now()) as {developer_until:number}|undefined;
    return {unlocked:!!row&&row.developer_until>Date.now(),expiresAt:row?.developer_until&&row.developer_until>Date.now()?row.developer_until:null};
  }
  unlockDeveloper(token:string,durationMs=30*60_000) {
    const expiresAt=Date.now()+durationMs,result=this.sqlite.prepare('UPDATE sessions SET developer_until=? WHERE token_hash=? AND expires_at>?').run(expiresAt,hash(token),Date.now());
    if(!result.changes)throw new AppError(401,'UNAUTHORIZED','请先登录老师工作台。');
    return {unlocked:true,expiresAt};
  }
  lockDeveloperAccess(){this.sqlite.prepare('UPDATE sessions SET developer_until=0 WHERE developer_until<>0').run();}
  deleteSession(token: string) { this.sqlite.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token)); }
  dedupGet(key: string) { return this.sqlite.prepare('SELECT payload_hash,state,response_json FROM request_dedup WHERE key_hash=? AND expires_at>?').get(key,Date.now()) as DedupRow | undefined; }
  dedupBegin(key: string,payload: string) { this.transaction(()=>{this.sqlite.prepare('DELETE FROM request_dedup WHERE key_hash=? AND expires_at<=?').run(key,Date.now());this.sqlite.prepare("INSERT INTO request_dedup(key_hash,payload_hash,state,expires_at) VALUES(?,?,'processing',?)").run(key,payload,Date.now()+DAY);}); }
  dedupEnd(key: string,result: AnswerResult) { this.sqlite.prepare("UPDATE request_dedup SET state='completed',response_json=? WHERE key_hash=?").run(JSON.stringify(result),key); }
  reserveModel(limit: number) {
    return this.transaction(()=>{
      const day=dateKey(); const current=this.sqlite.prepare('SELECT attempts FROM model_usage WHERE owner_id=? AND day=?').get(this.currentWorkspace(),day) as {attempts:number}|undefined;
      if((current?.attempts||0)>=limit) return false;
      this.sqlite.prepare('INSERT INTO model_usage(owner_id,day,attempts) VALUES(?,?,1) ON CONFLICT(owner_id,day) DO UPDATE SET attempts=attempts+1').run(this.currentWorkspace(),day); return day;
    });
  }
  finishModel(failed: boolean,input=0,output=0,day=dateKey()) { this.sqlite.prepare('UPDATE model_usage SET errors=errors+?,input_tokens=input_tokens+?,output_tokens=output_tokens+? WHERE owner_id=? AND day=?').run(failed?1:0,input,output,this.currentWorkspace(),day); }
  recordAnswer(question: string,channel: Channel,result: AnswerResult,unmatchedType: UnmatchedType|null,qqSender?:QqSender) {
    this.transaction(()=>{
      const metric=result.faqId?`faq:${result.faqId}`:result.source==='rag'?'rag':`fallback:${result.fallbackReason}`;
      this.sqlite.prepare('INSERT INTO question_daily(owner_id,day,channel,metric_key,hits) VALUES(?,?,?,?,1) ON CONFLICT(owner_id,day,channel,metric_key) DO UPDATE SET hits=hits+1').run(this.currentWorkspace(),dateKey(),channel,metric);
      if(!unmatchedType) return;
      const now=Date.now();
      const questionKey=this.scopedKey(hash(normalize(question)));
      this.sqlite.prepare(`INSERT INTO unmatched_questions(id,owner_id,question_key,question,reason,queue_type,web_count,qq_count,first_seen,last_seen)
       VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(question_key) DO UPDATE SET web_count=web_count+excluded.web_count,qq_count=qq_count+excluded.qq_count,last_seen=excluded.last_seen,queue_type=CASE WHEN queue_type='offline' THEN queue_type ELSE excluded.queue_type END`).run(randomUUID(),this.currentWorkspace(),questionKey,question,result.fallbackReason||'no_match',unmatchedType,channel==='web'?1:0,channel==='qq'?1:0,now,now);
      if(channel==='qq'&&qqSender&&/^[A-Za-z0-9_-]{6,160}$/.test(qqSender.id)) {
        const record=this.sqlite.prepare('SELECT id FROM unmatched_questions WHERE question_key=?').get(questionKey) as {id:string};
        const name=qqSender.name?.trim().replace(/[\p{Cc}\p{Cf}]/gu,'').slice(0,80)||null;
        const qqNumber=qqSender.qqNumber&&/^[1-9]\d{4,11}$/.test(qqSender.qqNumber)?qqSender.qqNumber:null;
        const chatKind=qqSender.chatKind==='c2c'||qqSender.chatKind==='group'?qqSender.chatKind:null;
        const targetId=qqSender.targetId&&/^[A-Za-z0-9_-]{6,160}$/.test(qqSender.targetId)?qqSender.targetId:null;
        const messageId=qqSender.messageId?.trim().replace(/[\p{Cc}\p{Cf}]/gu,'').slice(0,200)||null;
        this.sqlite.prepare(`INSERT INTO unmatched_qq_students(question_id,sender_id,sender_name,qq_number,chat_kind,target_id,message_id,question_count,first_seen,last_seen) VALUES(?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(question_id,sender_id) DO UPDATE SET sender_name=coalesce(excluded.sender_name,sender_name),qq_number=coalesce(excluded.qq_number,qq_number),chat_kind=coalesce(excluded.chat_kind,chat_kind),target_id=coalesce(excluded.target_id,target_id),message_id=coalesce(excluded.message_id,message_id),question_count=question_count+1,last_seen=excluded.last_seen`).run(record.id,qqSender.id,name,qqNumber,chatKind,targetId,messageId,1,now,now);
      }
    });
  }
  recordOfflineQuestion(question:string,qqSender?:QqSender) {
    const clean=question.trim().replace(/[\p{Cc}\p{Cf}]/gu,'').slice(0,200);if(!clean)throw new AppError(400,'INVALID_QUESTION','离线问题内容为空。');
    const now=Date.now(),questionKey=this.scopedKey(hash(normalize(clean)));
    this.transaction(()=>{
      this.sqlite.prepare(`INSERT INTO unmatched_questions(id,owner_id,question_key,question,reason,queue_type,web_count,qq_count,first_seen,last_seen)
        VALUES(?,?,?,?,?, 'offline',0,1,?,?) ON CONFLICT(question_key) DO UPDATE SET qq_count=qq_count+1,last_seen=excluded.last_seen,queue_type='offline',status='pending'`).run(randomUUID(),this.currentWorkspace(),questionKey,clean,'api_unavailable',now,now);
      if(qqSender&&/^[A-Za-z0-9_-]{6,160}$/.test(qqSender.id)){
        const record=this.sqlite.prepare('SELECT id FROM unmatched_questions WHERE question_key=?').get(questionKey) as {id:string};
        const name=qqSender.name?.trim().replace(/[\p{Cc}\p{Cf}]/gu,'').slice(0,80)||null;
        const qqNumber=qqSender.qqNumber&&/^[1-9]\d{4,11}$/.test(qqSender.qqNumber)?qqSender.qqNumber:null;
        const chatKind=qqSender.chatKind==='c2c'||qqSender.chatKind==='group'?qqSender.chatKind:null;
        const targetId=qqSender.targetId&&/^[A-Za-z0-9_-]{6,160}$/.test(qqSender.targetId)?qqSender.targetId:null;
        const messageId=qqSender.messageId?.trim().replace(/[\p{Cc}\p{Cf}]/gu,'').slice(0,200)||null;
        this.sqlite.prepare(`INSERT INTO unmatched_qq_students(question_id,sender_id,sender_name,qq_number,chat_kind,target_id,message_id,question_count,first_seen,last_seen) VALUES(?,?,?,?,?,?,?,1,?,?)
          ON CONFLICT(question_id,sender_id) DO UPDATE SET sender_name=coalesce(excluded.sender_name,sender_name),qq_number=coalesce(excluded.qq_number,qq_number),chat_kind=coalesce(excluded.chat_kind,chat_kind),target_id=coalesce(excluded.target_id,target_id),message_id=coalesce(excluded.message_id,message_id),question_count=question_count+1,last_seen=excluded.last_seen`).run(record.id,qqSender.id,name,qqNumber,chatKind,targetId,messageId,now,now);
      }
    });
    return this.sqlite.prepare('SELECT id FROM unmatched_questions WHERE question_key=?').get(questionKey) as {id:string};
  }
  completeOfflineQuestion(id:string){const result=this.sqlite.prepare("UPDATE unmatched_questions SET status='resolved' WHERE id=? AND owner_id=? AND queue_type='offline'").run(id,this.currentWorkspace());if(!result.changes)throw new AppError(404,'NOT_FOUND','离线问题不存在。');return {ok:true};}
  unmatchedPreferences():UnmatchedPreferences {const rows=this.sqlite.prepare("SELECT key,value,updated_at FROM runtime_preferences WHERE owner_id=? AND key IN ('offline_auto_reply','qq_answer_enabled')").all(this.currentWorkspace()) as {key:string;value:string;updated_at:number}[];const values=new Map(rows.map(row=>[row.key,row]));return {offlineAutoReply:values.get('offline_auto_reply')?.value!=='false',qqAnswerEnabled:values.get('qq_answer_enabled')?.value!=='false',updatedAt:Math.max(0,...rows.map(row=>row.updated_at))};}
  setOfflineAutoReply(enabled:boolean):UnmatchedPreferences {const now=Date.now();this.sqlite.prepare("INSERT INTO runtime_preferences(owner_id,key,value,updated_at) VALUES(?,'offline_auto_reply',?,?) ON CONFLICT(owner_id,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(this.currentWorkspace(),enabled?'true':'false',now);return this.unmatchedPreferences();}
  servicePreference(key:'qq_auto_start'|'deepseek_auto_start'|'zhipu_auto_start'|'qq_answer_enabled'){const row=this.sqlite.prepare('SELECT value FROM runtime_preferences WHERE owner_id=? AND key=?').get(this.currentWorkspace(),key) as {value:string}|undefined;return row?row.value!=='false':key!=='zhipu_auto_start';}
  setServicePreference(key:'qq_auto_start'|'deepseek_auto_start'|'zhipu_auto_start'|'qq_answer_enabled',enabled:boolean){this.sqlite.prepare('INSERT INTO runtime_preferences(owner_id,key,value,updated_at) VALUES(?,?,?,?) ON CONFLICT(owner_id,key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(this.currentWorkspace(),key,enabled?'true':'false',Date.now());}
  listUnmatched(query: ListQuery): PageResult<Unmatched> {
    const {status='',q='',unmatchedType,page=1,pageSize=20}=query; const where:string[]=['owner_id=?'],params:(string|number)[]=[this.currentWorkspace()];
    if(status) {where.push('status=?');params.push(status);} if(unmatchedType){where.push('queue_type=?');params.push(unmatchedType);} if(q) {where.push('instr(lower(question),lower(?))>0');params.push(q);}
    const condition=where.length?' WHERE '+where.join(' AND '):'';
    const total=(this.sqlite.prepare('SELECT count(*) AS n FROM unmatched_questions'+condition).get(...params) as {n:number}).n;
    const rows=this.sqlite.prepare('SELECT id,question,reason,queue_type AS type,web_count AS webCount,qq_count AS qqCount,status,resolved_faq_id AS resolvedFaqId,first_seen AS firstSeen,last_seen AS lastSeen FROM unmatched_questions'+condition+' ORDER BY last_seen DESC LIMIT ? OFFSET ?').all(...params,pageSize,(page-1)*pageSize) as Omit<Unmatched,'qqStudents'>[];
    const studentsByQuestion=new Map<string,UnmatchedQqStudent[]>();
    if(rows.length){
      const students=this.sqlite.prepare(`SELECT question_id AS questionId,sender_id AS id,coalesce(confirmed_name,sender_name) AS name,qq_number AS qqNumber,question_count AS questionCount,first_seen AS firstSeen,last_seen AS lastSeen
        FROM unmatched_qq_students WHERE question_id IN (${rows.map(()=>'?').join(',')}) ORDER BY last_seen DESC`).all(...rows.map(row=>row.id)) as (UnmatchedQqStudent&{questionId:string})[];
      for(const student of students){const list=studentsByQuestion.get(student.questionId)||[];list.push({id:student.id,name:student.name,qqNumber:student.qqNumber,questionCount:student.questionCount,firstSeen:student.firstSeen,lastSeen:student.lastSeen});studentsByQuestion.set(student.questionId,list);}
    }
    return {items:rows.map(row=>({...row,qqStudents:studentsByQuestion.get(row.id)||[]})),total,page,pageSize};
  }
  updateUnmatchedQqStudent(questionId:string,senderId:string,input:{name:string;qqNumber:string},actor:string):UnmatchedQqStudent {
    const name=input.name.trim().replace(/[\p{Cc}\p{Cf}]/gu,''),qqNumber=input.qqNumber.trim();
    if(!name||name.length>80)throw new AppError(400,'INVALID_QQ_NAME','QQ 昵称需要为 1 至 80 个字符。');
    if(!/^[1-9]\d{4,11}$/.test(qqNumber))throw new AppError(400,'INVALID_QQ_NUMBER','QQ 号需要为 5 至 12 位数字。');
    return this.transaction(()=>{
      const result=this.sqlite.prepare('UPDATE unmatched_qq_students SET confirmed_name=?,qq_number=? WHERE question_id=? AND sender_id=? AND question_id IN (SELECT id FROM unmatched_questions WHERE owner_id=?)').run(name,qqNumber,questionId,senderId,this.currentWorkspace());
      if(!result.changes)throw new AppError(404,'NOT_FOUND','该学生来源记录不存在。');
      this.sqlite.prepare('INSERT INTO admin_audit(actor_id,action,faq_id,version,created_at) VALUES(?,?,?,?,?)').run(actor,'unmatched.student.update',null,null,Date.now());
      return this.sqlite.prepare('SELECT sender_id AS id,coalesce(confirmed_name,sender_name) AS name,qq_number AS qqNumber,question_count AS questionCount,first_seen AS firstSeen,last_seen AS lastSeen FROM unmatched_qq_students WHERE question_id=? AND sender_id=?').get(questionId,senderId) as UnmatchedQqStudent;
    });
  }
  resolveUnmatched(id: string, action: 'create'|'link'|'ignore',actor: string,input?: FaqInput,faqId?: string) {
    return this.transaction(()=>{
      const record=this.sqlite.prepare('SELECT status FROM unmatched_questions WHERE id=? AND owner_id=?').get(id,this.currentWorkspace()) as {status:string}|undefined;
      if(!record) throw new AppError(404,'NOT_FOUND','该记录不存在。');
      if(record.status!=='pending') throw conflict('该记录已被处理，请刷新列表。');
      let faq: Faq|undefined;
      if(action==='create') { if(!input) throw new AppError(400,'INVALID_INPUT','缺少 FAQ 内容。'); faq=this.saveFaq(input,actor); }
      if(action==='link') { faq=faqId?this.getFaq(faqId):undefined; if(!faq || faq.status!=='active') throw new AppError(400,'INVALID_FAQ','请选择已启用的 FAQ。'); }
      const workspace=this.currentWorkspace();
      this.sqlite.prepare('UPDATE unmatched_questions SET status=?,resolved_faq_id=? WHERE id=? AND owner_id=?').run(action==='ignore'?'ignored':'resolved',faq?.id||null,id,workspace);
      let queuedReplies=0;
      if(faq){
        const now=Date.now(),students=this.sqlite.prepare(`SELECT sender_id AS senderId,coalesce(confirmed_name,sender_name) AS senderName,
          coalesce(chat_kind,'c2c') AS chatKind,coalesce(target_id,sender_id) AS targetId
          FROM unmatched_qq_students WHERE question_id=?`).all(id) as {senderId:string;senderName:string|null;chatKind:'c2c'|'group';targetId:string}[];
        const enqueue=this.sqlite.prepare(`INSERT OR IGNORE INTO unmatched_reply_targets(id,owner_id,question_id,faq_id,sender_id,sender_name,chat_kind,target_id,answer,status,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,'pending',?,?)`);
        for(const student of students)queuedReplies+=enqueue.run(randomUUID(),workspace,id,faq.id,student.senderId,student.senderName,student.chatKind,student.targetId,faq.answer,now,now).changes;
      }
      this.sqlite.prepare('INSERT INTO admin_audit(actor_id,action,faq_id,version,created_at) VALUES(?,?,?,?,?)').run(actor,`unmatched.${action}`,faq?.id||null,faq?.version||null,Date.now());
      return {ok:true,faq,queuedReplies};
    });
  }
  claimUnmatchedReplies(limit=5):{id:string;questionId:string;targetId:string;kind:'c2c'|'group';senderName:string|null;answer:string;claimToken:string;attachments:FaqAttachment[]}[] {
    const now=Date.now();return this.transaction(()=>{
      this.sqlite.prepare("UPDATE unmatched_reply_targets SET status=CASE WHEN dispatch_started=1 OR attempt_count>=3 THEN 'failed' ELSE 'pending' END,last_error=CASE WHEN dispatch_started=1 THEN '发送结果未确认，请核对聊天记录' WHEN attempt_count>=3 THEN '领取任务超时' ELSE last_error END,lease_until=NULL,updated_at=? WHERE status='processing' AND lease_until<=?").run(now,now);
      const rows=this.sqlite.prepare(`SELECT id,question_id AS questionId,faq_id AS faqId,target_id AS targetId,chat_kind AS kind,sender_name AS senderName,answer
        FROM unmatched_reply_targets WHERE owner_id=? AND status='pending' ORDER BY created_at,id LIMIT ?`).all(this.currentWorkspace(),Math.max(1,Math.min(20,limit))) as {id:string;questionId:string;faqId:string|null;targetId:string;kind:'c2c'|'group';senderName:string|null;answer:string}[];
      const claim=this.sqlite.prepare("UPDATE unmatched_reply_targets SET status='processing',attempt_count=attempt_count+1,claim_token=?,dispatch_started=0,lease_until=?,updated_at=? WHERE id=? AND status='pending'");
      return rows.map(row=>{const claimToken=randomUUID();claim.run(claimToken,now+30_000,now,row.id);return {...row,claimToken,attachments:row.faqId?this.listFaqAttachments(row.faqId):[]};});
    });
  }
  beginUnmatchedReply(id:string,claimToken:string) {
    const result=this.sqlite.prepare("UPDATE unmatched_reply_targets SET dispatch_started=1,lease_until=?,updated_at=? WHERE id=? AND owner_id=? AND claim_token=? AND status='processing' AND dispatch_started=0 AND lease_until>?").run(Date.now()+90_000,Date.now(),id,this.currentWorkspace(),claimToken,Date.now());
    return {canSend:result.changes===1};
  }
  completeUnmatchedReply(id:string,claimToken:string,status:'sent'|'failed',errorCode?:string,messageId?:string) {
    return this.transaction(()=>{
      const row=this.sqlite.prepare('SELECT status,claim_token,dispatch_started FROM unmatched_reply_targets WHERE id=? AND owner_id=?').get(id,this.currentWorkspace()) as {status:string;claim_token:string|null;dispatch_started:number}|undefined;
      if(!row)throw new AppError(404,'NOT_FOUND','该问题回发任务不存在。');
      if(row.status==='sent')return {ok:true};
      if(row.claim_token!==claimToken||!row.dispatch_started)throw conflict('该问题回发任务凭证已失效。');
      this.sqlite.prepare('UPDATE unmatched_reply_targets SET status=?,lease_until=NULL,sent_at=?,last_error=?,platform_message_id=?,updated_at=? WHERE id=?').run(status,status==='sent'?Date.now():null,status==='failed'?(errorCode||'发送失败').slice(0,120):null,status==='sent'?(messageId||null):null,Date.now(),id);
      return {ok:true};
    });
  }
  batchUnmatched(ids:string[],action:'ignore'|'delete',actor:string){
    const unique=[...new Set(ids)].filter(Boolean);
    if(!unique.length||unique.length>100)throw new AppError(400,'INVALID_BATCH','请选择 1 至 100 条问题记录。');
    return this.transaction(()=>{
      const placeholders=unique.map(()=>'?').join(','),workspace=this.currentWorkspace();
      const rows=this.sqlite.prepare(`SELECT id,status FROM unmatched_questions WHERE owner_id=? AND id IN (${placeholders})`).all(workspace,...unique) as {id:string;status:string}[];
      if(rows.length!==unique.length)throw new AppError(404,'NOT_FOUND','部分问题记录不存在，请刷新列表后重试。');
      if(action==='ignore'&&rows.some(row=>row.status!=='pending'))throw conflict('仅待处理问题可以忽略，请刷新列表后重试。');
      if(action==='ignore')this.sqlite.prepare(`UPDATE unmatched_questions SET status='ignored',resolved_faq_id=NULL WHERE owner_id=? AND id IN (${placeholders})`).run(workspace,...unique);
      else this.sqlite.prepare(`DELETE FROM unmatched_questions WHERE owner_id=? AND id IN (${placeholders})`).run(workspace,...unique);
      this.sqlite.prepare('INSERT INTO admin_audit(actor_id,action,faq_id,version,created_at) VALUES(?,?,?,?,?)').run(actor,`unmatched.batch.${action}`,null,unique.length,Date.now());
      return {ok:true,count:unique.length};
    });
  }
  private publicGroup(row:GroupRow,appId?:string):QqGroup {
    return {id:row.id,label:row.actual_name||row.label,groupNumber:row.group_number,nameSynced:!!row.actual_name,available:!appId||row.bot_app_id===appId,enabled:!!row.enabled,firstSeen:row.first_seen,lastSeen:row.last_seen};
  }
  registerQqGroup(openId:string,appId=''):QqGroup {
    if(!/^[A-Za-z0-9_-]{6,160}$/.test(openId))throw new AppError(400,'INVALID_GROUP','群聊标识格式无效。');
    if(appId&&!/^\d{5,20}$/.test(appId))throw new AppError(400,'INVALID_BOT','机器人应用标识格式无效。');
    const now=Date.now(),workspace=this.currentWorkspace(),existing=this.sqlite.prepare('SELECT id FROM qq_groups WHERE open_id=?').get(openId) as {id:string}|undefined;
    if(existing)this.sqlite.prepare("UPDATE qq_groups SET owner_id=?,last_seen=?,bot_app_id=CASE WHEN ?<>'' THEN ? ELSE bot_app_id END WHERE id=?").run(workspace,now,appId,appId,existing.id);
    else this.sqlite.prepare('INSERT INTO qq_groups(id,owner_id,open_id,label,enabled,first_seen,last_seen,bot_app_id) VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),workspace,openId,'待核对群名',1,now,now,appId);
    const row=this.sqlite.prepare('SELECT * FROM qq_groups WHERE open_id=?').get(openId) as GroupRow;return this.publicGroup(row);
  }
  listQqGroups(appId?:string):QqGroup[] {
    const rows=this.sqlite.prepare('SELECT * FROM qq_groups WHERE owner_id=? AND deleted_at IS NULL ORDER BY enabled DESC,coalesce(actual_name,label),last_seen DESC').all(this.currentWorkspace()) as GroupRow[];return rows.map(row=>this.publicGroup(row,appId));
  }
  groupsToSync(appId:string){return this.sqlite.prepare("SELECT id,open_id FROM qq_groups WHERE owner_id=? AND bot_app_id IN ('',?)").all(this.currentWorkspace(),appId) as {id:string;open_id:string}[];}
  syncQqGroup(id:string,appId:string,name:string){
    if(!name.trim()||name.length>100||/[\p{Cc}]/u.test(name))throw new AppError(400,'INVALID_GROUP_LABEL','QQ 返回的群名称无效。');
    this.sqlite.prepare('UPDATE qq_groups SET actual_name=?,bot_app_id=?,metadata_synced_at=? WHERE id=?').run(name.trim(),appId,Date.now(),id);
  }
  updateQqGroup(id:string,input:{label:string;enabled:boolean;groupNumber?:string},actor:string):QqGroup {
    const label=input.label.trim();if(!label||label.length>100)throw new AppError(400,'INVALID_GROUP_LABEL','群聊名称需要为 1 至 100 个字符。');
    if(input.groupNumber!==undefined&&input.groupNumber!==''&&!/^[1-9]\d{4,14}$/.test(input.groupNumber))throw new AppError(400,'INVALID_GROUP_NUMBER','请填写 5 至 15 位真实 QQ 群号。');
    return this.transaction(()=>{const result=this.sqlite.prepare('UPDATE qq_groups SET label=?,enabled=?,group_number=CASE WHEN ? THEN ? ELSE group_number END WHERE id=? AND owner_id=? AND deleted_at IS NULL').run(label,input.enabled?1:0,input.groupNumber!==undefined?1:0,input.groupNumber||null,id,this.currentWorkspace());if(!result.changes)throw new AppError(404,'NOT_FOUND','该群聊不存在。');if(!input.enabled)this.sqlite.prepare("UPDATE notification_targets SET status='failed',last_error='群聊已停用',lease_until=NULL WHERE group_id=? AND (status='pending' OR (status='processing' AND dispatch_started=0))").run(id);this.sqlite.prepare('INSERT INTO admin_audit(actor_id,action,faq_id,version,owner_id,created_at) VALUES(?,?,?,?,?,?)').run(actor,'qq_group.update',null,null,this.currentWorkspace(),Date.now());const row=this.sqlite.prepare('SELECT * FROM qq_groups WHERE id=? AND owner_id=?').get(id,this.currentWorkspace()) as GroupRow;return this.publicGroup(row);});
  }
  deleteQqGroup(id:string,actor:string):{ok:true;id:string} {
    return this.transaction(()=>{const now=Date.now(),result=this.sqlite.prepare('UPDATE qq_groups SET enabled=0,deleted_at=? WHERE id=? AND owner_id=? AND deleted_at IS NULL').run(now,id,this.currentWorkspace());if(!result.changes)throw new AppError(404,'NOT_FOUND','该群聊不存在。');this.sqlite.prepare("UPDATE notification_targets SET status='failed',last_error='群聊已删除',lease_until=NULL WHERE group_id=? AND (status='pending' OR (status='processing' AND dispatch_started=0))").run(id);this.sqlite.prepare('INSERT INTO admin_audit(actor_id,action,faq_id,version,owner_id,created_at) VALUES(?,?,?,?,?,?)').run(actor,'qq_group.delete',null,null,this.currentWorkspace(),now);return {ok:true,id};});
  }
  listNotificationAttachments(notificationId:string):NotificationAttachment[] {return this.sqlite.prepare('SELECT id,notification_id AS notificationId,name,kind,mime,size,created_at AS createdAt FROM notification_attachments WHERE notification_id=? ORDER BY created_at,id').all(notificationId) as NotificationAttachment[];}
  notificationAttachmentFile(id:string){return this.sqlite.prepare('SELECT a.id,a.notification_id,a.name,a.stored_name,a.kind,a.mime,a.size,a.created_at FROM notification_attachments a JOIN notifications n ON n.id=a.notification_id WHERE a.id=? AND n.owner_id=?').get(id,this.currentWorkspace()) as {id:string;notification_id:string;name:string;stored_name:string;kind:KnowledgeAttachmentKind;mime:string;size:number;created_at:number}|undefined;}
  notificationAttachmentStored(storedName:string){return this.sqlite.prepare('SELECT id FROM notification_attachments WHERE stored_name=?').get(storedName) as {id:string}|undefined;}
  private notification(id:string):NotificationRecord {
    const row=this.sqlite.prepare(`SELECT n.id,n.title,n.content,n.created_at AS createdAt,count(t.id) AS targetCount,
      sum(CASE WHEN t.status IN ('pending','processing') THEN 1 ELSE 0 END) AS pendingCount,
      sum(CASE WHEN t.status='sent' THEN 1 ELSE 0 END) AS sentCount,sum(CASE WHEN t.status='failed' THEN 1 ELSE 0 END) AS failedCount
      FROM notifications n JOIN notification_targets t ON t.notification_id=n.id WHERE n.id=? AND n.owner_id=? GROUP BY n.id`).get(id,this.currentWorkspace()) as Omit<NotificationRecord,'targets'>|undefined;
    if(!row)throw new AppError(404,'NOT_FOUND','该通知不存在。');
    const targets=this.sqlite.prepare(`SELECT t.id,t.group_id AS groupId,coalesce(g.actual_name,g.label) AS groupLabel,t.status,t.attempt_count AS attempts,t.sent_at AS sentAt,t.last_error AS lastError,t.platform_message_id AS messageId
      FROM notification_targets t JOIN qq_groups g ON g.id=t.group_id WHERE t.notification_id=? ORDER BY g.label`).all(id) as NotificationTarget[];
    return {...row,targets,attachments:this.listNotificationAttachments(id)};
  }
  createNotification(input:NotificationInput,actor:string,appId?:string,attachments:NotificationAttachmentInput[]=[]):NotificationRecord {
    const title=input.title.trim(),content=input.content.trim(),groupIds=[...new Set(input.groupIds)].sort();
    if(!/^[A-Za-z0-9_-]{8,100}$/.test(input.requestId)||!title||title.length>80||!content||content.length>1500||!groupIds.length||groupIds.length>20)throw new AppError(400,'INVALID_NOTIFICATION','请填写标题和通知内容，并选择 1 至 20 个群聊。');
    if(attachments.length>10||attachments.some(item=>!item.name||item.name.length>240||item.size<1||item.size>60*1024*1024))throw new AppError(400,'INVALID_ATTACHMENT','每条通知最多添加 10 个有效附件。');
    const payloadHash=hash(JSON.stringify({title,content,groupIds,attachments:attachments.map(item=>({name:item.name,kind:item.kind,mime:item.mime,size:item.size}))}));
    return this.transaction(()=>{const old=this.sqlite.prepare('SELECT id,payload_hash,deleted_at FROM notifications WHERE owner_id=? AND request_id=?').get(this.currentWorkspace(),input.requestId) as {id:string;payload_hash:string;deleted_at:number|null}|undefined;if(old){if(old.deleted_at!==null)throw new AppError(409,'NOTIFICATION_DELETED','该通知记录已删除，如需重新发送，请重新编辑通知。');if(old.payload_hash!==payloadHash)throw new AppError(409,'REQUEST_CONFLICT','该发送请求编号已用于其他内容。');return this.notification(old.id);}
      const groups=this.sqlite.prepare(`SELECT id FROM qq_groups WHERE owner_id=? AND enabled=1 AND deleted_at IS NULL AND id IN (${groupIds.map(()=>'?').join(',')})${appId?' AND bot_app_id=?':''}`).all(this.currentWorkspace(),...groupIds,...(appId?[appId]:[])) as {id:string}[];if(groups.length!==groupIds.length)throw new AppError(400,'INVALID_GROUP_SELECTION','选择中包含已停用、已删除或不属于当前机器人的群聊，请刷新并重新选择。');
      const id=randomUUID(),now=Date.now();this.sqlite.prepare('INSERT INTO notifications(id,owner_id,request_id,payload_hash,title,content,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,this.currentWorkspace(),input.requestId,payloadHash,title,content,actor,now);const insert=this.sqlite.prepare('INSERT INTO notification_targets(id,notification_id,group_id,status,attempt_count) VALUES(?,?,?,\'pending\',0)');for(const groupId of groupIds)insert.run(randomUUID(),id,groupId);const attach=this.sqlite.prepare('INSERT INTO notification_attachments(id,notification_id,name,stored_name,kind,mime,size,created_at) VALUES(?,?,?,?,?,?,?,?)');for(const item of attachments)attach.run(randomUUID(),id,item.name,item.storedName,item.kind,item.mime,item.size,now);this.sqlite.prepare('INSERT INTO admin_audit(actor_id,action,faq_id,version,owner_id,created_at) VALUES(?,?,?,?,?,?)').run(actor,'notification.send',null,null,this.currentWorkspace(),now);return this.notification(id);});
  }
  listNotifications(limit=20):NotificationRecord[] {
    const ids=this.sqlite.prepare('SELECT id FROM notifications WHERE owner_id=? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ?').all(this.currentWorkspace(),Math.max(1,Math.min(50,limit))) as {id:string}[];return ids.map(item=>this.notification(item.id));
  }
  deleteNotification(id:string,actor:string):{ok:true;id:string} {
    return this.sqlite.transaction(()=>{
      const row=this.sqlite.prepare('SELECT deleted_at FROM notifications WHERE id=? AND owner_id=?').get(id,this.currentWorkspace()) as {deleted_at:number|null}|undefined;
      if(!row)throw new AppError(404,'NOT_FOUND','该通知记录不存在。');
      if(row.deleted_at!==null)return {ok:true as const,id};
      if(this.sqlite.prepare("SELECT 1 FROM notification_targets WHERE notification_id=? AND status IN ('pending','processing') LIMIT 1").get(id))throw new AppError(409,'NOTIFICATION_ACTIVE','通知仍在排队或发送中，请等待发送结束后再删除记录。');
      const now=Date.now();
      // Keep the request ID and receipts so a delayed retry cannot resend a deleted record.
      this.sqlite.prepare('UPDATE notifications SET deleted_at=? WHERE id=?').run(now,id);
      this.sqlite.prepare('INSERT INTO admin_audit(actor_id,action,faq_id,version,created_at) VALUES(?,?,?,?,?)').run(actor,'notification.delete',null,null,now);
      return {ok:true as const,id};
    }).immediate();
  }
  claimNotificationTargets(limit=5,appId?:string):{id:string;notificationId:string;groupOpenId:string;text:string;claimToken:string;attachments:NotificationAttachment[]}[] {
    const now=Date.now();return this.transaction(()=>{
      this.sqlite.prepare("UPDATE notification_targets SET status=CASE WHEN dispatch_started=1 OR attempt_count>=3 THEN 'failed' ELSE 'pending' END,last_error=CASE WHEN dispatch_started=1 THEN '发送结果未确认，请核对群聊后再发送' WHEN attempt_count>=3 THEN '领取任务超时' ELSE last_error END,lease_until=NULL WHERE status='processing' AND lease_until<=?").run(now);
      const rows=this.sqlite.prepare(`SELECT t.id,t.notification_id AS notificationId,g.open_id AS groupOpenId,n.title,n.content FROM notification_targets t JOIN notifications n ON n.id=t.notification_id JOIN qq_groups g ON g.id=t.group_id WHERE n.owner_id=? AND t.status='pending' AND n.deleted_at IS NULL AND g.enabled=1 AND g.deleted_at IS NULL${appId?' AND g.bot_app_id=?':''} ORDER BY n.created_at,t.id LIMIT ?`).all(this.currentWorkspace(),...(appId?[appId]:[]),Math.max(1,Math.min(20,limit))) as {id:string;notificationId:string;groupOpenId:string;title:string;content:string}[];
      const claim=this.sqlite.prepare("UPDATE notification_targets SET status='processing',attempt_count=attempt_count+1,claim_token=?,dispatch_started=0,lease_until=? WHERE id=? AND status='pending'");
      return rows.map(row=>{const claimToken=randomUUID();claim.run(claimToken,now+30_000,row.id);return {id:row.id,notificationId:row.notificationId,groupOpenId:row.groupOpenId,text:'【'+row.title+'】\n'+row.content,claimToken,attachments:this.listNotificationAttachments(row.notificationId)};});
    });
  }
  beginNotificationTarget(id:string,claimToken:string) {
    const result=this.sqlite.prepare(`UPDATE notification_targets SET dispatch_started=1,lease_until=? WHERE id=? AND claim_token=? AND status='processing' AND dispatch_started=0 AND lease_until>? AND group_id IN (SELECT id FROM qq_groups WHERE enabled=1 AND deleted_at IS NULL)`).run(Date.now()+90_000,id,claimToken,Date.now());
    return {canSend:result.changes===1};
  }
  completeNotificationTarget(id:string,claimToken:string,status:'sent'|'failed',errorCode?:string,messageId?:string) {
    return this.transaction(()=>{
      const row=this.sqlite.prepare('SELECT status,claim_token,dispatch_started FROM notification_targets WHERE id=?').get(id) as {status:string;claim_token:string;dispatch_started:number}|undefined;
      if(!row)throw new AppError(404,'NOT_FOUND','该发送任务不存在。');
      if(row.claim_token!==claimToken||!row.dispatch_started)throw conflict('该发送任务凭证已失效。');
      if(row.status==='sent')return {ok:true};
      this.sqlite.prepare('UPDATE notification_targets SET status=?,lease_until=NULL,sent_at=?,last_error=?,platform_message_id=? WHERE id=?').run(status,status==='sent'?Date.now():null,status==='failed'?(errorCode||'发送结果未确认，请核对群聊后再发送').slice(0,120):null,status==='sent'?(messageId||null):null,id);
      return {ok:true};
    });
  }
  private publicMaterial(row:any):MaterialItem{return {id:row.id,categoryId:row.category_id,categoryName:row.category_name,name:row.name,mime:row.mime,size:row.size,senderId:row.sender_id,senderName:row.sender_name,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at};}
  private ensureMaterialUnrelatedCategory():MaterialCategory{
    const workspace=this.currentWorkspace(),now=Date.now();let row=this.sqlite.prepare('SELECT id,name,created_at,updated_at FROM material_categories WHERE owner_id=? AND name=?').get(workspace,MATERIAL_UNRELATED_CATEGORY) as any;
    if(!row){const id=randomUUID();this.sqlite.prepare('INSERT INTO material_categories(id,owner_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,workspace,MATERIAL_UNRELATED_CATEGORY,now,now);row={id,name:MATERIAL_UNRELATED_CATEGORY,created_at:now,updated_at:now};}
    this.sqlite.prepare("UPDATE material_items SET category_id=?,status='pending_confirm',updated_at=? WHERE owner_id=? AND (category_id IS NULL OR status='pending_archive')").run(row.id,now,workspace);
    return {id:row.id,name:row.name,createdAt:row.created_at,updatedAt:row.updated_at};
  }
  listMaterialCategories():MaterialCategory[]{this.ensureMaterialUnrelatedCategory();return (this.sqlite.prepare('SELECT id,name,created_at,updated_at FROM material_categories WHERE owner_id=? ORDER BY CASE WHEN name=? THEN 1 ELSE 0 END,name COLLATE NOCASE,id').all(this.currentWorkspace(),MATERIAL_UNRELATED_CATEGORY) as any[]).map(row=>({id:row.id,name:row.name,createdAt:row.created_at,updatedAt:row.updated_at}));}
  createMaterialCategory(name:string):MaterialCategory{const clean=name.trim();if(!clean||clean.length>60)throw new AppError(400,'INVALID_CATEGORY','类别名称应为 1 至 60 个字符。');const id=randomUUID(),now=Date.now();try{this.sqlite.prepare('INSERT INTO material_categories(id,owner_id,name,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,this.currentWorkspace(),clean,now,now);}catch{throw new AppError(409,'DUPLICATE_CATEGORY','该类别已经存在。');}return {id,name:clean,createdAt:now,updatedAt:now};}
  renameMaterialCategory(id:string,name:string):MaterialCategory{const clean=name.trim();if(!clean||clean.length>60)throw new AppError(400,'INVALID_CATEGORY','类别名称应为 1 至 60 个字符。');const current=this.sqlite.prepare('SELECT name FROM material_categories WHERE id=? AND owner_id=?').get(id,this.currentWorkspace()) as {name:string}|undefined;if(!current)throw new AppError(404,'NOT_FOUND','类别不存在。');if(current.name===MATERIAL_UNRELATED_CATEGORY)throw new AppError(409,'SYSTEM_CATEGORY','“无关类别”是系统保留分类，不能重命名。');const now=Date.now();try{this.sqlite.prepare('UPDATE material_categories SET name=?,updated_at=? WHERE id=? AND owner_id=?').run(clean,now,id,this.currentWorkspace());}catch(error){if(error instanceof AppError)throw error;throw new AppError(409,'DUPLICATE_CATEGORY','该类别已经存在。');}return this.listMaterialCategories().find(item=>item.id===id)!;}
  deleteMaterialCategory(id:string){return this.transaction(()=>{const workspace=this.currentWorkspace(),current=this.sqlite.prepare('SELECT name FROM material_categories WHERE id=? AND owner_id=?').get(id,workspace) as {name:string}|undefined;if(!current)throw new AppError(404,'NOT_FOUND','类别不存在。');if(current.name===MATERIAL_UNRELATED_CATEGORY)throw new AppError(409,'SYSTEM_CATEGORY','“无关类别”是系统保留分类，不能删除。');const unrelated=this.ensureMaterialUnrelatedCategory(),now=Date.now();this.sqlite.prepare('DELETE FROM material_categories WHERE id=? AND owner_id=?').run(id,workspace);this.sqlite.prepare("UPDATE material_items SET category_id=?,status='pending_confirm',updated_at=? WHERE owner_id=? AND category_id IS NULL").run(unrelated.id,now,workspace);return {ok:true,id};});}
  createMaterialItem(input:{sourceKey:string;categoryId:string|null;name:string;storedName:string;mime:string;size:number;senderId:string;senderName?:string|null}){
    const workspace=this.currentWorkspace(),existing=this.sqlite.prepare('SELECT id FROM material_items WHERE owner_id=? AND source_key=?').get(workspace,input.sourceKey) as {id:string}|undefined;if(existing)return this.getMaterialItem(existing.id)!;
    if(input.categoryId&&!this.sqlite.prepare('SELECT 1 FROM material_categories WHERE id=? AND owner_id=?').get(input.categoryId,workspace))input.categoryId=null;
    input.categoryId=input.categoryId||this.ensureMaterialUnrelatedCategory().id;
    const id=randomUUID(),now=Date.now(),status:MaterialStatus='pending_confirm';this.sqlite.prepare('INSERT INTO material_items(id,owner_id,source_key,category_id,name,stored_name,mime,size,sender_id,sender_name,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,workspace,input.sourceKey,input.categoryId,input.name,input.storedName,input.mime,input.size,input.senderId,input.senderName||null,status,now,now);return this.getMaterialItem(id)!;
  }
  materialBySourceKey(sourceKey:string):MaterialItem|undefined{const row=this.sqlite.prepare('SELECT m.*,c.name AS category_name FROM material_items m LEFT JOIN material_categories c ON c.id=m.category_id WHERE m.owner_id=? AND m.source_key=?').get(this.currentWorkspace(),sourceKey);return row?this.publicMaterial(row):undefined;}
  getMaterialItem(id:string):MaterialItem|undefined{const row=this.sqlite.prepare('SELECT m.*,c.name AS category_name FROM material_items m LEFT JOIN material_categories c ON c.id=m.category_id WHERE m.id=? AND m.owner_id=?').get(id,this.currentWorkspace());return row?this.publicMaterial(row):undefined;}
  listMaterialItems(query:MaterialListQuery):PageResult<MaterialItem>{this.ensureMaterialUnrelatedCategory();const q=(query.q||'').trim(),page=Math.max(1,query.page||1),pageSize=Math.max(1,Math.min(100,query.pageSize||10)),where=['m.owner_id=?'],params:any[]=[this.currentWorkspace()];if(q){where.push('instr(lower(m.name),lower(?))>0');params.push(q);}if(query.status){where.push('m.status=?');params.push(query.status);}if(query.categoryId){where.push('m.category_id=?');params.push(query.categoryId);}const clause=' WHERE '+where.join(' AND '),total=(this.sqlite.prepare('SELECT count(*) n FROM material_items m'+clause).get(...params) as {n:number}).n,rows=this.sqlite.prepare('SELECT m.*,c.name AS category_name FROM material_items m LEFT JOIN material_categories c ON c.id=m.category_id'+clause+' ORDER BY m.created_at DESC,m.id LIMIT ? OFFSET ?').all(...params,pageSize,(page-1)*pageSize) as any[];return {items:rows.map(row=>this.publicMaterial(row)),total,page,pageSize};}
  updateMaterialItem(id:string,categoryId:string|null){const workspace=this.currentWorkspace(),resolvedCategoryId=categoryId||this.ensureMaterialUnrelatedCategory().id;if(!this.sqlite.prepare('SELECT 1 FROM material_categories WHERE id=? AND owner_id=?').get(resolvedCategoryId,workspace))throw new AppError(404,'NOT_FOUND','类别不存在。');const now=Date.now(),result=this.sqlite.prepare("UPDATE material_items SET category_id=?,status='archived',updated_at=? WHERE id=? AND owner_id=?").run(resolvedCategoryId,now,id,workspace);if(!result.changes)throw new AppError(404,'NOT_FOUND','资料不存在。');return this.getMaterialItem(id)!;}
  materialItemFile(id:string){return this.sqlite.prepare('SELECT id,name,stored_name,mime,size FROM material_items WHERE id=? AND owner_id=?').get(id,this.currentWorkspace()) as {id:string;name:string;stored_name:string;mime:string;size:number}|undefined;}
  deleteMaterialItems(ids:string[]){const unique=[...new Set(ids)].slice(0,100),workspace=this.currentWorkspace();if(!unique.length)throw new AppError(400,'INVALID_SELECTION','请选择资料。');return this.transaction(()=>{const rows=this.sqlite.prepare(`SELECT id,name,stored_name,mime,size FROM material_items WHERE owner_id=? AND id IN (${unique.map(()=>'?').join(',')})`).all(workspace,...unique) as {id:string;name:string;stored_name:string;mime:string;size:number}[];if(!rows.length)throw new AppError(404,'NOT_FOUND','资料不存在。');this.sqlite.prepare(`DELETE FROM material_items WHERE owner_id=? AND id IN (${rows.map(()=>'?').join(',')})`).run(workspace,...rows.map(row=>row.id));return rows;});}
  stats() {
    const workspace=this.currentWorkspace(),counts=this.sqlite.prepare("SELECT count(*) AS totalFaqs,sum(CASE WHEN status='active' THEN 1 ELSE 0 END) AS activeFaqs,sum(CASE WHEN status='active' AND is_demo=1 THEN 1 ELSE 0 END) AS demoFaqs FROM faqs WHERE owner_id=?").get(workspace) as {totalFaqs:number;activeFaqs:number;demoFaqs:number};
    const pending=(this.sqlite.prepare("SELECT count(*) AS n FROM unmatched_questions WHERE owner_id=? AND status='pending'").get(workspace) as {n:number}).n;
    const pendingMaterials=(this.sqlite.prepare("SELECT count(*) AS n FROM material_items WHERE owner_id=? AND status IN ('pending_confirm','pending_archive')").get(workspace) as {n:number}).n;
    const usage=this.sqlite.prepare('SELECT * FROM model_usage WHERE owner_id=? AND day=?').get(workspace,dateKey()) as {attempts:number;errors:number;input_tokens:number;output_tokens:number}|undefined;
    const totals=this.sqlite.prepare("SELECT coalesce(sum(hits),0) AS total,coalesce(sum(CASE WHEN metric_key LIKE 'faq:%' OR metric_key='rag' THEN hits ELSE 0 END),0) AS matched,coalesce(sum(CASE WHEN day=? THEN hits ELSE 0 END),0) AS today FROM question_daily WHERE owner_id=?").get(dateKey(),workspace) as {total:number;matched:number;today:number};
    const recentDays=Array.from({length:7},(_,i)=>{const day=dateKey(Date.now()-(6-i)*DAY);return {day,hits:(this.sqlite.prepare('SELECT coalesce(sum(hits),0) AS n FROM question_daily WHERE owner_id=? AND day=?').get(workspace,day) as {n:number}).n};});
    return {totalFaqs:counts.totalFaqs,activeFaqs:counts.activeFaqs||0,demoMode:!!counts.demoFaqs,pendingQuestions:pending,pendingMaterials,todayRequests:totals.today,totalRequests:totals.total,hitRate:totals.total?totals.matched/totals.total:null,modelCallsToday:usage?.attempts||0,modelErrorsToday:usage?.errors||0,modelTokensToday:(usage?.input_tokens||0)+(usage?.output_tokens||0),recentDays};
  }
}
