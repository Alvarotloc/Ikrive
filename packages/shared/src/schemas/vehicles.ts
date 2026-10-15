import { z } from 'zod';
import { FUEL_TYPES, ODOMETER_SOURCES, VEHICLE_STATUSES, VEHICLE_TYPES } from '../enums';
import { moneySchema, odometerValueSchema, optionalText } from './common';

/** Calendar date without time, `YYYY-MM-DD`. Date-only values avoid time zone shifts. */
export const isoDateSchema = z.iso.date();

const vehicleFieldsSchema = z.object({
  name: optionalText(60),
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  version: optionalText(80),
  year: z.number().int().min(1886).max(2100).nullable().optional(),
  plate: optionalText(20, { upperCase: true }),
  vin: optionalText(17, { upperCase: true }),
  type: z.enum(VEHICLE_TYPES).default('car'),
  fuelType: z.enum(FUEL_TYPES).default('gasoline'),
  purchaseDate: isoDateSchema.nullable().optional(),
  purchasePrice: moneySchema.nullable().optional(),
  purchaseOdometer: odometerValueSchema.nullable().optional(),
  notes: optionalText(2000),
});

export const createVehicleSchema = vehicleFieldsSchema.extend({
  /** Current odometer value. Creates the first manual reading, dated today. */
  currentOdometer: odometerValueSchema.nullable().optional(),
});
export type CreateVehicle = z.infer<typeof createVehicleSchema>;
export type CreateVehicleInput = z.input<typeof createVehicleSchema>;

export const updateVehicleSchema = vehicleFieldsSchema
  .extend({
    type: z.enum(VEHICLE_TYPES),
    fuelType: z.enum(FUEL_TYPES),
    soldAt: isoDateSchema.nullable(),
    archived: z.boolean(),
  })
  .partial();
export type UpdateVehicle = z.infer<typeof updateVehicleSchema>;
export type UpdateVehicleInput = z.input<typeof updateVehicleSchema>;

export const odometerReadingSchema = z.object({
  id: z.string(),
  vehicleId: z.string(),
  date: isoDateSchema,
  value: z.number().int(),
  source: z.enum(ODOMETER_SOURCES),
  createdAt: z.iso.datetime(),
});
export type OdometerReading = z.infer<typeof odometerReadingSchema>;

export const createOdometerReadingSchema = z.object({
  date: isoDateSchema,
  value: odometerValueSchema,
});
export type CreateOdometerReading = z.infer<typeof createOdometerReadingSchema>;

export const vehicleSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  make: z.string(),
  model: z.string(),
  version: z.string().nullable(),
  year: z.number().int().nullable(),
  plate: z.string().nullable(),
  vin: z.string().nullable(),
  type: z.enum(VEHICLE_TYPES),
  fuelType: z.enum(FUEL_TYPES),
  purchaseDate: isoDateSchema.nullable(),
  purchasePrice: z.number().nullable(),
  purchaseOdometer: z.number().int().nullable(),
  notes: z.string().nullable(),
  soldAt: isoDateSchema.nullable(),
  archivedAt: z.iso.datetime().nullable(),
  status: z.enum(VEHICLE_STATUSES),
  /** Relative URL of the photo (with a cache-busting version), or null. */
  photoUrl: z.string().nullable(),
  /** Latest odometer reading, the single source of truth for the mileage. */
  odometer: z.object({ value: z.number().int(), date: isoDateSchema }).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Vehicle = z.infer<typeof vehicleSchema>;

export const vehicleListQuerySchema = z.object({
  status: z.enum([...VEHICLE_STATUSES, 'all']).default('active'),
});
export type VehicleListQuery = z.input<typeof vehicleListQuerySchema>;

export const vehicleOdometerParamsSchema = z.object({ id: z.string().min(1), readingId: z.string().min(1) });
