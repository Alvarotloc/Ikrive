import { describe, expect, it, vi } from 'vitest';
import { mockApi, setServerMode } from '@/test/render';
import { openApiFile } from './api-files';

const download = vi.hoisted(() => ({ openBlob: vi.fn(), downloadBlob: vi.fn() }));
vi.mock('./download', () => download);

const URL_PDF = '/api/vehicles/v1/maintenance/m1/attachments/a1?inline=1';
const pdf = () => new Blob(['%PDF-1.7'], { type: 'application/pdf' });

describe('openApiFile', () => {
  it('server mode: opens a PDF with its Content-Disposition name or the fallback', async () => {
    setServerMode('https://ikrive.example.com', 'secret-token');
    download.openBlob.mockResolvedValue(undefined);

    mockApi({
      'GET /vehicles/v1/maintenance/m1/attachments/a1': {
        body: pdf(),
        headers: { 'content-disposition': 'inline; filename="factura-taller.pdf"' },
      },
    });
    await openApiFile(URL_PDF, 'fallback.pdf');
    expect(download.openBlob).toHaveBeenLastCalledWith(expect.any(Blob), 'factura-taller.pdf');
    const [blob] = download.openBlob.mock.lastCall ?? [];
    expect(blob.type).toBe('application/pdf');
    expect(await blob.text()).toBe('%PDF-1.7');

    mockApi({ 'GET /vehicles/v1/maintenance/m1/attachments/a1': { body: pdf() } });
    await openApiFile(URL_PDF, 'fallback.pdf');
    expect(download.openBlob).toHaveBeenLastCalledWith(expect.any(Blob), 'fallback.pdf');
    expect(download.openBlob).toHaveBeenCalledTimes(2);
  });
});
