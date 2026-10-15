import {
  createMaintenanceRecordSchema,
  idParamSchema,
  maintenanceRecordParamsSchema,
  maintenanceRecordSchema,
  updateMaintenanceRecordSchema,
} from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUser } from '../../plugins/auth';
import type { MaintenanceService } from './service';

export const maintenanceRoutes: FastifyPluginAsyncZod<{ service: MaintenanceService }> = async (
  app,
  { service },
) => {
  app.addHook('preHandler', app.authenticate);

  app.get(
    '/vehicles/:id/maintenance',
    { schema: { params: idParamSchema, response: { 200: z.array(maintenanceRecordSchema) } } },
    async (request) => service.list(currentUser(request).id, request.params.id),
  );

  app.post(
    '/vehicles/:id/maintenance',
    {
      schema: {
        params: idParamSchema,
        body: createMaintenanceRecordSchema,
        response: { 201: maintenanceRecordSchema },
      },
    },
    async (request, reply) =>
      reply.status(201).send(service.create(currentUser(request).id, request.params.id, request.body)),
  );

  app.get(
    '/vehicles/:id/maintenance/:recordId',
    { schema: { params: maintenanceRecordParamsSchema, response: { 200: maintenanceRecordSchema } } },
    async (request) => {
      const { id, recordId } = request.params;
      return service.get(currentUser(request).id, id, recordId);
    },
  );

  app.patch(
    '/vehicles/:id/maintenance/:recordId',
    {
      schema: {
        params: maintenanceRecordParamsSchema,
        body: updateMaintenanceRecordSchema,
        response: { 200: maintenanceRecordSchema },
      },
    },
    async (request) => {
      const { id, recordId } = request.params;
      return service.update(currentUser(request).id, id, recordId, request.body);
    },
  );

  app.delete(
    '/vehicles/:id/maintenance/:recordId',
    { schema: { params: maintenanceRecordParamsSchema } },
    async (request, reply) => {
      const { id, recordId } = request.params;
      await service.remove(currentUser(request).id, id, recordId);
      return reply.status(204).send();
    },
  );
};
