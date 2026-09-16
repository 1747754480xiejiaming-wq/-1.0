import type Database from 'better-sqlite3';
import type {NotificationAttachment, NotificationRecord, NotificationTarget} from '@campus/contracts';
import type {NotificationRepository} from '../../modules/notifications/repository.js';

export class SqliteNotificationRepository implements NotificationRepository {
  constructor(private readonly sqlite: Database.Database) {}

  list(workspaceId: string, limit = 20): NotificationRecord[] {
    const ids = this.sqlite.prepare(`SELECT id FROM notifications
      WHERE owner_id=? AND deleted_at IS NULL ORDER BY created_at DESC,id LIMIT ?`)
      .all(workspaceId, Math.max(1, Math.min(50, limit))) as {id: string}[];
    return ids.map(({id}) => this.get(workspaceId, id)!);
  }

  private get(workspaceId: string, id: string): NotificationRecord | undefined {
    const row = this.sqlite.prepare(`SELECT n.id,n.title,n.content,n.created_at AS createdAt,
      count(t.id) AS targetCount,
      sum(CASE WHEN t.status IN ('pending','processing') THEN 1 ELSE 0 END) AS pendingCount,
      sum(CASE WHEN t.status='sent' THEN 1 ELSE 0 END) AS sentCount,
      sum(CASE WHEN t.status='failed' THEN 1 ELSE 0 END) AS failedCount
      FROM notifications n JOIN notification_targets t ON t.notification_id=n.id
      WHERE n.owner_id=? AND n.id=? GROUP BY n.id`).get(workspaceId, id) as Omit<NotificationRecord, 'targets' | 'attachments'> | undefined;
    if (!row) return undefined;
    const targets = this.sqlite.prepare(`SELECT t.id,t.group_id AS groupId,
      coalesce(g.actual_name,g.label) AS groupLabel,t.status,t.attempt_count AS attempts,
      t.sent_at AS sentAt,t.last_error AS lastError,t.platform_message_id AS messageId
      FROM notification_targets t JOIN qq_groups g ON g.id=t.group_id
      WHERE t.notification_id=? ORDER BY g.label,t.id`).all(id) as NotificationTarget[];
    const attachments = this.sqlite.prepare(`SELECT id,notification_id AS notificationId,
      name,kind,mime,size,created_at AS createdAt FROM notification_attachments
      WHERE notification_id=? ORDER BY created_at,id`).all(id) as NotificationAttachment[];
    return {...row, targets, attachments};
  }
}
