import {
  createMaintenanceScheduleSchema,
  idParamSchema,
  maintenanceScheduleParamsSchema,
  maintenanceScheduleSchema,
  updateMaintenanceScheduleSchema,
} from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUser } from '../../plugins/auth';
import type { SchedulesService } from './service';

export const schedulesRoutes: FastifyPluginAsyncZod<{ service: SchedulesService }> = async (
  app,
  { service },
) => {
  app.addHook('preHandler', app.authenticate);

  app.get(
    '/vehicles/:id/schedules',
    { schema: { params: idParamSchema, response: { 200: z.array(maintenanceScheduleSchema) } } },
    async (request) => service.list(currentUser(request).id, request.params.id),
  );

  app.post(
    '/vehicles/:id/schedules',
    {
      schema: {
        params: idParamSchema,
        body: createMaintenanceScheduleSchema,
        response: { 201: maintenanceScheduleSchema },
      },
    },
    async (request, reply) =>
      reply.status(201).send(service.create(currentUser(request).id, request.params.id, request.body)),
  );

  app.get(
    '/vehicles/:id/schedules/:scheduleId',
    { schema: { params: maintenanceScheduleParamsSchema, response: { 200: maintenanceScheduleSchema } } },
    async (request) => {
      const { id, scheduleId } = request.params;
      return service.get(currentUser(request).id, id, scheduleId);
    },
  );

  app.patch(
    '/vehicles/:id/schedules/:scheduleId',
    {
      schema: {
        params: maintenanceScheduleParamsSchema,
        body: updateMaintenanceScheduleSchema,
        response: { 200: maintenanceScheduleSchema },
      },
    },
    async (request) => {
      const { id, scheduleId } = request.params;
      return service.update(currentUser(request).id, id, scheduleId, request.body);
    },
  );

  app.delete(
    '/vehicles/:id/schedules/:scheduleId',
    { schema: { params: maintenanceScheduleParamsSchema } },
    async (request, reply) => {
      const { id, scheduleId } = request.params;
      service.remove(currentUser(request).id, id, scheduleId);
      return reply.status(204).send();
    },
  );
};
