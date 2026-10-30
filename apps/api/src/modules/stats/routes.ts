import { idParamSchema, vehicleStatsSchema } from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { currentUser } from '../../plugins/auth';
import type { StatsService } from './service';

export const statsRoutes: FastifyPluginAsyncZod<{ service: StatsService }> = async (app, { service }) => {
  app.addHook('preHandler', app.authenticate);

  app.get(
    '/vehicles/:id/stats',
    { schema: { params: idParamSchema, response: { 200: vehicleStatsSchema } } },
    async (request) => service.forVehicle(currentUser(request).id, request.params.id),
  );
};
