import {
  createOdometerReadingSchema,
  createVehicleSchema,
  idParamSchema,
  odometerReadingSchema,
  updateVehicleSchema,
  vehicleListQuerySchema,
  vehicleOdometerParamsSchema,
  vehicleSchema,
} from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { BadRequestError } from '../../lib/errors';
import { receiveToBuffer } from '../../lib/uploads';
import { currentUser } from '../../plugins/auth';
import type { VehiclesService } from './service';

export const vehiclesRoutes: FastifyPluginAsyncZod<{ service: VehiclesService }> = async (
  app,
  { service },
) => {
  app.addHook('preHandler', app.authenticate);

  app.get(
    '/vehicles',
    { schema: { querystring: vehicleListQuerySchema, response: { 200: z.array(vehicleSchema) } } },
    async (request) => service.list(currentUser(request).id, request.query),
  );

  app.post(
    '/vehicles',
    { schema: { body: createVehicleSchema, response: { 201: vehicleSchema } } },
    async (request, reply) => reply.status(201).send(service.create(currentUser(request).id, request.body)),
  );

  app.get(
    '/vehicles/:id',
    { schema: { params: idParamSchema, response: { 200: vehicleSchema } } },
    async (request) => service.get(currentUser(request).id, request.params.id),
  );

  app.patch(
    '/vehicles/:id',
    { schema: { params: idParamSchema, body: updateVehicleSchema, response: { 200: vehicleSchema } } },
    async (request) => service.update(currentUser(request).id, request.params.id, request.body),
  );

  app.delete('/vehicles/:id', { schema: { params: idParamSchema } }, async (request, reply) => {
    await service.remove(currentUser(request).id, request.params.id);
    return reply.status(204).send();
  });

  app.get('/vehicles/:id/photo', { schema: { params: idParamSchema } }, async (request, reply) => {
    const stream = service.openPhoto(currentUser(request).id, request.params.id);
    // The URL carries a version, so the browser may keep the image for good.
    return reply
      .type('image/webp')
      .header('cache-control', 'private, max-age=31536000, immutable')
      .send(stream);
  });

  app.put(
    '/vehicles/:id/photo',
    { schema: { params: idParamSchema, response: { 200: vehicleSchema } } },
    async (request) => {
      const file = await request.file();
      if (!file) throw new BadRequestError('Expected an image file in the "file" field');
      return service.setPhoto(currentUser(request).id, request.params.id, await receiveToBuffer(file));
    },
  );

  app.delete(
    '/vehicles/:id/photo',
    { schema: { params: idParamSchema, response: { 200: vehicleSchema } } },
    async (request) => service.removePhoto(currentUser(request).id, request.params.id),
  );

  app.get(
    '/vehicles/:id/odometer',
    { schema: { params: idParamSchema, response: { 200: z.array(odometerReadingSchema) } } },
    async (request) => service.listReadings(currentUser(request).id, request.params.id),
  );

  app.post(
    '/vehicles/:id/odometer',
    {
      schema: {
        params: idParamSchema,
        body: createOdometerReadingSchema,
        response: { 201: odometerReadingSchema },
      },
    },
    async (request, reply) =>
      reply.status(201).send(service.addReading(currentUser(request).id, request.params.id, request.body)),
  );

  app.delete(
    '/vehicles/:id/odometer/:readingId',
    { schema: { params: vehicleOdometerParamsSchema } },
    async (request, reply) => {
      const { id, readingId } = request.params;
      service.removeReading(currentUser(request).id, id, readingId);
      return reply.status(204).send();
    },
  );
};
