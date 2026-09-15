import type { FastifyInstance } from 'fastify';
import type { SessionResult, UserRole } from '@campus/contracts';
import type { Config } from '../config.js';
import type { Store } from '../db/store.js';
import type { AnswerService } from '../services/answer.js';
import type { AnswerOptimizer } from '../services/answer-optimizer.js';
import type { BotController } from '../services/bot-control.js';
import type { MaterialInboxService } from '../services/materials.js';
import type { ModelSelector } from '../services/model.js';
import type { Models } from '../services/models.js';
import type { QqGroups } from '../services/qq-groups.js';
import type { RagService } from '../services/rag.js';

export const API_PREFIX = '/api/v1';
export const ID_PARAMS_SCHEMA = {type:'object',additionalProperties:false,required:['id'],properties:{id:{type:'string',minLength:1,maxLength:100}}} as const;

export type CreateAppDependencies = {
  store?: Store;
  select?: ModelSelector;
  modelFetch?: typeof fetch;
  botController?: BotController;
};

export interface RequestContext {
  user: SessionResult['user'] | null;
  role: UserRole | null;
  workspaceId: string | null;
  csrfToken: string | null;
  correlationId: string;
}
declare module 'fastify' {
  interface FastifyRequest {
    campusSession?: SessionResult;
    campusContext?: RequestContext;
  }
}

export interface RouteContext {
  app: FastifyInstance;
  config: Config;
  store: Store;
  answers: AnswerService;
  answerOptimizer: AnswerOptimizer;
  models: Models;
  rag: RagService;
  materials: MaterialInboxService;
  materialDirectory: string;
  botController: BotController;
  qqGroups: QqGroups;
  dependencies: CreateAppDependencies;
  publicStatus(): {
    activeFaqs: number;
    demoMode: boolean;
    modelConfigured: boolean;
    mode: 'semantic' | 'faq';
    service: string;
  };
  getBotState(): {state:'connected'|'offline';lastSeen:number}|null;
  setBotState(state: {state:'connected'|'offline';lastSeen:number}|null): void;
}
