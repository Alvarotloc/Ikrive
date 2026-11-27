import {
  createVehicleDocumentSchema,
  idParamSchema,
  updateVehicleDocumentSchema,
  vehicleDocumentParamsSchema,
  vehicleDocumentSchema,
} from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentUser } from '../../plugins/auth';
import type { DocumentsService } from './service';

export const documentsRoutes: FastifyPluginAsyncZod<{ service: DocumentsService }> = async (
  app,
  { service },
) => {
  app.addHook('preHandler', app.authenticate);

  app.get(
    '/vehicles/:id/documents',
    { schema: { params: idParamSchema, response: { 200: z.array(vehicleDocumentSchema) } } },
    async (request) => service.list(currentUser(request).id, request.params.id),
  );

  app.post(
    '/vehicles/:id/documents',
    {
      schema: {
        params: idParamSchema,
        body: createVehicleDocumentSchema,
        response: { 201: vehicleDocumentSchema },
      },
    },
    async (request, reply) =>
      reply.status(201).send(service.create(currentUser(request).id, request.params.id, request.body)),
  );

  app.get(
    '/vehicles/:id/documents/:documentId',
    { schema: { params: vehicleDocumentParamsSchema, response: { 200: vehicleDocumentSchema } } },
    async (request) => {
      const { id, documentId } = request.params;
      return service.get(currentUser(request).id, id, documentId);
    },
  );

  app.patch(
    '/vehicles/:id/documents/:documentId',
    {
      schema: {
        params: vehicleDocumentParamsSchema,
        body: updateVehicleDocumentSchema,
        response: { 200: vehicleDocumentSchema },
      },
    },
    async (request) => {
      const { id, documentId } = request.params;
      return service.update(currentUser(request).id, id, documentId, request.body);
    },
  );

  app.delete(
    '/vehicles/:id/documents/:documentId',
    { schema: { params: vehicleDocumentParamsSchema } },
    async (request, reply) => {
      const { id, documentId } = request.params;
      await service.remove(currentUser(request).id, id, documentId);
      return reply.status(204).send();
    },
  );
};
