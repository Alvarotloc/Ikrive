import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { dataSource } from '@/lib/data-source';
import { queryKeys } from '@/lib/query-keys';
import type { CsvImportChoice } from './wizard';

/**
 * What importing `file` into the vehicle would do (`dryRun: true`). Never stale nor cached once unused:
 * it depends on what the vehicle has right now.
 */
export const csvImportPreviewQuery = (
  vehicleId: string,
  file: File,
  fileId: number,
  options: CsvImportChoice,
) =>
  queryOptions({
    queryKey: queryKeys.csvImport.preview(vehicleId, fileId, options),
    queryFn: () => dataSource().csvImport.import(vehicleId, file, { ...options, dryRun: true }),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });

/** The real import, with the options of the preview; on success invalidates every vehicle query. */
export function useCsvImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, file, options }: { vehicleId: string; file: File; options: CsvImportChoice }) =>
      dataSource().csvImport.import(vehicleId, file, options),
    // On the mutation, not on `mutate()`: it still runs if the user leaves the page mid-import.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all }),
  });
}
