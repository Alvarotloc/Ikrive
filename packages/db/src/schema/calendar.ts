import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './auth';

/**
 * Personal iCal feed of a user (one row per user; no row = disabled). The token is never stored:
 * only its selector (lookup) and the SHA-256 of its verifier (compared in constant time).
 */
export const calendarFeeds = sqliteTable(
  'calendar_feeds',
  {
    userId: text()
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    selector: text().notNull(),
    /** Hex SHA-256 of the verifier. */
    verifierHash: text().notNull(),
    createdAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex('calendar_feeds_selector_idx').on(t.selector)],
);
