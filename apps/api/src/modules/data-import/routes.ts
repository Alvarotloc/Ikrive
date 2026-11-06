import { rm } from 'node:fs/promises';
import { type DataImportSummary, dataImportSummarySchema } from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { BadRequestError, PayloadTooLargeError } from '../../lib/errors';
import { receiveToFile } from '../../lib/uploads';
import { currentUser } from '../../plugins/auth';
import type { DataImportService } from './service';

const MIB = 1024 * 1024;

const INCOMPLETE_UPLOAD = 'The upload ended before the zip was complete';

/** Import of an export zip into the user's account (session required). Adds, never overwrites. */
export const dataImportRoutes: FastifyPluginAsyncZod<{ service: DataImportService }> = async (
  app,
  { service },
) => {
  app.post(
    '/me/import',
    { preHandler: app.authenticate, schema: { response: { 201: dataImportSummarySchema } } },
    async (request, reply) => {
      const maxBytes = service.limits.zipBytes;
      // `request.file()` answers 406 to a body that is not multipart; R3 asks for a 400.
      if (!request.isMultipart()) throw new BadRequestError('Expected a zip in the "file" field');
      // Replaces the global upload limit for this route only: an export holds every attachment.
      const file = await request.file({ limits: { fileSize: maxBytes, files: 1 } });
      if (file?.fieldname !== 'file') {
        file?.file.resume();
        throw new BadRequestError('Expected a zip in the "file" field');
      }

      // On disk, not in memory: the zip needs random access and may be large.
      const zipPath = await service.tempZipPath();
      let summary: DataImportSummary;
      try {
        await receiveToFile(file.file, zipPath, INCOMPLETE_UPLOAD);
        if (file.file.truncated) {
          throw new PayloadTooLargeError(`The zip is larger than ${Math.round(maxBytes / MIB)} MiB`);
        }
        summary = await service.import(currentUser(request).id, zipPath);
      } finally {
        // Before replying, so the zip is gone by the time the client gets the answer.
        await rm(zipPath, { force: true });
      }
      return reply.status(201).send(summary);
    },
  );
};
