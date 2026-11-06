import {
  createReportShareSchema,
  idParamSchema,
  reportShareParamsSchema,
  reportShareSchema,
  reportShareSecretSchema,
} from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { contentDisposition } from '../../lib/http';
import { currentUser } from '../../plugins/auth';
import type { ReportSharesService } from './service';

/** Management of the public links of an owned vehicle (session required). */
export const reportSharesRoutes: FastifyPluginAsyncZod<{ service: ReportSharesService }> = async (
  app,
  { service },
) => {
  app.addHook('preHandler', app.authenticate);

  app.post(
    '/vehicles/:id/report-shares',
    {
      schema: {
        params: idParamSchema,
        body: createReportShareSchema,
        response: { 201: reportShareSecretSchema },
      },
    },
    async (request, reply) =>
      reply.status(201).send(service.create(currentUser(request).id, request.params.id, request.body)),
  );

  app.get(
    '/vehicles/:id/report-shares',
    { schema: { params: idParamSchema, response: { 200: z.array(reportShareSchema) } } },
    async (request) => service.list(currentUser(request).id, request.params.id),
  );

  app.delete(
    '/vehicles/:id/report-shares/:shareId',
    { schema: { params: reportShareParamsSchema } },
    async (request, reply) => {
      service.revoke(currentUser(request).id, request.params.id, request.params.shareId);
      return reply.status(204).send();
    },
  );
};

/** Public sale report of a link: the token in the URL is the only credential. */
export const publicReportRoutes: FastifyPluginAsyncZod<{ service: ReportSharesService }> = async (
  app,
  { service },
) => {
  // Personal data generated on the fly: never stored by the browser or a proxy. Every response,
  // 404s included, so a cached 404 does not outlive a reactivation of the owner.
  app.addHook('onSend', async (_request, reply) => {
    reply.header('cache-control', 'private, no-store');
  });

  app.get(
    '/public/reports/:token',
    {
      schema: { params: z.object({ token: z.string() }) },
      // Every valid request renders a PDF; failed ones count too, which slows down token probing.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { fileName, pdf } = await service.render(request.params.token, request.log);
      return (
        reply
          .type('application/pdf')
          .header('content-disposition', contentDisposition(fileName, 'inline'))
          // Never indexed (`cache-control` is set by the `onSend` hook).
          .header('x-robots-tag', 'noindex')
          .header('x-content-type-options', 'nosniff')
          .send(pdf)
      );
    },
  );
};
