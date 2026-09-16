import type {Conversation} from '@campus/contracts';

export interface ConversationRepository {
  listActive(workspaceId: string): Conversation[];
}
