import type { UpdateUserSettings } from '@ikrive/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { dataSource } from '@/lib/data-source';
import { queryKeys } from '@/lib/query-keys';

export const settingsQuery = queryOptions({
  queryKey: queryKeys.settings,
  queryFn: () => dataSource().settings.get(),
});

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: UpdateUserSettings) => dataSource().settings.update(changes),
    onSuccess: (settings) => queryClient.setQueryData(queryKeys.settings, settings),
  });
}
