import type { ClientConfig } from '@ikrive/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from './api-client';
import { queryKeys } from './query-keys';

/** Server configuration for the SPA (upload limit). It only changes when the server restarts. */
export const clientConfigQuery = queryOptions({
  queryKey: queryKeys.config,
  queryFn: () => api.get<ClientConfig>('/config'),
  staleTime: Infinity,
});
