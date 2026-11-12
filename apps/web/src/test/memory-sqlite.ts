import Database from 'better-sqlite3';
import type { AsyncRemoteCallback } from 'drizzle-orm/sqlite-proxy';

/**
 * A `drizzle-orm/sqlite-proxy` callback over an in-memory better-sqlite3 database: the engine of the
 * local `DataSource` in the tests, where there is no device. Like the plugin on the device, rows go back
 * as arrays in column order; `get` returns the first row (`undefined` without rows) and `run` returns no
 * rows.
 */
export function createMemorySqlite(): AsyncRemoteCallback {
  const sqlite = new Database(':memory:');
  return async (sql, params, method) => {
    const statement = sqlite.prepare(sql);
    if (!statement.reader) {
      statement.run(...params);
      return { rows: [] };
    }
    const rows = statement.raw().all(...params) as unknown[][];
    if (method === 'run') return { rows: [] };
    if (method === 'get') return { rows: rows[0] } as { rows: unknown[] };
    return { rows };
  };
}
