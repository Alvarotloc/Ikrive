import { clientConfigSchema } from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

/** Read-only server configuration for the SPA. Its only consumer lives behind the login. */
export const clientConfigRoutes: FastifyPluginAsyncZod<{ maxUploadMb: number }> = async (
  app,
  { maxUploadMb },
) => {
  app.get(
    '/config',
    { preHandler: app.authenticate, schema: { response: { 200: clientConfigSchema } } },
    async () => ({ maxUploadMb }),
  );
};
