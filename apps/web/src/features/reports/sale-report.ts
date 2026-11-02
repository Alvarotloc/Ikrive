import type { SaleReportOptions } from '@ikrive/shared';

/** The query flags of `GET /vehicles/:id/report.pdf`, in the order of `saleReportQuerySchema`. */
const OPTION_KEYS = [
  'hidePrices',
  'hidePlate',
  'hideVin',
  'includeInvoices',
] as const satisfies readonly (keyof SaleReportOptions)[];

/** `/vehicles/<id>/report.pdf` + `?<flag>=true` for the checked options only (the API defaults the rest to `false`). */
export function saleReportPath(vehicleId: string, options: SaleReportOptions): string {
  const query = new URLSearchParams();
  for (const key of OPTION_KEYS) if (options[key]) query.set(key, 'true');
  const search = query.toString();
  return `/vehicles/${vehicleId}/report.pdf${search ? `?${search}` : ''}`;
}

/**
 * File name of a `Content-Disposition` header: the RFC 5987 `filename*` (UTF-8) when present and
 * decodable, otherwise `filename`, otherwise `null`.
 */
export function fileNameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const extended = /filename\*\s*=\s*UTF-8''([^;\s]+)/i.exec(header)?.[1];
  if (extended) {
    try {
      const decoded = decodeURIComponent(extended);
      if (decoded) return decoded;
    } catch {
      // Malformed percent-encoding: fall back to the plain `filename`.
    }
  }
  const plain = /filename\s*=\s*(?:"([^"]*)"|([^;\s]+))/i.exec(header);
  return plain?.[1] || plain?.[2] || null;
}

/** Whether any privacy option is checked (`includeInvoices` is not one). */
export const hidesAnything = (options: SaleReportOptions) =>
  options.hidePrices || options.hidePlate || options.hideVin;
