import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { odometerReadings, vehicles } from './vehicles';

const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

export const fuelLogs = sqliteTable(
  'fuel_logs',
  {
    id: id(),
    vehicleId: text()
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    /** Date-only, `YYYY-MM-DD`. */
    date: text().notNull(),
    /** In the user's distance unit. Always set: the consumption between refuels needs it. */
    odometer: integer().notNull(),
    /** Reading created from this log. Kept in sync with `odometer` in the same transaction. */
    odometerReadingId: text().references(() => odometerReadings.id, { onDelete: 'set null' }),
    /** Unit derived on read: `fuelQuantityUnit(vehicle.fuelType, settings.volumeUnit)`. */
    quantity: real().notNull(),
    /** Decimal amount in the user's currency, 2 decimals when computed. */
    totalPrice: real().notNull(),
    /** Decimal amount in the user's currency, 3 decimals when computed. */
    pricePerUnit: real().notNull(),
    fullTank: integer({ mode: 'boolean' }).notNull().default(true),
    missedPrevious: integer({ mode: 'boolean' }).notNull().default(false),
    createdAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    index('fuel_logs_vehicle_id_date_idx').on(t.vehicleId, t.date),
    uniqueIndex('fuel_logs_odometer_reading_id_idx').on(t.odometerReadingId),
  ],
);
