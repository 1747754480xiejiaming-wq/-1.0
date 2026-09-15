export type FaqStatus = 'active' | 'disabled';
export type FaqLibraryType = 'answer' | 'forbidden';
export type Channel = 'web' | 'qq';
export type AnswerSource = 'faq_keyword' | 'faq_semantic' | 'forbidden_keyword' | 'forbidden_semantic' | 'rag' | 'fallback';
export type FallbackReason = 'no_match' | 'manual_transfer' | 'ambiguous' | 'sensitive_input' | 'out_of_scope' | 'unsafe_instruction' | 'model_not_configured' | 'model_unavailable' | 'model_capacity' | 'daily_limit' | 'weekly_limit' | 'image_model_not_connected' | 'image_unrecognized' | 'knowledge_changed' | 'request_interrupted' | 'api_unavailable';
export type KnowledgeAttachmentKind = 'folder' | 'image' | 'pdf' | 'word' | 'excel' | 'video';
export interface AnswerAttachment { id:string; faqId?:string; name:string; kind:KnowledgeAttachmentKind; mime:string; size:number; createdAt:number }
export interface FaqAttachment extends AnswerAttachment { faqId:string }
export interface FaqInput { question: string; answer: string; keywords: string[]; category: string; status: FaqStatus; confirmed: boolean; libraryType?:FaqLibraryType }
export interface Faq extends Omit<FaqInput, 'confirmed'> { id: string; version: number; isDemo: boolean; updatedAt: number; createdAt: number; libraryType:FaqLibraryType; attachments?:FaqAttachment[] }
export interface KnowledgeCategory { id:string; name:string; libraryType:FaqLibraryType; sortOrder:number; createdAt:number; updatedAt:number }
export interface QqSender { id:string; name?:string; qqNumber?:string; chatKind?:'c2c'|'group'; targetId?:string; messageId?:string }
export interface AnswerInput { question: string; requestId: string; images?:string[]; qqSender?:QqSender }
export type ModelProvider='qwen'|'deepseek'|'zhipu';
export type TextModelProvider='deepseek'|'zhipu';
export interface ModelUsage {weekStart:string;resetAt:number;updatedAt:number;consumedPercent:number;exhausted:boolean;totalTokens:number;activeCalls:number;unknownCalls:number;providers:{provider:ModelProvider;inputTokens:number;outputTokens:number;totalTokens:number;calls:number}[]}
export interface ModelConnection {provider:ModelProvider;name:string;model:string;keyConfigured:boolean;connected:boolean;checkedAt:number|null}
export interface ModelsStatus {activeTextProvider:TextModelProvider;providers:ModelConnection[];usage:ModelUsage}
export type AccountPlan='plus'|'pro';
export interface AccountPlanStatus {plan:AccountPlan;quotaMultiplier:1|5;usage:ModelUsage;updatedAt:number}
export interface DeveloperAccess {unlocked:boolean;expiresAt:number|null}
export interface AnswerResult { requestId: string; answer: string; faqId: string | null; faqVersion: number | null; source: AnswerSource; fallbackReason: FallbackReason | null; isDemo: boolean; attachments?:AnswerAttachment[] }
export type RagDocumentStatus='pending'|'parsing'|'ready'|'failed';
export interface RagFolder {id:string;name:string;parentId:string|null;createdAt:number;updatedAt:number}
export interface RagDocument {id:string;folderId:string|null;name:string;mime:string;size:number;status:RagDocumentStatus;progress:number;chunkCount:number;tokenCount:number;graphNodeCount:number;graphEdgeCount:number;error:string|null;createdAt:number;updatedAt:number}
export interface RagChunk {id:string;documentId:string;documentName:string;position:number;content:string;tokenCount:number;keywords:string[]}
export interface RagGraphNode {id:string;documentId:string;label:string;type:string;description:string}
export interface RagGraphEdge {id:string;documentId:string;sourceId:string;targetId:string;relation:string}
export interface RagGraph {document:RagDocument;nodes:RagGraphNode[];edges:RagGraphEdge[]}
export interface RagSettings {embeddingModel:string;rerankModel:string;parserMode:'local'|'model';chunkSize:number;chunkOverlap:number;topK:number;updatedAt:number}
export interface RagSearchHit extends RagChunk {keywordScore:number;vectorScore:number;rerankScore:number}
export interface RagEvaluationCase {question:string;expectedAnswer:string}
export interface RagEvaluationResult {id:string;createdAt:number;total:number;retrievalHitRate:number;answerKeywordRate:number;averageLatencyMs:number;items:{question:string;expectedAnswer:string;answer:string;hit:boolean;latencyMs:number}[]}
export type UserRole='teacher'|'developer';
export interface User { id: string; username: string; role:UserRole }
export interface SessionResult { user: User; csrfToken: string }
export interface RegisteredAccount {id:string;username:string;createdAt:number}
export interface PageResult<T> { items: T[]; total: number; page: number; pageSize: number }
export interface UnmatchedQqStudent { id:string; name:string|null; qqNumber:string|null; questionCount:number; firstSeen:number; lastSeen:number }
export type UnmatchedType='manual'|'unrelated'|'offline';
export interface Unmatched { id: string; question: string; reason: string; type:UnmatchedType; webCount: number; qqCount: number; qqStudents:UnmatchedQqStudent[]; status: 'pending' | 'resolved' | 'ignored'; resolvedFaqId: string | null; firstSeen: number; lastSeen: number }
export interface UnmatchedPreferences {offlineAutoReply:boolean;qqAnswerEnabled:boolean;updatedAt:number}
export interface PublicStatus { activeFaqs: number; demoMode: boolean; modelConfigured: boolean; mode: 'faq' | 'semantic'; service: string }
export interface BotConfig { appId: string; appSecretConfigured: boolean; processRunning: boolean }
export interface BotActionResult { ok: true; message: string; processRunning: boolean; answeringEnabled:boolean }
export interface QqGroup { id: string; label: string; groupNumber: string|null; nameSynced: boolean; available: boolean; enabled: boolean; firstSeen: number; lastSeen: number }
export interface NotificationTarget { id: string; groupId: string; groupLabel: string; status: 'pending'|'processing'|'sent'|'failed'; attempts: number; sentAt: number|null; lastError: string|null; messageId?:string|null }
export interface NotificationAttachment extends AnswerAttachment { notificationId:string }
export interface NotificationRecord { id: string; title: string; content: string; createdAt: number; targetCount: number; pendingCount: number; sentCount: number; failedCount: number; targets: NotificationTarget[]; attachments:NotificationAttachment[] }
export interface NotificationInput { requestId: string; title: string; content: string; groupIds: string[] }
export type MaterialStatus='pending_confirm'|'pending_archive'|'archived';
export interface MaterialCategory {id:string;name:string;createdAt:number;updatedAt:number}
export interface MaterialItem {id:string;categoryId:string|null;categoryName:string|null;name:string;mime:string;size:number;senderId:string;senderName:string|null;status:MaterialStatus;createdAt:number;updatedAt:number}
export interface AdminStatus extends PublicStatus { totalFaqs: number; pendingQuestions: number; pendingMaterials:number; todayRequests: number; totalRequests: number; hitRate: number | null; modelCallsToday: number; modelDailyLimit: number; modelErrorsToday: number; modelTokensToday: number; botConfigured: boolean; botCredentialsConfigured: boolean; botProcessRunning: boolean; qqAnswerEnabled:boolean; botAppId: string; botState:'connected'|'offline'; botLastSeen:number|null; recentDays: { day: string; hits: number }[] }
export interface ApiErrorBody { error: { code: string; message: string }; requestId?: string }
export const CATEGORIES = ['选课与课程', '考试与成绩', '学籍与注册', '毕业与材料', '校园服务'] as const;
export const FALLBACK_ANSWER = '暂未找到能够确认的标准答案，请联系学院教务老师，或换一种问法再试。';
export const MANUAL_TRANSFER_ANSWER = '已转人工处理，请耐心等待';
export const UNAVAILABLE_ANSWER = '服务暂不可用，请稍后重试或联系学院教务老师。';
export const UUID_SCHEMA = { type: 'string', pattern: '^[a-zA-Z0-9_-]{8,100}$', minLength: 8, maxLength: 100 } as const;
export const ANSWER_INPUT_SCHEMA = { type: 'object', additionalProperties: false, required: ['question', 'requestId'], properties: { question: { type: 'string', minLength: 0, maxLength: 200 }, requestId: UUID_SCHEMA, images:{type:'array',minItems:1,maxItems:3,items:{type:'string',minLength:8,maxLength:2800000}}, qqSender:{type:'object',additionalProperties:false,required:['id'],properties:{id:{type:'string',minLength:6,maxLength:160,pattern:'^[A-Za-z0-9_-]+$'},name:{type:'string',minLength:1,maxLength:80},qqNumber:{type:'string',pattern:'^[1-9][0-9]{4,11}$'},chatKind:{enum:['c2c','group']},targetId:{type:'string',minLength:6,maxLength:160,pattern:'^[A-Za-z0-9_-]+$'},messageId:{type:'string',minLength:1,maxLength:200,pattern:'^[^\\u0000-\\u001F\\u007F-\\u009F]+$'}}}} } as const;
export const FAQ_PROPERTIES = {
  question: { type: 'string', minLength: 1, maxLength: 200 }, answer: { type: 'string', minLength: 1, maxLength: 1500 },
  keywords: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 40 } },
  category: { type: 'string', minLength: 1, maxLength: 40 }, status: { type: 'string', enum: ['active', 'disabled'] }, confirmed: { type: 'boolean' }, libraryType:{type:'string',enum:['answer','forbidden']},
} as const;
export const FAQ_INPUT_SCHEMA = { type: 'object', additionalProperties: false, required: ['question','answer','keywords','category','status','confirmed'], properties: FAQ_PROPERTIES };
export const FAQ_PATCH_SCHEMA = { ...FAQ_INPUT_SCHEMA, required: [...FAQ_INPUT_SCHEMA.required, 'version'], properties: { ...FAQ_PROPERTIES, version: { type: 'integer', minimum: 1 } } };
export const PAGE_QUERY_SCHEMA = { type: 'object', additionalProperties: false, properties: { q: { type: 'string', maxLength: 200 }, status: { type: 'string', maxLength: 20 }, category: { type: 'string', maxLength: 40 }, libraryType:{type:'string',enum:['answer','forbidden']}, unmatchedType:{type:'string',enum:['manual','unrelated','offline']}, page: { type: 'integer', minimum: 1, default: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 } } };
export const ANSWER_RESPONSE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['requestId','answer','faqId','faqVersion','source','fallbackReason','isDemo'],
  properties: { requestId: { type: 'string' }, answer: { type: 'string' }, faqId: { anyOf: [{ type: 'string' }, { type: 'null' }] }, faqVersion: { anyOf: [{ type: 'integer' }, { type: 'null' }] }, source: { enum: ['faq_keyword', 'faq_semantic','forbidden_keyword','forbidden_semantic','rag','fallback'] }, fallbackReason: { anyOf: [{ type: 'string' }, { type: 'null' }] }, isDemo: { type: 'boolean' }, attachments:{type:'array',items:{type:'object',additionalProperties:false,required:['id','name','kind','mime','size','createdAt'],properties:{id:{type:'string'},faqId:{type:'string'},name:{type:'string'},kind:{enum:['folder','image','pdf','word','excel','video']},mime:{type:'string'},size:{type:'integer'},createdAt:{type:'integer'}}}} },
};
