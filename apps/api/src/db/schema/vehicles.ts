import { FUEL_TYPES, ODOMETER_SOURCES, VEHICLE_TYPES } from '@ikrive/shared';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './auth';

const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

export const vehicles = sqliteTable(
  'vehicles',
  {
    id: id(),
    ownerId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text(),
    make: text().notNull(),
    model: text().notNull(),
    version: text(),
    year: integer(),
    plate: text(),
    vin: text(),
    type: text({ enum: VEHICLE_TYPES }).notNull().default('car'),
    fuelType: text({ enum: FUEL_TYPES }).notNull().default('gasoline'),
    /** Date-only values are stored as `YYYY-MM-DD`. */
    purchaseDate: text(),
    purchasePrice: real(),
    purchaseOdometer: integer(),
    notes: text(),
    /** File name of the photo inside the uploads directory. */
    photo: text(),
    soldAt: text(),
    archivedAt: integer({ mode: 'timestamp_ms' }),
    createdAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (t) => [index('vehicles_owner_id_idx').on(t.ownerId)],
);

export const odometerReadings = sqliteTable(
  'odometer_readings',
  {
    id: id(),
    vehicleId: text()
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    date: text().notNull(),
    value: integer().notNull(),
    source: text({ enum: ODOMETER_SOURCES }).notNull().default('manual'),
    createdAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('odometer_readings_vehicle_id_date_idx').on(t.vehicleId, t.date)],
);
