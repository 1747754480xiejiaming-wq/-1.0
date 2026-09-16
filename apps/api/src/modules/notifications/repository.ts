import type {NotificationRecord} from '@campus/contracts';

export interface NotificationRepository {
  list(workspaceId: string, limit?: number): NotificationRecord[];
}
