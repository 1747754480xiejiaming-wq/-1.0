import type {Conversation} from '@campus/contracts';
import type {ConversationRepository} from '../../modules/conversations/repository.js';

export class SqliteConversationRepository implements ConversationRepository {
  listActive(_workspaceId: string): Conversation[] {
    // Conversation persistence is introduced by Task 9; v1.0.3 has no rows to adapt yet.
    return [];
  }
}
