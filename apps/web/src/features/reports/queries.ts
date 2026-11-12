import {
  type CreateReportShare,
  type SaleReportOptions,
  saleReportFileName,
  type Vehicle,
} from '@ikrive/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { vehicleTitle } from '@/features/vehicles/display';
import { dataSource } from '@/lib/data-source';
import { downloadBlob } from '@/lib/download';
import { todayIso } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

/**
 * Generates the sale report PDF and saves it with the API file name (or the shared one when the
 * response has none). A mutation, not a query: it is an action and the PDF is `no-store`.
 * `onError` also runs when the dialog was closed while the report was generating.
 */
export function useDownloadSaleReport(
  vehicle: Pick<Vehicle, 'id' | 'name' | 'make' | 'model'>,
  { onError }: { onError: () => void },
) {
  return useMutation({
    mutationFn: async (options: SaleReportOptions) => {
      const { blob, fileName } = await dataSource().saleReport.download(vehicle.id, options);
      await downloadBlob(fileName ?? saleReportFileName(vehicleTitle(vehicle), todayIso()), blob);
    },
    // On the mutation, not on `mutate()`: those callbacks are dropped if the dialog closes mid-request.
    onError,
  });
}

/** Public links of a vehicle's sale report, newest first, with the status computed by the API. */
export const reportSharesQuery = (vehicleId: string) =>
  queryOptions({
    queryKey: queryKeys.vehicles.reportShares(vehicleId),
    queryFn: () => dataSource().reportShares.list(vehicleId),
  });

/** Creates a public link; its response carries the URL, the only time it is known. */
export function useCreateReportShare(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateReportShare) => dataSource().reportShares.create(vehicleId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.reportShares(vehicleId) }),
  });
}

export function useRevokeReportShare(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (shareId: string) => dataSource().reportShares.revoke(vehicleId, shareId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.reportShares(vehicleId) }),
  });
}
