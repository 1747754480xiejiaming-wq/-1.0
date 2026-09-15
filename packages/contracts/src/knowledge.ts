import type {AnswerAttachment} from './answers.js';

export type FaqStatus = 'active' | 'disabled';
export type FaqLibraryType = 'answer' | 'forbidden';
export type RagDocumentStatus = 'pending' | 'parsing' | 'ready' | 'failed';
export type MaterialStatus = 'pending_confirm' | 'pending_archive' | 'archived';
export type KnowledgeVersionStatus = 'draft' | 'active' | 'archived';

export interface FaqAttachment extends AnswerAttachment {
  faqId: string;
}

export interface FaqInput {
  question: string;
  answer: string;
  keywords: string[];
  category: string;
  status: FaqStatus;
  confirmed: boolean;
  libraryType?: FaqLibraryType;
}

export interface Faq extends Omit<FaqInput, 'confirmed'> {
  id: string;
  version: number;
  isDemo: boolean;
  updatedAt: number;
  createdAt: number;
  libraryType: FaqLibraryType;
  attachments?: FaqAttachment[];
}

export interface KnowledgeCategory {
  id: string;
  name: string;
  libraryType: FaqLibraryType;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeVersion {
  id: string;
  workspaceId: string;
  version: number;
  status: KnowledgeVersionStatus;
  contentHash: string;
  createdAt: number;
  activatedAt: number | null;
}

export interface RagFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface RagDocument {
  id: string;
  folderId: string | null;
  name: string;
  mime: string;
  size: number;
  status: RagDocumentStatus;
  progress: number;
  chunkCount: number;
  tokenCount: number;
  graphNodeCount: number;
  graphEdgeCount: number;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface RagChunk {
  id: string;
  documentId: string;
  documentName: string;
  position: number;
  content: string;
  tokenCount: number;
  keywords: string[];
}

export interface RagGraphNode {
  id: string;
  documentId: string;
  label: string;
  type: string;
  description: string;
}

export interface RagGraphEdge {
  id: string;
  documentId: string;
  sourceId: string;
  targetId: string;
  relation: string;
}

export interface RagGraph {
  document: RagDocument;
  nodes: RagGraphNode[];
  edges: RagGraphEdge[];
}

export interface RagSettings {
  embeddingModel: string;
  rerankModel: string;
  parserMode: 'local' | 'model';
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
  updatedAt: number;
}

export interface RagSearchHit extends RagChunk {
  keywordScore: number;
  vectorScore: number;
  rerankScore: number;
}

export interface RagEvaluationCase {
  question: string;
  expectedAnswer: string;
}

export interface RagEvaluationResult {
  id: string;
  createdAt: number;
  total: number;
  retrievalHitRate: number;
  answerKeywordRate: number;
  averageLatencyMs: number;
  items: {
    question: string;
    expectedAnswer: string;
    answer: string;
    hit: boolean;
    latencyMs: number;
  }[];
}

export interface MaterialCategory {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface MaterialItem {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  mime: string;
  size: number;
  senderId: string;
  senderName: string | null;
  status: MaterialStatus;
  createdAt: number;
  updatedAt: number;
}

export const CATEGORIES = ['选课与课程', '考试与成绩', '学籍与注册', '毕业与材料', '校园服务'] as const;

export const FAQ_PROPERTIES = {
  question: {type: 'string', minLength: 1, maxLength: 200},
  answer: {type: 'string', minLength: 1, maxLength: 1_500},
  keywords: {
    type: 'array',
    minItems: 1,
    maxItems: 20,
    items: {type: 'string', minLength: 1, maxLength: 40},
  },
  category: {type: 'string', minLength: 1, maxLength: 40},
  status: {type: 'string', enum: ['active', 'disabled']},
  confirmed: {type: 'boolean'},
  libraryType: {type: 'string', enum: ['answer', 'forbidden']},
} as const;

export const FAQ_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['question', 'answer', 'keywords', 'category', 'status', 'confirmed'],
  properties: FAQ_PROPERTIES,
};

export const FAQ_PATCH_SCHEMA = {
  ...FAQ_INPUT_SCHEMA,
  required: [...FAQ_INPUT_SCHEMA.required, 'version'],
  properties: {...FAQ_PROPERTIES, version: {type: 'integer', minimum: 1}},
};

export const PAGE_QUERY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    q: {type: 'string', maxLength: 200},
    status: {type: 'string', maxLength: 20},
    category: {type: 'string', maxLength: 40},
    libraryType: {type: 'string', enum: ['answer', 'forbidden']},
    unmatchedType: {type: 'string', enum: ['manual', 'unrelated', 'offline']},
    page: {type: 'integer', minimum: 1, default: 1},
    pageSize: {type: 'integer', minimum: 1, maximum: 100, default: 20},
  },
};

export const KNOWLEDGE_VERSION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'workspaceId', 'version', 'status', 'contentHash', 'createdAt', 'activatedAt'],
  properties: {
    id: {type: 'string', minLength: 1, maxLength: 100},
    workspaceId: {type: 'string', minLength: 1, maxLength: 100},
    version: {type: 'integer', minimum: 1},
    status: {enum: ['draft', 'active', 'archived']},
    contentHash: {type: 'string', minLength: 1, maxLength: 160},
    createdAt: {type: 'integer', minimum: 0},
    activatedAt: {anyOf: [{type: 'integer', minimum: 0}, {type: 'null'}]},
  },
} as const;
