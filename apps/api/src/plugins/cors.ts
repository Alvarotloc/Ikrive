import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { isApiRequest } from '../lib/http';

/**
 * CORS on `/api/*` for the native clients (`CORS_ORIGINS`), which authenticate with a bearer token:
 * no credentials. Any other origin, or a request outside the API, gets no CORS headers, and its
 * preflight falls through to the not-found handler (404).
 */
export default fp(async (app: FastifyInstance, { origins }: { origins: string[] }) => {
  await app.register(cors, {
    delegator(request, callback) {
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
              // `content-disposition` carries the file name of downloads (`api.download`).
              exposedHeaders: ['set-auth-token', 'content-disposition'],
              maxAge: 600,
            }
          : { origin: false },
      );
    },
  });
});
