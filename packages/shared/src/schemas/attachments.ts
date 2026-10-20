import { z } from 'zod';
import { ATTACHMENT_MIME_TYPES } from '../enums';
import { maintenanceRecordParamsSchema } from './maintenance';

/** A file attached to a maintenance record. The storage key and the owning entity are not exposed. */
export const attachmentSchema = z.object({
  id: z.string(),
  originalName: z.string(),
  /** Detected from the file contents, not the type declared by the client. */
  mimeType: z.enum(ATTACHMENT_MIME_TYPES),
  /** Bytes. */
  size: z.number().int().nonnegative(),
  /** Hex SHA-256 of the contents. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  url: z.string(),
  /** `null` for PDFs: only images have a thumbnail. */
  thumbnailUrl: z.string().nullable(),
  createdAt: z.string(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

/** Params of `GET`/`POST /vehicles/:id/maintenance/:recordId/attachments`. */
export const maintenanceAttachmentListParamsSchema = maintenanceRecordParamsSchema;

/** Params of `/vehicles/:id/maintenance/:recordId/attachments/:attachmentId[/thumbnail]`. */
export const maintenanceAttachmentParamsSchema = maintenanceRecordParamsSchema.extend({
  attachmentId: z.string().min(1),
});

/**
 * Query of `GET /vehicles/:id/maintenance/:recordId/attachments/:attachmentId`. `inline=1` serves the
 * original to be shown by the browser; omitted or `0`, it is downloaded. Any other value is a 400.
 */
export const attachmentFileQuerySchema = z.object({ inline: z.enum(['0', '1']).optional() });
