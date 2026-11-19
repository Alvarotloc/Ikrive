import { describe, expect, it } from 'vitest';
import { detectAttachmentType, detectPhotoFormat, MAX_FILE_NAME_LENGTH, sanitizeFileName } from './files';

const bytes = (...parts: (string | number[])[]) =>
  Uint8Array.from(
    parts.flatMap((part) => (typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : part)),
  );

const PDF = bytes('%PDF-1.7\n');
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], 'JFIF');
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d], 'IHDR');
const WEBP = bytes('RIFF', [0x24, 0x00, 0x00, 0x00], 'WEBPVP8 ');
const GIF87 = bytes('GIF87a', [0x08, 0x00]);
const GIF89 = bytes('GIF89a', [0x08, 0x00]);
const TIFF_LE = bytes([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00]);
const TIFF_BE = bytes([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x08]);
const AVIF = bytes([0x00, 0x00, 0x00, 0x1c], 'ftypavif', [0, 0, 0, 0], 'mif1avifmiaf');
const AVIF_COMPATIBLE = bytes([0x00, 0x00, 0x00, 0x18], 'ftypmif1', [0, 0, 0, 0], 'mif1avif');
const AVIS = bytes([0x00, 0x00, 0x00, 0x14], 'ftypavis', [0, 0, 0, 0], 'msf1');
const HEIC = bytes([0x00, 0x00, 0x00, 0x18], 'ftypheic', [0, 0, 0, 0], 'mif1heic');
const AVIF_OUTSIDE_FTYP = bytes([0x00, 0x00, 0x00, 0x14], 'ftypheic', [0, 0, 0, 0], 'mif1avif');
const BMP = bytes('BM', [0x36, 0x00, 0x00, 0x00]);
const TEXT = bytes('just some text, not a PDF');

describe('files', () => {
  it('detects PDF, JPEG, PNG and WebP by their signature', () => {
    expect(detectAttachmentType(PDF)).toEqual({ mimeType: 'application/pdf', extension: 'pdf' });
    expect(detectAttachmentType(JPEG)).toEqual({ mimeType: 'image/jpeg', extension: 'jpg' });
    expect(detectAttachmentType(PNG)).toEqual({ mimeType: 'image/png', extension: 'png' });
    expect(detectAttachmentType(WEBP)).toEqual({ mimeType: 'image/webp', extension: 'webp' });
  });

  it('returns null for other contents', () => {
    for (const data of [
      GIF89,
      TEXT,
      AVIF,
      new Uint8Array(0),
      bytes('%PDF'),
      bytes('RIFF', [0x24, 0, 0, 0], 'WAVEfmt '),
    ]) {
      expect(detectAttachmentType(data)).toBeNull();
    }
  });

  it('detects the photo formats the API accepts', () => {
    expect(detectPhotoFormat(JPEG)).toBe('jpeg');
    expect(detectPhotoFormat(PNG)).toBe('png');
    expect(detectPhotoFormat(WEBP)).toBe('webp');
    expect(detectPhotoFormat(GIF87)).toBe('gif');
    expect(detectPhotoFormat(GIF89)).toBe('gif');
    expect(detectPhotoFormat(TIFF_LE)).toBe('tiff');
    expect(detectPhotoFormat(TIFF_BE)).toBe('tiff');
    expect(detectPhotoFormat(AVIF)).toBe('avif');
    expect(detectPhotoFormat(AVIF_COMPATIBLE)).toBe('avif');
    expect(detectPhotoFormat(AVIS)).toBe('avif');
    for (const data of [HEIC, AVIF_OUTSIDE_FTYP, bytes('ftypavif'), BMP, TEXT, PDF, new Uint8Array(0)]) {
      expect(detectPhotoFormat(data)).toBeNull();
    }
  });

  it('keeps the base name of the declared file name', () => {
    expect(sanitizeFileName('factura.pdf', 'pdf')).toBe('factura.pdf');
    expect(sanitizeFileName('/home/user/docs/factura.pdf', 'pdf')).toBe('factura.pdf');
    expect(sanitizeFileName('C:\\Users\\me\\ticket.jpg', 'jpg')).toBe('ticket.jpg');
    expect(sanitizeFileName('  Factura taller.pdf  ', 'pdf')).toBe('Factura taller.pdf');
    expect(sanitizeFileName('', 'pdf')).toBe('file.pdf');
    expect(sanitizeFileName('docs/   ', 'png')).toBe('file.png');

    expect(sanitizeFileName(`${'a'.repeat(300)}.pdf`, 'pdf')).toBe('a'.repeat(MAX_FILE_NAME_LENGTH));
    // 254 characters and then an emoji (a surrogate pair): kept whole, the name has 255 code points.
    const emoji = sanitizeFileName(`${'a'.repeat(254)}🚗🚗.pdf`, 'pdf');
    expect(emoji).toBe(`${'a'.repeat(254)}🚗`);
    expect(Array.from(emoji)).toHaveLength(MAX_FILE_NAME_LENGTH);
  });
});
