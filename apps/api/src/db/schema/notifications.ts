import { NOTIFICATION_TYPES } from '@ikrive/shared';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './auth';
import { vehicles } from './vehicles';

const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

export const notifications = sqliteTable(
  'notifications',
  {
    id: id(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Nullable for future kinds without a vehicle; deleting the vehicle deletes its notifications. */
    vehicleId: text().references(() => vehicles.id, { onDelete: 'cascade' }),
    type: text({ enum: NOTIFICATION_TYPES }).notNull(),
    title: text().notNull(),
    body: text(),
    /** Internal SPA path. */
    link: text(),
    /** Unique per event, so running a job again does not notify twice. */
    dedupeKey: text().notNull(),
    readAt: integer({ mode: 'timestamp_ms' }),
    createdAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index('notifications_user_id_created_at_idx').on(t.userId, t.createdAt),
    uniqueIndex('notifications_dedupe_key_idx').on(t.dedupeKey),
    index('notifications_vehicle_id_idx').on(t.vehicleId),
  ],
);
