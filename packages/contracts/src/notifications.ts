import type {AnswerAttachment} from './answers.js';

export interface QqGroup {
  id: string;
  label: string;
  groupNumber: string | null;
  nameSynced: boolean;
  available: boolean;
  enabled: boolean;
  firstSeen: number;
  lastSeen: number;
}

export interface NotificationTarget {
  id: string;
  groupId: string;
  groupLabel: string;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  attempts: number;
  sentAt: number | null;
  lastError: string | null;
  messageId?: string | null;
}

export interface NotificationAttachment extends AnswerAttachment {
  notificationId: string;
}

export interface NotificationRecord {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  targetCount: number;
  pendingCount: number;
  sentCount: number;
  failedCount: number;
  targets: NotificationTarget[];
  attachments: NotificationAttachment[];
}

export interface NotificationInput {
  requestId: string;
  title: string;
  content: string;
  groupIds: string[];
}
