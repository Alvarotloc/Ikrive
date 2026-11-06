import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './auth';

/**
 * Fingerprint of each export imported into an account, so the same `data.json` is not imported
 * twice. The unique index is the guarantee (also against concurrent imports); the service only
 * checks first to answer early. Not exported: it is not user data.
 */
export const dataImports = sqliteTable(
  'data_imports',
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Hex SHA-256 of the bytes of the imported `data.json`. */
    dataSha256: text().notNull(),
    createdAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex('data_imports_user_id_data_sha256_idx').on(t.userId, t.dataSha256)],
);
