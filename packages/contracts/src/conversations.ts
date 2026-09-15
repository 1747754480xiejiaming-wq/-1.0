import type {Channel} from './answers.js';

export const INPUT_INTENTS = [
  'academic_question',
  'context_update',
  'confirmation',
  'negation',
  'small_talk',
  'material_upload',
  'sensitive_personal',
] as const;

export type InputIntent = (typeof INPUT_INTENTS)[number];
export type ConversationStatus = 'active' | 'completed' | 'expired';

export interface Conversation {
  id: string;
  workspaceId: string;
  channel: Channel;
  targetId: string;
  senderId: string;
  intent: InputIntent;
  status: ConversationStatus;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export const CONVERSATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'workspaceId',
    'channel',
    'targetId',
    'senderId',
    'intent',
    'status',
    'version',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: {type: 'string', minLength: 1, maxLength: 100},
    workspaceId: {type: 'string', minLength: 1, maxLength: 100},
    channel: {enum: ['web', 'qq']},
    targetId: {type: 'string', minLength: 1, maxLength: 160},
    senderId: {type: 'string', minLength: 1, maxLength: 160},
    intent: {enum: INPUT_INTENTS},
    status: {enum: ['active', 'completed', 'expired']},
    version: {type: 'integer', minimum: 1},
    createdAt: {type: 'integer', minimum: 0},
    updatedAt: {type: 'integer', minimum: 0},
  },
} as const;
