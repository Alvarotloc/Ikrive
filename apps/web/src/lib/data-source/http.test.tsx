import type { Attachment } from '@ikrive/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { mockApi } from '@/test/render';
import { httpDataSource } from './http';

const attachment: Attachment = {
  id: 'a1',
  originalName: 'factura-taller.pdf',
  mimeType: 'application/pdf',
  size: 8,
  sha256: 'a'.repeat(64),
  url: '/api/vehicles/v1/maintenance/m1/attachments/a1',
  thumbnailUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('httpDataSource', () => {
  it('uploads a file as the multipart file part with its name', async () => {
    const fetchMock = mockApi({
      'POST /vehicles/v1/maintenance/m1/attachments': { status: 201, body: attachment },
    });
    const file = new File(['%PDF-1.7'], 'factura-taller.pdf', { type: 'application/pdf' });

    await expect(httpDataSource.attachments.upload('v1', 'm1', file)).resolves.toEqual(attachment);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('/api/vehicles/v1/maintenance/m1/attachments');
    expect(init?.method).toBe('POST');
    // FormData lets `fetch` set the multipart content type with its boundary.
    expect(init?.headers).toBeUndefined();
    const body = init?.body;
    expect(body).toBeInstanceOf(FormData);
    expect([...(body as FormData).keys()]).toEqual(['file']);
    expect((body as FormData).get('file')).toBe(file);
    expect((body as FormData).get('file')).toHaveProperty('name', 'factura-taller.pdf');
  });

  it('sends a CSV import as multipart with options before the file', async () => {
    const summary = {
      dryRun: true,
      format: 'fuelio',
      created: { odometer: 0, fuel: 2, maintenance: 1 },
      duplicates: 0,
      rejected: [],
      errors: [],
      skipped: [],
      droppedFuelFields: { notes: false, station: false },
      encodingReplaced: false,
    };
    const fetchMock = mockApi({ 'POST /vehicles/v1/csv-import': { status: 200, body: summary } });
    const file = new File(['Date,Odometer\n'], 'fuelio.csv', { type: 'text/csv' });

    await expect(
      httpDataSource.csvImport.import('v1', file, { dryRun: true, dateFormat: 'dmy' }),
    ).resolves.toEqual(summary);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('/api/vehicles/v1/csv-import');
    expect(init?.method).toBe('POST');
    const body = init?.body as FormData;
    expect([...body.keys()]).toEqual(['options', 'file']);
    expect(JSON.parse(String(body.get('options')))).toEqual({ dryRun: true, dateFormat: 'dmy' });
    expect(body.get('file')).toBe(file);

    // Without options the API still gets the `options` part, as `{}`.
    await httpDataSource.csvImport.import('v1', file);
    const second = fetchMock.mock.calls[1]?.[1]?.body as FormData;
    expect([...second.keys()]).toEqual(['options', 'file']);
    expect(second.get('options')).toBe('{}');
  });

  it('rejects a non-2xx response with its ApiError problem', async () => {
    const problem = {
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail: 'The odometer cannot go backwards: there is a reading of 50000 on 2026-01-10',
    };
    mockApi({ 'POST /vehicles/v1/odometer': { status: 409, body: problem } });

    const error = await httpDataSource.odometer
      .add('v1', { date: '2026-01-01', value: 40_000 })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).problem).toEqual(problem);
  });

  it('exports through GET /api/me/export with its file name', async () => {
    const fetchMock = mockApi({
      'GET /me/export': {
        body: new Blob(['PK zip'], { type: 'application/zip' }),
        headers: { 'content-disposition': 'attachment; filename="ikrive-export-2026-11-16.zip"' },
      },
    });

    const exported = await httpDataSource.dataPortability.export();
    // The HTTP export is always a `Blob`; only the local mode leaves a file on the device.
    if (!('blob' in exported)) throw new Error(`Expected a Blob, got the device file ${exported.uri}`);
    const { blob, fileName } = exported;

    expect(fileName).toBe('ikrive-export-2026-11-16.zip');
    expect(blob.type).toBe('application/zip');
    expect(await blob.text()).toBe('PK zip');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('/api/me/export');
    expect(init?.method ?? 'GET').toBe('GET');
  });

  it('resolves me to null on 401', async () => {
    mockApi({
      'GET /me': { status: 401, body: { type: 'about:blank', title: 'Unauthorized', status: 401 } },
    });
    await expect(httpDataSource.me()).resolves.toBeNull();

    mockApi({
      'GET /me': { status: 500, body: { type: 'about:blank', title: 'Server error', status: 500 } },
    });
    await expect(httpDataSource.me()).rejects.toBeInstanceOf(ApiError);
  });
});
