export type ClarificationDecision =
  | {kind: 'ready'; conversationId: string}
  | {kind: 'ask'; conversationId: string; missingSlot: string; question: string; round: 1 | 2}
  | {kind: 'escalate'; conversationId: string; reason: 'high_risk' | 'round_limit' | 'insufficient_context'};

export type DecisionDisposition = 'answer' | 'clarify' | 'escalate';

export interface DecisionSignature {
  disposition: DecisionDisposition;
  faqId: string | null;
  knowledgeVersion: string;
  configVersion: string;
  keyFacts: string[];
  evidenceIds: string[];
  hash: string;
}

export type TeacherCompletionMode = 'link' | 'create' | 'direct_reply';

export interface TeacherTimingInput {
  taskId: string;
  sessionId: string;
  activeMs: number;
  elapsedMs: number;
  completionMode: TeacherCompletionMode;
  clientStartedAt: number;
}

const STRING_160_SCHEMA = {type: 'string', minLength: 1, maxLength: 160} as const;
const VERSION_SCHEMA = {type: 'string', minLength: 1, maxLength: 100} as const;

export const CLARIFICATION_DECISION_SCHEMA = {
  oneOf: [
    {
      type: 'object', additionalProperties: false,
      required: ['kind', 'conversationId'],
      properties: {kind: {const: 'ready'}, conversationId: STRING_160_SCHEMA},
    },
    {
      type: 'object', additionalProperties: false,
      required: ['kind', 'conversationId', 'missingSlot', 'question', 'round'],
      properties: {
        kind: {const: 'ask'}, conversationId: STRING_160_SCHEMA, missingSlot: STRING_160_SCHEMA,
        question: STRING_160_SCHEMA, round: {enum: [1, 2]},
      },
    },
    {
      type: 'object', additionalProperties: false,
      required: ['kind', 'conversationId', 'reason'],
      properties: {
        kind: {const: 'escalate'}, conversationId: STRING_160_SCHEMA,
        reason: {enum: ['high_risk', 'round_limit', 'insufficient_context']},
      },
    },
  ],
} as const;

export const DECISION_SIGNATURE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['disposition', 'faqId', 'knowledgeVersion', 'configVersion', 'keyFacts', 'evidenceIds', 'hash'],
  properties: {
    disposition: {enum: ['answer', 'clarify', 'escalate']},
    faqId: {anyOf: [STRING_160_SCHEMA, {type: 'null'}]},
    knowledgeVersion: VERSION_SCHEMA,
    configVersion: VERSION_SCHEMA,
    keyFacts: {type: 'array', uniqueItems: true, items: STRING_160_SCHEMA},
    evidenceIds: {type: 'array', uniqueItems: true, items: STRING_160_SCHEMA},
    hash: STRING_160_SCHEMA,
  },
} as const;

export const TEACHER_TIMING_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['taskId', 'sessionId', 'activeMs', 'elapsedMs', 'completionMode', 'clientStartedAt'],
  properties: {
    taskId: STRING_160_SCHEMA,
    sessionId: STRING_160_SCHEMA,
    activeMs: {type: 'integer', minimum: 1, maximum: 28_800_000},
    elapsedMs: {type: 'integer', minimum: 1, maximum: 28_800_000},
    completionMode: {enum: ['link', 'create', 'direct_reply']},
    clientStartedAt: {type: 'integer', minimum: 0},
  },
} as const;
