import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import {
  ATTACHMENT_ACCEPT,
  exceedsUploadLimit,
  inlineUrl,
  uploadErrorKey,
  uploadSequentially,
} from './attachments';

const apiError = (status: number) => new ApiError({ type: 'about:blank', title: 'Error', status });
const file = (name: string, size = 1) => new File([new Uint8Array(size)], name, { type: 'application/pdf' });

describe('attachments', () => {
  it('accepts exactly the attachment mime types', () => {
    expect(ATTACHMENT_ACCEPT).toBe('application/pdf,image/jpeg,image/png,image/webp');
  });

  it('builds the inline url of an attachment', () => {
    expect(inlineUrl('/api/vehicles/v1/maintenance/r1/attachments/a1')).toBe(
      '/api/vehicles/v1/maintenance/r1/attachments/a1?inline=1',
    );
  });

  it('maps a 415 problem to the unsupported type message', () => {
    expect(uploadErrorKey(apiError(415), 20)).toBe('maintenance.attachments.errors.type');
    expect(uploadErrorKey(apiError(415))).toBe('maintenance.attachments.errors.type');
  });

  it('maps a 413 problem to the size message with or without a known limit', () => {
    expect(uploadErrorKey(apiError(413), 20)).toBe('maintenance.attachments.errors.size');
    expect(uploadErrorKey(apiError(413))).toBe('maintenance.attachments.errors.sizeUnknownLimit');
  });

  it('maps any other error to the generic message', () => {
    expect(uploadErrorKey(apiError(500), 20)).toBe('common.error');
    expect(uploadErrorKey(apiError(404), 20)).toBe('common.error');
    expect(uploadErrorKey(new TypeError('Failed to fetch'), 20)).toBe('common.error');
  });

  it('flags only files larger than the limit', () => {
    const limit = 1024 * 1024;
    expect(exceedsUploadLimit(file('small.pdf', 10), 1)).toBe(false);
    expect(exceedsUploadLimit(file('exact.pdf', limit), 1)).toBe(false);
    expect(exceedsUploadLimit(file('over.pdf', limit + 1), 1)).toBe(true);
  });

  it('uploads files one by one and keeps going after a failure', async () => {
    const events: string[] = [];
    const failure = apiError(415);
    const files = [file('a.pdf'), file('b.pdf'), file('c.pdf')];

    const result = await uploadSequentially(files, async (current) => {
      events.push(`start ${current.name}`);
      await Promise.resolve();
      events.push(`end ${current.name}`);
      if (current.name === 'b.pdf') throw failure;
    });

    expect(events).toEqual([
      'start a.pdf',
      'end a.pdf',
      'start b.pdf',
      'end b.pdf',
      'start c.pdf',
      'end c.pdf',
    ]);
    expect(result.uploaded).toBe(2);
    expect(result.failures).toEqual([{ file: files[1], error: failure }]);
  });
});
