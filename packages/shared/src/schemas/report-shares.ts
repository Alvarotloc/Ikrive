import { z } from 'zod';
import { REPORT_SHARE_STATUSES } from '../enums';

/**
 * Options stored in a public link to the sale report. JSON booleans, not `z.stringbool`: the query of
 * `report.pdf` accepts `"true"`/`"1"`, a JSON body uses real booleans.
 */
export const reportShareOptionsSchema = z.object({
  hidePrices: z.boolean().default(false),
  hidePlate: z.boolean().default(false),
  hideVin: z.boolean().default(false),
  includeInvoices: z.boolean().default(false),
});

/** Body of `POST /vehicles/:id/report-shares`; `{}` takes every default. */
export const createReportShareSchema = reportShareOptionsSchema.extend({
  expiresInDays: z.number().int().min(1).max(90).default(30),
});
export type CreateReportShare = z.input<typeof createReportShareSchema>;

/** A public link as listed: never includes its token. */
export const reportShareSchema = z.object({
  id: z.string(),
  hidePrices: z.boolean(),
  hidePlate: z.boolean(),
  hideVin: z.boolean(),
  includeInvoices: z.boolean(),
  expiresAt: z.string(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
  status: z.enum(REPORT_SHARE_STATUSES),
});
export type ReportShare = z.infer<typeof reportShareSchema>;

/** Response of creating a link: the only time its public URL (and token) is returned. */
export const reportShareSecretSchema = reportShareSchema.extend({ url: z.url() });
export type ReportShareSecret = z.infer<typeof reportShareSecretSchema>;

export const reportShareParamsSchema = z.object({ id: z.string().min(1), shareId: z.string().min(1) });
