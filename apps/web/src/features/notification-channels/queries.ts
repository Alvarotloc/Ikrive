import type { CreateNotificationChannelInput, UpdateNotificationChannelInput } from '@ikrive/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { dataSource } from '@/lib/data-source';
import { queryKeys } from '@/lib/query-keys';

export const notificationChannelsQuery = queryOptions({
  queryKey: queryKeys.notificationChannels.all,
  queryFn: () => dataSource().notificationChannels.list(),
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
    dataSource().notificationChannels.create(channel),
  );

export const useUpdateChannel = () =>
  useChannelMutation(({ id, changes }: { id: string; changes: UpdateNotificationChannelInput }) =>
    dataSource().notificationChannels.update(id, changes),
  );

export const useDeleteChannel = () =>
  useChannelMutation((id: string) => dataSource().notificationChannels.remove(id));

export const useTestChannel = () =>
  useChannelMutation((id: string) => dataSource().notificationChannels.test(id));
