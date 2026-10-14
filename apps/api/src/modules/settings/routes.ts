import { updateUserSettingsSchema, userSettingsSchema } from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { currentUser } from '../../plugins/auth';
import type { SettingsService } from './service';

export const settingsRoutes: FastifyPluginAsyncZod<{ service: SettingsService }> = async (
  app,
  { service },
) => {
  app.addHook('preHandler', app.authenticate);

  app.get('/settings', { schema: { response: { 200: userSettingsSchema } } }, async (request) =>
    service.get(currentUser(request).id),
  );

  app.patch(
    '/settings',
    { schema: { body: updateUserSettingsSchema, response: { 200: userSettingsSchema } } },
    async (request) => service.update(currentUser(request).id, request.body),
  );
};
