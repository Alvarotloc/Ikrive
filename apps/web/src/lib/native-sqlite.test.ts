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

  it('returns RETURNING rows', async () => {
    freshPlugin();
    plugin.connection.run.mockResolvedValue({
      changes: {
        changes: 2,
        values: [
          { id: 'r1', value: 100 },
          { id: 'r2', value: 200 },
        ],
      },
    });
    const callback = await openDeviceDatabase();

    const result = await callback(
      'update "odometer_readings" set "value" = ? returning "id", "value"',
      [1],
      'all',
    );

    expect(plugin.connection.run).toHaveBeenCalledExactlyOnceWith(
      'update "odometer_readings" set "value" = ? returning "id", "value"',
      [1],
      false,
      'all',
    );
    expect(result).toEqual({
      rows: [
        ['r1', 100],
        ['r2', 200],
      ],
    });
  });

  it('returns the first row for get', async () => {
    freshPlugin();
    plugin.connection.query
      .mockResolvedValueOnce({ values: [{ id: 'a' }, { id: 'b' }] })
      .mockResolvedValueOnce({
        values: [],
      });
    plugin.connection.run.mockResolvedValue({ changes: { changes: 1, values: [{ id: 'new' }] } });
    const callback = await openDeviceDatabase();

    expect(await callback('select "id" from "vehicles"', [], 'get')).toEqual({ rows: ['a'] });
    expect(await callback('select "id" from "vehicles" where 0', [], 'get')).toEqual({ rows: undefined });
    expect(await callback('insert into "vehicles" ("id") values (?) returning "id"', ['new'], 'get')).toEqual(
      {
        rows: ['new'],
      },
    );
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
