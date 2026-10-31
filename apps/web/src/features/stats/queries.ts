import type { VehicleStats } from '@ikrive/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export const statsQuery = (vehicleId: string) =>
  queryOptions({
    queryKey: queryKeys.vehicles.stats(vehicleId),
    queryFn: () => api.get<VehicleStats>(`/vehicles/${vehicleId}/stats`),
  });
