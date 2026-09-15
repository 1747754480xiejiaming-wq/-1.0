import {createHash} from 'node:crypto';

export function normalizeLineEndings(source: string | Buffer): string {
  return source.toString().replace(/\r\n?/g, '\n');
}

/**
 * Git 在不同工作区可能切换 LF/CRLF。哈希只反映 OpenAPI 内容，不反映本地换行策略。
 */
export function openApiSourceHash(source: string | Buffer): string {
  return createHash('sha256').update(normalizeLineEndings(source), 'utf8').digest('hex');
}
