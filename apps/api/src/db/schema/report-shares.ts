import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { vehicles } from './vehicles';

const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/**
 * Public read-only link to a vehicle's sale report. The token is never stored: only its selector
 * (lookup) and the SHA-256 of its verifier (compared in constant time), as in `calendar_feeds`.
 * Ownership comes from `vehicles.owner_id`; the status is derived on read from the two dates.
 */
export const reportShares = sqliteTable(
  'report_shares',
  {
    id: id(),
    vehicleId: text()
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    selector: text().notNull(),
    /** Hex SHA-256 of the verifier. */
    verifierHash: text().notNull(),
    hidePrices: integer({ mode: 'boolean' }).notNull().default(false),
    hidePlate: integer({ mode: 'boolean' }).notNull().default(false),
    hideVin: integer({ mode: 'boolean' }).notNull().default(false),
    includeInvoices: integer({ mode: 'boolean' }).notNull().default(false),
    expiresAt: integer({ mode: 'timestamp_ms' }).notNull(),
    revokedAt: integer({ mode: 'timestamp_ms' }),
    createdAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('report_shares_selector_idx').on(t.selector),
    index('report_shares_vehicle_id_idx').on(t.vehicleId),
  ],
);
