import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import test from 'node:test';
import Fastify from 'fastify';
import {
  ANSWER_RESPONSE_SCHEMA,
  ANSWER_TRACE_SCHEMA,
  API_ERROR_SCHEMA,
  CLARIFICATION_DECISION_SCHEMA,
  CONVERSATION_SCHEMA,
  DECISION_SIGNATURE_SCHEMA,
  EVALUATION_DATASET_SCHEMA,
  INPUT_INTENTS,
  JOB_SCHEMA,
  JOB_STATUSES,
  KNOWLEDGE_VERSION_SCHEMA,
  TEACHER_TIMING_INPUT_SCHEMA,
  pageResultSchema,
  type AnswerResult,
  type DecisionSignature,
  type EvaluationDataset,
  type EvaluationMetricResult,
  type EvaluationRunSummary,
  type InputIntent,
  type JobStatus,
  validateEvaluationDataset,
  validateDecisionSignature,
} from '@campus/contracts';
import {
  API_OPERATIONS,
  OPENAPI_SOURCE_SHA256,
  type ApiRequest,
  type ApiResponse,
} from '../apps/web/src/api/generated.js';
import {openApiSourceHash} from '../scripts/openapi-source-hash.js';

type ContractSchema = Record<string, unknown>;

async function validationStatus(
  schema: ContractSchema,
  payload: Record<string, unknown>,
): Promise<number> {
  const app = Fastify({
    logger: false,
    ajv: {customOptions: {removeAdditional: false}},
  });
  app.post('/', {schema: {body: schema}}, async (_, reply) => reply.code(204).send());

  try {
    await app.ready();
    return (await app.inject({method: 'POST', url: '/', payload})).statusCode;
  } finally {
    await app.close();
  }
}

async function assertStrictSchema(
  schema: ContractSchema,
  validPayload: Record<string, unknown>,
): Promise<void> {
  assert.equal(await validationStatus(schema, validPayload), 204);
  assert.equal(
    await validationStatus(schema, {...validPayload, unexpected: true}),
    400,
    'Schema 必须拒绝未声明字段',
  );
}

test('旧回答、错误和分页契约保持兼容且严格', async () => {
  const legacyAnswer = {
    requestId: 'request-legacy-001',
    answer: '请按教务处通知办理。',
    faqId: 'faq-legacy-001',
    faqVersion: 1,
    source: 'faq_keyword',
    fallbackReason: null,
    isDemo: false,
  } satisfies AnswerResult;

  await assertStrictSchema(ANSWER_RESPONSE_SCHEMA, legacyAnswer);
  await assertStrictSchema(API_ERROR_SCHEMA, {
    error: {code: 'VERSION_CONFLICT', message: '数据版本已经变化。'},
    requestId: 'request-error-001',
  });
  await assertStrictSchema(pageResultSchema({type: 'string'}), {
    items: ['one'],
    total: 1,
    page: 1,
    pageSize: 20,
  });
});

test('四目标评测数据严格校验并拒绝不可判定样本', async () => {
  const sample: EvaluationDataset = {
    datasetVersion: 'teacher-gold-2026-09-16',
    evidenceKind: 'teacher',
    knowledgeVersion: 'kv-1',
    configVersion: 'mvp-1',
    samples: [{
      id: 'gold-001',
      question: '缓考怎么办',
      expectedDisposition: 'answer',
      expectedFaqId: 'exam-deferral',
      requiredFacts: ['申请截止时间'],
      risk: 'high',
    }],
  };

  assert.equal(validateEvaluationDataset(sample).success, true);
  await assertStrictSchema(EVALUATION_DATASET_SCHEMA, {...sample});

  const invalidDatasets: unknown[] = [
    (({datasetVersion: _, ...dataset}) => dataset)(sample),
    (({evidenceKind: _, ...dataset}) => dataset)(sample),
    {...sample, datasetVersion: ''},
    {...sample, samples: [(({risk: _, ...item}) => item)(sample.samples[0]!)]},
    {...sample, samples: [(({expectedDisposition: _, ...item}) => item)(sample.samples[0]!)]},
    {...sample, samples: [(({requiredFacts: _, ...item}) => item)(sample.samples[0]!)]},
    {...sample, samples: [{...sample.samples[0]!, risk: 'critical'}]},
    {...sample, samples: [{...sample.samples[0]!, expectedDisposition: 'defer'}]},
    {...sample, samples: [{...sample.samples[0]!, requiredFacts: []}]},
    {...sample, unexpected: true},
  ];
  for (const invalid of invalidDatasets) {
    assert.equal(validateEvaluationDataset(invalid).success, false);
  }
});

test('决策签名冻结 SHA-256、排序数组和严格字段', async () => {
  const signature: DecisionSignature = {
    disposition: 'answer',
    faqId: 'exam-deferral',
    knowledgeVersion: 'kv-1',
    configVersion: 'mvp-1',
    keyFacts: ['申请截止时间', '课程名称'],
    evidenceIds: ['evidence-001', 'evidence-002'],
    hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  };

  assert.equal(validateDecisionSignature(signature).success, true);
  await assertStrictSchema(DECISION_SIGNATURE_SCHEMA, {...signature});
  const invalidSignatures: unknown[] = [
    (({hash: _, ...value}) => value)(signature),
    {...signature, hash: 'A'.repeat(64)},
    {...signature, hash: 'a'.repeat(63)},
    {...signature, keyFacts: ['课程名称', '申请截止时间']},
    {...signature, evidenceIds: ['evidence-001', 'evidence-001']},
    {...signature, unexpected: true},
  ];
  for (const invalid of invalidSignatures) {
    assert.equal(validateDecisionSignature(invalid).success, false);
  }
});

test('合成评测结果在类型层不得宣称完成或通过', () => {
  const awaitingMetric = {
    metric: 'correctness', numerator: 0, denominator: 0, value: null, target: 0.9,
    comparator: 'gte', status: 'awaiting_real_data',
  } satisfies EvaluationMetricResult;
  const syntheticAwaitingRun = {
    runId: 'run-synthetic-001', datasetVersion: 'synthetic-1', evidenceKind: 'synthetic',
    knowledgeVersion: 'kv-1', configVersion: 'mvp-1', codeVersion: 'code-1',
    status: 'awaiting_real_data', metrics: [awaitingMetric], sampleCount: 1, startedAt: 1, completedAt: null,
  } satisfies EvaluationRunSummary;
  const teacherCompletedRun = {
    ...syntheticAwaitingRun,
    evidenceKind: 'teacher',
    status: 'completed',
    metrics: [{...awaitingMetric, denominator: 1, value: 1, status: 'pass'}],
    completedAt: 2,
  } satisfies EvaluationRunSummary;

  type SyntheticRun = Extract<EvaluationRunSummary, {evidenceKind: 'synthetic'}>;
  const completed = 'completed' as const;
  const passingMetric = {...awaitingMetric, denominator: 1, value: 1, status: 'pass'} as const;
  // @ts-expect-error 合成数据不能完成。
  const invalidSyntheticStatus: SyntheticRun['status'] = completed;
  // @ts-expect-error 合成数据不能包含可宣称达标的指标。
  const invalidSyntheticMetric: SyntheticRun['metrics'][number] = passingMetric;

  assert.equal(syntheticAwaitingRun.status, 'awaiting_real_data');
  assert.equal(teacherCompletedRun.status, 'completed');
  assert.equal(invalidSyntheticStatus, 'completed');
  assert.equal(invalidSyntheticMetric.status, 'pass');
});

test('追问与教师计时契约要求完整上下文且拒绝未知字段', async () => {
  const answerWithClarification = {
    requestId: 'request-clarify-001',
    answer: '请补充缓考申请的课程信息。',
    faqId: null,
    faqVersion: null,
    source: 'fallback',
    fallbackReason: 'ambiguous',
    isDemo: false,
    conversationId: 'conversation-001',
    clarification: {missingSlot: 'course', question: '请问是哪门课程？', round: 1},
  };
  assert.equal(await validationStatus(ANSWER_RESPONSE_SCHEMA, answerWithClarification), 204);
  assert.equal(await validationStatus(ANSWER_RESPONSE_SCHEMA, {
    ...answerWithClarification,
    conversationId: undefined,
  }), 400);
  assert.equal(await validationStatus(ANSWER_RESPONSE_SCHEMA, {
    ...answerWithClarification,
    clarification: {question: '请问是哪门课程？', round: 1},
  }), 400);

  await assertStrictSchema(CLARIFICATION_DECISION_SCHEMA, {
    kind: 'ask', conversationId: 'conversation-001', missingSlot: 'course', question: '请问是哪门课程？', round: 1,
  });
  await assertStrictSchema(TEACHER_TIMING_INPUT_SCHEMA, {
    taskId: 'task-001', sessionId: 'session-001', activeMs: 1, elapsedMs: 2,
    completionMode: 'link', clientStartedAt: 0,
  });
});

test('回答追踪、任务、会话和知识版本契约拒绝缺失版本或多余字段', async () => {
  await assertStrictSchema(ANSWER_TRACE_SCHEMA, {
    answerRunId: 'answer-run-001',
    requestId: 'request-trace-001',
    knowledgeVersion: 1,
    decisionVersion: 'retrieval-v1',
    evidence: [{sourceType: 'faq', sourceId: 'faq-001', version: 1}],
  });
  await assertStrictSchema(JOB_SCHEMA, {
    id: 'job-001',
    type: 'knowledge.index',
    status: 'pending',
    attempts: 0,
    maxAttempts: 3,
    availableAt: 1,
    createdAt: 1,
    updatedAt: 1,
  });
  await assertStrictSchema(CONVERSATION_SCHEMA, {
    id: 'conversation-001',
    workspaceId: 'workspace-001',
    channel: 'qq',
    targetId: 'group-001',
    senderId: 'sender-001',
    intent: 'academic_question',
    status: 'active',
    version: 1,
    createdAt: 1,
    updatedAt: 1,
  });
  await assertStrictSchema(KNOWLEDGE_VERSION_SCHEMA, {
    id: 'knowledge-version-001',
    workspaceId: 'workspace-001',
    version: 1,
    status: 'active',
    contentHash: 'sha256:abc',
    createdAt: 1,
    activatedAt: 1,
  });

  const withoutVersion = {
    id: 'knowledge-version-001',
    workspaceId: 'workspace-001',
    status: 'active',
    contentHash: 'sha256:abc',
    createdAt: 1,
    activatedAt: 1,
  };
  assert.equal(await validationStatus(KNOWLEDGE_VERSION_SCHEMA, withoutVersion), 400);
});

test('任务状态和输入意图与三代计划一致', async () => {
  const expectedJobStatuses = [
    'pending',
    'claimed',
    'processing',
    'succeeded',
    'failed',
    'unknown',
    'cancelled',
  ] satisfies JobStatus[];
  const expectedInputIntents = [
    'academic_question',
    'context_update',
    'confirmation',
    'negation',
    'small_talk',
    'material_upload',
    'sensitive_personal',
  ] satisfies InputIntent[];

  assert.deepEqual(JOB_STATUSES, expectedJobStatuses);
  assert.deepEqual(INPUT_INTENTS, expectedInputIntents);
  assert.equal(
    await validationStatus(JOB_SCHEMA, {
      id: 'job-invalid',
      type: 'knowledge.index',
      status: 'retrying',
      attempts: 0,
      maxAttempts: 3,
      availableAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }),
    400,
  );
});

test('生成的前端客户端与冻结 OpenAPI 快照一致', () => {
  const projectRoot = resolve(import.meta.dirname, '..');
  const snapshot = readFileSync(resolve(projectRoot, 'docs/api/openapi-v1.0.3.json'));
  const expectedHash = openApiSourceHash(snapshot);

  assert.equal(OPENAPI_SOURCE_SHA256, expectedHash);
  assert.equal(Object.keys(API_OPERATIONS).length, 81);
  assert.deepEqual(API_OPERATIONS['POST /api/v1/admin/answer/test'], {
    method: 'POST',
    path: '/admin/answer/test',
  });
  assert.deepEqual(API_OPERATIONS['POST /api/v1/internal/qq/answer'], {
    method: 'POST',
    path: '/internal/qq/answer',
  });

  const request: ApiRequest<'POST /api/v1/admin/answer/test'> = {
    question: '如何选课？',
    requestId: 'request-generated-001',
  };
  const response: ApiResponse<'POST /api/v1/admin/answer/test'> = {
    requestId: request.requestId,
    answer: '请按选课通知办理。',
    faqId: null,
    faqVersion: null,
    source: 'fallback',
    fallbackReason: 'no_match',
    isDemo: false,
  };

  assert.equal(response.requestId, request.requestId);
});

test('契约包不依赖框架、数据库或模型客户端', () => {
  const contractDirectory = resolve(import.meta.dirname, '../packages/contracts/src');
  const forbiddenDependencies = /from\s+['"](?:fastify|react|better-sqlite3|drizzle-orm|@langchain|openai)/;

  for (const file of readdirSync(contractDirectory).filter((name) => name.endsWith('.ts'))) {
    const source = readFileSync(resolve(contractDirectory, file), 'utf8');
    assert.doesNotMatch(source, forbiddenDependencies, `${file} 引入了不允许的运行时依赖`);
  }

  const indexSource = readFileSync(resolve(contractDirectory, 'index.ts'), 'utf8');
  const indexLines = indexSource.split(/\r?\n/).filter(Boolean);
  assert.ok(indexLines.every((line) => /^export \* from '.+\.js';$/.test(line)));
});
