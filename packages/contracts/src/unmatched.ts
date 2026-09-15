export interface UnmatchedQqStudent {
  id: string;
  name: string | null;
  qqNumber: string | null;
  questionCount: number;
  firstSeen: number;
  lastSeen: number;
}

export type UnmatchedType = 'manual' | 'unrelated' | 'offline';

export interface Unmatched {
  id: string;
  question: string;
  reason: string;
  type: UnmatchedType;
  webCount: number;
  qqCount: number;
  qqStudents: UnmatchedQqStudent[];
  status: 'pending' | 'resolved' | 'ignored';
  resolvedFaqId: string | null;
  firstSeen: number;
  lastSeen: number;
}

export interface UnmatchedPreferences {
  offlineAutoReply: boolean;
  qqAnswerEnabled: boolean;
  updatedAt: number;
}
