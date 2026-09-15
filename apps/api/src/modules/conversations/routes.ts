import type { FastifyInstance } from 'fastify';
import type { RouteContext } from '../../http/context.js';

// v1.0.3 has no public conversation endpoints. This module owns the domain slot so
// later conversation APIs can be added without growing the application bootstrap.
export function registerConversationRoutes(_app: FastifyInstance, _context: RouteContext) {}
