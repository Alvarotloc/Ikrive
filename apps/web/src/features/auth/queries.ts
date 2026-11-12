import { queryOptions } from '@tanstack/react-query';
import { dataSource } from '@/lib/data-source';
import { queryKeys } from '@/lib/query-keys';

/** Current user, or null when there is no session. */
export const meQuery = queryOptions({
  queryKey: queryKeys.me,
  queryFn: () => dataSource().me(),
  staleTime: 5 * 60_000,
});
