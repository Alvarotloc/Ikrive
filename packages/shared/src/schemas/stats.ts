import { z } from 'zod';
import { MAINTENANCE_CATEGORIES } from '../enums';
import { isoDateSchema } from './vehicles';

/** Calendar month, `YYYY-MM`. */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/**
 * Statistics of a vehicle (`GET /api/vehicles/:id/stats`). Distances, quantities and amounts are in
 * the units and currency they were stored in; ratios are null when there is not enough data.
 */
export const vehicleStatsSchema = z.object({
  distance: z.object({
    /** Last reading minus the first one. */
    driven: z.number().int().nullable(),
    perYear: z.number().int().nullable(),
    perMonth: z.number().int().nullable(),
  }),
  /** Quantity per 100 units of distance (L/100 km, kWh/100 km, gal/100 mi). */
  consumption: z.object({ average: z.number().nullable() }),
  costPerDistance: z.object({ fuel: z.number().nullable(), maintenance: z.number().nullable() }),
  spending: z.object({
    purchase: z.number().nullable(),
    fuel: z.number(),
    maintenance: z.number(),
    /** Total cost of ownership: purchase + fuel + maintenance. */
    total: z.number(),
    byCategory: z.array(z.object({ category: z.enum(MAINTENANCE_CATEGORIES), total: z.number() })),
  }),
  series: z.object({
    distanceByMonth: z.array(z.object({ month: monthSchema, distance: z.number().int() })),
    consumptionBySegment: z.array(
      z.object({
        startDate: isoDateSchema,
        endDate: isoDateSchema,
        distance: z.number().int(),
        quantity: z.number(),
        consumption: z.number(),
      }),
    ),
    spendingByMonth: z.array(z.object({ month: monthSchema, fuel: z.number(), maintenance: z.number() })),
  }),
});
export type VehicleStats = z.infer<typeof vehicleStatsSchema>;
