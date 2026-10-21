import { MAINTENANCE_CATEGORIES } from '@ikrive/shared';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { odometerReadings, vehicles } from './vehicles';

const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/**
 * Periodic maintenance rule of a vehicle: every `intervalMonths` and/or every `intervalDistance`,
 * whichever comes first. Only the last time it was done is stored; the next due date, odometer and
 * status are computed on read because they depend on today and on the odometer readings.
 */
export const maintenanceSchedules = sqliteTable(
  'maintenance_schedules',
  {
    id: id(),
    vehicleId: text()
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    category: text({ enum: MAINTENANCE_CATEGORIES }).notNull(),
    intervalMonths: integer(),
    /** In the user's distance unit, like the odometer. */
    intervalDistance: integer(),
    warnDays: integer().notNull(),
    warnDistance: integer().notNull(),
    /** Date-only, `YYYY-MM-DD`. */
    lastDoneDate: text().notNull(),
    lastDoneOdometer: integer(),
    createdAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (t) => [index('maintenance_schedules_vehicle_id_idx').on(t.vehicleId)],
);

export const maintenanceRecords = sqliteTable(
  'maintenance_records',
  {
    id: id(),
    vehicleId: text()
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    /** Date-only, `YYYY-MM-DD`. */
    date: text().notNull(),
    odometer: integer(),
    /** Reading created from this record. Kept in sync with `odometer` in the same transaction. */
    odometerReadingId: text().references(() => odometerReadings.id, { onDelete: 'set null' }),
    category: text({ enum: MAINTENANCE_CATEGORIES }).notNull(),
    title: text().notNull(),
    description: text(),
    workshop: text(),
    /** Decimal amount in the user's currency (`user_settings.currency`). */
    cost: real(),
    includeInReport: integer({ mode: 'boolean' }).notNull().default(true),
    /** Schedule this record fulfils. Deleting the schedule keeps the record, unlinked. */
    scheduleId: text().references(() => maintenanceSchedules.id, { onDelete: 'set null' }),
    createdAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    index('maintenance_records_vehicle_id_date_idx').on(t.vehicleId, t.date),
    uniqueIndex('maintenance_records_odometer_reading_id_idx').on(t.odometerReadingId),
  ],
);
