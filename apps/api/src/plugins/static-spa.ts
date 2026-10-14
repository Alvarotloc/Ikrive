import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

/** Serves the built React SPA. The SPA fallback lives in the app not-found handler. */
export default fp(async (app: FastifyInstance, { root }: { root: string }) => {
  await app.register(fastifyStatic, { root: resolve(root), wildcard: false });
});
