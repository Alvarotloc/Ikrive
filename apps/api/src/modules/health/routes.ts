import { healthSchema } from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { APP_VERSION } from '../../lib/version';

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/health', { schema: { response: { 200: healthSchema } } }, async () => ({
    status: 'ok' as const,
    version: APP_VERSION,
  }));
};
