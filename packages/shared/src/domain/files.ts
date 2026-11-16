import type { AttachmentMimeType } from '../enums';

/** Type of an attachment detected from its bytes, with the extension of its storage key. */
export interface DetectedType {
  mimeType: AttachmentMimeType;
  extension: 'pdf' | 'jpg' | 'png' | 'webp';
}

/** Image formats a vehicle photo can be uploaded in (before it is recoded to WebP). */
export type PhotoFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'tiff';

/** Longest name kept for an attachment, in characters (code points). */
export const MAX_FILE_NAME_LENGTH = 255;

const startsWith = (data: Uint8Array, signature: readonly number[], offset = 0) =>
  data.length >= offset + signature.length && signature.every((byte, i) => data[offset + i] === byte);

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

const PDF = ascii('%PDF-');
const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = ascii('RIFF');
const WEBP = ascii('WEBP');
const GIF87 = ascii('GIF87a');
const GIF89 = ascii('GIF89a');
const TIFF_LE = [0x49, 0x49, 0x2a, 0x00];
const TIFF_BE = [0x4d, 0x4d, 0x00, 0x2a];

const isWebp = (data: Uint8Array) => startsWith(data, RIFF) && startsWith(data, WEBP, 8);

/**
 * Detects the type of an attachment from its magic bytes, ignoring the declared content type
 * and extension. Returns `null` for anything that is not a PDF, JPEG, PNG or WebP file.
 */
export function detectAttachmentType(data: Uint8Array): DetectedType | null {
  if (startsWith(data, PDF)) return { mimeType: 'application/pdf', extension: 'pdf' };
  if (startsWith(data, JPEG)) return { mimeType: 'image/jpeg', extension: 'jpg' };
  if (startsWith(data, PNG)) return { mimeType: 'image/png', extension: 'png' };
  if (isWebp(data)) return { mimeType: 'image/webp', extension: 'webp' };
  return null;
}

/**
 * Detects the format of a vehicle photo from its magic bytes: JPEG, PNG, WebP, GIF or TIFF, the formats
 * the API decodes. `null` for anything else.
 */
export function detectPhotoFormat(data: Uint8Array): PhotoFormat | null {
  if (startsWith(data, JPEG)) return 'jpeg';
  if (startsWith(data, PNG)) return 'png';
  if (isWebp(data)) return 'webp';
  if (startsWith(data, GIF87) || startsWith(data, GIF89)) return 'gif';
  if (startsWith(data, TIFF_LE) || startsWith(data, TIFF_BE)) return 'tiff';
  return null;
}

/**
 * Keeps the base name of the declared file name (no directories, trimmed), capped to
 * `MAX_FILE_NAME_LENGTH` characters without splitting a surrogate pair; `file.<extension>` if empty.
 */
export function sanitizeFileName(filename: string, extension: string): string {
  const base = Array.from(filename.split(/[/\\]/).pop()?.trim() ?? '')
    .slice(0, MAX_FILE_NAME_LENGTH)
    .join('');
  return base || `file.${extension}`;
}
