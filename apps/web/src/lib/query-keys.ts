import type { VehicleListQuery } from '@ikrive/shared';

export const queryKeys = {
  me: ['me'] as const,
  settings: ['settings'] as const,
  vehicles: {
    all: ['vehicles'] as const,
    list: (status: NonNullable<VehicleListQuery['status']>) => ['vehicles', 'list', status] as const,
    detail: (id: string) => ['vehicles', 'detail', id] as const,
    odometer: (id: string) => ['vehicles', 'detail', id, 'odometer'] as const,
    maintenance: (id: string) => ['vehicles', 'detail', id, 'maintenance'] as const,
  },
};
