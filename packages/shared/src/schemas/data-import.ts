import { z } from 'zod';

const countSchema = z.number().int().min(0);

/** `type` of the 409 problem answered to an export already imported into the account. */
export const DUPLICATE_IMPORT_PROBLEM_TYPE = 'urn:ikrive:problem:duplicate-import';

const vehicleRefSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  make: z.string(),
  model: z.string(),
});

/** Imported vehicle whose plate or VIN matches one the account already had. Nothing is merged. */
export const importedVehicleMatchSchema = z.object({
  /** The vehicle created by the import (its new id). */
  imported: vehicleRefSchema,
  /** The vehicle the account already had. */
  existing: vehicleRefSchema,
  matchedBy: z.array(z.enum(['plate', 'vin'])).min(1),
});
export type ImportedVehicleMatch = z.infer<typeof importedVehicleMatchSchema>;

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
  /** Imported vehicles that look like ones the account already had (same plate or VIN). */
  matchingVehicles: z.array(importedVehicleMatchSchema),
});
export type DataImportSummary = z.infer<typeof dataImportSummarySchema>;
