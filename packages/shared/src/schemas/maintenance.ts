import { z } from 'zod';
import { MAINTENANCE_CATEGORIES } from '../enums';
import { moneySchema, odometerValueSchema, optionalText } from './common';
import { isoDateSchema } from './vehicles';

const maintenanceFieldsSchema = z.object({
  date: isoDateSchema,
  /** Odometer at the time of the maintenance. Creates or updates a linked `maintenance` reading. */
  odometer: odometerValueSchema.nullable().optional(),
  category: z.enum(MAINTENANCE_CATEGORIES),
  title: z.string().trim().min(1).max(120),
  description: optionalText(2000),
  workshop: optionalText(120),
  cost: moneySchema.nullable().optional(),
  includeInReport: z.boolean().default(true),
});

export const createMaintenanceRecordSchema = maintenanceFieldsSchema;
export type CreateMaintenanceRecord = z.infer<typeof createMaintenanceRecordSchema>;
export type CreateMaintenanceRecordInput = z.input<typeof createMaintenanceRecordSchema>;

export const updateMaintenanceRecordSchema = maintenanceFieldsSchema
  // No default here: a partial PATCH must not reset the flag.
  .extend({ includeInReport: z.boolean() })
  .partial();
export type UpdateMaintenanceRecord = z.infer<typeof updateMaintenanceRecordSchema>;
export type UpdateMaintenanceRecordInput = z.input<typeof updateMaintenanceRecordSchema>;

export const maintenanceRecordSchema = z.object({
  id: z.string(),
  vehicleId: z.string(),
  date: isoDateSchema,
  odometer: z.number().int().nullable(),
  category: z.enum(MAINTENANCE_CATEGORIES),
  title: z.string(),
  description: z.string().nullable(),
  workshop: z.string().nullable(),
  cost: z.number().nullable(),
  includeInReport: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type MaintenanceRecord = z.infer<typeof maintenanceRecordSchema>;

export const maintenanceRecordParamsSchema = z.object({ id: z.string().min(1), recordId: z.string().min(1) });
