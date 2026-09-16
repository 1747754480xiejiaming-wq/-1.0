import type Database from 'better-sqlite3';
import type {Faq, FaqAttachment, FaqInput, PageResult} from '@campus/contracts';
import {DuplicateKnowledgeQuestionError, OptimisticConcurrencyError} from '../../core/unit-of-work.js';
import type {KnowledgeListQuery, KnowledgeRepository} from '../../modules/knowledge/repository.js';

interface FaqRow {
  id: string;
  question: string;
  answer: string;
  keywords: string;
  category: string;
  status: 'active' | 'disabled';
  version: number;
  is_demo: number;
  created_at: number;
  updated_at: number;
  library_type: 'answer' | 'forbidden';
}

export class SqliteKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly sqlite: Database.Database) {}

  getFaq(workspaceId: string, id: string): Faq | undefined {
    const row = this.sqlite.prepare('SELECT * FROM faqs WHERE owner_id=? AND id=?').get(workspaceId, id) as FaqRow | undefined;
    return row ? this.hydrateFaq(row) : undefined;
  }

  listFaqs(workspaceId: string, query: KnowledgeListQuery): PageResult<Faq> {
    const q = query.q ?? '';
    const status = query.status ?? '';
    const category = query.category ?? '';
    const libraryType = query.libraryType ?? 'answer';
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = ['owner_id=?', 'library_type=?'];
    const params: Array<string | number> = [workspaceId, libraryType];
    if (q) {
      where.push('(instr(lower(question),lower(?))>0 OR instr(lower(answer),lower(?))>0)');
      params.push(q, q);
    }
    if (status) {
      where.push('status=?');
      params.push(status);
    }
    if (category) {
      where.push('category=?');
      params.push(category);
    }
    const condition = ` WHERE ${where.join(' AND ')}`;
    const total = (this.sqlite.prepare(`SELECT count(*) AS value FROM faqs${condition}`).get(...params) as {value: number}).value;
    const rows = this.sqlite.prepare(`SELECT * FROM faqs${condition} ORDER BY updated_at DESC,id LIMIT ? OFFSET ?`)
      .all(...params, pageSize, (page - 1) * pageSize) as FaqRow[];
    return {items: rows.map(row => this.hydrateFaq(row)), total, page, pageSize};
  }

  createFaq(workspaceId: string, id: string, input: FaqInput, actorId: string, isDemo = false): Faq {
    const question = input.question.trim();
    const now = Date.now();
    try {
      this.sqlite.prepare(`INSERT INTO faqs(
        id,owner_id,question_key,question,answer,keywords,category,library_type,status,
        version,is_demo,updated_by,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,1,?,?,?,?)`).run(
        id,
        workspaceId,
        `${workspaceId}:${normalize(question)}`,
        question,
        input.answer.trim(),
        JSON.stringify([...new Set(input.keywords.map(keyword => keyword.trim()).filter(Boolean))]),
        input.category.trim(),
        input.libraryType ?? 'answer',
        input.status,
        isDemo ? 1 : 0,
        actorId,
        now,
        now,
      );
    } catch (error) {
      rethrowQuestionKeyConflict(error);
    }
    return this.getFaq(workspaceId, id)!;
  }

  updateFaq(workspaceId: string, id: string, expectedVersion: number, input: FaqInput, actorId: string): Faq {
    const question = input.question.trim();
    let result: Database.RunResult;
    try {
      result = this.sqlite.prepare(`UPDATE faqs SET
        question=?, question_key=?, answer=?, keywords=?, category=?, library_type=?, status=?,
        version=version+1, is_demo=0, updated_by=?, updated_at=?
        WHERE owner_id=? AND id=? AND version=?`).run(
        question,
        `${workspaceId}:${normalize(question)}`,
        input.answer.trim(),
        JSON.stringify([...new Set(input.keywords.map(keyword => keyword.trim()).filter(Boolean))]),
        input.category.trim(),
        input.libraryType ?? 'answer',
        input.status,
        actorId,
        Date.now(),
        workspaceId,
        id,
        expectedVersion,
      );
    } catch (error) {
      rethrowQuestionKeyConflict(error);
    }
    if (result.changes !== 1) throw new OptimisticConcurrencyError();
    return this.getFaq(workspaceId, id)!;
  }

  deleteFaq(workspaceId: string, id: string, expectedVersion: number) {
    const faq = this.getFaq(workspaceId, id);
    if (!faq || faq.version !== expectedVersion) throw new OptimisticConcurrencyError();
    const attachments = this.sqlite.prepare(`SELECT stored_name AS storedName
      FROM faq_attachments WHERE faq_id=? ORDER BY created_at,id`).all(id) as {storedName: string}[];
    this.sqlite.prepare('UPDATE unmatched_questions SET resolved_faq_id=NULL WHERE owner_id=? AND resolved_faq_id=?')
      .run(workspaceId, id);
    const result = this.sqlite.prepare('DELETE FROM faqs WHERE owner_id=? AND id=? AND version=?')
      .run(workspaceId, id, expectedVersion);
    if (result.changes !== 1) throw new OptimisticConcurrencyError();
    return {faq, attachments};
  }

  private hydrateFaq(row: FaqRow): Faq {
    return {...this.toFaq(row), attachments: this.listAttachments(row.id)};
  }

  private toFaq(row: FaqRow): Faq {
    return {
      id: row.id,
      question: row.question,
      answer: row.answer,
      keywords: JSON.parse(row.keywords) as string[],
      category: row.category,
      status: row.status,
      version: row.version,
      isDemo: Boolean(row.is_demo),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      libraryType: row.library_type,
    };
  }

  private listAttachments(faqId: string): FaqAttachment[] {
    return this.sqlite.prepare(`SELECT id,faq_id AS faqId,name,kind,mime,size,created_at AS createdAt
      FROM faq_attachments WHERE faq_id=? ORDER BY created_at,id`).all(faqId) as FaqAttachment[];
  }
}

function normalize(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\p{Z}\s]/gu, '');
}

function rethrowQuestionKeyConflict(error: unknown): never {
  if (isQuestionKeyUniqueConstraint(error)) throw new DuplicateKnowledgeQuestionError();
  throw error;
}

function isQuestionKeyUniqueConstraint(error: unknown): error is Error & {code: string} {
  return error instanceof Error
    && 'code' in error
    && error.code === 'SQLITE_CONSTRAINT_UNIQUE'
    && error.message === 'UNIQUE constraint failed: faqs.question_key';
}
