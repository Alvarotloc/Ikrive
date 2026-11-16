import { detectPhotoFormat } from '@ikrive/shared';
import type { LocalImages } from '@/lib/data-source/local/files';

/** Marker that makes an image with a valid signature fail to decode (a truncated or garbage file). */
export const CORRUPT = 'CORRUPT';

/** The smallest bytes `detectAttachmentType` takes for a WebP, followed by `tag`. */
export const webpBytes = (tag = '') => new TextEncoder().encode(`RIFF\0\0\0\0WEBPVP8 ${tag}`);

export interface FakeImages extends LocalImages {
  /** Longest side asked for in each recoding, in call order (1600 for a photo, 320 for a thumbnail). */
  requested: number[];
}

/**
 * `LocalImages` without a canvas: decodes anything with an image signature that does not contain
 * `CORRUPT`, and recodes it to a minimal WebP. `output` simulates a device that does not produce WebP.
 */
export function fakeImages({ output }: { output?: Uint8Array } = {}): FakeImages {
  let count = 0;
  const decode = async (data: Uint8Array) => {
    const text = new TextDecoder().decode(data);
    if (!detectPhotoFormat(data) || text.includes(CORRUPT)) throw new Error('The image cannot be decoded');
  };
  const recode = async (data: Uint8Array, size: number) => {
    await decode(data);
    requested.push(size);
    count += 1;
    return output ?? webpBytes(`${size}-${count}`);
  };
  const requested: number[] = [];
  return {
    requested,
    assertDecodable: decode,
    toWebpPhoto: (data) => recode(data, 1600),
    toWebpThumbnail: (data) => recode(data, 320),
  };
}
