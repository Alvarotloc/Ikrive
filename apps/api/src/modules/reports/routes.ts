import { idParamSchema, saleReportQuerySchema } from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { contentDisposition } from '../../lib/http';
import { currentUser } from '../../plugins/auth';
import type { ReportsService } from './service';

export const reportsRoutes: FastifyPluginAsyncZod<{ service: ReportsService }> = async (app, { service }) => {
  app.addHook('preHandler', app.authenticate);

  app.get(
    '/vehicles/:id/report.pdf',
    {
      schema: { params: idParamSchema, querystring: saleReportQuerySchema },
      // Rendering takes hundreds of milliseconds of CPU: far below the global API limit.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { fileName, pdf } = await service.generate(
        currentUser(request).id,
        request.params.id,
        request.query,
        request.log,
      );
      return (
        reply
          .type('application/pdf')
          .header('content-disposition', contentDisposition(fileName, 'attachment'))
          // Personal data generated on the fly: never stored by the browser or a proxy.
          .header('cache-control', 'private, no-store')
          .header('x-content-type-options', 'nosniff')
          .send(pdf)
      );
    },
  );
};
