import {
  attachmentSchema,
  maintenanceAttachmentListParamsSchema,
  maintenanceAttachmentParamsSchema,
} from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { BadRequestError } from '../../lib/errors';
import { currentUser } from '../../plugins/auth';
import type { AttachmentsService } from './service';

const BASE = '/vehicles/:id/maintenance/:recordId/attachments';

/** The contents behind an attachment id never change, so the browser may keep them for good. */
const IMMUTABLE = 'private, max-age=31536000, immutable';

/**
 * `Content-Disposition` for a download (RFC 6266): an ASCII fallback for old clients plus the
 * UTF-8 name encoded as an RFC 5987 `filename*` parameter.
 */
export function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export const attachmentsRoutes: FastifyPluginAsyncZod<{ service: AttachmentsService }> = async (
  app,
  { service },
) => {
  app.addHook('preHandler', app.authenticate);

  app.get(
    BASE,
    {
      schema: { params: maintenanceAttachmentListParamsSchema, response: { 200: z.array(attachmentSchema) } },
    },
    async (request) => {
      const { id, recordId } = request.params;
      return service.list(currentUser(request).id, id, recordId);
    },
  );

  app.post(
    BASE,
    { schema: { params: maintenanceAttachmentListParamsSchema, response: { 201: attachmentSchema } } },
    async (request, reply) => {
      const { id, recordId } = request.params;
      const file = await request.file();
      if (!file) throw new BadRequestError('Expected a file in the "file" field');
      // Buffered before anything is written, so a file over the size limit (413) leaves nothing on disk.
      const data = await file.toBuffer();
      const attachment = await service.upload(currentUser(request).id, id, recordId, {
        filename: file.filename,
        data,
      });
      return reply.status(201).send(attachment);
    },
  );

  app.get(
    `${BASE}/:attachmentId`,
    { schema: { params: maintenanceAttachmentParamsSchema } },
    async (request, reply) => {
      const { id, recordId, attachmentId } = request.params;
      const { row, stream } = service.open(currentUser(request).id, id, recordId, attachmentId);
      return reply
        .type(row.mimeType)
        .header('content-length', row.size)
        .header('content-disposition', contentDisposition(row.originalName))
        .header('cache-control', IMMUTABLE)
        .send(stream);
    },
  );

  app.get(
    `${BASE}/:attachmentId/thumbnail`,
    { schema: { params: maintenanceAttachmentParamsSchema } },
    async (request, reply) => {
      const { id, recordId, attachmentId } = request.params;
      const thumbnail = await service.thumbnail(currentUser(request).id, id, recordId, attachmentId);
      return reply.type('image/webp').header('cache-control', IMMUTABLE).send(thumbnail);
    },
  );

  app.delete(
    `${BASE}/:attachmentId`,
    { schema: { params: maintenanceAttachmentParamsSchema } },
    async (request, reply) => {
      const { id, recordId, attachmentId } = request.params;
      await service.remove(currentUser(request).id, id, recordId, attachmentId);
      return reply.status(204).send();
    },
  );
};
