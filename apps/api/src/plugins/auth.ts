import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Auth, SessionUser } from '../auth';
import { ForbiddenError, UnauthorizedError } from '../lib/errors';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
  interface FastifyInstance {
    /** preHandler that rejects unauthenticated requests and populates `request.user`. */
    authenticate: (request: FastifyRequest) => Promise<void>;
    /** preHandler like `authenticate` that also rejects users without the `admin` role (403). */
    requireAdmin: (request: FastifyRequest) => Promise<void>;
  }
}

/** Returns the authenticated user. Use only in routes protected by `app.authenticate`. */
export function currentUser(request: FastifyRequest): SessionUser {
  if (!request.user) throw new UnauthorizedError();
  return request.user;
}

/**
 * Union of two comma-separated header lists, without case-insensitive duplicates. Used so Better
 * Auth's `Access-Control-Expose-Headers` (bearer adds `set-auth-token`) does not overwrite the one
 * set by the CORS plugin.
 */
function mergeHeaderList(current: unknown, added: string): string {
  const existing = Array.isArray(current) ? current.join(',') : typeof current === 'string' ? current : '';
  const merged = new Map<string, string>();
  for (const name of `${existing},${added}`.split(',')) {
    const trimmed = name.trim();
    if (trimmed && !merged.has(trimmed.toLowerCase())) merged.set(trimmed.toLowerCase(), trimmed);
  }
  return [...merged.values()].join(', ');
}

export default fp(async (app: FastifyInstance, { auth }: { auth: Auth }) => {
  app.decorateRequest('user', null);

  app.decorate('authenticate', async (request: FastifyRequest) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw new UnauthorizedError();
    request.user = session.user;
  });

  app.decorate('requireAdmin', async (request: FastifyRequest) => {
    await app.authenticate(request);
    if (currentUser(request).role !== 'admin') throw new ForbiddenError();
  });

  // Bridge Fastify <-> Better Auth's Fetch-based handler.
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, `${request.protocol}://${request.host}`);
      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          body: request.body === undefined ? undefined : JSON.stringify(request.body),
        }),
      );
      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key === 'set-cookie') return;
        if (key === 'access-control-expose-headers') {
          reply.header(key, mergeHeaderList(reply.getHeader(key), value));
          return;
        }
        reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header('set-cookie', cookies);
      return reply.send(response.body ? await response.text() : null);
    },
  });
});
