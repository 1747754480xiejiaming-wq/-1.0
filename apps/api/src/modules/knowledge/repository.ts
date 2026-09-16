import type {Faq, FaqInput, FaqLibraryType, FaqStatus, PageResult} from '@campus/contracts';

export interface KnowledgeListQuery {
  q?: string;
  status?: FaqStatus;
  category?: string;
  libraryType?: FaqLibraryType;
  page?: number;
  pageSize?: number;
}

export interface KnowledgeRepository {
  getFaq(workspaceId: string, id: string): Faq | undefined;
  listFaqs(workspaceId: string, query: KnowledgeListQuery): PageResult<Faq>;
  createFaq(workspaceId: string, id: string, input: FaqInput, actorId: string, isDemo?: boolean): Faq;
  updateFaq(
    workspaceId: string,
    id: string,
    expectedVersion: number,
    input: FaqInput,
    actorId: string,
  ): Faq;
  deleteFaq(workspaceId: string, id: string, expectedVersion: number): {
    faq: Faq;
    attachments: {storedName: string}[];
  };
}
