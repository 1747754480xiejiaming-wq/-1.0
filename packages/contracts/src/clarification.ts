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
const SHA_256_SCHEMA = {type: 'string', pattern: '^[a-f0-9]{64}$'} as const;

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

// JSON Schema cannot express lexical array ordering; code that trusts a signature must call verifyDecisionSignature.
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
    hash: SHA_256_SCHEMA,
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}

function isStringWithin(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

function compareUnicodeCodePoints(left: string, right: string): number {
  const leftCodePoints = Array.from(left);
  const rightCodePoints = Array.from(right);
  const length = Math.min(leftCodePoints.length, rightCodePoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftCodePoints[index]!.codePointAt(0)! - rightCodePoints[index]!.codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return leftCodePoints.length - rightCodePoints.length;
}

function isSortedUniqueStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.some(item => !isStringWithin(item, 160))) return false;
  return value.every((item, index) => index === 0 || compareUnicodeCodePoints(value[index - 1]!, item) < 0);
}

function sortedUniqueUnicodeCodePointStrings(values: string[]): string[] {
  return [...new Set(values)].sort(compareUnicodeCodePoints);
}

export function canonicalDecisionSignaturePayload(input: Omit<DecisionSignature, 'hash'>): string {
  return JSON.stringify([
    input.disposition,
    input.faqId,
    input.knowledgeVersion,
    input.configVersion,
    sortedUniqueUnicodeCodePointStrings(input.keyFacts),
    sortedUniqueUnicodeCodePointStrings(input.evidenceIds),
  ]);
}

export async function computeDecisionSignatureHash(input: Omit<DecisionSignature, 'hash'>): Promise<string> {
  const payload = canonicalDecisionSignaturePayload(input);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function constantShapeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export function validateDecisionSignature(
  value: unknown,
): {success: true; data: DecisionSignature} | {success: false; errors: string[]} {
  const errors: string[] = [];
  if (!isRecord(value)) return {success: false, errors: ['decision signature must be an object']};

  const keys = ['disposition', 'faqId', 'knowledgeVersion', 'configVersion', 'keyFacts', 'evidenceIds', 'hash'];
  if (!hasOnlyKeys(value, keys)) errors.push('decision signature contains unknown fields');
  if (value.disposition !== 'answer' && value.disposition !== 'clarify' && value.disposition !== 'escalate') {
    errors.push('disposition is invalid');
  }
  if (value.faqId !== null && !isStringWithin(value.faqId, 160)) errors.push('faqId is invalid');
  if (!isStringWithin(value.knowledgeVersion, 100)) errors.push('knowledgeVersion is invalid');
  if (!isStringWithin(value.configVersion, 100)) errors.push('configVersion is invalid');
  if (!isSortedUniqueStringArray(value.keyFacts)) errors.push('keyFacts must be unique and Unicode code-point ascending');
  if (!isSortedUniqueStringArray(value.evidenceIds)) errors.push('evidenceIds must be unique and Unicode code-point ascending');
  if (typeof value.hash !== 'string' || !/^[a-f0-9]{64}$/.test(value.hash)) errors.push('hash must be lowercase SHA-256 hex');

  return errors.length > 0
    ? {success: false, errors}
    : {success: true, data: value as unknown as DecisionSignature};
}

export async function verifyDecisionSignature(
  value: unknown,
): Promise<{success: true; data: DecisionSignature} | {success: false; errors: string[]}> {
  const structural = validateDecisionSignature(value);
  if (!structural.success) return structural;

  const {hash, ...input} = structural.data;
  const expectedHash = await computeDecisionSignatureHash(input);
  return constantShapeEqual(hash, expectedHash)
    ? structural
    : {success: false, errors: ['hash does not match canonical payload']};
}

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
