import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_DATABASE, openDeviceDatabase } from './native-sqlite';

const plugin = vi.hoisted(() => {
  const connection = {
    open: vi.fn(),
    isDBOpen: vi.fn(),
    query: vi.fn(),
    run: vi.fn(),
  };
  return {
    connection,
    checkConnectionsConsistency: vi.fn(),
    isConnection: vi.fn(),
    createConnection: vi.fn(),
    retrieveConnection: vi.fn(),
  };
});

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: class {
    checkConnectionsConsistency = plugin.checkConnectionsConsistency;
    isConnection = plugin.isConnection;
    createConnection = plugin.createConnection;
    retrieveConnection = plugin.retrieveConnection;
  },
}));

/** A plugin without a connection yet: `createConnection` returns a closed one. */
function freshPlugin() {
  plugin.checkConnectionsConsistency.mockResolvedValue({ result: false });
  plugin.isConnection.mockResolvedValue({ result: false });
  plugin.createConnection.mockResolvedValue(plugin.connection);
  plugin.connection.isDBOpen.mockResolvedValue({ result: false });
  plugin.connection.open.mockResolvedValue(undefined);
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('openDeviceDatabase', () => {
  it('maps selected rows to arrays in column order', async () => {
    freshPlugin();
    plugin.connection.query.mockResolvedValue({
      values: [
        { id: 'a', make: 'Seat', year: 2020 },
        { id: 'b', make: 'Renault', year: null },
      ],
    });
    const callback = await openDeviceDatabase();

    const result = await callback('select "id", "make", "year" from "vehicles"', [], 'all');

    expect(plugin.createConnection).toHaveBeenCalledExactlyOnceWith(
      DEVICE_DATABASE,
      false,
      'no-encryption',
      1,
      false,
    );
    expect(plugin.connection.open).toHaveBeenCalledOnce();
    expect(plugin.connection.query).toHaveBeenCalledExactlyOnceWith(
      'select "id", "make", "year" from "vehicles"',
      [],
    );
    expect(result).toEqual({
      rows: [
        ['a', 'Seat', 2020],
        ['b', 'Renault', null],
      ],
    });
  });

  it('runs writes without the plugin transaction', async () => {
    freshPlugin();
    plugin.connection.run.mockResolvedValue({ changes: { changes: 1 } });
    const callback = await openDeviceDatabase();

    expect(await callback('begin', [], 'run')).toEqual({ rows: [] });
    expect(await callback('delete from "vehicles" where "id" = ?', ['a'], 'run')).toEqual({ rows: [] });
    expect(await callback('\n\t\t\tCREATE TABLE `x` (`id` text)', [], 'run')).toEqual({ rows: [] });

    expect(plugin.connection.run.mock.calls).toEqual([
      ['begin', [], false],
      ['delete from "vehicles" where "id" = ?', ['a'], false],
      ['\n\t\t\tCREATE TABLE `x` (`id` text)', [], false],
    ]);
    expect(plugin.connection.query).not.toHaveBeenCalled();
  });

  it('sends RETURNING statements through query, never through the plugin emulation', async () => {
    freshPlugin();
    // The plugin's `run` re-reads RETURNING rows by rowid and gets them wrong on Android: it must never see one.
    plugin.connection.run.mockImplementation(async (sql: string, _params: unknown[], ...rest: unknown[]) => {
      if (/returning/i.test(sql) || rest.length !== 1) throw new Error(`RETURNING through run: ${sql}`);
      return { changes: { changes: 1 } };
    });
    plugin.connection.query.mockImplementation(async (sql: string) => ({
      values: sql.startsWith('insert')
        ? [{ id: 'new', make: 'Seat' }]
        : [
            { id: 'r1', value: 100 },
            { id: 'r2', value: 200 },
          ],
    }));
    const callback = await openDeviceDatabase();
    const insert = 'insert into "vehicles" ("id", "make") values (?, ?) returning "id", "make"';
    const update =
      'update "odometer_readings" set "value" = ? where "vehicle_id" = ? returning "id", "value"';
    const remove = 'delete from "odometer_readings" where "vehicle_id" = ? returning "id", "value"';

    expect(await callback(insert, ['new', 'Seat'], 'get')).toEqual({ rows: ['new', 'Seat'] });
    expect(await callback(update, [1, 'v'], 'all')).toEqual({
      rows: [
        ['r1', 100],
        ['r2', 200],
      ],
    });
    expect(await callback(remove, ['v'], 'all')).toEqual({
      rows: [
        ['r1', 100],
        ['r2', 200],
      ],
    });

    expect(plugin.connection.query.mock.calls).toEqual([
      [insert, ['new', 'Seat']],
      [update, [1, 'v']],
      [remove, ['v']],
    ]);
    expect(plugin.connection.run).not.toHaveBeenCalled();
  });

  it('returns the first row for get', async () => {
    freshPlugin();
    plugin.connection.query
      .mockResolvedValueOnce({ values: [{ id: 'a' }, { id: 'b' }] })
      .mockResolvedValueOnce({ values: [] });
    const callback = await openDeviceDatabase();

    expect(await callback('select "id" from "vehicles"', [], 'get')).toEqual({ rows: ['a'] });
    expect(await callback('select "id" from "vehicles" where 0', [], 'get')).toEqual({ rows: undefined });
  });

  it('reuses an existing connection', async () => {
    plugin.checkConnectionsConsistency.mockResolvedValue({ result: true });
    plugin.isConnection.mockResolvedValue({ result: true });
    plugin.retrieveConnection.mockResolvedValue(plugin.connection);
    plugin.connection.isDBOpen.mockResolvedValue({ result: true });

    await openDeviceDatabase();

    expect(plugin.isConnection).toHaveBeenCalledWith(DEVICE_DATABASE, false);
    expect(plugin.retrieveConnection).toHaveBeenCalledExactlyOnceWith(DEVICE_DATABASE, false);
    expect(plugin.createConnection).not.toHaveBeenCalled();
    expect(plugin.connection.open).not.toHaveBeenCalled();
  });
});
