import type {AnsweringRepository} from '../modules/answering/repository.js';
import type {ConversationRepository} from '../modules/conversations/repository.js';
import type {KnowledgeRepository} from '../modules/knowledge/repository.js';
import type {NotificationRepository} from '../modules/notifications/repository.js';
import type {UnmatchedRepository} from '../modules/unmatched/repository.js';

export interface Repositories {
  answering: AnsweringRepository;
  conversations: ConversationRepository;
  knowledge: KnowledgeRepository;
  notifications: NotificationRepository;
  unmatched: UnmatchedRepository;
}

export interface UnitOfWork {
  transaction<T>(operation: (repositories: Repositories) => T): T;
}

export class OptimisticConcurrencyError extends Error {
  constructor(message = '记录已被其他操作更新。') {
    super(message);
    this.name = 'OptimisticConcurrencyError';
  }
}

export class DuplicateKnowledgeQuestionError extends Error {
  constructor(message = '当前工作区已有相同的标准问题。') {
    super(message);
    this.name = 'DuplicateKnowledgeQuestionError';
  }
}
