import type { AttachmentMimeType } from '../enums';

/** File extension of an attachment inside the export zip, by its detected content type. */
export const ATTACHMENT_EXTENSIONS: Record<AttachmentMimeType, 'pdf' | 'jpg' | 'png' | 'webp'> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Path of an attachment's file inside the export zip: `attachments/<id>.<ext>`. */
export function attachmentExportPath(id: string, mimeType: AttachmentMimeType): string {
  return `attachments/${id}.${ATTACHMENT_EXTENSIONS[mimeType]}`;
}

/** Path of a vehicle's photo inside the export zip: `photos/<vehicleId>.webp` (photos are stored as WebP). */
export function photoExportPath(vehicleId: string): string {
  return `photos/${vehicleId}.webp`;
}
