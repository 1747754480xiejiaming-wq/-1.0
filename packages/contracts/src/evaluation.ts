export type EvaluationEvidenceKind = 'teacher' | 'synthetic';
export type EvaluationRisk = 'low' | 'medium' | 'high';
export type ExpectedDisposition = 'answer' | 'clarify' | 'escalate';

export interface EvaluationSample {
  id: string;
  question: string;
  expectedDisposition: ExpectedDisposition;
  expectedFaqId: string | null;
  requiredFacts: string[];
  risk: EvaluationRisk;
  expectedMissingSlot?: string;
  followups?: string[];
}

export interface EvaluationDataset {
  datasetVersion: string;
  evidenceKind: EvaluationEvidenceKind;
  knowledgeVersion: string;
  configVersion: string;
  samples: EvaluationSample[];
}

export interface EvaluationMetricResult {
  metric: 'correctness' | 'highRiskErrorRate' | 'stability' | 'followupF1' | 'completionRate' | 'teacherEfficiency';
  numerator: number;
  denominator: number;
  value: number | null;
  target: number;
  comparator: 'gte' | 'lte';
  status: 'pass' | 'fail' | 'awaiting_real_data';
}

export interface AwaitingEvaluationMetricResult extends Omit<EvaluationMetricResult, 'value' | 'status'> {
  value: null;
  status: 'awaiting_real_data';
}

interface EvaluationRunSummaryBase {
  runId: string;
  datasetVersion: string;
  knowledgeVersion: string;
  configVersion: string;
  codeVersion: string;
  sampleCount: number;
  startedAt: number;
  completedAt: number | null;
}

export interface TeacherEvaluationRunSummary extends EvaluationRunSummaryBase {
  evidenceKind: 'teacher';
  status: 'completed' | 'failed' | 'awaiting_real_data';
  metrics: EvaluationMetricResult[];
}

export interface SyntheticEvaluationRunSummary extends EvaluationRunSummaryBase {
  evidenceKind: 'synthetic';
  status: 'failed' | 'awaiting_real_data';
  metrics: AwaitingEvaluationMetricResult[];
}

export type EvaluationRunSummary = TeacherEvaluationRunSummary | SyntheticEvaluationRunSummary;

const NONEMPTY_STRING_SCHEMA = {type: 'string', minLength: 1} as const;

export const EVALUATION_SAMPLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'question', 'expectedDisposition', 'expectedFaqId', 'requiredFacts', 'risk'],
  properties: {
    id: NONEMPTY_STRING_SCHEMA,
    question: {type: 'string', minLength: 1, maxLength: 200},
    expectedDisposition: {enum: ['answer', 'clarify', 'escalate']},
    expectedFaqId: {anyOf: [NONEMPTY_STRING_SCHEMA, {type: 'null'}]},
    requiredFacts: {type: 'array', minItems: 1, uniqueItems: true, items: NONEMPTY_STRING_SCHEMA},
    risk: {enum: ['low', 'medium', 'high']},
    expectedMissingSlot: NONEMPTY_STRING_SCHEMA,
    followups: {type: 'array', items: NONEMPTY_STRING_SCHEMA},
  },
  allOf: [
    {
      if: {properties: {expectedDisposition: {const: 'answer'}}, required: ['expectedDisposition']},
      then: {properties: {expectedFaqId: NONEMPTY_STRING_SCHEMA}},
      else: {properties: {expectedFaqId: {type: 'null'}}},
    },
    {
      if: {properties: {expectedDisposition: {const: 'clarify'}}, required: ['expectedDisposition']},
      then: {required: ['expectedMissingSlot'], properties: {expectedMissingSlot: NONEMPTY_STRING_SCHEMA}},
    },
  ],
} as const;

export const EVALUATION_DATASET_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['datasetVersion', 'evidenceKind', 'knowledgeVersion', 'configVersion', 'samples'],
  properties: {
    datasetVersion: NONEMPTY_STRING_SCHEMA,
    evidenceKind: {enum: ['teacher', 'synthetic']},
    knowledgeVersion: NONEMPTY_STRING_SCHEMA,
    configVersion: NONEMPTY_STRING_SCHEMA,
    samples: {type: 'array', minItems: 1, items: EVALUATION_SAMPLE_SCHEMA},
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}

function nonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function validateEvaluationDataset(
  value: unknown,
): {success: true; data: EvaluationDataset} | {success: false; errors: string[]} {
  const errors: string[] = [];
  if (!isRecord(value)) return {success: false, errors: ['dataset must be an object']};

  const datasetKeys = ['datasetVersion', 'evidenceKind', 'knowledgeVersion', 'configVersion', 'samples'];
  if (!hasOnlyKeys(value, datasetKeys)) errors.push('dataset contains unknown fields');
  for (const key of ['datasetVersion', 'knowledgeVersion', 'configVersion']) {
    if (!nonemptyString(value[key])) errors.push(`${key} must be a nonempty string`);
  }
  if (value.evidenceKind !== 'teacher' && value.evidenceKind !== 'synthetic') {
    errors.push('evidenceKind must be teacher or synthetic');
  }
  if (!Array.isArray(value.samples) || value.samples.length === 0) {
    errors.push('samples must contain at least one sample');
    return {success: false, errors};
  }

  const ids = new Set<string>();
  for (const [index, sample] of value.samples.entries()) {
    const prefix = `samples[${index}]`;
    if (!isRecord(sample)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    const sampleKeys = [
      'id', 'question', 'expectedDisposition', 'expectedFaqId', 'requiredFacts', 'risk', 'expectedMissingSlot', 'followups',
    ];
    if (!hasOnlyKeys(sample, sampleKeys)) errors.push(`${prefix} contains unknown fields`);
    if (!nonemptyString(sample.id)) errors.push(`${prefix}.id must be a nonempty string`);
    else if (ids.has(sample.id)) errors.push(`${prefix}.id must be unique`);
    else ids.add(sample.id);
    if (typeof sample.question !== 'string' || sample.question.length < 1 || sample.question.length > 200) {
      errors.push(`${prefix}.question must contain 1..200 characters`);
    }
    if (sample.expectedDisposition !== 'answer' && sample.expectedDisposition !== 'clarify' && sample.expectedDisposition !== 'escalate') {
      errors.push(`${prefix}.expectedDisposition is invalid`);
    }
    if (sample.risk !== 'low' && sample.risk !== 'medium' && sample.risk !== 'high') errors.push(`${prefix}.risk is invalid`);
    if (!Array.isArray(sample.requiredFacts) || sample.requiredFacts.length === 0
      || sample.requiredFacts.some(fact => !nonemptyString(fact))
      || new Set(sample.requiredFacts).size !== sample.requiredFacts.length) {
      errors.push(`${prefix}.requiredFacts must contain unique nonempty strings`);
    }
    if (sample.expectedDisposition === 'answer') {
      if (!nonemptyString(sample.expectedFaqId)) errors.push(`${prefix}.expectedFaqId is required for answer`);
    } else if (sample.expectedFaqId !== null) {
      errors.push(`${prefix}.expectedFaqId must be null unless disposition is answer`);
    }
    if (sample.expectedDisposition === 'clarify' && !nonemptyString(sample.expectedMissingSlot)) {
      errors.push(`${prefix}.expectedMissingSlot is required for clarify`);
    }
    if (sample.followups !== undefined
      && (!Array.isArray(sample.followups) || sample.followups.some(followup => !nonemptyString(followup)))) {
      errors.push(`${prefix}.followups must contain nonempty strings`);
    }
  }
  return errors.length > 0
    ? {success: false, errors}
    : {success: true, data: value as unknown as EvaluationDataset};
}
