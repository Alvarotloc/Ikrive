import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { dataSource } from '@/lib/data-source';
import { queryKeys } from '@/lib/query-keys';

/** First page of the user's notifications; polled while the app is open (the job runs hourly). */
export const notificationsQuery = queryOptions({
  queryKey: queryKeys.notifications.list,
  queryFn: () => dataSource().notifications.list(),
  refetchInterval: 60_000,
});

function useNotificationsMutation<TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });
}

export const useMarkNotificationRead = () =>
  useNotificationsMutation((id: string) => dataSource().notifications.markRead(id));

export const useMarkAllNotificationsRead = () =>
  useNotificationsMutation(() => dataSource().notifications.markAllRead());
