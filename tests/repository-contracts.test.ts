import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {dirname, resolve} from 'node:path';
import type {FaqInput} from '@campus/contracts';
import {OptimisticConcurrencyError} from '../apps/api/src/core/unit-of-work.js';
import {Store} from '../apps/api/src/db/store.js';
import {AppError} from '../apps/api/src/errors.js';
import {SqliteUnitOfWork} from '../apps/api/src/infrastructure/sqlite/unit-of-work.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fixture() {
  const store = new Store(':memory:', root);
  const unitOfWork = new SqliteUnitOfWork(store.sqlite);
  return {store, unitOfWork};
}

function seedCategory(store: Store, workspaceId: string, name = '测试分类') {
  const now = Date.now();
  store.sqlite.prepare(`INSERT INTO knowledge_categories(
    id, owner_id, name, library_type, sort_order, created_at, updated_at
  ) VALUES(?, ?, ?, 'answer', 10, ?, ?)`).run(randomUUID(), workspaceId, name, now, now);
}

function seedFaq(store: Store, workspaceId: string, id: string, updatedAt: number, question = `问题-${id}`) {
  store.sqlite.prepare(`INSERT INTO faqs(
    id, owner_id, question_key, question, answer, keywords, category,
    library_type, status, version, is_demo, created_at, updated_at
  ) VALUES(?, ?, ?, ?, ?, ?, '测试分类', 'answer', 'active', 1, 0, ?, ?)`)
    .run(id, workspaceId, `${workspaceId}:${id}`, question, `答案-${id}`, JSON.stringify(['关键词']), updatedAt, updatedAt);
}

function seedUnmatched(store: Store, workspaceId: string, id: string, lastSeen: number) {
  store.sqlite.prepare(`INSERT INTO unmatched_questions(
    id, owner_id, question_key, question, reason, queue_type,
    web_count, qq_count, status, first_seen, last_seen
  ) VALUES(?, ?, ?, ?, 'no_match', 'manual', 1, 0, 'pending', ?, ?)`)
    .run(id, workspaceId, `${workspaceId}:${id}`, `未匹配-${id}`, lastSeen, lastSeen);
}

function seedNotification(store: Store, workspaceId: string, id: string, createdAt: number) {
  const groupId = `group-${id}`;
  store.sqlite.prepare(`INSERT INTO qq_groups(
    id, owner_id, open_id, label, enabled, first_seen, last_seen, bot_app_id
  ) VALUES(?, ?, ?, ?, 1, ?, ?, '')`).run(groupId, workspaceId, `open-${id}`, `群-${id}`, createdAt, createdAt);
  store.sqlite.prepare(`INSERT INTO notifications(
    id, owner_id, request_id, payload_hash, title, content, created_by, created_at
  ) VALUES(?, ?, ?, ?, ?, '内容', '教师', ?)`)
    .run(id, workspaceId, `request-${id}`, `hash-${id}`, `通知-${id}`, createdAt);
  store.sqlite.prepare(`INSERT INTO notification_targets(
    id, notification_id, group_id, status, attempt_count
  ) VALUES(?, ?, ?, 'sent', 1)`).run(`target-${id}`, id, groupId);
}

test('所有仓储读取都以显式工作区隔离', () => {
  const {store, unitOfWork} = fixture();
  try {
    for (const workspaceId of ['workspace-a', 'workspace-b']) {
      seedCategory(store, workspaceId);
      seedFaq(store, workspaceId, `faq-${workspaceId}`, 100);
      seedUnmatched(store, workspaceId, `unmatched-${workspaceId}`, 100);
      seedNotification(store, workspaceId, `notification-${workspaceId}`, 100);
    }

    unitOfWork.transaction(repositories => {
      assert.deepEqual(repositories.knowledge.listFaqs('workspace-a', {}).items.map(item => item.id), ['faq-workspace-a']);
      assert.deepEqual(repositories.unmatched.list('workspace-a', {}).items.map(item => item.id), ['unmatched-workspace-a']);
      assert.deepEqual(repositories.notifications.list('workspace-a', 20).map(item => item.id), ['notification-workspace-a']);
      assert.equal(repositories.answering.countActivity('workspace-a'), 0);
      assert.deepEqual(repositories.conversations.listActive('workspace-a'), []);
      repositories.answering.recordActivity('workspace-a', '2026-09-16', 'web', 'faq:faq-workspace-a');
      assert.equal(repositories.answering.countActivity('workspace-a'), 1);
      assert.equal(repositories.answering.countActivity('workspace-b'), 0);
    });
  } finally {
    store.close();
  }
});

test('Store 兼容门面委托 FAQ 创建、更新和删除并保持 409 冲突', () => {
  const {store} = fixture();
  try {
    store.enterWorkspace('workspace-a');
    seedCategory(store, 'workspace-a');
    const input: FaqInput = {
      question: '门面问题', answer: '门面答案', keywords: ['门面'], category: '测试分类',
      status: 'active', confirmed: true, libraryType: 'answer',
    };

    const created = store.saveFaq(input, '教师');
    assert.equal(created.version, 1);
    const updated = store.saveFaq({...input, answer: '新答案'}, '教师', created.id, created.version);
    assert.equal(updated.version, 2);
    assert.equal(updated.answer, '新答案');

    assert.throws(
      () => store.saveFaq({...input, answer: '过期更新'}, '教师', created.id, created.version),
      (error: unknown) => error instanceof AppError && error.statusCode === 409 && error.code === 'CONFLICT',
    );
    assert.throws(
      () => store.deleteFaq(created.id, '教师', created.version),
      (error: unknown) => error instanceof AppError && error.statusCode === 409 && error.code === 'CONFLICT',
    );
    assert.equal(store.deleteFaq(created.id, '教师', updated.version).id, created.id);
    assert.equal(store.getFaq(created.id), undefined);
  } finally {
    store.close();
  }
});

test('FAQ 乐观版本更新只接受当前版本', () => {
  const {store, unitOfWork} = fixture();
  try {
    seedCategory(store, 'workspace-a');
    seedFaq(store, 'workspace-a', 'faq-a', 100);
    const input: FaqInput = {
      question: '更新后的问题', answer: '更新后的答案', keywords: ['更新'],
      category: '测试分类', status: 'active', confirmed: true, libraryType: 'answer',
    };

    const updated = unitOfWork.transaction(repositories =>
      repositories.knowledge.updateFaq('workspace-a', 'faq-a', 1, input, '教师-a'));
    assert.equal(updated.version, 2);
    assert.throws(
      () => unitOfWork.transaction(repositories =>
        repositories.knowledge.updateFaq('workspace-a', 'faq-a', 1, input, '教师-b')),
      OptimisticConcurrencyError,
    );
    assert.equal(unitOfWork.transaction(repositories => repositories.knowledge.getFaq('workspace-a', 'faq-a'))?.version, 2);
  } finally {
    store.close();
  }
});

test('UnitOfWork 在操作抛错时回滚跨仓储写入', () => {
  const {store, unitOfWork} = fixture();
  try {
    seedCategory(store, 'workspace-a');
    seedFaq(store, 'workspace-a', 'faq-a', 100);
    seedUnmatched(store, 'workspace-a', 'unmatched-a', 100);
    const input: FaqInput = {
      question: '不应保存', answer: '不应保存', keywords: ['回滚'], category: '测试分类',
      status: 'active', confirmed: true, libraryType: 'answer',
    };

    assert.throws(() => unitOfWork.transaction(repositories => {
      repositories.knowledge.updateFaq('workspace-a', 'faq-a', 1, input, '教师');
      assert.equal(repositories.unmatched.resolvePending('workspace-a', 'unmatched-a', 'ignored', null), true);
      throw new Error('强制回滚');
    }), /强制回滚/);

    unitOfWork.transaction(repositories => {
      assert.equal(repositories.knowledge.getFaq('workspace-a', 'faq-a')?.version, 1);
      assert.equal(repositories.unmatched.list('workspace-a', {}).items[0]?.status, 'pending');
    });
  } finally {
    store.close();
  }
});

test('所有现有列表在时间相同时使用 ID 稳定分页', () => {
  const {store, unitOfWork} = fixture();
  try {
    seedCategory(store, 'workspace-a');
    for (const id of ['c', 'a', 'b']) {
      seedFaq(store, 'workspace-a', `faq-${id}`, 100);
      seedUnmatched(store, 'workspace-a', `unmatched-${id}`, 100);
      seedNotification(store, 'workspace-a', `notification-${id}`, 100);
    }
    store.sqlite.prepare(`INSERT INTO unmatched_qq_students(
      question_id, sender_id, sender_name, question_count, first_seen, last_seen
    ) VALUES('unmatched-a', ?, ?, 1, 100, 100)`).run('student-z', '学生 Z');
    store.sqlite.prepare(`INSERT INTO unmatched_qq_students(
      question_id, sender_id, sender_name, question_count, first_seen, last_seen
    ) VALUES('unmatched-a', ?, ?, 1, 100, 100)`).run('student-a', '学生 A');

    unitOfWork.transaction(repositories => {
      assert.deepEqual(repositories.knowledge.listFaqs('workspace-a', {page: 1, pageSize: 2}).items.map(item => item.id), ['faq-a', 'faq-b']);
      assert.deepEqual(repositories.knowledge.listFaqs('workspace-a', {page: 2, pageSize: 2}).items.map(item => item.id), ['faq-c']);
      assert.deepEqual(repositories.unmatched.list('workspace-a', {page: 1, pageSize: 2}).items.map(item => item.id), ['unmatched-a', 'unmatched-b']);
      assert.deepEqual(repositories.unmatched.list('workspace-a', {page: 2, pageSize: 2}).items.map(item => item.id), ['unmatched-c']);
      assert.deepEqual(repositories.unmatched.list('workspace-a', {page: 1, pageSize: 2}).items[0]?.qqStudents.map(student => student.id), ['student-a', 'student-z']);
      assert.deepEqual(repositories.notifications.list('workspace-a', 20).map(item => item.id), ['notification-a', 'notification-b', 'notification-c']);
    });
  } finally {
    store.close();
  }
});

test('两个处理者更新同一待解答记录时只有一个成功', async () => {
  const {store, unitOfWork} = fixture();
  try {
    seedUnmatched(store, 'workspace-a', 'unmatched-a', 100);
    const attempts = await Promise.all([
      Promise.resolve().then(() => unitOfWork.transaction(repositories =>
        repositories.unmatched.resolvePending('workspace-a', 'unmatched-a', 'resolved', null))),
      Promise.resolve().then(() => unitOfWork.transaction(repositories =>
        repositories.unmatched.resolvePending('workspace-a', 'unmatched-a', 'ignored', null))),
    ]);

    assert.equal(attempts.filter(Boolean).length, 1);
    assert.equal(attempts.filter(value => !value).length, 1);
  } finally {
    store.close();
  }
});
