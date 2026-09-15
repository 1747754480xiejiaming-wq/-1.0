import type { FastifyRequest } from 'fastify';
import { AppError } from '../errors.js';
import { constantEqual } from '../services/auth.js';
import type { RouteContext } from './context.js';

export function createGuards(context: RouteContext) {
  const { config, store, botController } = context;

  function origin(req: FastifyRequest) {
    if (req.headers.origin && !config.origins.includes(req.headers.origin)) {
      throw new AppError(403, 'ORIGIN_REJECTED', '请求来源不被允许。');
    }
  }

  async function publicRoute(req: FastifyRequest) {
    req.campusContext = {user:null,role:null,workspaceId:null,csrfToken:null,correlationId:req.id};
  }

  async function session(req: FastifyRequest) {
    const token = req.cookies.campus_session;
    const found = token ? store.getSession(token) : undefined;
    if (!found) throw new AppError(401, 'UNAUTHORIZED', '请先登录。');
    req.campusSession = {user:found.user,csrfToken:found.csrfToken};
    req.campusContext = {user:found.user,role:found.user.role,workspaceId:found.workspaceId||null,csrfToken:found.csrfToken,correlationId:req.id};
    if (found.workspaceId) store.enterWorkspace(found.workspaceId);
  }

  async function teacher(req: FastifyRequest) {
    await session(req);
    if (req.campusSession!.user.role !== 'teacher') throw new AppError(403, 'TEACHER_REQUIRED', '开发者账号不能访问老师业务数据。');
  }

  async function sessionWrite(req: FastifyRequest) {
    await session(req);
    origin(req);
    if (typeof req.headers['x-csrf-token'] !== 'string' || !constantEqual(req.headers['x-csrf-token'], req.campusSession!.csrfToken)) {
      throw new AppError(403, 'CSRF_REJECTED', '页面凭证已失效，请刷新后重试。');
    }
  }

  async function teacherWrite(req: FastifyRequest) {
    await teacher(req);
    origin(req);
    if (typeof req.headers['x-csrf-token'] !== 'string' || !constantEqual(req.headers['x-csrf-token'], req.campusSession!.csrfToken)) {
      throw new AppError(403, 'CSRF_REJECTED', '页面凭证已失效，请刷新后重试。');
    }
  }

  async function developerAccount(req: FastifyRequest) {
    await session(req);
    if (req.campusSession!.user.role !== 'developer') throw new AppError(403, 'DEVELOPER_REQUIRED', '仅开发者账号可以访问账号管理。');
  }

  async function developerAccountWrite(req: FastifyRequest) {
    await sessionWrite(req);
    if (req.campusSession!.user.role !== 'developer') throw new AppError(403, 'DEVELOPER_REQUIRED', '仅开发者账号可以访问账号管理。');
  }

  async function developerUnlock(req: FastifyRequest) {
    await teacherWrite(req);
    if (!store.developerAccess(req.cookies.campus_session!).unlocked) throw new AppError(403, 'DEVELOPER_LOCKED', '请先输入开发者密匙。');
  }

  async function qqService(req: FastifyRequest) {
    const expected = config.botToken;
    if (!expected || !constantEqual(req.headers.authorization||'', `Bearer ${expected}`)) throw new AppError(401, 'BOT_UNAUTHORIZED', '机器人服务凭证无效。');
    const workspaceId = store.botWorkspace();
    store.enterWorkspace(workspaceId);
    req.campusContext = {user:null,role:null,workspaceId,csrfToken:null,correlationId:req.id};
    const appId = req.headers['x-qq-app-id'];
    if (appId && appId !== botController.status().appId) throw new AppError(409, 'BOT_CHANGED', '当前机器人已更换，请停止旧连接。');
  }

  return {
    publicRoute,
    session,
    teacher,
    teacherWrite,
    sessionWrite,
    developerAccount,
    developerAccountWrite,
    developerUnlock,
    qqService,
    origin,
    // Compatibility aliases keep the route extraction mechanical and behavior-preserving.
    admin: teacher,
    adminWrite: teacherWrite,
    developerWrite: developerUnlock,
    bot: qqService,
  };
}

export type RouteGuards = ReturnType<typeof createGuards>;
