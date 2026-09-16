import type {Channel} from '@campus/contracts';

export interface AnsweringRepository {
  countActivity(workspaceId: string): number;
  recordActivity(workspaceId: string, day: string, channel: Channel, metricKey: string): void;
}
