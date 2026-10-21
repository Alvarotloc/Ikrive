import { z } from 'zod';
import { MAINTENANCE_CATEGORIES, SCHEDULE_STATUSES } from '../enums';
import { odometerValueSchema } from './common';
import { isoDateSchema } from './vehicles';

const intervalMonthsSchema = z.number().int().min(1).max(240);
/** Distance interval in the user's distance unit, like `odometer`. */
const intervalDistanceSchema = z.number().int().min(1).max(1_000_000);
const warnDaysSchema = z.number().int().min(0).max(365);
const warnDistanceSchema = z.number().int().min(0).max(100_000);

const scheduleFieldsSchema = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.enum(MAINTENANCE_CATEGORIES),
  intervalMonths: intervalMonthsSchema.nullable().optional(),
  intervalDistance: intervalDistanceSchema.nullable().optional(),
  /** Days before the due date (by months) from which the schedule is `due_soon`. */
  warnDays: warnDaysSchema.default(30),
  /** Distance before the due odometer from which the schedule is `due_soon`. */
  warnDistance: warnDistanceSchema.default(1000),
  /** Last time it was done. Defaults to the vehicle purchase, or today and the latest reading. */
  lastDoneDate: isoDateSchema.optional(),
  lastDoneOdometer: odometerValueSchema.nullable().optional(),
});

const SCHEDULE_INTERVAL_REQUIRED = 'A schedule needs an interval in months or distance';

const hasInterval = (value: { intervalMonths?: number | null; intervalDistance?: number | null }) =>
  value.intervalMonths != null || value.intervalDistance != null;

export const createMaintenanceScheduleSchema = scheduleFieldsSchema.refine(hasInterval, {
  path: ['intervalMonths'],
  message: SCHEDULE_INTERVAL_REQUIRED,
});
export type CreateMaintenanceSchedule = z.infer<typeof createMaintenanceScheduleSchema>;
export type CreateMaintenanceScheduleInput = z.input<typeof createMaintenanceScheduleSchema>;

/** Partial update. The service checks that the merged schedule still has an interval. */
export const updateMaintenanceScheduleSchema = scheduleFieldsSchema
  // No defaults here: a partial PATCH must not reset the thresholds.
  .extend({ warnDays: warnDaysSchema, warnDistance: warnDistanceSchema })
  .partial();
export type UpdateMaintenanceSchedule = z.infer<typeof updateMaintenanceScheduleSchema>;
export type UpdateMaintenanceScheduleInput = z.input<typeof updateMaintenanceScheduleSchema>;

export const maintenanceScheduleSchema = z.object({
  id: z.string(),
  vehicleId: z.string(),
  title: z.string(),
  category: z.enum(MAINTENANCE_CATEGORIES),
  intervalMonths: z.number().int().nullable(),
  intervalDistance: z.number().int().nullable(),
  warnDays: z.number().int(),
  warnDistance: z.number().int(),
  lastDoneDate: isoDateSchema,
  lastDoneOdometer: z.number().int().nullable(),
  /** Computed on read: earliest of the date by months and the date estimated from the distance. */
  nextDueDate: isoDateSchema.nullable(),
  nextDueDateEstimated: z.boolean(),
  nextDueOdometer: z.number().int().nullable(),
  status: z.enum(SCHEDULE_STATUSES),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type MaintenanceSchedule = z.infer<typeof maintenanceScheduleSchema>;

export const maintenanceScheduleParamsSchema = z.object({
  id: z.string().min(1),
  scheduleId: z.string().min(1),
});
