import {
  type AttachmentEntityType,
  type AttachmentMimeType,
  attachmentFileQuerySchema,
  attachmentSchema,
  documentAttachmentListParamsSchema,
  documentAttachmentParamsSchema,
  maintenanceAttachmentListParamsSchema,
  maintenanceAttachmentParamsSchema,
} from '@ikrive/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { BadRequestError } from '../../lib/errors';
import { contentDisposition } from '../../lib/http';
import { receiveToBuffer } from '../../lib/uploads';
import { currentUser } from '../../plugins/auth';
import type { AttachmentParent, AttachmentsService } from './service';

/** Routes and params of the attachments of each parent entity. */
const PARENTS = {
  maintenance: {
    base: '/vehicles/:id/maintenance/:recordId/attachments',
    listParams: maintenanceAttachmentListParamsSchema,
    params: maintenanceAttachmentParamsSchema,
  },
  document: {
    base: '/vehicles/:id/documents/:documentId/attachments',
    listParams: documentAttachmentListParamsSchema,
    params: documentAttachmentParamsSchema,
  },
} as const;

type ParentParams = { id: string; recordId: string } | { id: string; documentId: string };

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

/** Registered once per parent entity type (`entityType`), with the same handlers and policy. */
export const attachmentsRoutes: FastifyPluginAsyncZod<{
  service: AttachmentsService;
  entityType: AttachmentEntityType;
}> = async (app, { service, entityType }) => {
  app.addHook('preHandler', app.authenticate);

  const { base, listParams, params } = PARENTS[entityType];
  const parentOf = (path: ParentParams): AttachmentParent => ({
    entityType,
    vehicleId: path.id,
    entityId: 'recordId' in path ? path.recordId : path.documentId,
  });

  app.get(
    base,
    {
      schema: { params: listParams, response: { 200: z.array(attachmentSchema) } },
    },
    async (request) => {
      return service.list(currentUser(request).id, parentOf(request.params));
    },
  );

  app.post(
    base,
    { schema: { params: listParams, response: { 201: attachmentSchema } } },
    async (request, reply) => {
      const file = await request.file();
      if (!file) throw new BadRequestError('Expected a file in the "file" field');
      // Buffered before anything is written, so a file over the size limit (413) leaves nothing on disk.
      const data = await receiveToBuffer(file);
      const attachment = await service.upload(currentUser(request).id, parentOf(request.params), {
        filename: file.filename,
        data,
      });
      return reply.status(201).send(attachment);
    },
  );

  app.get(
    `${base}/:attachmentId`,
    { schema: { params, querystring: attachmentFileQuerySchema } },
    async (request, reply) => {
      const disposition = request.query.inline === '1' ? 'inline' : 'attachment';
      const { row, stream } = service.open(
        currentUser(request).id,
        parentOf(request.params),
        request.params.attachmentId,
      );
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

  app.get(`${base}/:attachmentId/thumbnail`, { schema: { params } }, async (request, reply) => {
    const { attachmentId } = request.params;
    const thumbnail = await service.thumbnail(
      currentUser(request).id,
      parentOf(request.params),
      attachmentId,
    );
    return reply.type('image/webp').header('cache-control', IMMUTABLE).send(thumbnail);
  });

  app.delete(`${base}/:attachmentId`, { schema: { params } }, async (request, reply) => {
    await service.remove(currentUser(request).id, parentOf(request.params), request.params.attachmentId);
    return reply.status(204).send();
  });
};
