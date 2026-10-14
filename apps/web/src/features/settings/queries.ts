import type { UpdateUserSettings, UserSettings } from '@ikrive/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export const settingsQuery = queryOptions({
  queryKey: queryKeys.settings,
  queryFn: () => api.get<UserSettings>('/settings'),
});

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: UpdateUserSettings) => api.patch<UserSettings>('/settings', changes),
    onSuccess: (settings) => queryClient.setQueryData(queryKeys.settings, settings),
  });
}
