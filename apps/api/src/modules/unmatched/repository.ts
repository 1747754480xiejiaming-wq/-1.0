import type {PageResult, Unmatched, UnmatchedType} from '@campus/contracts';

export interface UnmatchedListQuery {
  status?: string;
  q?: string;
  unmatchedType?: UnmatchedType;
  page?: number;
  pageSize?: number;
}

export interface UnmatchedRepository {
  list(workspaceId: string, query: UnmatchedListQuery): PageResult<Unmatched>;
  status(workspaceId: string, id: string): Unmatched['status'] | undefined;
  resolvePending(
    workspaceId: string,
    id: string,
    status: 'resolved' | 'ignored',
    resolvedFaqId: string | null,
  ): boolean;
}
