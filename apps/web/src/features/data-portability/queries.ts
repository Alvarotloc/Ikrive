import type { DataImportSummary } from '@ikrive/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

/** A plain link: the browser streams the zip to disk with the `Content-Disposition` file name. */
export const EXPORT_URL = '/api/me/export';

/** `POST /me/import` with the zip; on success invalidates the vehicles and notification channels. */
export function useImportData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return api.post<DataImportSummary>('/me/import', body);
    },
    // On the mutation, not on `mutate()`: it still runs if the user leaves Settings mid-import.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.notificationChannels.all }),
      ]),
  });
}
