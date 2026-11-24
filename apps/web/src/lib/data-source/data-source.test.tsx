import type { Me, Vehicle } from '@ikrive/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { meQuery } from '@/features/auth/queries';
import { useCreateVehicle, vehiclesQuery } from '@/features/vehicles/queries';
import { saveApiFile } from '@/lib/api-files';
import { queryKeys } from '@/lib/query-keys';
import { createTestQueryClient } from '@/test/render';
import { httpDataSource } from './http';
import { type DataSource, dataSource, setDataSource } from './index';

const download = vi.hoisted(() => ({ openBlob: vi.fn(), downloadBlob: vi.fn() }));
vi.mock('@/lib/download', () => download);

const car: Vehicle = {
  id: 'v1',
  name: null,
  make: 'Toyota',
  model: 'Corolla',
  version: null,
  year: 2021,
  plate: null,
  vin: null,
  type: 'car',
  fuelType: 'hybrid',
  purchaseDate: null,
  purchasePrice: null,
  purchaseOdometer: null,
  notes: null,
  soldAt: null,
  archivedAt: null,
  status: 'active',
  photoUrl: null,
  odometer: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const me: Me = { id: 'u1', name: 'Ana', email: 'ana@example.com', role: 'admin' };

/**
 * A `DataSource` that answers the given operations and leaves the rest to HTTP: any request that
 * reaches `fetch` is not mocked and fails the test, so the operations under test cannot go to the API.
 */
function fakeDataSource(overrides: {
  me?: DataSource['me'];
  vehicles?: Partial<DataSource['vehicles']>;
  files?: Partial<DataSource['files']>;
  csvImport?: Partial<DataSource['csvImport']>;
}): DataSource {
  return {
    ...httpDataSource,
    me: overrides.me ?? httpDataSource.me,
    vehicles: { ...httpDataSource.vehicles, ...overrides.vehicles },
    files: { ...httpDataSource.files, ...overrides.files },
    csvImport: { ...httpDataSource.csvImport, ...overrides.csvImport },
  };
}

describe('active data source', () => {
  afterEach(() => {
    setDataSource(httpDataSource);
  });

  it('uses the HTTP data source by default', () => {
    expect(dataSource()).toBe(httpDataSource);
  });

  it('queries read through the active data source', async () => {
    const list = vi.fn(async () => [car]);
    const getMe = vi.fn(async () => me);
    setDataSource(fakeDataSource({ me: getMe, vehicles: { list } }));
    const queryClient = createTestQueryClient();

    await expect(queryClient.fetchQuery(vehiclesQuery('archived'))).resolves.toEqual([car]);
    expect(list).toHaveBeenCalledWith('archived');
    await expect(queryClient.fetchQuery(meQuery)).resolves.toEqual(me);
    expect(getMe).toHaveBeenCalledTimes(1);
  });

  it('mutations write through the active data source and keep their invalidation', async () => {
    const create = vi.fn(async () => car);
    setDataSource(fakeDataSource({ vehicles: { create } }));
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCreateVehicle(), { wrapper });
    await result.current.mutateAsync({ make: 'Toyota', model: 'Corolla' });

    expect(create).toHaveBeenCalledWith({ make: 'Toyota', model: 'Corolla' });
    expect(queryClient.getQueryData(queryKeys.vehicles.detail('v1'))).toEqual(car);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.vehicles.all });
  });

  it('files are fetched through the active data source', async () => {
    const blob = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
    const get = vi.fn(async () => ({ blob, fileName: 'factura.pdf' }));
    setDataSource(fakeDataSource({ files: { get } }));
    download.downloadBlob.mockResolvedValue(undefined);

    await saveApiFile('/api/vehicles/v1/maintenance/m1/attachments/a1', 'fallback.pdf');

    expect(get).toHaveBeenCalledWith('/api/vehicles/v1/maintenance/m1/attachments/a1');
    expect(download.downloadBlob).toHaveBeenCalledWith('factura.pdf', blob);
  });
});
