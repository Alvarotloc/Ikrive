import { meSchema } from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { currentUser } from '../../plugins/auth';

export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/me',
    { preHandler: app.authenticate, schema: { response: { 200: meSchema } } },
    async (request) => {
      const { id, name, email, role } = currentUser(request);
      return { id, name, email, role: role === 'admin' ? 'admin' : 'user' } as const;
    },
  );
};
