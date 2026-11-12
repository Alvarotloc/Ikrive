import { queryOptions } from '@tanstack/react-query';
import { dataSource } from './data-source';
import { queryKeys } from './query-keys';

/** Server configuration for the SPA (upload limit). It only changes when the server restarts. */
export const clientConfigQuery = queryOptions({
  queryKey: queryKeys.config,
  queryFn: () => dataSource().config(),
  staleTime: Infinity,
});
