import type Database from 'better-sqlite3';
import type {Repositories, UnitOfWork} from '../../core/unit-of-work.js';
import {SqliteAnsweringRepository} from './answering-repository.js';
import {SqliteConversationRepository} from './conversations-repository.js';
import {SqliteKnowledgeRepository} from './knowledge-repository.js';
import {SqliteNotificationRepository} from './notifications-repository.js';
import {SqliteUnmatchedRepository} from './unmatched-repository.js';

export class SqliteUnitOfWork implements UnitOfWork {
  readonly repositories: Repositories;

  constructor(private readonly sqlite: Database.Database) {
    this.repositories = {
      answering: new SqliteAnsweringRepository(sqlite),
      conversations: new SqliteConversationRepository(),
      knowledge: new SqliteKnowledgeRepository(sqlite),
      notifications: new SqliteNotificationRepository(sqlite),
      unmatched: new SqliteUnmatchedRepository(sqlite),
    };
  }

  transaction<T>(operation: (repositories: Repositories) => T): T {
    return this.sqlite.transaction(() => operation(this.repositories))();
  }
}
