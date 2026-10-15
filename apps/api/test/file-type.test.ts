import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { detectAttachmentType } from '../src/lib/file-type';

const image = (format: 'jpeg' | 'png' | 'webp') =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: '#2d3a3a' } })
    .toFormat(format)
    .toBuffer();

describe('detectAttachmentType', () => {
  it('detects PDF, JPEG, PNG and WebP by their signature', async () => {
    expect(detectAttachmentType(Buffer.from('%PDF-1.7\n%âãÏÓ\n'))).toEqual({
      mimeType: 'application/pdf',
      extension: 'pdf',
    });
    expect(detectAttachmentType(await image('jpeg'))).toEqual({ mimeType: 'image/jpeg', extension: 'jpg' });
    expect(detectAttachmentType(await image('png'))).toEqual({ mimeType: 'image/png', extension: 'png' });
    expect(detectAttachmentType(await image('webp'))).toEqual({ mimeType: 'image/webp', extension: 'webp' });
  });

  it('returns null for other contents', async () => {
    const gif = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#c5e8e0' } })
      .gif()
      .toBuffer();
    expect(detectAttachmentType(gif)).toBeNull();
    expect(detectAttachmentType(Buffer.from('just some text, not a PDF'))).toBeNull();
    expect(detectAttachmentType(Buffer.alloc(0))).toBeNull();
    expect(detectAttachmentType(Buffer.from('%PDF'))).toBeNull();
    expect(detectAttachmentType(Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt '))).toBeNull();
  });
});
