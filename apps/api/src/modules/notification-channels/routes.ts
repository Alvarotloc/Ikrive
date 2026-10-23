import {
  createNotificationChannelSchema,
  idParamSchema,
  notificationChannelSchema,
  notificationChannelTestResultSchema,
  updateNotificationChannelSchema,
} from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUser } from '../../plugins/auth';
import type { NotificationChannelsService } from './service';

export const notificationChannelsRoutes: FastifyPluginAsyncZod<{
  service: NotificationChannelsService;
}> = async (app, { service }) => {
  app.addHook('preHandler', app.authenticate);

  app.get(
    '/notification-channels',
    { schema: { response: { 200: z.array(notificationChannelSchema) } } },
    async (request) => service.list(currentUser(request).id),
  );

  app.post(
    '/notification-channels',
    { schema: { body: createNotificationChannelSchema, response: { 201: notificationChannelSchema } } },
    async (request, reply) => reply.status(201).send(service.create(currentUser(request).id, request.body)),
  );

  app.patch(
    '/notification-channels/:id',
    {
      schema: {
        params: idParamSchema,
        body: updateNotificationChannelSchema,
        response: { 200: notificationChannelSchema },
      },
    },
    async (request) => service.update(currentUser(request).id, request.params.id, request.body),
  );

  app.delete('/notification-channels/:id', { schema: { params: idParamSchema } }, async (request, reply) => {
    service.remove(currentUser(request).id, request.params.id);
    return reply.status(204).send();
  });

  app.post(
    '/notification-channels/:id/test',
    { schema: { params: idParamSchema, response: { 200: notificationChannelTestResultSchema } } },
    async (request) => service.test(currentUser(request).id, request.params.id),
  );
};
