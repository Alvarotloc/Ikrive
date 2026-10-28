import type { CalendarFeed, CalendarFeedSecret } from '@ikrive/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

const PATH = '/settings/calendar-feed';

export const calendarFeedQuery = queryOptions({
  queryKey: queryKeys.calendarFeed,
  queryFn: () => api.get<CalendarFeed>(PATH),
});

/** Enables or regenerates the feed; the response carries the URL, the only time it is known. */
export function useEnableCalendarFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CalendarFeedSecret>(PATH),
    onSuccess: ({ enabled, createdAt }) =>
      queryClient.setQueryData<CalendarFeed>(queryKeys.calendarFeed, { enabled, createdAt }),
  });
}

export function useDisableCalendarFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>(PATH),
    onSuccess: () =>
      queryClient.setQueryData<CalendarFeed>(queryKeys.calendarFeed, { enabled: false, createdAt: null }),
  });
}
