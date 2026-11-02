import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { contentDisposition } from '../../lib/http';
import { currentUser } from '../../plugins/auth';
import type { DataExportService } from './service';

/** Download of every piece of the user's data as a zip (session required). */
export const dataExportRoutes: FastifyPluginAsyncZod<{ service: DataExportService }> = async (
  app,
  { service },
) => {
  app.get('/me/export', { preHandler: app.authenticate }, async (request, reply) => {
    const { fileName, stream } = await service.export(currentUser(request).id);
    // Streamed: no Content-Length. A failure mid-stream destroys the connection (truncated zip).
    stream.on('error', (error) => request.log.error({ err: error }, 'export: zip stream failed'));
    return (
      reply
        .type('application/zip')
        .header('content-disposition', contentDisposition(fileName))
        // Personal data generated on the fly: never stored by the browser or a proxy.
        .header('cache-control', 'no-store')
        .header('x-content-type-options', 'nosniff')
        .send(stream)
    );
  });
};
