import type { Notification, NotificationList } from '@ikrive/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

/** First page of the user's notifications; polled while the app is open (the job runs hourly). */
export const notificationsQuery = queryOptions({
  queryKey: queryKeys.notifications.list,
  queryFn: () => api.get<NotificationList>('/notifications'),
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
  useNotificationsMutation((id: string) => api.patch<Notification>(`/notifications/${id}/read`));

export const useMarkAllNotificationsRead = () =>
  useNotificationsMutation(() => api.post<void>('/notifications/read-all'));
