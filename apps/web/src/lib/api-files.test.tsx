import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeImages } from '@/test/fake-images';
import { createMemoryFileStore } from '@/test/memory-file-store';
import { createMemorySqlite } from '@/test/memory-sqlite';
import { createTestQueryClient, mockApi, mockObjectUrls, setServerMode } from '@/test/render';
import { filesViaDataSource, openApiFile, saveApiFile, useApiFileSrc } from './api-files';
import { setLocalMode } from './app-mode';
import { setDataSource } from './data-source';
import { createLocalDataSource, openLocalDatabase } from './data-source/local';

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

describe('files in local mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('local mode: loads files through the data source', async () => {
    vi.stubEnv('MODE', 'native');
    setLocalMode(true);
    // No route: a request to the URL would fail the test.
    const fetchMock = mockApi({});
    const { createObjectURL } = mockObjectUrls();
    download.openBlob.mockResolvedValue(undefined);
    download.downloadBlob.mockResolvedValue(undefined);
    const local = createLocalDataSource(await openLocalDatabase(createMemorySqlite()), {
      files: createMemoryFileStore(),
      images: fakeImages(),
    });
    setDataSource(local);
    const vehicle = await local.vehicles.create({ make: 'Seat', model: 'Ibiza' });
    const record = await local.maintenance.create(vehicle.id, {
      date: '2024-03-01',
      category: 'other',
      title: 'Revisión',
    });
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    const pdf = await local.attachments.upload(vehicle.id, record.id, new File(['%PDF-1.7'], 'Factura.pdf'));
    const image = await local.attachments.upload(vehicle.id, record.id, new File([jpeg], 'Ticket.jpg'));

    expect(filesViaDataSource()).toBe(true);

    // An image: `undefined` while it loads, then a `blob:` URL of the thumbnail, never its `local://` URL.
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useApiFileSrc(image.thumbnailUrl ?? ''), {
      wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
    });
    expect(result.current.src).toBeUndefined();
    await waitFor(() => expect(result.current.src).toBe('blob:1'));
    expect(createObjectURL.mock.lastCall?.[0]?.type).toBe('image/webp');

    // A PDF: opened and saved with its original name.
    await openApiFile(`${pdf.url}?inline=1`, 'fallback.pdf');
    expect(download.openBlob).toHaveBeenLastCalledWith(expect.any(Blob), 'Factura.pdf');
    expect(await download.openBlob.mock.lastCall?.[0].text()).toBe('%PDF-1.7');
    await saveApiFile(pdf.url, 'fallback.pdf');
    expect(download.downloadBlob).toHaveBeenLastCalledWith('Factura.pdf', expect.any(Blob));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
