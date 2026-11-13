import { MIGRATIONS_FOLDER } from '@ikrive/db';
import { user, userSettings } from '@ikrive/db/schema';
import { DEFAULT_USER_SETTINGS } from '@ikrive/shared';
import Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { type AsyncRemoteCallback, drizzle as drizzleProxy } from 'drizzle-orm/sqlite-proxy';
import { describe, expect, it } from 'vitest';
import { createMemorySqlite } from '@/test/memory-sqlite';
import { type LocalDb, openLocalDatabase } from './database';
import { BUNDLED_MIGRATIONS, migrateLocal } from './migrations';

const SCHEMA_QUERY =
  "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name";

/** `sqlite_master` of a database migrated by the API's migrator (better-sqlite3, from the SQL files). */
function apiSchema(): unknown[][] {
  const sqlite = new Database(':memory:');
  migrate(drizzle({ client: sqlite }), { migrationsFolder: MIGRATIONS_FOLDER });
  return sqlite.prepare(SCHEMA_QUERY).raw().all() as unknown[][];
}

const localSchema = (db: LocalDb) => db.values(sql.raw(SCHEMA_QUERY));

/** Counts the `run` calls that reach the engine, to tell whether reopening applies anything. */
function countingCallback(callback: AsyncRemoteCallback) {
  const statements: string[] = [];
  const counted: AsyncRemoteCallback = (query, params, method) => {
    statements.push(query);
    return callback(query, params, method);
  };
  return { counted, statements };
}

describe('openLocalDatabase', () => {
  it('creates the same schema as the API migrator', async () => {
    const db = await openLocalDatabase(createMemorySqlite());

    expect(await localSchema(db)).toEqual(apiSchema());
  });

  it('applies only pending migrations on reopen', async () => {
    const callback = createMemorySqlite();
    // The first migrations only, as an older app version would have left the database.
    await migrateLocal(drizzleProxy(callback), BUNDLED_MIGRATIONS.slice(0, 5));
    const { counted, statements } = countingCallback(callback);

    const db = await openLocalDatabase(counted);
    const applied = await db.values<[string, number]>(
      sql`SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at`,
    );

    expect(applied).toHaveLength(13);
    expect(applied.map(([, createdAt]) => Number(createdAt))).toEqual(
      BUNDLED_MIGRATIONS.map((migration) => migration.when),
    );
    const created = (table: string) =>
      statements.some((statement) => statement.includes(`CREATE TABLE \`${table}\``));
    expect(created('vehicles')).toBe(false);
    expect(created('maintenance_schedules')).toBe(false);
    expect(created('notifications')).toBe(true);

    // A third open has nothing left to apply and keeps the 13 rows.
    const again = await openLocalDatabase(callback);
    expect(await again.values(sql`SELECT id FROM __drizzle_migrations`)).toHaveLength(13);
    expect(await localSchema(again)).toEqual(apiSchema());
  });

  it('records the same migration hashes as the API migrator', async () => {
    const db = await openLocalDatabase(createMemorySqlite());
    const sqlite = new Database(':memory:');
    migrate(drizzle({ client: sqlite }), { migrationsFolder: MIGRATIONS_FOLDER });

    expect(
      await db.values(sql`SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at`),
    ).toEqual(
      sqlite.prepare('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at').raw().all(),
    );
  });

  it('seeds the local user and default settings once', async () => {
    const callback = createMemorySqlite();
    await openLocalDatabase(callback);
    const db = await openLocalDatabase(callback);

    const users = await db.select().from(user);
    const settings = await db.select().from(userSettings);

    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      id: 'local',
      name: 'Local',
      email: 'local@ikrive.invalid',
      role: 'user',
    });
    expect(settings).toEqual([{ userId: 'local', ...DEFAULT_USER_SETTINGS }]);
  });
});
