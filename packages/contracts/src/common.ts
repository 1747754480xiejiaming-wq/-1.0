export type ContractSchema = Record<string, unknown>;

export type ModelProvider = 'qwen' | 'deepseek' | 'zhipu';
export type TextModelProvider = 'deepseek' | 'zhipu';
export type AccountPlan = 'plus' | 'pro';
export type UserRole = 'teacher' | 'developer';

export interface ModelUsage {
  weekStart: string;
  resetAt: number;
  updatedAt: number;
  consumedPercent: number;
  exhausted: boolean;
  totalTokens: number;
  activeCalls: number;
  unknownCalls: number;
  providers: {
    provider: ModelProvider;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    calls: number;
  }[];
}

export interface ModelConnection {
  provider: ModelProvider;
  name: string;
  model: string;
  keyConfigured: boolean;
  connected: boolean;
  checkedAt: number | null;
}

export interface ModelsStatus {
  activeTextProvider: TextModelProvider;
  providers: ModelConnection[];
  usage: ModelUsage;
}

export interface AccountPlanStatus {
  plan: AccountPlan;
  quotaMultiplier: 1 | 5;
  usage: ModelUsage;
  updatedAt: number;
}

export interface DeveloperAccess {
  unlocked: boolean;
  expiresAt: number | null;
}

export interface User {
  id: string;
  username: string;
  role: UserRole;
}

export interface SessionResult {
  user: User;
  csrfToken: string;
}

export interface RegisteredAccount {
  id: string;
  username: string;
  createdAt: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PublicStatus {
  activeFaqs: number;
  demoMode: boolean;
  modelConfigured: boolean;
  mode: 'faq' | 'semantic';
  service: string;
}

export interface BotConfig {
  appId: string;
  appSecretConfigured: boolean;
  processRunning: boolean;
}

export interface BotActionResult {
  ok: true;
  message: string;
  processRunning: boolean;
  answeringEnabled: boolean;
}

export interface AdminStatus extends PublicStatus {
  totalFaqs: number;
  pendingQuestions: number;
  pendingMaterials: number;
  todayRequests: number;
  totalRequests: number;
  hitRate: number | null;
  modelCallsToday: number;
  modelDailyLimit: number;
  modelErrorsToday: number;
  modelTokensToday: number;
  botConfigured: boolean;
  botCredentialsConfigured: boolean;
  botProcessRunning: boolean;
  qqAnswerEnabled: boolean;
  botAppId: string;
  botState: 'connected' | 'offline';
  botLastSeen: number | null;
  recentDays: {day: string; hits: number}[];
}

export interface ApiErrorBody {
  error: {code: string; message: string};
  requestId?: string;
}

export const API_ERROR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message'],
      properties: {
        code: {type: 'string', minLength: 1, maxLength: 120},
        message: {type: 'string', minLength: 1, maxLength: 500},
      },
    },
    requestId: {type: 'string', minLength: 1, maxLength: 160},
  },
} as const;

export function pageResultSchema(itemSchema: ContractSchema = {}): ContractSchema {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['items', 'total', 'page', 'pageSize'],
    properties: {
      items: {type: 'array', items: itemSchema},
      total: {type: 'integer', minimum: 0},
      page: {type: 'integer', minimum: 1},
      pageSize: {type: 'integer', minimum: 1, maximum: 100},
    },
  };
}
