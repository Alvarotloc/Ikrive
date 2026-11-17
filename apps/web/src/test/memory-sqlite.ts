import Database from 'better-sqlite3';
import type { AsyncRemoteCallback } from 'drizzle-orm/sqlite-proxy';

/**
 * Error of a statement whose result has a column the device plugin cannot read: on Android it looks each
 * column up by name in the cursor, and a name with a `.` (an aggregate or computed expression without an
 * alias, like `max("odometer_readings"."date")`) is not found (`Couldn't read row 0 column -1`).
 */
export function unreadableColumnsError(sql: string, columns: string[]): Error | null {
  const unreadable = columns.filter((name) => name.includes('.'));
  if (unreadable.length === 0) return null;
  return new Error(
    `Columns the device plugin cannot read (add an alias): ${unreadable.join(', ')} in: ${sql}`,
  );
}

/**
 * A `drizzle-orm/sqlite-proxy` callback over an in-memory better-sqlite3 database: the engine of the
 * local `DataSource` in the tests, where there is no device. Like the plugin on the device, rows go back
 * as arrays in column order; `get` returns the first row (`undefined` without rows) and `run` returns no
 * rows. Like the plugin on Android, a statement whose result has a column name with a `.` fails (see
 * `unreadableColumnsError`), so every local query is checked against that limit.
 */
export function createMemorySqlite(): AsyncRemoteCallback {
  const sqlite = new Database(':memory:');
  return async (sql, params, method) => {
    const statement = sqlite.prepare(sql);
    if (!statement.reader) {
      statement.run(...params);
      return { rows: [] };
    }
    const unreadable = unreadableColumnsError(
      sql,
      statement.columns().map(({ name }) => name),
    );
    if (unreadable) throw unreadable;
    const rows = statement.raw().all(...params) as unknown[][];
    if (method === 'run') return { rows: [] };
    if (method === 'get') return { rows: rows[0] } as { rows: unknown[] };
    return { rows };
  };
}
