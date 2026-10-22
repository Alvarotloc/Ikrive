import {
  idParamSchema,
  notificationListQuerySchema,
  notificationListSchema,
  notificationSchema,
} from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { currentUser } from '../../plugins/auth';
import type { NotificationsService } from './service';

export const notificationsRoutes: FastifyPluginAsyncZod<{ service: NotificationsService }> = async (
  app,
  { service },
) => {
  app.addHook('preHandler', app.authenticate);

  app.get(
    '/notifications',
    { schema: { querystring: notificationListQuerySchema, response: { 200: notificationListSchema } } },
    async (request) => service.list(currentUser(request).id, request.query),
  );

  app.patch(
    '/notifications/:id/read',
    { schema: { params: idParamSchema, response: { 200: notificationSchema } } },
    async (request) => service.markRead(currentUser(request).id, request.params.id),
  );

  app.post('/notifications/read-all', async (request, reply) => {
    service.markAllRead(currentUser(request).id);
    return reply.status(204).send();
  });
};
