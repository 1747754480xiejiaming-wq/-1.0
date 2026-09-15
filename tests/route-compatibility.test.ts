import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance, InjectOptions } from 'fastify';
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
  'x-runtime-route-tree'?: string;
};

type AuthHeaders = {cookie:string;'x-csrf-token':string};

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
const faq = (question:string) => ({question,answer:`${question}的标准答案`,keywords:[question],category:'校园服务',status:'active',confirmed:true});

function methodPathSet(document: OpenApiDocument) {
  return new Set(Object.entries(document.paths).flatMap(([path, item]) =>
    Object.keys(item).filter(method => routeMethods.has(method)).map(method => `${method.toUpperCase()} ${path}`),
  ));
}

function assertErrorShape(response: {headers:Record<string,unknown>;json():unknown}, code: string) {
  assert.match(String(response.headers['content-type']), /^application\/json/);
  const body = response.json() as { error?: { code?: string; message?: string }; requestId?: string };
  assert.equal(body.error?.code, code);
  assert.equal(typeof body.error?.message, 'string');
  assert.ok(body.error!.message!.length > 0);
  assert.equal(typeof body.requestId, 'string');
  assert.ok(body.requestId!.length > 0);
}

async function signIn(app: FastifyInstance, username:string, password:string):Promise<AuthHeaders> {
  const response=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username,password}});
  assert.equal(response.statusCode,200);
  assert.match(String(response.headers['content-type']), /^application\/json/);
  assert.deepEqual(Object.keys(response.json()).sort(),['csrfToken','user']);
  return {cookie:`${response.cookies[0].name}=${response.cookies[0].value}`,'x-csrf-token':response.json().csrfToken};
}

test('显式 v1.0.3 基线保留全部方法、路径和路由注册顺序', async t => {
  assert.equal(routeRegistrars.length, 7);
  const frozen = JSON.parse(readFileSync('docs/api/openapi-v1.0.3.json', 'utf8')) as OpenApiDocument;
  const { app } = await createApp({ dbPath: ':memory:', logger: false, modelKey: '', botToken: 'route-compatibility-token' });
  t.after(() => app.close());
  assert.deepEqual(methodPathSet(app.swagger() as OpenApiDocument), methodPathSet(frozen));
  assert.equal(app.printRoutes({commonPrefix:false}),frozen['x-runtime-route-tree']);
});

test('onRequest 为公开和失败请求预置匿名请求上下文', async t => {
  const source=readFileSync('apps/api/src/app.ts','utf8');
  assert.match(source,/addHook\('onRequest'/,'app.ts 必须在 onRequest 初始化请求上下文');
  const {app}=await createApp({dbPath:':memory:',logger:false,modelKey:'',botToken:'route-context-token'});
  t.after(()=>app.close());
  assert.equal(app.hasRequestDecorator('campusContext'),true);
  assert.equal((await app.inject('/api/v1/health/live')).statusCode,200);
  const missing=await app.inject('/api/v1/not-found');
  assert.equal(missing.statusCode,404);
  assertErrorShape(missing,'NOT_FOUND');
});

test('v1.0.3 守卫矩阵保持认证、Origin、CSRF、角色和开发者解锁语义',async t=>{
  const {app,store}=await createApp({dbPath:':memory:',logger:false,modelKey:'',botToken:'route-compatibility-token',developerUsername:'route-developer',developerPassword:'developer-password-123'});
  t.after(()=>app.close());
  store.setAdmin('route-teacher',await hashPassword('route-password-123'));
  const teacher=await signIn(app,'route-teacher','route-password-123');
  const developer=await signIn(app,'route-developer','developer-password-123');
  const cases:{name:string;request:InjectOptions;status:number;code:string}[]=[
    {name:'session',request:{url:'/api/v1/faqs'},status:401,code:'UNAUTHORIZED'},
    {name:'teacher read',request:{url:'/api/v1/faqs',headers:developer},status:403,code:'TEACHER_REQUIRED'},
    {name:'teacher write CSRF',request:{method:'POST',url:'/api/v1/faqs',headers:{cookie:teacher.cookie},payload:faq('缺少 CSRF')},status:403,code:'CSRF_REJECTED'},
    {name:'Origin',request:{method:'POST',url:'/api/v1/faqs',headers:{...teacher,origin:'https://untrusted.example'},payload:faq('非法来源')},status:403,code:'ORIGIN_REJECTED'},
    {name:'developer account',request:{url:'/api/v1/developer/accounts',headers:teacher},status:403,code:'DEVELOPER_REQUIRED'},
    {name:'developer unlock',request:{method:'POST',url:'/api/v1/admin/models/deepseek/connect',headers:teacher,payload:{}},status:403,code:'DEVELOPER_LOCKED'},
    {name:'QQ bot',request:{method:'POST',url:'/api/v1/internal/qq/answer',payload:{question:'选课时间',requestId:'route-compatibility'}},status:401,code:'BOT_UNAUTHORIZED'},
  ];
  for(const item of cases){const response=await app.inject(item.request);assert.equal(response.statusCode,item.status,item.name);assertErrorShape(response,item.code);}
  const accounts=await app.inject({url:'/api/v1/developer/accounts',headers:developer});
  assert.equal(accounts.statusCode,200);
  assert.ok(Array.isArray(accounts.json().items));
});

test('成功状态和关键字段矩阵覆盖公开、会话、知识、RAG、资料、通知和下载',async t=>{
  const {app,store}=await createApp({dbPath:':memory:',logger:false,modelKey:'',botToken:'route-success-token'});
  t.after(()=>app.close());
  store.setAdmin('route-success-teacher',await hashPassword('route-password-123'));
  const headers=await signIn(app,'route-success-teacher','route-password-123');
  const created=await app.inject({method:'POST',url:'/api/v1/faqs',headers,payload:faq('成功矩阵问题')});
  assert.equal(created.statusCode,201);
  assert.equal(typeof created.json().id,'string');
  assert.equal(created.json().version,1);
  const cases:{name:string;request:InjectOptions;status:number;keys:string[]}[]=[
    {name:'public',request:{url:'/api/v1/health/live'},status:200,keys:['ok']},
    {name:'session',request:{url:'/api/v1/auth/session',headers},status:200,keys:['csrfToken','user']},
    {name:'FAQ page',request:{url:'/api/v1/faqs',headers},status:200,keys:['items','page','pageSize','total']},
    {name:'knowledge',request:{url:'/api/v1/knowledge/categories?libraryType=answer',headers},status:200,keys:['items']},
    {name:'RAG',request:{url:'/api/v1/rag/tree',headers},status:200,keys:['documents','folders']},
    {name:'materials',request:{url:'/api/v1/admin/materials/categories',headers},status:200,keys:['items']},
    {name:'notifications',request:{url:'/api/v1/admin/notifications',headers},status:200,keys:['items']},
  ];
  for(const item of cases){const response=await app.inject(item.request);assert.equal(response.statusCode,item.status,item.name);assert.match(String(response.headers['content-type']),/^application\/json/);assert.deepEqual(Object.keys(response.json()).sort(),item.keys.sort(),item.name);}
  const invalid=await app.inject({method:'POST',url:'/api/v1/faqs',headers,payload:{}});
  assert.equal(invalid.statusCode,400);
  assertErrorShape(invalid,'INVALID_INPUT');
  const duplicate=await app.inject({method:'POST',url:'/api/v1/faqs',headers,payload:faq('成功矩阵问题')});
  assert.equal(duplicate.statusCode,409);
  assertErrorShape(duplicate,'DUPLICATE_FAQ');
  const download=await app.inject({url:'/api/v1/faqs/export.xlsx',headers});
  assert.equal(download.statusCode,200);
  assert.match(String(download.headers['content-type']),/spreadsheetml/);
  assert.match(String(download.headers['content-disposition']),/attachment/);
  assert.ok(download.rawPayload.length>0);
});

test('合法 QQ 凭证绑定机器人工作区且并发教师请求不串工作区',async t=>{
  const {app,store}=await createApp({dbPath:':memory:',logger:false,modelKey:'',botToken:'workspace-bot-token',registrationCode:'workspace-registration'});
  t.after(()=>app.close());
  const register=async(username:string,password:string)=>{
    const response=await app.inject({method:'POST',url:'/api/v1/auth/register',payload:{username,password,registrationCode:'workspace-registration'}});
    assert.equal(response.statusCode,201);
    return {headers:{cookie:`${response.cookies[0].name}=${response.cookies[0].value}`,'x-csrf-token':response.json().csrfToken} as AuthHeaders,workspaceId:store.getSession(response.cookies[0].value)!.workspaceId};
  };
  const first=await register('并发学院甲','workspace-password-123');
  const second=await register('并发学院乙','workspace-password-456');
  await app.inject({method:'PATCH',url:'/api/v1/unmatched/preferences',headers:first.headers,payload:{offlineAutoReply:false}});
  await app.inject({method:'PATCH',url:'/api/v1/unmatched/preferences',headers:second.headers,payload:{offlineAutoReply:true}});
  assert.ok(first.workspaceId);
  store.setBotWorkspace(first.workspaceId);
  const qq=await app.inject({url:'/api/v1/internal/qq/offline/preferences',headers:{authorization:'Bearer workspace-bot-token'}});
  assert.equal(qq.statusCode,200);
  assert.equal(qq.json().offlineAutoReply,false);
  const [createdFirst,createdSecond]=await Promise.all([
    app.inject({method:'POST',url:'/api/v1/faqs',headers:first.headers,payload:faq('甲乙可同名问题')}),
    app.inject({method:'POST',url:'/api/v1/faqs',headers:second.headers,payload:faq('甲乙可同名问题')}),
  ]);
  assert.deepEqual([createdFirst.statusCode,createdSecond.statusCode],[201,201]);
  const reads=await Promise.all(Array.from({length:40},(_,index)=>app.inject({url:'/api/v1/faqs?libraryType=answer',headers:index%2?second.headers:first.headers})));
  for(const [index,response] of reads.entries()){
    assert.equal(response.statusCode,200);
    assert.equal(response.json().total,1);
    assert.equal(response.json().items[0].question,'甲乙可同名问题');
    assert.equal(response.json().items[0].id,index%2?createdSecond.json().id:createdFirst.json().id);
  }
});
