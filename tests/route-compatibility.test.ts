import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../apps/api/src/app.js';
import { registerAuthRoutes } from '../apps/api/src/modules/auth/routes.js';
import { registerKnowledgeRoutes } from '../apps/api/src/modules/knowledge/routes.js';
import { registerAnsweringRoutes } from '../apps/api/src/modules/answering/routes.js';
import { registerConversationRoutes } from '../apps/api/src/modules/conversations/routes.js';
import { registerUnmatchedRoutes } from '../apps/api/src/modules/unmatched/routes.js';
import { registerNotificationRoutes } from '../apps/api/src/modules/notifications/routes.js';
import { registerOperationRoutes } from '../apps/api/src/modules/operations/routes.js';
import { hashPassword } from '../apps/api/src/services/auth.js';

type OpenApiDocument = {
  paths: Record<string, Record<string, unknown>>;
};

const routeMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);
const routeRegistrars: Array<(app: FastifyInstance, context: never) => void> = [
  registerAuthRoutes,
  registerKnowledgeRoutes,
  registerAnsweringRoutes,
  registerConversationRoutes,
  registerUnmatchedRoutes,
  registerNotificationRoutes,
  registerOperationRoutes,
];

function methodPathSet(document: OpenApiDocument) {
  return new Set(Object.entries(document.paths).flatMap(([path, item]) =>
    Object.keys(item).filter(method => routeMethods.has(method)).map(method => `${method.toUpperCase()} ${path}`),
  ));
}

function assertErrorShape(payload: unknown, code: string) {
  assert.equal(typeof payload, 'object');
  const body = payload as { error?: { code?: string; message?: string }; requestId?: string };
  assert.equal(body.error?.code, code);
  assert.equal(typeof body.error?.message, 'string');
  assert.ok(body.error!.message!.length > 0);
  assert.equal(typeof body.requestId, 'string');
  assert.ok(body.requestId!.length > 0);
}

test('v1.0.3 OpenAPI 的方法和路径由七个领域路由模块完整保留', async t => {
  assert.equal(routeRegistrars.length, 7);
  const frozen = JSON.parse(readFileSync('docs/api/openapi-v1.0.3.json', 'utf8')) as OpenApiDocument;
  const { app } = await createApp({ dbPath: ':memory:', logger: false, modelKey: '', botToken: 'route-compatibility-token' });
  t.after(() => app.close());
  assert.deepEqual(methodPathSet(app.swagger() as OpenApiDocument), methodPathSet(frozen));
});

test('公开、会话、教师写入和 QQ 服务鉴权兼容 v1.0.3', async t => {
  const { app, store } = await createApp({ dbPath: ':memory:', logger: false, modelKey: '', botToken: 'route-compatibility-token' });
  t.after(() => app.close());
  store.setAdmin('route-teacher', await hashPassword('route-password-123'));

  const live = await app.inject('/api/v1/health/live');
  assert.equal(live.statusCode, 200);
  assert.deepEqual(live.json(), { ok: true });

  const anonymous = await app.inject('/api/v1/faqs');
  assert.equal(anonymous.statusCode, 401);
  assertErrorShape(anonymous.json(), 'UNAUTHORIZED');

  const botAnonymous = await app.inject({ method: 'POST', url: '/api/v1/internal/qq/answer', payload: { question: '选课时间', requestId: 'route-compatibility' } });
  assert.equal(botAnonymous.statusCode, 401);
  assertErrorShape(botAnonymous.json(), 'BOT_UNAUTHORIZED');

  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: 'route-teacher', password: 'route-password-123' } });
  assert.equal(login.statusCode, 200);
  assert.match(String(login.headers['content-type']), /^application\/json/);
  assert.deepEqual(Object.keys(login.json()).sort(), ['csrfToken', 'user']);
  const cookie = `${login.cookies[0].name}=${login.cookies[0].value}`;
  const faq = {question:'路由兼容问题',answer:'路由兼容答案',keywords:['路由兼容'],category:'校园服务',status:'active',confirmed:true};

  const missingCsrf = await app.inject({ method: 'POST', url: '/api/v1/faqs', headers: { cookie }, payload: faq });
  assert.equal(missingCsrf.statusCode, 403);
  assertErrorShape(missingCsrf.json(), 'CSRF_REJECTED');

  const invalid = await app.inject({ method: 'POST', url: '/api/v1/faqs', headers: { cookie, 'x-csrf-token': login.json().csrfToken }, payload: {} });
  assert.equal(invalid.statusCode, 400);
  assertErrorShape(invalid.json(), 'INVALID_INPUT');

  const headers = {cookie, 'x-csrf-token': login.json().csrfToken};
  const created = await app.inject({method:'POST',url:'/api/v1/faqs',headers,payload:faq});
  assert.equal(created.statusCode, 201);
  assert.equal(typeof created.json().id, 'string');
  assert.equal(created.json().version, 1);
  const duplicate = await app.inject({method:'POST',url:'/api/v1/faqs',headers,payload:faq});
  assert.equal(duplicate.statusCode, 409);
  assertErrorShape(duplicate.json(), 'DUPLICATE_FAQ');

  const list = await app.inject({url:'/api/v1/faqs',headers});
  assert.equal(list.statusCode, 200);
  assert.deepEqual(Object.keys(list.json()).sort(), ['items','page','pageSize','total']);
  const download = await app.inject({url:'/api/v1/faqs/export.xlsx',headers});
  assert.equal(download.statusCode, 200);
  assert.match(String(download.headers['content-type']), /spreadsheetml/);
  assert.match(String(download.headers['content-disposition']), /attachment/);
});
