export const JOB_STATUSES = [
  'pending',
  'claimed',
  'processing',
  'succeeded',
  'failed',
  'unknown',
  'cancelled',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export interface JobRecord {
  id: string;
  type: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: number;
  claimedAt?: number | null;
  completedAt?: number | null;
  lastErrorCode?: string | null;
  createdAt: number;
  updatedAt: number;
}

export const JOB_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'type', 'status', 'attempts', 'maxAttempts', 'availableAt', 'createdAt', 'updatedAt'],
  properties: {
    id: {type: 'string', minLength: 1, maxLength: 100},
    type: {type: 'string', minLength: 1, maxLength: 100},
    status: {enum: JOB_STATUSES},
    attempts: {type: 'integer', minimum: 0},
    maxAttempts: {type: 'integer', minimum: 1},
    availableAt: {type: 'integer', minimum: 0},
    claimedAt: {anyOf: [{type: 'integer', minimum: 0}, {type: 'null'}]},
    completedAt: {anyOf: [{type: 'integer', minimum: 0}, {type: 'null'}]},
    lastErrorCode: {anyOf: [{type: 'string', maxLength: 120}, {type: 'null'}]},
    createdAt: {type: 'integer', minimum: 0},
    updatedAt: {type: 'integer', minimum: 0},
  },
} as const;
