import { describe, expect, it } from 'vitest';
import { webpBytes } from '@/test/fake-images';
import { type CanvasEnv, createCanvasImages, type DecodedImage, fitInside } from './canvas-images';

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * A browser without canvas: decodes every image as `width`×`height` (or rejects with `fail`) and records
 * what was decoded, drawn and encoded.
 */
function fakeEnv({ width = 4000, height = 3000, fail = false, output = webpBytes('canvas') } = {}) {
  const calls = {
    decoded: [] as { bytes: Uint8Array; options: ImageBitmapOptions }[],
    closed: 0,
    canvases: [] as { width: number; height: number; drawn: boolean; closedWhenDrawn: number }[],
    encoded: [] as { type: string; quality?: number }[],
  };
  const env: CanvasEnv<DecodedImage> = {
    async decode(blob, options) {
      calls.decoded.push({ bytes: new Uint8Array(await blob.arrayBuffer()), options });
      if (fail) throw new DOMException('The source image could not be decoded.', 'InvalidStateError');
      return {
        width,
        height,
        close: () => {
          calls.closed += 1;
        },
      };
    },
    createCanvas(canvasWidth, canvasHeight) {
      const canvas = { width: canvasWidth, height: canvasHeight, drawn: false, closedWhenDrawn: -1 };
      calls.canvases.push(canvas);
      return {
        draw() {
          canvas.closedWhenDrawn = calls.closed;
          canvas.drawn = true;
        },
        async toBlob(type, quality) {
          calls.encoded.push({ type, quality });
          return new Blob([output.slice()], { type });
        },
      };
    },
  };
  return { env, calls };
}

describe('canvas images', () => {
  it('fits inside the box without enlarging', () => {
    expect(fitInside(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitInside(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitInside(1000, 500, 320)).toEqual({ width: 320, height: 160 });
    expect(fitInside(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitInside(1600, 1600, 1600)).toEqual({ width: 1600, height: 1600 });
    expect(fitInside(10000, 1, 320)).toEqual({ width: 320, height: 1 });
  });

  it('decodes with the EXIF orientation and encodes WebP', async () => {
    const { env, calls } = fakeEnv({ width: 3000, height: 4000 });
    const images = createCanvasImages(env);

    expect(await images.toWebpPhoto(JPEG)).toEqual(webpBytes('canvas'));
    expect(await images.toWebpThumbnail(JPEG)).toEqual(webpBytes('canvas'));
    await images.assertDecodable(JPEG);

    expect(calls.decoded).toEqual([
      { bytes: JPEG, options: { imageOrientation: 'from-image' } },
      { bytes: JPEG, options: { imageOrientation: 'from-image' } },
      { bytes: JPEG, options: { imageOrientation: 'from-image' } },
    ]);
    expect(calls.canvases).toEqual([
      { width: 1200, height: 1600, drawn: true, closedWhenDrawn: 0 },
      { width: 240, height: 320, drawn: true, closedWhenDrawn: 1 },
    ]);
    expect(calls.encoded).toEqual([
      { type: 'image/webp', quality: 0.8 },
      { type: 'image/webp', quality: 0.7 },
    ]);
    // Each bitmap is released after drawing it (none was closed before its own draw), and the one of
    // `assertDecodable` too.
    expect(calls.closed).toBe(3);
  });

  it('rejects when the image does not decode', async () => {
    const { env, calls } = fakeEnv({ fail: true });
    const images = createCanvasImages(env);

    await expect(images.assertDecodable(JPEG)).rejects.toThrow('could not be decoded');
    await expect(images.toWebpPhoto(JPEG)).rejects.toThrow('could not be decoded');
    await expect(images.toWebpThumbnail(JPEG)).rejects.toThrow('could not be decoded');
    expect(calls.canvases).toEqual([]);
    expect(calls.encoded).toEqual([]);
  });

  it('recodes jpeg annex images as jpeg within 2000 px', async () => {
    const { env, calls } = fakeEnv({ width: 4000, height: 3000, output: JPEG });
    const images = createCanvasImages(env);

    expect(await images.toAnnexImage(JPEG, 'image/jpeg')).toEqual({
      data: JPEG,
      format: 'jpeg',
      width: 2000,
      height: 1500,
    });
    expect(calls.canvases).toEqual([{ width: 2000, height: 1500, drawn: true, closedWhenDrawn: 0 }]);
    expect(calls.encoded).toEqual([{ type: 'image/jpeg', quality: 0.85 }]);
    expect(calls.closed).toBe(1);
  });

  it('recodes other annex images as png', async () => {
    const { env, calls } = fakeEnv({ width: 1000, height: 5000, output: PNG });
    const images = createCanvasImages(env);

    expect(await images.toAnnexImage(webpBytes(), 'image/webp')).toEqual({
      data: PNG,
      format: 'png',
      width: 400,
      height: 2000,
    });
    expect(await images.toAnnexImage(PNG, 'image/png')).toMatchObject({ format: 'png' });
    expect(calls.encoded.map((call) => call.type)).toEqual(['image/png', 'image/png']);
  });

  it('never enlarges small annex images', async () => {
    const { env, calls } = fakeEnv({ width: 640, height: 480, output: JPEG });
    const images = createCanvasImages(env);

    expect(await images.toAnnexImage(JPEG, 'image/jpeg')).toMatchObject({ width: 640, height: 480 });
    expect(calls.canvases).toEqual([{ width: 640, height: 480, drawn: true, closedWhenDrawn: 0 }]);
  });

  it('decodes annex images with the EXIF orientation', async () => {
    const { env, calls } = fakeEnv({ width: 3000, height: 4000, output: JPEG });
    const images = createCanvasImages(env);

    // A portrait photo stored landscape with an EXIF rotation: the decoded (rotated) size is used.
    expect(await images.toAnnexImage(JPEG, 'image/jpeg')).toMatchObject({ width: 1500, height: 2000 });
    expect(calls.decoded).toEqual([{ bytes: JPEG, options: { imageOrientation: 'from-image' } }]);

    const failing = fakeEnv({ fail: true });
    await expect(createCanvasImages(failing.env).toAnnexImage(JPEG, 'image/jpeg')).rejects.toThrow(
      'could not be decoded',
    );
    expect(failing.calls.encoded).toEqual([]);
  });
});
