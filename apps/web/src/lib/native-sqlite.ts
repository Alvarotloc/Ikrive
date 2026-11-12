/**
 * The SQLite database of the native app's local mode, on the device (`@capacitor-community/sqlite`).
 * Loaded only by `features/mobile/local-mode.ts` through `import()` in local mode: the web never requests
 * this module nor the plugin.
 *
 * `openDeviceDatabase` returns the callback of `drizzle-orm/sqlite-proxy` (`AsyncRemoteCallback`) over the
 * plugin. The proxy expects every row as an array in column order and opens its transactions with plain
 * `BEGIN`/`COMMIT` statements, so writes go through `run` with the plugin's own transaction turned off.
 */

import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { AsyncRemoteCallback } from 'drizzle-orm/sqlite-proxy';

/** Name of the database file (`ikriveSQLite.db` in the app's databases folder). */
export const DEVICE_DATABASE = 'ikrive';

/** Statements that return rows and go through the plugin's `query`. */
const READ_STATEMENT = /^\s*(select|pragma|with)\b/i;

/**
 * A plugin row (an object keyed by column) as the array the proxy expects. The plugin keeps the order of
 * the columns in the object (Android's JSON does); the local queries never select two columns with the
 * same name, which would collapse into one key.
 */
const toArray = (row: Record<string, unknown>): unknown[] => Object.values(row);

/** The `AsyncRemoteCallback` over an open connection of the plugin. */
export function deviceCallback(connection: SQLiteDBConnection): AsyncRemoteCallback {
  return async (sql, params, method) => {
    let rows: unknown[][];
    if (READ_STATEMENT.test(sql)) {
      const result = await connection.query(sql, params);
      rows = (result.values ?? []).map(toArray);
    } else if (method === 'run') {
      await connection.run(sql, params, false);
      return { rows: [] };
    } else {
      // `INSERT/UPDATE/DELETE … RETURNING`: the plugin returns the rows in `changes.values`.
      const result = await connection.run(sql, params, false, 'all');
      rows = (result.changes?.values ?? []).map(toArray);
    }
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
