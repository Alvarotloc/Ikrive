import { z } from 'zod';
import { resolveFuelPrices } from '../domain/fuel';
import { moneySchema, odometerValueSchema } from './common';
import { isoDateSchema } from './vehicles';

const fuelLogFieldsSchema = z.object({
  date: isoDateSchema,
  /** Odometer at the time of the refuel. Creates or updates a linked `fuel` reading. */
  odometer: odometerValueSchema,
  /** In `fuelQuantityUnit(vehicle.fuelType, settings.volumeUnit)`: litres, gallons or kWh. */
  quantity: z.number().positive().max(10_000),
  /** Decimal amounts in the user's currency. */
  totalPrice: moneySchema.positive(),
  pricePerUnit: moneySchema.positive(),
  fullTank: z.boolean().default(true),
  /** A previous refuel was not logged, so the consumption up to this one cannot be measured. */
  missedPrevious: z.boolean().default(false),
});

/** One of the two prices may be missing: it is computed from the quantity and the other one. */
export const createFuelLogSchema = fuelLogFieldsSchema
  .extend({ totalPrice: moneySchema.positive().optional(), pricePerUnit: moneySchema.positive().optional() })
  .refine((value) => value.totalPrice !== undefined || value.pricePerUnit !== undefined, {
    message: 'Either the total price or the price per unit is required',
    path: ['totalPrice'],
  })
  .transform((value) => ({ ...value, ...resolveFuelPrices(value) }));
export type CreateFuelLog = z.infer<typeof createFuelLogSchema>;
export type CreateFuelLogInput = z.input<typeof createFuelLogSchema>;

export const updateFuelLogSchema = fuelLogFieldsSchema
  // No defaults here: a partial PATCH must not reset the flags.
  .extend({ fullTank: z.boolean(), missedPrevious: z.boolean() })
  .partial();
export type UpdateFuelLog = z.infer<typeof updateFuelLogSchema>;
export type UpdateFuelLogInput = z.input<typeof updateFuelLogSchema>;

export const fuelLogSchema = z.object({
  id: z.string(),
  vehicleId: z.string(),
  date: isoDateSchema,
  odometer: z.number().int(),
  quantity: z.number(),
  totalPrice: z.number(),
  pricePerUnit: z.number(),
  fullTank: z.boolean(),
  missedPrevious: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type FuelLog = z.infer<typeof fuelLogSchema>;

export const fuelLogParamsSchema = z.object({ id: z.string().min(1), logId: z.string().min(1) });
