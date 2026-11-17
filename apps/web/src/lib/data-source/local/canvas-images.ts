import type { AnnexImage } from '@ikrive/shared/sale-report-pdf';
import type { LocalImages } from './files';

/** A decoded image: an `ImageBitmap` on the device. */
export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  /** Frees its memory (a 50 MP photo takes ~200 MB decoded). */
  close(): void;
}

/** A canvas that draws a decoded image scaled to its size and encodes itself. */
export interface ImageCanvas<I extends DecodedImage> {
  draw(image: I): void;
  /** `null` when the canvas cannot be encoded. `quality` only applies to lossy types. */
  toBlob(type: string, quality?: number): Promise<Blob | null>;
}

/** What `createCanvasImages` needs from the browser, replaced by doubles in the tests (Node has no canvas). */
export interface CanvasEnv<I extends DecodedImage> {
  decode(blob: Blob, options: ImageBitmapOptions): Promise<I>;
  createCanvas(width: number, height: number): ImageCanvas<I>;
}

/** The WebView's `createImageBitmap` and `<canvas>`. */
const browserEnv: CanvasEnv<ImageBitmap> = {
  decode: (blob, options) => createImageBitmap(blob, options),
  createCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return {
      draw(image) {
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D is not available');
        context.drawImage(image, 0, 0, width, height);
      },
      toBlob: (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality)),
    };
  },
};

/** Size of a `width`×`height` image fitted inside a `max`×`max` box, keeping its ratio and never enlarged. */
export function fitInside(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Decoding with the EXIF orientation applied, as `sharp().rotate()` does in the API. */
const DECODE_OPTIONS: ImageBitmapOptions = { imageOrientation: 'from-image' };

/** Longest side of an invoice image appended to the sale report, as `toAnnexImage` of the API. */
const ANNEX_MAX_SIZE = 2000;

/**
 * `LocalImages` over the WebView: decodes with `createImageBitmap` (EXIF orientation applied), draws on a
 * canvas of at most the requested size and encodes it as WebP. A WebView that cannot encode WebP returns
 * another format; the local `DataSource` rejects it (`assertWebp`). Invoice images of the sale report are
 * encoded as JPEG (from JPEG) or PNG instead, the formats pdf-lib embeds.
 */
export function createCanvasImages(env: CanvasEnv<DecodedImage> = browserEnv): LocalImages {
  const decode = (data: Uint8Array) => env.decode(new Blob([data.slice()]), DECODE_OPTIONS);

  const recode = async (data: Uint8Array, max: number, type: string, quality?: number) => {
    const image = await decode(data);
    let canvas: ImageCanvas<DecodedImage>;
    let size: { width: number; height: number };
    try {
      size = fitInside(image.width, image.height, max);
      canvas = env.createCanvas(size.width, size.height);
      canvas.draw(image);
    } finally {
      image.close();
    }
    const blob = await canvas.toBlob(type, quality);
    if (!blob) throw new Error('The image could not be encoded');
    return { data: new Uint8Array(await blob.arrayBuffer()), ...size };
  };

  const toWebp = async (data: Uint8Array, max: number, quality: number) =>
    (await recode(data, max, 'image/webp', quality)).data;

  return {
    async assertDecodable(data) {
      (await decode(data)).close();
    },
    toWebpPhoto: (data) => toWebp(data, 1600, 0.8),
    toWebpThumbnail: (data) => toWebp(data, 320, 0.7),
    async toAnnexImage(data, mimeType): Promise<AnnexImage> {
      if (mimeType === 'image/jpeg') {
        return { format: 'jpeg', ...(await recode(data, ANNEX_MAX_SIZE, 'image/jpeg', 0.85)) };
      }
      return { format: 'png', ...(await recode(data, ANNEX_MAX_SIZE, 'image/png')) };
    },
  };
}
