import type { AttachmentMimeType } from '@ikrive/shared';

export interface DetectedType {
  mimeType: AttachmentMimeType;
  extension: 'pdf' | 'jpg' | 'png' | 'webp';
}

const startsWith = (data: Buffer, signature: number[], offset = 0) =>
  data.length >= offset + signature.length && signature.every((byte, i) => data[offset + i] === byte);

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/**
 * Detects the type of an attachment from its magic bytes, ignoring the declared content type
 * and extension. Returns `null` for anything that is not a PDF, JPEG, PNG or WebP file.
 */
export function detectAttachmentType(data: Buffer): DetectedType | null {
  if (startsWith(data, ascii('%PDF-'))) return { mimeType: 'application/pdf', extension: 'pdf' };
  if (startsWith(data, [0xff, 0xd8, 0xff])) return { mimeType: 'image/jpeg', extension: 'jpg' };
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mimeType: 'image/png', extension: 'png' };
  }
  if (startsWith(data, ascii('RIFF')) && startsWith(data, ascii('WEBP'), 8)) {
    return { mimeType: 'image/webp', extension: 'webp' };
  }
  return null;
}
