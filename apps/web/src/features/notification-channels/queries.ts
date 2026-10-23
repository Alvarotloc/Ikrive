import type {
  CreateNotificationChannelInput,
  NotificationChannel,
  NotificationChannelTestResult,
  UpdateNotificationChannelInput,
} from '@ikrive/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export const notificationChannelsQuery = queryOptions({
  queryKey: queryKeys.notificationChannels.all,
  queryFn: () => api.get<NotificationChannel[]>('/notification-channels'),
});

/** Every change refreshes the list; a test too, since it stores or clears `lastError`. */
function useChannelMutation<TVariables, TResult>(mutationFn: (variables: TVariables) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notificationChannels.all }),
  });
}

export const useCreateChannel = () =>
  useChannelMutation((channel: CreateNotificationChannelInput) =>
    api.post<NotificationChannel>('/notification-channels', channel),
  );

export const useUpdateChannel = () =>
  useChannelMutation(({ id, changes }: { id: string; changes: UpdateNotificationChannelInput }) =>
    api.patch<NotificationChannel>(`/notification-channels/${id}`, changes),
  );

export const useDeleteChannel = () =>
  useChannelMutation((id: string) => api.delete<void>(`/notification-channels/${id}`));

export const useTestChannel = () =>
  useChannelMutation((id: string) =>
    api.post<NotificationChannelTestResult>(`/notification-channels/${id}/test`),
  );
