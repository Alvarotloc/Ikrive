import { readFileSync } from 'node:fs';
import { expenses, fuelLogs, maintenanceRecords, odometerReadings } from '@ikrive/db/schema';
import { CSV_IMPORT_MAX_BYTES, csvImportSummarySchema, type Problem } from '@ikrive/shared';
import { parseCsvImport } from '@ikrive/shared/csv-import';
import { asc, count, eq, sql } from 'drizzle-orm';
import type { AsyncRemoteCallback } from 'drizzle-orm/sqlite-proxy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { fakeImages } from '@/test/fake-images';
import { createMemoryFileStore } from '@/test/memory-file-store';
import { createMemorySqlite } from '@/test/memory-sqlite';
import type { DataSource } from '../types';
import { createLocalDataSource, type LocalDb, openLocalDatabase } from './index';

// Spied (still the real parser) so the 413 can assert it is never reached.
vi.mock('@ikrive/shared/csv-import', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ikrive/shared/csv-import')>();
  return { ...actual, parseCsvImport: vi.fn(actual.parseCsvImport) };
});

let db: LocalDb;
let local: DataSource;
/** Every statement that reached the engine, to check that a rejected operation wrote nothing. */
let statements: string[];
let vehicleId: string;

beforeEach(async () => {
  vi.mocked(parseCsvImport).mockClear();
  const memory = createMemorySqlite();
  const recording: AsyncRemoteCallback = (query, params, method) => {
    statements.push(query);
    return memory(query, params, method);
  };
  statements = [];
  db = await openLocalDatabase(recording);
  local = createLocalDataSource(db, { files: createMemoryFileStore(), images: fakeImages() });
  vehicleId = (await local.vehicles.create({ make: 'Seat', model: 'Ibiza' })).id;
  statements = [];
});

const writes = () => statements.filter((query) => /^\s*(insert|update|delete|begin)/i.test(query));

async function problemOf(operation: Promise<unknown>): Promise<Problem> {
  const error = await operation.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ApiError);
  return (error as ApiError).problem;
}

const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(
      new URL(`../../../../../../packages/shared/src/csv-import/fixtures/${name}`, import.meta.url),
    ),
  );
const csvFile = (content: Uint8Array<ArrayBuffer> | string, name = 'import.csv') =>
  new File([content], name, { type: 'text/csv' });
const lubeLoggerOdometer = (...rows: [string, number][]) =>
  csvFile(['Date,InitialOdometer,Odometer', ...rows.map(([date, value]) => `${date},0,${value}`)].join('\n'));

/** Rows written by an import, in a stable order. */
async function snapshot() {
  return {
    readings: await db
      .select({ date: odometerReadings.date, value: odometerReadings.value, source: odometerReadings.source })
      .from(odometerReadings)
      .orderBy(asc(odometerReadings.date), asc(odometerReadings.value))
      .all(),
    fuelLogs: (await db.select({ n: count() }).from(fuelLogs).get())?.n ?? 0,
    maintenance: (await db.select({ n: count() }).from(maintenanceRecords).get())?.n ?? 0,
    expenses: (await db.select({ n: count() }).from(expenses).get())?.n ?? 0,
  };
}
const EMPTY = { readings: [], fuelLogs: 0, maintenance: 0, expenses: 0 };

describe('local CSV import', () => {
  it('imports a Fuelio file in one transaction', async () => {
    const summary = await local.csvImport.import(vehicleId, csvFile(fixture('fuelio.csv')));

    expect(csvImportSummarySchema.parse(summary)).toEqual(summary);
    expect(summary).toMatchObject({
      dryRun: false,
      format: 'fuelio',
      created: { odometer: 0, fuel: 2, maintenance: 2, expense: 1 },
      duplicates: 0,
      rejected: [],
      encodingReplaced: false,
    });
    expect(writes().filter((query) => /^\s*begin/i.test(query))).toHaveLength(1);
    expect((await snapshot()).readings).toEqual([
      { date: '2025-01-10', value: 10000, source: 'fuel' },
      { date: '2025-02-14', value: 10651, source: 'fuel' },
      { date: '2025-03-01', value: 11000, source: 'maintenance' },
    ]);
    for (const log of await db.select().from(fuelLogs).all()) {
      const reading = await db
        .select()
        .from(odometerReadings)
        .where(eq(odometerReadings.id, log.odometerReadingId ?? ''))
        .get();
      expect(reading).toMatchObject({ date: log.date, value: log.odometer, source: 'fuel' });
    }
    const records = await db.select().from(maintenanceRecords).orderBy(asc(maintenanceRecords.date)).all();
    expect(records.map(({ title, odometer, scheduleId }) => ({ title, odometer, scheduleId }))).toEqual([
      { title: 'Aceite y filtro', odometer: 11000, scheduleId: null },
      { title: 'ITV anual', odometer: null, scheduleId: null },
    ]);
    expect(records[1]?.odometerReadingId).toBeNull();

    // Loose readings are `manual`.
    await local.csvImport.import(vehicleId, csvFile(fixture('lubelogger-odometer.csv')));
    expect((await snapshot()).readings.filter((reading) => reading.source === 'manual')).toEqual([
      { date: '2025-03-01', value: 31000, source: 'manual' },
      { date: '2025-04-01', value: 31500, source: 'manual' },
    ]);
  });

  it('rolls back when a write fails', async () => {
    await db.run(
      sql`CREATE TRIGGER fail_maintenance BEFORE INSERT ON maintenance_records BEGIN SELECT RAISE(ABORT, 'boom'); END`,
    );

    // The refuels are written first; the first maintenance record aborts the transaction.
    await expect(local.csvImport.import(vehicleId, csvFile(fixture('fuelio.csv')))).rejects.toThrow();

    expect(await snapshot()).toEqual(EMPTY);
  });

  describe('same rules as the API', () => {
    it('skips everything on a second import', async () => {
      await local.csvImport.import(vehicleId, csvFile(fixture('fuelio.csv')));
      const before = await snapshot();

      const summary = await local.csvImport.import(vehicleId, csvFile(fixture('fuelio.csv')));

      expect(summary).toMatchObject({
        created: { odometer: 0, fuel: 0, maintenance: 0, expense: 0 },
        duplicates: 5,
      });
      expect(await snapshot()).toEqual(before);

      // Data entered by hand counts too.
      await local.fuelLogs.create(vehicleId, {
        date: '2025-05-01',
        odometer: 12000,
        quantity: 30,
        totalPrice: 45,
      });
      const manual = csvFile('Date,Odometer,FuelConsumed,Cost\n2025-05-01,12000,30,45.00\n');
      expect(await local.csvImport.import(vehicleId, manual)).toMatchObject({
        created: { fuel: 0 },
        duplicates: 1,
      });
    });

    it('counts repeated rows and odometer rows matching a refuel as duplicates', async () => {
      const repeated = lubeLoggerOdometer(
        ['2025-03-01', 31000],
        ['2025-03-01', 31000],
        ['2025-04-01', 31500],
      );
      expect(await local.csvImport.import(vehicleId, repeated)).toMatchObject({
        created: { odometer: 2 },
        duplicates: 1,
      });

      // The linked `fuel` reading of a refuel: a loose row repeating it is a duplicate.
      await local.csvImport.import(vehicleId, csvFile(fixture('lubelogger-fuel.csv')));
      const summary = await local.csvImport.import(vehicleId, lubeLoggerOdometer(['2025-01-03', 30000]));
      expect(summary).toMatchObject({ created: { odometer: 0 }, duplicates: 1, rejected: [] });
      expect((await snapshot()).readings).toHaveLength(4);
    });

    it('reports odometer conflicts and future dates per row', async () => {
      await local.odometer.add(vehicleId, { date: '2025-01-01', value: 50000 });

      const stored = await local.csvImport.import(vehicleId, csvFile(fixture('lubelogger-fuel.csv')));
      expect(stored).toMatchObject({
        created: { fuel: 0 },
        rejected: [
          {
            row: 2,
            kind: 'fuel',
            reason: 'odometer_conflict',
            conflict: { date: '2025-01-01', value: 50000 },
          },
          {
            row: 3,
            kind: 'fuel',
            reason: 'odometer_conflict',
            conflict: { date: '2025-01-01', value: 50000 },
          },
        ],
      });

      // Row 2 is processed first and wins, although row 3 is older; row 4 is in the future.
      const file = lubeLoggerOdometer(['2025-04-01', 60000], ['2025-03-01', 61000], ['2999-01-01', 70000]);
      expect(await local.csvImport.import(vehicleId, file)).toMatchObject({
        created: { odometer: 1 },
        rejected: [
          {
            row: 3,
            kind: 'odometer',
            reason: 'odometer_conflict',
            conflict: { date: '2025-04-01', value: 60000 },
          },
          { row: 4, kind: 'odometer', reason: 'future_date', conflict: null },
        ],
      });
      expect(await snapshot()).toEqual({
        readings: [
          { date: '2025-01-01', value: 50000, source: 'manual' },
          { date: '2025-04-01', value: 60000, source: 'manual' },
        ],
        fuelLogs: 0,
        maintenance: 0,
        expenses: 0,
      });
    });

    it('imports expenses and skips them on a second import', async () => {
      const summary = await local.csvImport.import(vehicleId, csvFile(fixture('lubelogger-tax.csv')));

      expect(csvImportSummarySchema.parse(summary)).toEqual(summary);
      expect(summary).toMatchObject({
        format: 'lubelogger',
        created: { odometer: 0, fuel: 0, maintenance: 0, expense: 1 },
        duplicates: 0,
        skipped: [],
      });
      expect(writes().filter((query) => /^\s*begin/i.test(query))).toHaveLength(1);
      expect(await local.expenses.list(vehicleId)).toEqual([
        expect.objectContaining({
          vehicleId,
          date: '2025-01-15',
          category: 'tax',
          title: 'Impuesto de circulacion',
          description: null,
          cost: 110,
        }),
      ]);
      // No reading for an expense.
      expect(await snapshot()).toEqual({ ...EMPTY, expenses: 1 });

      const again = await local.csvImport.import(vehicleId, csvFile(fixture('lubelogger-tax.csv')));
      expect(again).toMatchObject({ created: { expense: 0 }, duplicates: 1 });

      // An expense entered by hand with another category is a duplicate too.
      await local.expenses.create(vehicleId, {
        date: '2025-02-01',
        category: 'other',
        title: 'IVTM',
        cost: 95.5,
      });
      const manual = csvFile('Date,Description,Cost\n2025-02-01,ivtm ,95.50\n2025-03-01,IVTM,95.50\n');
      expect(await local.csvImport.import(vehicleId, manual)).toMatchObject({
        created: { expense: 1 },
        duplicates: 1,
      });
      expect((await snapshot()).expenses).toBe(3);
    });
  });

  describe('previews and rejections', () => {
    it('previews without writing', async () => {
      const preview = await local.csvImport.import(vehicleId, csvFile(fixture('fuelio.csv')), {
        dryRun: true,
      });

      expect(writes()).toEqual([]);
      const applied = await local.csvImport.import(vehicleId, csvFile(fixture('fuelio.csv')));
      expect(preview).toEqual({ ...applied, dryRun: true });
    });

    it('rejects a missing vehicle with 404', async () => {
      for (const options of [undefined, { dryRun: true }]) {
        expect(
          await problemOf(local.csvImport.import('missing', csvFile(fixture('fuelio.csv')), options)),
        ).toEqual({
          type: 'about:blank',
          title: 'Not Found',
          status: 404,
          detail: 'Vehicle not found',
        });
      }
      expect(writes()).toEqual([]);
    });

    it('rejects a CSV over the size limit before reading or parsing', async () => {
      const big = csvFile(new Uint8Array(CSV_IMPORT_MAX_BYTES + 1));
      const read = vi.spyOn(big, 'arrayBuffer');

      expect(await problemOf(local.csvImport.import(vehicleId, big))).toEqual({
        type: 'about:blank',
        title: 'request file too large',
        status: 413,
      });
      expect(read).not.toHaveBeenCalled();
      expect(parseCsvImport).not.toHaveBeenCalled();
      expect(writes()).toEqual([]);

      // The spy is the parser the local mode calls: a file within the limit reaches it.
      await local.csvImport.import(vehicleId, csvFile(fixture('lubelogger-odometer.csv')), { dryRun: true });
      expect(parseCsvImport).toHaveBeenCalledOnce();
    });

    it('rejects invalid options and unparseable files with the API errors', async () => {
      // An outdated client could send an option the schema does not know (`target` comes from the device).
      const outdated = { dryRun: false, target: { distance: 'km', quantity: 'l' } };
      const invalid = await problemOf(
        local.csvImport.import(vehicleId, csvFile(fixture('fuelio.csv')), outdated),
      );
      expect(invalid).toMatchObject({ status: 400, title: 'Validation failed', errors: [{ path: '' }] });

      const paths = await problemOf(
        local.csvImport.import(vehicleId, csvFile(fixture('fuelio.csv')), {
          ...outdated,
          mapping: { kind: 'fuel', columns: { date: -1 }, dateFormat: 'ymd', decimalSeparator: '.' },
        }),
      );
      expect(paths.errors?.map((error) => error.path).sort()).toEqual(['', 'mapping.columns.date']);
      expect(parseCsvImport).not.toHaveBeenCalled();

      expect(await problemOf(local.csvImport.import(vehicleId, csvFile('foo,bar\n1,2\n')))).toEqual({
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'The CSV cannot be imported',
        errors: [{ path: 'file', message: 'Unrecognized CSV format' }],
      });
      const generic = await problemOf(
        local.csvImport.import(vehicleId, csvFile('Fecha,Km\n2025-01-01,1000\n'), {
          mapping: { kind: 'odometer', columns: { value: 1 }, dateFormat: 'ymd', decimalSeparator: '.' },
        }),
      );
      expect(generic.errors).toEqual([{ path: 'mapping.columns.date', message: 'Required' }]);

      await local.settings.update({ distanceUnit: 'mi' });
      statements = [];
      const units = await problemOf(local.csvImport.import(vehicleId, csvFile(fixture('fuelio.csv'))));
      expect(units.errors).toEqual([
        { path: 'sourceUnits', message: 'The file units (km) differ from the vehicle units (mi, l)' },
      ]);
      expect(writes()).toEqual([]);
    });
  });

  it('flags a file that is not UTF-8', async () => {
    const latin1 = () => csvFile(fixture('lubelogger-service-latin1.csv'));

    expect(await local.csvImport.import(vehicleId, latin1(), { dryRun: true })).toMatchObject({
      dryRun: true,
      encodingReplaced: true,
      created: { maintenance: 2 },
    });
    expect(await local.csvImport.import(vehicleId, latin1())).toMatchObject({
      dryRun: false,
      encodingReplaced: true,
      created: { maintenance: 2 },
    });

    const utf8 = csvFile(`﻿${new TextDecoder().decode(fixture('lubelogger-service.csv'))}`);
    expect(await local.csvImport.import(vehicleId, utf8, { dryRun: true })).toMatchObject({
      encodingReplaced: false,
    });
  });
});
