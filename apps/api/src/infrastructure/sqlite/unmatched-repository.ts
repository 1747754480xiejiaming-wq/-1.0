import type Database from 'better-sqlite3';
import type {PageResult, Unmatched, UnmatchedQqStudent} from '@campus/contracts';
import type {UnmatchedListQuery, UnmatchedRepository} from '../../modules/unmatched/repository.js';

type UnmatchedRow = Omit<Unmatched, 'qqStudents'>;

export class SqliteUnmatchedRepository implements UnmatchedRepository {
  constructor(private readonly sqlite: Database.Database) {}

  list(workspaceId: string, query: UnmatchedListQuery): PageResult<Unmatched> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = ['owner_id=?'];
    const params: Array<string | number> = [workspaceId];
    if (query.status) {
      where.push('status=?');
      params.push(query.status);
    }
    if (query.unmatchedType) {
      where.push('queue_type=?');
      params.push(query.unmatchedType);
    }
    if (query.q) {
      where.push('instr(lower(question),lower(?))>0');
      params.push(query.q);
    }
    const condition = ` WHERE ${where.join(' AND ')}`;
    const total = (this.sqlite.prepare(`SELECT count(*) AS count FROM unmatched_questions${condition}`)
      .get(...params) as {count: number}).count;
    const rows = this.sqlite.prepare(`SELECT id,question,reason,queue_type AS type,
      web_count AS webCount,qq_count AS qqCount,status,resolved_faq_id AS resolvedFaqId,
      first_seen AS firstSeen,last_seen AS lastSeen FROM unmatched_questions${condition}
      ORDER BY last_seen DESC,id LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize) as UnmatchedRow[];
    const studentsByQuestion = this.studentsByQuestion(rows.map(row => row.id));
    return {
      items: rows.map(row => ({...row, qqStudents: studentsByQuestion.get(row.id) ?? []})),
      total,
      page,
      pageSize,
    };
  }

  status(workspaceId: string, id: string): Unmatched['status'] | undefined {
    return (this.sqlite.prepare('SELECT status FROM unmatched_questions WHERE owner_id=? AND id=?')
      .get(workspaceId, id) as {status: Unmatched['status']} | undefined)?.status;
  }

  resolvePending(workspaceId: string, id: string, status: 'resolved' | 'ignored', resolvedFaqId: string | null): boolean {
    const result = this.sqlite.prepare(`UPDATE unmatched_questions SET status=?,resolved_faq_id=?
      WHERE owner_id=? AND id=? AND status='pending'`).run(status, resolvedFaqId, workspaceId, id);
    return result.changes === 1;
  }

  private studentsByQuestion(questionIds: string[]): Map<string, UnmatchedQqStudent[]> {
    const result = new Map<string, UnmatchedQqStudent[]>();
    if (!questionIds.length) return result;
    const rows = this.sqlite.prepare(`SELECT question_id AS questionId,sender_id AS id,
      coalesce(confirmed_name,sender_name) AS name,qq_number AS qqNumber,
      question_count AS questionCount,first_seen AS firstSeen,last_seen AS lastSeen
      FROM unmatched_qq_students WHERE question_id IN (${questionIds.map(() => '?').join(',')})
      ORDER BY last_seen DESC,sender_id`).all(...questionIds) as Array<UnmatchedQqStudent & {questionId: string}>;
    for (const {questionId, ...student} of rows) {
      const students = result.get(questionId) ?? [];
      students.push(student);
      result.set(questionId, students);
    }
    return result;
  }
}
