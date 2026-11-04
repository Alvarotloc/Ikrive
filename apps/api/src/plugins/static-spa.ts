import { basename, resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Files that must always be revalidated: the service worker, the web manifest and the app shell.
 * Otherwise a cached copy could hide a new version of the PWA. Hashed `/assets/*` are left alone.
 */
const ALWAYS_REVALIDATE = new Set(['sw.js', 'manifest.webmanifest', 'index.html']);

/** Serves the built React SPA. The SPA fallback lives in the app not-found handler. */
export default fp(async (app: FastifyInstance, { root }: { root: string }) => {
  await app.register(fastifyStatic, {
    root: resolve(root),
    wildcard: false,
    setHeaders: (reply, path) => {
      if (ALWAYS_REVALIDATE.has(basename(path))) reply.header('cache-control', 'no-cache');
    },
  });
});
