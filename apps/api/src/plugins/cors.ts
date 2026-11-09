import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { isApiRequest } from '../lib/http';

/**
 * CORS for the native clients (`TRUSTED_ORIGINS`): only on `/api/*` and only for the listed origins.
 * Without credentials: those clients send the session token in `Authorization`, never the cookie.
 * Any other request (same-origin web, SPA files, other origins) gets no CORS headers, and a
 * preflight from them falls through to the 404 handler.
 */
export default fp(async (app: FastifyInstance, { origins }: { origins: readonly string[] }) => {
  await app.register(cors, {
    delegator: (request, callback) => {
      const origin = request.headers.origin;
      const allowed = isApiRequest(request.url) && origin !== undefined && origins.includes(origin);
      callback(
        null,
        allowed
          ? {
              origin,
              credentials: false,
              methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
              allowedHeaders: ['authorization', 'content-type'],
              exposedHeaders: ['set-auth-token', 'content-disposition'],
              maxAge: 600,
            }
          : { origin: false },
      );
    },
  });
});
