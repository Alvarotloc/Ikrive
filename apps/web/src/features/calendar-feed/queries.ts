import type { CalendarFeed } from '@ikrive/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { dataSource } from '@/lib/data-source';
import { queryKeys } from '@/lib/query-keys';

export const calendarFeedQuery = queryOptions({
  queryKey: queryKeys.calendarFeed,
  queryFn: () => dataSource().calendarFeed.get(),
});

/** Enables or regenerates the feed; the response carries the URL, the only time it is known. */
export function useEnableCalendarFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => dataSource().calendarFeed.enable(),
    onSuccess: ({ enabled, createdAt }) =>
      queryClient.setQueryData<CalendarFeed>(queryKeys.calendarFeed, { enabled, createdAt }),
  });
}

export function useDisableCalendarFeed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => dataSource().calendarFeed.disable(),
    onSuccess: () =>
      queryClient.setQueryData<CalendarFeed>(queryKeys.calendarFeed, { enabled: false, createdAt: null }),
  });
}
