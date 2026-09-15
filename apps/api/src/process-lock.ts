import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';

interface LockRecord {
  pid: number;
  startedAt: number;
  heartbeatAt: number;
}

export interface ProcessLock {
  release(): void;
}

interface ProcessLockOptions {
  heartbeatMs?: number;
  staleAfterMs?: number;
  legacyGraceMs?: number;
  now?: () => number;
  isProcessAlive?: (pid: number) => boolean;
}

function defaultIsProcessAlive(pid: number) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function parseRecord(value: string): LockRecord | null {
  try {
    const parsed = JSON.parse(value) as Partial<LockRecord>;
    if (
      Number.isSafeInteger(parsed.pid) && Number(parsed.pid) > 0 &&
      Number.isFinite(parsed.startedAt) && Number(parsed.startedAt) > 0 &&
      Number.isFinite(parsed.heartbeatAt) && Number(parsed.heartbeatAt) > 0
    ) return parsed as LockRecord;
  } catch {}
  return null;
}

function sameOwner(file: string, expected: Pick<LockRecord, 'pid' | 'startedAt'>) {
  if (!existsSync(file)) return false;
  const current = parseRecord(readFileSync(file, 'utf8'));
  return current?.pid === expected.pid && current.startedAt === expected.startedAt;
}

export function acquireProcessLock(file: string, options: ProcessLockOptions = {}): ProcessLock | null {
  const heartbeatMs = options.heartbeatMs ?? 2_000;
  const staleAfterMs = options.staleAfterMs ?? 15_000;
  const legacyGraceMs = options.legacyGraceMs ?? 120_000;
  const now = options.now ?? Date.now;
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;

  if (existsSync(file)) {
    const raw = readFileSync(file, 'utf8').trim();
    const record = parseRecord(raw);
    const legacyPid = Number(raw);
    const active = record
      ? now() - record.heartbeatAt <= staleAfterMs && isProcessAlive(record.pid)
      : Number.isSafeInteger(legacyPid) && legacyPid > 0 && now() - statSync(file).mtimeMs <= legacyGraceMs && isProcessAlive(legacyPid);
    if (active) return null;
    try { unlinkSync(file); } catch (error) {
      if (existsSync(file)) throw error;
    }
  }

  const owner: LockRecord = { pid: process.pid, startedAt: now(), heartbeatAt: now() };
  try {
    writeFileSync(file, JSON.stringify(owner), { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return null;
    throw error;
  }

  const heartbeat = setInterval(() => {
    try {
      if (!sameOwner(file, owner)) return;
      owner.heartbeatAt = now();
      writeFileSync(file, JSON.stringify(owner));
    } catch {}
  }, heartbeatMs);
  heartbeat.unref();

  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      clearInterval(heartbeat);
      try {
        if (sameOwner(file, owner)) unlinkSync(file);
      } catch {}
    },
  };
}
