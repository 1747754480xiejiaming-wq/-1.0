import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {createApp} from '../apps/api/src/app.js';

const TRACKED_HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

type JsonObject = Record<string, unknown>;

function countRuntimeRoutes(routeTree: string): number {
  return [...routeTree.matchAll(/\(([^)]+)\)/g)]
    .flatMap((match) => match[1].split(',').map((method) => method.trim()))
    .filter((method) => TRACKED_HTTP_METHODS.has(method)).length;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as JsonObject)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortJson(child)]),
  );
}

function apiVersionFor(outputPath: string, productVersion: string): string {
  return /openapi-v([^/\\]+)\.json$/i.exec(outputPath)?.[1] ?? productVersion;
}

async function exportOpenApi(): Promise<void> {
  const projectRoot = process.cwd();
  const outputPath = resolve(projectRoot, process.argv[2] ?? 'docs/api/openapi.json');
  const runtimeDirectory = mkdtempSync(join(tmpdir(), 'campus-openapi-export-'));
  const product = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as {version: string};
  const {app} = await createApp({
    root: projectRoot,
    dbPath: ':memory:',
    dataDir: join(runtimeDirectory, 'data'),
    localDir: join(runtimeDirectory, '.local'),
    modelStateDir: join(runtimeDirectory, 'models'),
    logger: false,
    modelKey: '',
    botToken: 'openapi-export-bot-token',
    developerKey: 'openapi-export-developer-key',
  });

  try {
    const document = app.swagger() as JsonObject;
    const routeTree = app.printRoutes({commonPrefix: false});
    const info = document.info as JsonObject;
    const snapshot = sortJson({
      ...document,
      info: {...info, version: apiVersionFor(outputPath, product.version)},
      'x-runtime-route-count': countRuntimeRoutes(routeTree),
      // 隐藏的内部路由不进入公开 paths，但完整路由树必须参与兼容性基线。
      'x-runtime-route-tree': routeTree,
    });

    mkdirSync(dirname(outputPath), {recursive: true});
    writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    process.stdout.write(`OpenAPI 已导出：${outputPath}\n`);
  } finally {
    await app.close();
    rmSync(runtimeDirectory, {recursive: true, force: true});
  }
}

await exportOpenApi();
