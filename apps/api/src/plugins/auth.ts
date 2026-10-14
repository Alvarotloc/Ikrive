import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Auth, SessionUser } from '../auth';
import { UnauthorizedError } from '../lib/errors';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
  interface FastifyInstance {
    /** preHandler that rejects unauthenticated requests and populates `request.user`. */
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}

/** Returns the authenticated user. Use only in routes protected by `app.authenticate`. */
export function currentUser(request: FastifyRequest): SessionUser {
  if (!request.user) throw new UnauthorizedError();
  return request.user;
}

export default fp(async (app: FastifyInstance, { auth }: { auth: Auth }) => {
  app.decorateRequest('user', null);

  app.decorate('authenticate', async (request: FastifyRequest) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw new UnauthorizedError();
    request.user = session.user;
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
        if (key !== 'set-cookie') reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header('set-cookie', cookies);
      return reply.send(response.body ? await response.text() : null);
    },
  });
});
