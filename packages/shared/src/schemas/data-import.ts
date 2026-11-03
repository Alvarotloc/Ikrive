import { z } from 'zod';

const countSchema = z.number().int().min(0);

/** Response of `POST /api/me/import`: what was added to the account, and what was left out. */
export const dataImportSummarySchema = z.object({
  vehicles: countSchema,
  odometerReadings: countSchema,
  maintenanceSchedules: countSchema,
  maintenanceRecords: countSchema,
  fuelLogs: countSchema,
  attachments: countSchema,
  /** Vehicle photos. */
  photos: countSchema,
  notificationChannels: countSchema,
  skipped: z.object({
    /** Channels with a token (not in the export) or with a config the current schema rejects. */
    notificationChannels: countSchema,
  }),
});
export type DataImportSummary = z.infer<typeof dataImportSummarySchema>;
