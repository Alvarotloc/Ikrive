/**
 * The SQLite database of the native app's local mode, on the device (`@capacitor-community/sqlite`).
 * Loaded only by `features/mobile/local-mode.ts` through `import()` in local mode: the web never requests
 * this module nor the plugin.
 *
 * `openDeviceDatabase` returns the callback of `drizzle-orm/sqlite-proxy` (`AsyncRemoteCallback`) over the
 * plugin. The proxy expects every row as an array in column order and opens its transactions with plain
 * `BEGIN`/`COMMIT` statements, so writes go through `run` with the plugin's own transaction turned off.
 *
 * Statements with a `RETURNING` clause go through `query`, never through `run(…, returnMode)`: on Android
 * the plugin strips the clause and re-reads the rows by `rowid` from the connection's previous
 * `last_insert_rowid()`, which belongs to the last insert on any table, so the rows come back empty (an
 * `INSERT … RETURNING` after a migration or another table's insert). Its SQLite (SQLCipher 4.17) supports
 * `RETURNING` natively and `query` runs the statement as it is.
 */

import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { AsyncRemoteCallback } from 'drizzle-orm/sqlite-proxy';

/** Name of the database file (`ikriveSQLite.db` in the app's databases folder). */
export const DEVICE_DATABASE = 'ikrive';

/** Statements that return rows and go through the plugin's `query`: reads and writes with `RETURNING`. */
const READ_STATEMENT = /^\s*(select|pragma|with)\b/i;
const RETURNING = /\breturning\b/i;

/**
 * A plugin row (an object keyed by column) as the array the proxy expects. The plugin keeps the order of
 * the columns in the object (Android's JSON does); the local queries never select two columns with the
 * same name, which would collapse into one key.
 */
const toArray = (row: Record<string, unknown>): unknown[] => Object.values(row);

/** The `AsyncRemoteCallback` over an open connection of the plugin. */
export function deviceCallback(connection: SQLiteDBConnection): AsyncRemoteCallback {
  return async (sql, params, method) => {
    if (!READ_STATEMENT.test(sql) && !RETURNING.test(sql)) {
      await connection.run(sql, params, false);
      return { rows: [] };
    }
    const result = await connection.query(sql, params);
    const rows = (result.values ?? []).map(toArray);
    if (method === 'run') return { rows: [] };
    if (method === 'get') return { rows: rows[0] } as { rows: unknown[] };
    return { rows };
  };
}

/**
 * Opens the local database of the device (created on first use, unencrypted) and returns its callback.
 * Reuses the plugin's connection when it already exists (e.g. after the WebView reloads).
 */
export async function openDeviceDatabase(): Promise<AsyncRemoteCallback> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const consistent = (await sqlite.checkConnectionsConsistency()).result;
  const exists = (await sqlite.isConnection(DEVICE_DATABASE, false)).result;
  const connection =
    consistent && exists
      ? await sqlite.retrieveConnection(DEVICE_DATABASE, false)
      : await sqlite.createConnection(DEVICE_DATABASE, false, 'no-encryption', 1, false);
  if (!(await connection.isDBOpen()).result) await connection.open();
  return deviceCallback(connection);
}
