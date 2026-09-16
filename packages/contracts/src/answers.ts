import {DECISION_SIGNATURE_SCHEMA, type DecisionSignature} from './clarification.js';

export type Channel = 'web' | 'qq';
export type AnswerSource =
  | 'faq_keyword'
  | 'faq_semantic'
  | 'forbidden_keyword'
  | 'forbidden_semantic'
  | 'rag'
  | 'fallback';
export type FallbackReason =
  | 'no_match'
  | 'manual_transfer'
  | 'ambiguous'
  | 'sensitive_input'
  | 'out_of_scope'
  | 'unsafe_instruction'
  | 'model_not_configured'
  | 'model_unavailable'
  | 'model_capacity'
  | 'daily_limit'
  | 'weekly_limit'
  | 'image_model_not_connected'
  | 'image_unrecognized'
  | 'knowledge_changed'
  | 'request_interrupted'
  | 'api_unavailable';
export type KnowledgeAttachmentKind = 'folder' | 'image' | 'pdf' | 'word' | 'excel' | 'video';

export interface AnswerAttachment {
  id: string;
  faqId?: string;
  name: string;
  kind: KnowledgeAttachmentKind;
  mime: string;
  size: number;
  createdAt: number;
}

export interface QqSender {
  id: string;
  name?: string;
  qqNumber?: string;
  chatKind?: 'c2c' | 'group';
  targetId?: string;
  messageId?: string;
}

export interface AnswerInput {
  question: string;
  requestId: string;
  images?: string[];
  qqSender?: QqSender;
}

export interface AnswerResult {
  requestId: string;
  answer: string;
  faqId: string | null;
  faqVersion: number | null;
  source: AnswerSource;
  fallbackReason: FallbackReason | null;
  isDemo: boolean;
  attachments?: AnswerAttachment[];
  conversationId?: string;
  clarification?: {missingSlot: string; question: string; round: 1 | 2};
  decisionSignature?: DecisionSignature;
}

export interface AnswerEvidenceReference {
  sourceType: 'faq' | 'rag' | 'policy';
  sourceId: string;
  version: number;
  excerpt?: string;
}

export interface AnswerTrace {
  answerRunId: string;
  requestId: string;
  knowledgeVersion: number;
  decisionVersion: string;
  evidence: AnswerEvidenceReference[];
}

export const FALLBACK_ANSWER = '暂未找到能够确认的标准答案，请联系学院教务老师，或换一种问法再试。';
export const MANUAL_TRANSFER_ANSWER = '已转人工处理，请耐心等待';
export const UNAVAILABLE_ANSWER = '服务暂不可用，请稍后重试或联系学院教务老师。';

export const UUID_SCHEMA = {
  type: 'string',
  pattern: '^[a-zA-Z0-9_-]{8,100}$',
  minLength: 8,
  maxLength: 100,
} as const;

export const ANSWER_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['question', 'requestId'],
  properties: {
    question: {type: 'string', minLength: 0, maxLength: 200},
    requestId: UUID_SCHEMA,
    images: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {type: 'string', minLength: 8, maxLength: 2_800_000},
    },
    qqSender: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: {type: 'string', minLength: 6, maxLength: 160, pattern: '^[A-Za-z0-9_-]+$'},
        name: {type: 'string', minLength: 1, maxLength: 80},
        qqNumber: {type: 'string', pattern: '^[1-9][0-9]{4,11}$'},
        chatKind: {enum: ['c2c', 'group']},
        targetId: {type: 'string', minLength: 6, maxLength: 160, pattern: '^[A-Za-z0-9_-]+$'},
        messageId: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
          pattern: '^[^\\u0000-\\u001F\\u007F-\\u009F]+$',
        },
      },
    },
  },
} as const;

const ANSWER_ATTACHMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'kind', 'mime', 'size', 'createdAt'],
  properties: {
    id: {type: 'string'},
    faqId: {type: 'string'},
    name: {type: 'string'},
    kind: {enum: ['folder', 'image', 'pdf', 'word', 'excel', 'video']},
    mime: {type: 'string'},
    size: {type: 'integer'},
    createdAt: {type: 'integer'},
  },
} as const;

export const ANSWER_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['requestId', 'answer', 'faqId', 'faqVersion', 'source', 'fallbackReason', 'isDemo'],
  properties: {
    requestId: {type: 'string'},
    answer: {type: 'string'},
    faqId: {anyOf: [{type: 'string'}, {type: 'null'}]},
    faqVersion: {anyOf: [{type: 'integer'}, {type: 'null'}]},
    source: {enum: ['faq_keyword', 'faq_semantic', 'forbidden_keyword', 'forbidden_semantic', 'rag', 'fallback']},
    fallbackReason: {anyOf: [{type: 'string'}, {type: 'null'}]},
    isDemo: {type: 'boolean'},
    attachments: {type: 'array', items: ANSWER_ATTACHMENT_SCHEMA},
    conversationId: {type: 'string', minLength: 1, maxLength: 160},
    clarification: {
      type: 'object',
      additionalProperties: false,
      required: ['missingSlot', 'question', 'round'],
      properties: {
        missingSlot: {type: 'string', minLength: 1, maxLength: 160},
        question: {type: 'string', minLength: 1, maxLength: 160},
        round: {enum: [1, 2]},
      },
    },
    decisionSignature: DECISION_SIGNATURE_SCHEMA,
  },
  allOf: [{if: {required: ['clarification']}, then: {required: ['conversationId']}}],
} as const;

export const ANSWER_TRACE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answerRunId', 'requestId', 'knowledgeVersion', 'decisionVersion', 'evidence'],
  properties: {
    answerRunId: {type: 'string', minLength: 1, maxLength: 100},
    requestId: {type: 'string', minLength: 1, maxLength: 160},
    knowledgeVersion: {type: 'integer', minimum: 1},
    decisionVersion: {type: 'string', minLength: 1, maxLength: 100},
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['sourceType', 'sourceId', 'version'],
        properties: {
          sourceType: {enum: ['faq', 'rag', 'policy']},
          sourceId: {type: 'string', minLength: 1, maxLength: 160},
          version: {type: 'integer', minimum: 1},
          excerpt: {type: 'string', maxLength: 1_000},
        },
      },
    },
  },
} as const;
