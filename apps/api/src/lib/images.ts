import sharp from 'sharp';
import { BadRequestError } from './errors';

const SUPPORTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif', 'gif', 'tiff']);

/**
 * Normalizes an uploaded photo: applies the EXIF orientation, downsizes it and re-encodes it as WebP.
 * Re-encoding also strips metadata such as the GPS position where the photo was taken.
 */
export async function toWebpPhoto(input: Buffer, maxSize = 1600): Promise<Buffer> {
  const image = sharp(input, { failOn: 'error' });
  const { format } = await image.metadata().catch(() => ({ format: undefined }));
  if (!format || !SUPPORTED_FORMATS.has(format)) {
    throw new BadRequestError('The file is not a supported image (JPEG, PNG, WebP, AVIF, GIF or TIFF)');
  }
  return image
    .rotate()
    .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}

/** Resolves when the buffer decodes as an image; rejects otherwise (e.g. a valid signature with garbage). */
export async function assertDecodableImage(input: Buffer): Promise<void> {
  await sharp(input, { failOn: 'error' }).stats();
}

/** Thumbnail of an attachment: oriented, at most `size` px on its longest side, WebP without metadata. */
export function toWebpThumbnail(input: Buffer, size = 320): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 70 })
    .toBuffer();
}
