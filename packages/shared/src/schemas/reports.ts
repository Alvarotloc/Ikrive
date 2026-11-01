import { z } from 'zod';

/** Query flag: `true`/`1` or `false`/`0` (case-insensitive); omitted means `false`. Anything else is a 400. */
const flag = z.stringbool({ truthy: ['true', '1'], falsy: ['false', '0'] }).default(false);

/**
 * Query of `GET /vehicles/:id/report.pdf`: privacy options of the sale report and whether to append the
 * invoices of the included maintenance records (they are appended as they are: the privacy options do
 * not apply to them).
 */
export const saleReportQuerySchema = z.object({
  hidePrices: flag,
  hidePlate: flag,
  hideVin: flag,
  includeInvoices: flag,
});

export type SaleReportOptions = z.output<typeof saleReportQuerySchema>;
