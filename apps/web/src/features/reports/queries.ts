import { type SaleReportOptions, saleReportFileName, type Vehicle } from '@ikrive/shared';
import { useMutation } from '@tanstack/react-query';
import { vehicleTitle } from '@/features/vehicles/display';
import { api } from '@/lib/api-client';
import { downloadBlob } from '@/lib/download';
import { todayIso } from '@/lib/format';
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
