import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { type DataImportSummary, dataImportSummarySchema } from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { BadRequestError, PayloadTooLargeError } from '../../lib/errors';
import { currentUser } from '../../plugins/auth';
import type { DataImportService } from './service';

const MIB = 1024 * 1024;

const INCOMPLETE_UPLOAD = 'The upload ended before the zip was complete';

/**
 * Writes the uploaded file to `path`; always settles. When the body is malformed (no closing
 * boundary) or the client disconnects, `@fastify/multipart` either destroys the file stream
 * without an error or busboy emits an error on it («Part terminated early…»), depending on
 * whether the part was already being read. If the stream was already destroyed before we got
 * here, `pipeline` would wait forever on a closed stream, so it is checked first. Any other
 * failure of the upload side (error or premature close) means the upload is incomplete: 400.
 * Only a failure of the disk side (full disk…) is rethrown, and ends in a 500.
 */
async function receive(source: Readable, path: string): Promise<void> {
  if (source.destroyed && !source.readableEnded) throw new BadRequestError(INCOMPLETE_UPLOAD);
  const sink = createWriteStream(path);
  // `pipeline` destroys both streams with the first error, so whichever fails first is the cause.
  let failed: 'source' | 'sink' | undefined;
  source.once('error', () => {
    failed ??= 'source';
  });
  sink.once('error', () => {
    failed ??= 'sink';
  });
  try {
    await pipeline(source, sink);
  } catch (error) {
    if (failed === 'sink') throw error;
    throw new BadRequestError(INCOMPLETE_UPLOAD);
  }
}

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
        await receive(file.file, zipPath);
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
