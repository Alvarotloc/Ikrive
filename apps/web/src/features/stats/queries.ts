import { queryOptions } from '@tanstack/react-query';
import { dataSource } from '@/lib/data-source';
import { queryKeys } from '@/lib/query-keys';

export const statsQuery = (vehicleId: string) =>
  queryOptions({
    queryKey: queryKeys.vehicles.stats(vehicleId),
    queryFn: () => dataSource().stats.get(vehicleId),
  });
