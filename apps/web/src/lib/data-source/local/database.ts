import { LOCAL_USER_ID } from '@ikrive/db';
import * as schema from '@ikrive/db/schema';
import { sql } from 'drizzle-orm';
import {
  type AsyncBatchRemoteCallback,
  type AsyncRemoteCallback,
  drizzle,
  type SqliteRemoteDatabase,
} from 'drizzle-orm/sqlite-proxy';
import { BUNDLED_MIGRATIONS, type BundledMigration, migrateLocal } from './migrations';

export type LocalDb = SqliteRemoteDatabase<typeof schema>;
/** A transaction of the local database (`db.transaction(async (tx) => …)`). */
export type LocalTx = Parameters<Parameters<LocalDb['transaction']>[0]>[0];

/** The synthetic user that owns every local row: the tables keep their foreign keys to `user.id`. */
export const LOCAL_USER = {
  id: LOCAL_USER_ID,
  name: 'Local',
  email: 'local@ikrive.invalid',
  role: 'user',
} as const;

/**
 * Opens the local database behind `callback` (the plugin on the device, better-sqlite3 in the tests):
 * turns the foreign keys on (the cascades of the schema rely on them), applies the pending migrations
 * and makes sure the local user and its settings (schema defaults = `DEFAULT_USER_SETTINGS`) exist.
 */
export async function openLocalDatabase(
  callback: AsyncRemoteCallback,
  migrations: readonly BundledMigration[] = BUNDLED_MIGRATIONS,
): Promise<LocalDb> {
  // `drizzle(callback, config)` drops `casing` (sqlite-proxy only reads it from the third argument), so the
  // config goes after a batch callback that runs the statements one by one.
  const batch: AsyncBatchRemoteCallback = async (queries) => {
    const results: Awaited<ReturnType<AsyncRemoteCallback>>[] = [];
    for (const query of queries) results.push(await callback(query.sql, query.params, query.method));
    return results;
  };
  const db = drizzle(callback, batch, { schema, casing: 'snake_case' });
  await db.run(sql`PRAGMA foreign_keys = ON`);
  await migrateLocal(db, migrations);
  await db.insert(schema.user).values(LOCAL_USER).onConflictDoNothing();
  await db.insert(schema.userSettings).values({ userId: LOCAL_USER_ID }).onConflictDoNothing();
  return db;
}
