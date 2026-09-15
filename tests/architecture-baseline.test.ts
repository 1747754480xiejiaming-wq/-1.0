import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import test from 'node:test';
import {createApp} from '../apps/api/src/app.js';

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

type OpenApiOperation = {
  responses?: Record<string, unknown>;
};

type OpenApiDocument = {
  paths?: Record<string, Partial<Record<string, OpenApiOperation>>>;
  'x-runtime-route-count'?: number;
  'x-runtime-route-tree'?: string;
};

function countRuntimeRoutes(routeTree: string): number {
  return [...routeTree.matchAll(/\(([^)]+)\)/g)]
    .flatMap((match) => match[1].split(',').map((method) => method.trim()))
    .filter((method) => HTTP_METHODS.has(method)).length;
}

function documentedOperations(document: OpenApiDocument): string[] {
  return Object.entries(document.paths ?? {})
    .flatMap(([path, pathItem]) => Object.keys(pathItem).map((method) => `${method.toUpperCase()} ${path}`))
    .filter((operation) => HTTP_METHODS.has(operation.split(' ', 1)[0]))
    .sort();
}

test('冻结 v1.0.3 API、回答契约和构建入口', async (t) => {
  const projectRoot = resolve(import.meta.dirname, '..');
  const exportScript = join(projectRoot, 'scripts', 'export-openapi.ts');
  const snapshotPath = join(projectRoot, 'docs', 'api', 'openapi-v1.0.3.json');

  assert.equal(existsSync(exportScript), true, '缺少 OpenAPI 导出脚本');
  assert.equal(existsSync(snapshotPath), true, '缺少 v1.0.3 OpenAPI 冻结快照');
  assert.equal(
    existsSync(join(projectRoot, 'openapi.json')),
    false,
    '根目录存在可能与冻结快照冲突的旧 OpenAPI 文件',
  );

  const runtimeDirectory = mkdtempSync(join(tmpdir(), 'campus-architecture-baseline-'));
  const {app} = await createApp({
    dbPath: ':memory:',
    dataDir: join(runtimeDirectory, 'data'),
    localDir: join(runtimeDirectory, '.local'),
    modelStateDir: join(runtimeDirectory, 'models'),
    logger: false,
    modelKey: '',
    botToken: 'architecture-baseline-bot-token',
    developerKey: 'architecture-baseline-developer-key',
  });
  t.after(async () => {
    await app.close();
    rmSync(runtimeDirectory, {recursive: true, force: true});
  });

  const runtimeDocument = app.swagger() as OpenApiDocument;
  const runtimeRouteTree = app.printRoutes({commonPrefix: false});
  const runtimeRouteCount = countRuntimeRoutes(runtimeRouteTree);
  const frozenDocument = JSON.parse(readFileSync(snapshotPath, 'utf8')) as OpenApiDocument;

  assert.equal(runtimeRouteCount, 96, 'v1.0.3 业务路由数量发生变化');
  assert.equal(frozenDocument['x-runtime-route-count'], runtimeRouteCount);
  assert.equal(frozenDocument['x-runtime-route-tree'], runtimeRouteTree);
  assert.deepEqual(documentedOperations(frozenDocument), documentedOperations(runtimeDocument));

  const webResponse = runtimeDocument.paths?.['/api/v1/admin/answer/test']?.post?.responses?.['200'];
  const qqResponse = runtimeDocument.paths?.['/api/v1/internal/qq/answer']?.post?.responses?.['200'];
  assert.deepEqual(webResponse, qqResponse, 'Web 与 QQ 回答成功响应契约不一致');

  for (const entry of [
    'apps/api/src/server.ts',
    'apps/qq-bot/src/index.ts',
    'apps/web/src/main.tsx',
  ]) {
    assert.equal(existsSync(join(projectRoot, entry)), true, `缺少构建入口：${entry}`);
  }
});

test('开发产物、运行数据和凭据不会进入 Git', () => {
  const projectRoot = resolve(import.meta.dirname, '..');
  const ignoredPaths = [
    'work/render/page-1.png',
    'data/campus.db',
    '.local/runtime-secrets.json',
    'qa/load-peak/result.json',
    'docs/rendered/page-1.png',
    'logs/runtime.jsonl',
  ];

  const ignoredOutput = execFileSync(
    'git',
    ['check-ignore', '--no-index', ...ignoredPaths],
    {cwd: projectRoot, encoding: 'utf8'},
  );

  assert.deepEqual(
    ignoredOutput.trim().split(/\r?\n/).sort(),
    ignoredPaths.sort(),
    '存在可能被误提交的本地运行文件',
  );
});
