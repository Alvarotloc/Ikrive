import {
  type AttachmentMimeType,
  attachmentFileQuerySchema,
  attachmentSchema,
  maintenanceAttachmentListParamsSchema,
  maintenanceAttachmentParamsSchema,
} from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { BadRequestError } from '../../lib/errors';
import { contentDisposition } from '../../lib/http';
import { currentUser } from '../../plugins/auth';
import type { AttachmentsService } from './service';

const BASE = '/vehicles/:id/maintenance/:recordId/attachments';

/** The contents behind an attachment id never change, so the browser may keep them for good. */
const IMMUTABLE = 'private, max-age=31536000, immutable';

/** Directives shared by every user file: nothing loads, nothing frames it, nothing submits from it. */
const USER_CONTENT_BASE = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
];

/**
 * CSP of a user file served from the app's origin. It replaces helmet's policy for that response.
 * Images get `sandbox` (opaque origin, no scripts; `style-src` only for the synthetic document that
 * centres them). PDFs cannot: Chromium refuses to load its PDF viewer in a sandboxed document, and
 * the viewer is mounted as a plugin, hence `object-src 'self'`. Page scripts stay blocked for both.
 */
export function userContentPolicy(mimeType: AttachmentMimeType): string {
  if (mimeType === 'application/pdf') {
    const [defaultSrc, ...rest] = USER_CONTENT_BASE;
    return [defaultSrc, "object-src 'self'", ...rest].join('; ');
  }
  return [...USER_CONTENT_BASE, 'sandbox'].join('; ');
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
    { schema: { params: maintenanceAttachmentParamsSchema, querystring: attachmentFileQuerySchema } },
    async (request, reply) => {
      const { id, recordId, attachmentId } = request.params;
      const disposition = request.query.inline === '1' ? 'inline' : 'attachment';
      const { row, stream } = service.open(currentUser(request).id, id, recordId, attachmentId);
      // The type comes from the database (detected by content on upload), never from the client.
      // `nosniff` and the CSP also go with downloads: harmless, and a guard if `attachment` is ignored.
      return reply
        .type(row.mimeType)
        .header('content-length', row.size)
        .header('content-disposition', contentDisposition(row.originalName, disposition))
        .header('cache-control', IMMUTABLE)
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', userContentPolicy(row.mimeType))
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
