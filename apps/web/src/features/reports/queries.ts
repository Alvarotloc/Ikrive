import {
  type CreateReportShare,
  type ReportShare,
  type ReportShareSecret,
  type SaleReportOptions,
  saleReportFileName,
  type Vehicle,
} from '@ikrive/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { vehicleTitle } from '@/features/vehicles/display';
import { api } from '@/lib/api-client';
import { downloadBlob } from '@/lib/download';
import { todayIso } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import { saleReportPath } from './sale-report';

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
      const { blob, fileName } = await api.download(saleReportPath(vehicle.id, options));
      downloadBlob(fileName ?? saleReportFileName(vehicleTitle(vehicle), todayIso()), blob);
    },
    // On the mutation, not on `mutate()`: those callbacks are dropped if the dialog closes mid-request.
    onError,
  });
}

/** Public links of a vehicle's sale report, newest first, with the status computed by the API. */
export const reportSharesQuery = (vehicleId: string) =>
  queryOptions({
    queryKey: queryKeys.vehicles.reportShares(vehicleId),
    queryFn: () => api.get<ReportShare[]>(`/vehicles/${vehicleId}/report-shares`),
  });

/** Creates a public link; its response carries the URL, the only time it is known. */
export function useCreateReportShare(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateReportShare) =>
      api.post<ReportShareSecret>(`/vehicles/${vehicleId}/report-shares`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.reportShares(vehicleId) }),
  });
}

export function useRevokeReportShare(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (shareId: string) => api.delete<void>(`/vehicles/${vehicleId}/report-shares/${shareId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.reportShares(vehicleId) }),
  });
}
