import type { Me } from '@ikrive/shared';
import { queryOptions } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

/** Current user, or null when there is no session. */
export const meQuery = queryOptions({
  queryKey: queryKeys.me,
  queryFn: async (): Promise<Me | null> => {
    try {
      return await api.get<Me>('/me');
    } catch (error) {
      if (error instanceof ApiError && error.problem.status === 401) return null;
      throw error;
    }
  },
  staleTime: 5 * 60_000,
});
