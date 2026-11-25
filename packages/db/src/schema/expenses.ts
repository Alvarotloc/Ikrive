import { EXPENSE_CATEGORIES } from '@ikrive/shared';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { vehicles } from './vehicles';

const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/** Vehicle costs that are neither refuels nor maintenance (insurance, tax, tolls...). */
export const expenses = sqliteTable(
  'expenses',
  {
    id: id(),
    vehicleId: text()
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    /** Date-only, `YYYY-MM-DD`. */
    date: text().notNull(),
    /** Typed with `EXPENSE_CATEGORIES`; SQLite stores plain text and zod validates it. */
    category: text({ enum: EXPENSE_CATEGORIES }).notNull(),
    title: text(),
    description: text(),
    /** Decimal amount in the user's currency. */
    cost: real().notNull(),
    createdAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (t) => [index('expenses_vehicle_id_date_idx').on(t.vehicleId, t.date)],
);
