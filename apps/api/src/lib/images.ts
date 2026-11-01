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

export interface AnnexImage {
  data: Buffer;
  format: 'jpeg' | 'png';
  width: number;
  height: number;
}

/**
 * Image ready to be embedded in a PDF page: oriented, at most `maxSize` px on its longest side (never
 * enlarged) and re-encoded as JPEG (from JPEG) or PNG (anything else), the only formats pdf-lib embeds.
 * Rejects when the buffer does not decode as an image.
 */
export async function toAnnexImage(input: Buffer, maxSize = 2000): Promise<AnnexImage> {
  const image = sharp(input, { failOn: 'error' });
  const { format } = await image.metadata();
  const resized = image
    .rotate()
    .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true });
  const output = format === 'jpeg' ? 'jpeg' : 'png';
  const { data, info } = await (output === 'jpeg' ? resized.jpeg({ quality: 85 }) : resized.png()).toBuffer({
    resolveWithObject: true,
  });
  return { data, format: output, width: info.width, height: info.height };
}
