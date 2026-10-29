import {
  createFuelLogSchema,
  fuelLogParamsSchema,
  fuelLogSchema,
  idParamSchema,
  updateFuelLogSchema,
} from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUser } from '../../plugins/auth';
import type { FuelLogsService } from './service';

export const fuelLogsRoutes: FastifyPluginAsyncZod<{ service: FuelLogsService }> = async (
  app,
  { service },
) => {
  app.addHook('preHandler', app.authenticate);

  app.get(
    '/vehicles/:id/fuel-logs',
    { schema: { params: idParamSchema, response: { 200: z.array(fuelLogSchema) } } },
    async (request) => service.list(currentUser(request).id, request.params.id),
  );

  app.post(
    '/vehicles/:id/fuel-logs',
    { schema: { params: idParamSchema, body: createFuelLogSchema, response: { 201: fuelLogSchema } } },
    async (request, reply) =>
      reply.status(201).send(service.create(currentUser(request).id, request.params.id, request.body)),
  );

  app.get(
    '/vehicles/:id/fuel-logs/:logId',
    { schema: { params: fuelLogParamsSchema, response: { 200: fuelLogSchema } } },
    async (request) => {
      const { id, logId } = request.params;
      return service.get(currentUser(request).id, id, logId);
    },
  );

  app.patch(
    '/vehicles/:id/fuel-logs/:logId',
    {
      schema: { params: fuelLogParamsSchema, body: updateFuelLogSchema, response: { 200: fuelLogSchema } },
    },
    async (request) => {
      const { id, logId } = request.params;
      return service.update(currentUser(request).id, id, logId, request.body);
    },
  );

  app.delete(
    '/vehicles/:id/fuel-logs/:logId',
    { schema: { params: fuelLogParamsSchema } },
    async (request, reply) => {
      const { id, logId } = request.params;
      service.remove(currentUser(request).id, id, logId);
      return reply.status(204).send();
    },
  );
};
