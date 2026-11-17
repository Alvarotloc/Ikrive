import { describe, expect, it } from 'vitest';
import { createMemorySqlite } from './memory-sqlite';

describe('createMemorySqlite', () => {
  it('returns rows as arrays in column order', async () => {
    const sqlite = createMemorySqlite();
    await sqlite('create table t (a integer, b text)', [], 'run');
    await sqlite('insert into t values (?, ?)', [1, 'x'], 'run');

    expect(await sqlite('select "t"."a", max("t"."b") as "last_b" from t', [], 'all')).toEqual({
      rows: [[1, 'x']],
    });
    expect(await sqlite('select count(*) from t', [], 'get')).toEqual({ rows: [1] });
  });

  // The plugin on Android reads each column by name and cannot find one with a `.`.
  it('rejects a column the device plugin cannot read, as the plugin does', async () => {
    const sqlite = createMemorySqlite();
    await sqlite('create table t (a integer, b text)', [], 'run');

    await expect(sqlite('select "t"."a", max("t"."b") from t', [], 'all')).rejects.toThrow(
      'Columns the device plugin cannot read (add an alias): max("t"."b")',
    );
  });
});
