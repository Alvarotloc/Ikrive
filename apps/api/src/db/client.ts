import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIGRATIONS_FOLDER } from '@ikrive/db';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

export type Db = ReturnType<typeof createDb>;

/** Opens (or creates) the SQLite database. Pass ':memory:' for tests. */
export function createDb(filename: string) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const sqlite = new Database(filename);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  return drizzle({ client: sqlite, schema, casing: 'snake_case' });
}

// The bundled build ships them in dist/migrations (next to the bundle); from sources (development,
// tests) they are read from packages/db.
const BUNDLED_MIGRATIONS_DIR = fileURLToPath(new URL('./migrations', import.meta.url));
const MIGRATIONS_DIR = existsSync(BUNDLED_MIGRATIONS_DIR) ? BUNDLED_MIGRATIONS_DIR : MIGRATIONS_FOLDER;

export function runMigrations(db: Db) {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
