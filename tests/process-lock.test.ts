import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { acquireProcessLock } from '../apps/api/src/process-lock.js';

function lockPath() {
  const directory = mkdtempSync(join(tmpdir(), 'campus-process-lock-'));
  mkdirSync(directory, { recursive: true });
  return join(directory, 'api.pid');
}

test('清理已被其他程序复用的旧版 PID 锁', () => {
  const file = lockPath();
  writeFileSync(file, String(process.pid));
  const old = new Date(Date.now() - 10 * 60_000);
  utimesSync(file, old, old);

  const lock = acquireProcessLock(file, { legacyGraceMs: 1_000 });
  assert.ok(lock);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).pid, process.pid);
  lock.release();
  assert.equal(existsSync(file), false);
});

test('保留仍有心跳的当前 API 锁', () => {
  const file = lockPath();
  const first = acquireProcessLock(file, { heartbeatMs: 60_000 });
  assert.ok(first);
  assert.equal(acquireProcessLock(file), null);
  first.release();
});

test('陈旧的新格式锁不会因 PID 复用而阻止启动', () => {
  const file = lockPath();
  const now = Date.now();
  writeFileSync(file, JSON.stringify({ pid: process.pid, startedAt: now - 60_000, heartbeatAt: now - 60_000 }));
  const lock = acquireProcessLock(file, { staleAfterMs: 1_000 });
  assert.ok(lock);
  lock.release();
});
