import type Database from 'better-sqlite3';
import type {Channel} from '@campus/contracts';
import type {AnsweringRepository} from '../../modules/answering/repository.js';

export class SqliteAnsweringRepository implements AnsweringRepository {
  constructor(private readonly sqlite: Database.Database) {}

  countActivity(workspaceId: string): number {
    return (this.sqlite.prepare('SELECT coalesce(sum(hits),0) AS count FROM question_daily WHERE owner_id=?')
      .get(workspaceId) as {count: number}).count;
  }

  recordActivity(workspaceId: string, day: string, channel: Channel, metricKey: string): void {
    this.sqlite.prepare(`INSERT INTO question_daily(owner_id,day,channel,metric_key,hits)
      VALUES(?,?,?,?,1) ON CONFLICT(owner_id,day,channel,metric_key)
      DO UPDATE SET hits=hits+1`).run(workspaceId, day, channel, metricKey);
  }
}
