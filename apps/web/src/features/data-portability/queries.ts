import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataSource } from '@/lib/data-source';
import { queryKeys } from '@/lib/query-keys';

/** A plain link: the browser streams the zip to disk with the `Content-Disposition` file name. */
export const EXPORT_URL = '/api/me/export';

/**
 * The export zip through the `DataSource` (server mode: `GET /me/export` with the token; local mode:
 * built on the device). The browser uses `EXPORT_URL` instead.
 */
export function useExportData() {
  return useMutation({
    mutationFn: () => dataSource().dataPortability.export(),
  });
}

/** `POST /me/import` with the zip; on success invalidates the vehicles and notification channels. */
export function useImportData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => dataSource().dataPortability.import(file),
    // On the mutation, not on `mutate()`: it still runs if the user leaves Settings mid-import.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.notificationChannels.all }),
      ]),
  });
}
