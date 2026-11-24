import { readFileSync } from 'node:fs';
import { CSV_IMPORT_MAX_BYTES, type CsvImportSummary } from '@ikrive/shared';
import { parseCsvImport } from '@ikrive/shared/csv-import';
import { asc, count, eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/db/client';
import { fuelLogs, maintenanceRecords, odometerReadings } from '../src/db/schema';
import { createTestApp, signUp } from './helpers';

// Spied (still the real parser) so R14 can assert it is never reached for a file over the limit.
vi.mock('@ikrive/shared/csv-import', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ikrive/shared/csv-import')>();
  return { ...actual, parseCsvImport: vi.fn(actual.parseCsvImport) };
});

beforeEach(() => {
  vi.mocked(parseCsvImport).mockClear();
});

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];

const fixture = (name: string) =>
  readFileSync(new URL(`../../../packages/shared/src/csv-import/fixtures/${name}`, import.meta.url));

const BOUNDARY = '----ikrive-csv-boundary';

/** Multipart body with the given parts in order (`options` goes before `file`). */
function multipart(parts: { name: string; value: Buffer | string; filename?: string }[]) {
  const chunks = parts.flatMap(({ name, value, filename }) => [
    Buffer.from(
      filename === undefined
        ? `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n`
        : `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n`,
    ),
    typeof value === 'string' ? Buffer.from(value) : value,
    Buffer.from('\r\n'),
  ]);
  return {
    payload: Buffer.concat([...chunks, Buffer.from(`--${BOUNDARY}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
  };
}

const csvBody = (csv: Buffer | string, options?: Record<string, unknown> | string) =>
  multipart([
    ...(options === undefined
      ? []
      : [{ name: 'options', value: typeof options === 'string' ? options : JSON.stringify(options) }]),
    { name: 'file', value: csv, filename: 'import.csv' },
  ]);

async function createVehicle(app: TestApp, cookie: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/vehicles',
    headers: { cookie },
    payload: { make: 'Seat', model: 'León' },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string };
}

async function setup() {
  const { app, db } = await createTestApp();
  const { cookie } = await signUp(app);
  const vehicle = await createVehicle(app, cookie);
  const base = `/api/vehicles/${vehicle.id}`;
  const headers = { cookie };
  const importCsv = (
    csv: Buffer | string,
    options?: Record<string, unknown> | string,
    vehicleId = vehicle.id,
  ) => {
    const body = csvBody(csv, options);
    return app.inject({
      method: 'POST',
      url: `/api/vehicles/${vehicleId}/csv-import`,
      headers: { ...headers, ...body.headers },
      payload: body.payload,
    });
  };
  return {
    app,
    db,
    cookie,
    vehicle,
    importCsv,
    post: (path: string, payload: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: `${base}${path}`, headers, payload }),
  };
}

/** Rows written by an import, in a stable order. */
function snapshot(db: Db) {
  return {
    readings: db
      .select({ date: odometerReadings.date, value: odometerReadings.value, source: odometerReadings.source })
      .from(odometerReadings)
      .orderBy(asc(odometerReadings.date), asc(odometerReadings.value))
      .all(),
    fuelLogs: db.select({ n: count() }).from(fuelLogs).get()?.n ?? 0,
    maintenance: db.select({ n: count() }).from(maintenanceRecords).get()?.n ?? 0,
  };
}

function expectProblem(
  response: { statusCode: number; headers: Record<string, unknown>; body: string },
  status: number,
) {
  expect(response.statusCode, response.body).toBe(status);
  expect(response.headers['content-type']).toContain('application/problem+json');
}

const lubeLoggerOdometer = (...rows: [string, number][]) =>
  ['Date,InitialOdometer,Odometer', ...rows.map(([date, value]) => `${date},0,${value}`)].join('\n');

describe('csv import', () => {
  it('imports refuels and maintenance with their readings in one request', async () => {
    const { db, importCsv } = await setup();

    const response = await importCsv(fixture('fuelio.csv'));

    expect(response.statusCode, response.body).toBe(201);
    const summary = response.json() as CsvImportSummary;
    expect(summary).toMatchObject({
      dryRun: false,
      format: 'fuelio',
      created: { odometer: 0, fuel: 2, maintenance: 2 },
      duplicates: 0,
      rejected: [],
      errors: [],
      droppedFuelFields: { notes: true, station: true },
      encodingReplaced: false,
    });
    expect(summary.skipped.map((row) => row.reason)).toEqual(['not_maintenance', 'template', 'income']);

    expect(snapshot(db).readings).toEqual([
      { date: '2025-01-10', value: 10000, source: 'fuel' },
      { date: '2025-02-14', value: 10651, source: 'fuel' },
      { date: '2025-03-01', value: 11000, source: 'maintenance' },
    ]);
    const logs = db.select().from(fuelLogs).orderBy(asc(fuelLogs.date)).all();
    expect(
      logs.map(({ date, odometer, quantity, totalPrice, fullTank, missedPrevious }) => ({
        date,
        odometer,
        quantity,
        totalPrice,
        fullTank,
        missedPrevious,
      })),
    ).toEqual([
      {
        date: '2025-01-10',
        odometer: 10000,
        quantity: 40.5,
        totalPrice: 60.75,
        fullTank: true,
        missedPrevious: false,
      },
      {
        date: '2025-02-14',
        odometer: 10651,
        quantity: 35.25,
        totalPrice: 52.17,
        fullTank: false,
        missedPrevious: true,
      },
    ]);
    for (const log of logs) {
      const reading = db
        .select()
        .from(odometerReadings)
        .where(eq(odometerReadings.id, log.odometerReadingId ?? ''))
        .get();
      expect(reading).toMatchObject({ date: log.date, value: log.odometer, source: 'fuel' });
    }
    const records = db.select().from(maintenanceRecords).orderBy(asc(maintenanceRecords.date)).all();
    expect(
      records.map(({ title, odometer, cost, includeInReport, scheduleId }) => ({
        title,
        odometer,
        cost,
        includeInReport,
        scheduleId,
      })),
    ).toEqual([
      { title: 'Aceite y filtro', odometer: 11000, cost: 89.9, includeInReport: true, scheduleId: null },
      { title: 'ITV anual', odometer: null, cost: 45.5, includeInReport: true, scheduleId: null },
    ]);
    const linked = db
      .select()
      .from(odometerReadings)
      .where(eq(odometerReadings.id, records[0]?.odometerReadingId ?? ''))
      .get();
    expect(linked).toMatchObject({ date: '2025-03-01', value: 11000, source: 'maintenance' });
    expect(records[1]?.odometerReadingId).toBeNull();
  });

  it('imports odometer rows as manual readings', async () => {
    const { db, importCsv } = await setup();

    const response = await importCsv(fixture('lubelogger-odometer.csv'));

    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({
      format: 'lubelogger',
      created: { odometer: 2, fuel: 0, maintenance: 0 },
    });
    expect(snapshot(db)).toEqual({
      readings: [
        { date: '2025-03-01', value: 31000, source: 'manual' },
        { date: '2025-04-01', value: 31500, source: 'manual' },
      ],
      fuelLogs: 0,
      maintenance: 0,
    });
  });

  it('rolls back the whole import when a write fails', async () => {
    const { db, importCsv } = await setup();
    db.run(
      sql`CREATE TRIGGER fail_maintenance BEFORE INSERT ON maintenance_records BEGIN SELECT RAISE(ABORT, 'boom'); END`,
    );
    const before = snapshot(db);

    // The refuels are written first; the first maintenance record aborts the transaction.
    const response = await importCsv(fixture('fuelio.csv'));

    expectProblem(response, 500);
    expect(snapshot(db)).toEqual(before);
    expect(before).toEqual({ readings: [], fuelLogs: 0, maintenance: 0 });
  });

  describe('duplicates', () => {
    it('skips everything on a second import of the same file', async () => {
      const { db, importCsv } = await setup();
      expect((await importCsv(fixture('fuelio.csv'))).statusCode).toBe(201);
      const before = snapshot(db);

      const response = await importCsv(fixture('fuelio.csv'));

      expect(response.statusCode, response.body).toBe(201);
      expect(response.json()).toMatchObject({
        created: { odometer: 0, fuel: 0, maintenance: 0 },
        duplicates: 4,
        rejected: [],
      });
      expect(snapshot(db)).toEqual(before);
    });

    it('skips rows that match data entered by hand', async () => {
      const { db, importCsv, post } = await setup();
      const refuel = { date: '2025-01-10', odometer: 10000, quantity: 40.5, totalPrice: 60.75 };
      expect((await post('/fuel-logs', refuel)).statusCode).toBe(201);
      const service = { date: '2025-04-02', category: 'inspection', title: 'itv ANUAL ', cost: 45.5 };
      expect((await post('/maintenance', service)).statusCode).toBe(201);

      const response = await importCsv(fixture('fuelio.csv'));

      expect(response.statusCode, response.body).toBe(201);
      expect(response.json()).toMatchObject({
        created: { odometer: 0, fuel: 1, maintenance: 1 },
        duplicates: 2,
      });
      expect(snapshot(db)).toMatchObject({ fuelLogs: 2, maintenance: 2 });
    });

    it('counts repeated rows of a file as duplicates', async () => {
      const { db, importCsv } = await setup();
      const csv = lubeLoggerOdometer(['2025-03-01', 31000], ['2025-03-01', 31000], ['2025-04-01', 31500]);

      const response = await importCsv(csv);

      expect(response.json()).toMatchObject({ created: { odometer: 2 }, duplicates: 1 });
      expect(snapshot(db).readings).toHaveLength(2);
    });

    it('treats an odometer row matching a refuel of the same file as a duplicate', async () => {
      // No supported format mixes loose readings and refuels in one file, so the refuel's linked reading
      // comes from a previous import; within one file, `planCsvImport` covers it (shared tests).
      const { db, importCsv } = await setup();
      expect((await importCsv(fixture('lubelogger-fuel.csv'))).statusCode).toBe(201);

      const response = await importCsv(lubeLoggerOdometer(['2025-01-03', 30000], ['2025-01-25', 30600]));

      expect(response.json()).toMatchObject({ created: { odometer: 1 }, duplicates: 1, rejected: [] });
      expect(snapshot(db).readings.map((reading) => reading.source)).toEqual(['fuel', 'fuel', 'manual']);
    });
  });

  describe('odometer rules', () => {
    it('reports odometer conflicts per row without saving them', async () => {
      const { db, importCsv, post } = await setup();
      expect((await post('/odometer', { date: '2025-01-01', value: 50000 })).statusCode).toBe(201);

      // Against a stored reading: both refuels are below 50000 on a later date.
      const stored = await importCsv(fixture('lubelogger-fuel.csv'));
      expect(stored.statusCode, stored.body).toBe(201);
      expect(stored.json()).toMatchObject({
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

      // Between rows of the file: row 2 is processed first and wins, although row 3 is older.
      const file = await importCsv(lubeLoggerOdometer(['2025-04-01', 60000], ['2025-03-01', 61000]));
      expect(file.json()).toMatchObject({
        created: { odometer: 1 },
        rejected: [
          {
            row: 3,
            kind: 'odometer',
            reason: 'odometer_conflict',
            conflict: { date: '2025-04-01', value: 60000 },
          },
        ],
      });
      expect(snapshot(db)).toEqual({
        readings: [
          { date: '2025-01-01', value: 50000, source: 'manual' },
          { date: '2025-04-01', value: 60000, source: 'manual' },
        ],
        fuelLogs: 0,
        maintenance: 0,
      });
    });

    it('reports future dates per row', async () => {
      const { db, importCsv } = await setup();

      const response = await importCsv(lubeLoggerOdometer(['2025-03-01', 1000], ['2999-01-01', 2000]));

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        created: { odometer: 1 },
        rejected: [{ row: 3, kind: 'odometer', reason: 'future_date', conflict: null }],
      });
      expect(snapshot(db).readings).toEqual([{ date: '2025-03-01', value: 1000, source: 'manual' }]);
    });
  });

  it('previews an import without writing', async () => {
    const { db, importCsv } = await setup();

    const preview = await importCsv(fixture('fuelio.csv'), { dryRun: true });

    expect(preview.statusCode, preview.body).toBe(200);
    expect(snapshot(db)).toEqual({ readings: [], fuelLogs: 0, maintenance: 0 });
    const applied = await importCsv(fixture('fuelio.csv'));
    expect(applied.statusCode).toBe(201);
    expect(preview.json()).toEqual({ ...applied.json(), dryRun: true });
    expect(preview.json().created).toEqual({ odometer: 0, fuel: 2, maintenance: 2 });
  });

  it("hides other users' vehicles", async () => {
    const { app, db, vehicle, importCsv } = await setup();
    const { cookie: intruder } = await signUp(app, 'eve@example.com', 'Eve');
    const before = snapshot(db);

    for (const options of [undefined, { dryRun: true }]) {
      const body = csvBody(fixture('fuelio.csv'), options);
      const response = await app.inject({
        method: 'POST',
        url: `/api/vehicles/${vehicle.id}/csv-import`,
        headers: { cookie: intruder, ...body.headers },
        payload: body.payload,
      });
      expectProblem(response, 404);
      expect(response.json().detail).toBe('Vehicle not found');
      expectProblem(await importCsv(fixture('fuelio.csv'), options, 'missing'), 404);
    }
    expect(snapshot(db)).toEqual(before);
  });

  it('rejects a CSV over the size limit before parsing', async () => {
    const { db, importCsv } = await setup();
    const big = Buffer.concat([
      fixture('lubelogger-odometer.csv'),
      Buffer.alloc(CSV_IMPORT_MAX_BYTES + 1 - fixture('lubelogger-odometer.csv').length, 0x0a),
    ]);
    expect(big.length).toBe(CSV_IMPORT_MAX_BYTES + 1);

    const response = await importCsv(big);

    expectProblem(response, 413);
    expect(response.json().title).toBe('request file too large');
    expect(parseCsvImport).not.toHaveBeenCalled();
    expect(snapshot(db)).toEqual({ readings: [], fuelLogs: 0, maintenance: 0 });

    // The spy is the parser the service calls: a file at the limit reaches it.
    const atLimit = await importCsv(big.subarray(0, CSV_IMPORT_MAX_BYTES));
    expect(atLimit.statusCode, atLimit.body).toBe(201);
    expect(parseCsvImport).toHaveBeenCalledOnce();
  });

  describe('bad requests', () => {
    it('rejects a request without a CSV file', async () => {
      const { app, cookie, vehicle, db } = await setup();
      const url = `/api/vehicles/${vehicle.id}/csv-import`;

      const json = await app.inject({ method: 'POST', url, headers: { cookie }, payload: { file: 'x' } });
      expectProblem(json, 400);

      const wrongField = multipart([{ name: 'csv', value: fixture('fuelio.csv'), filename: 'import.csv' }]);
      const response = await app.inject({
        method: 'POST',
        url,
        headers: { cookie, ...wrongField.headers },
        payload: wrongField.payload,
      });
      expectProblem(response, 400);
      expect(response.json().detail).toBe('Expected a CSV in the "file" field');
      expect(snapshot(db)).toEqual({ readings: [], fuelLogs: 0, maintenance: 0 });
    });

    it('rejects invalid options', async () => {
      const { db, importCsv } = await setup();

      const broken = await importCsv(fixture('fuelio.csv'), '{"dryRun":');
      expectProblem(broken, 400);
      expect(broken.json().detail).toBe('The "options" field is not valid JSON');

      const invalid = await importCsv(fixture('fuelio.csv'), {
        dateFormat: 'yyyy',
        mapping: { kind: 'fuel', columns: { date: -1 }, dateFormat: 'ymd', decimalSeparator: '.' },
      });
      expectProblem(invalid, 400);
      expect(invalid.json()).toMatchObject({ title: 'Validation failed' });
      expect(
        invalid
          .json()
          .errors.map((error: { path: string }) => error.path)
          .sort(),
      ).toEqual(['dateFormat', 'mapping.columns.date']);
      expect(parseCsvImport).not.toHaveBeenCalled();
      expect(snapshot(db)).toEqual({ readings: [], fuelLogs: 0, maintenance: 0 });
    });

    it('rejects a CSV that cannot be parsed', async () => {
      const { db, importCsv } = await setup();

      const unknown = await importCsv('foo,bar\n1,2\n');
      expectProblem(unknown, 400);
      expect(unknown.json()).toMatchObject({
        detail: 'The CSV cannot be imported',
        errors: [{ path: 'file', message: 'Unrecognized CSV format' }],
      });

      const generic = await importCsv('Fecha,Km\n2025-01-01,1000\n', {
        mapping: { kind: 'odometer', columns: { value: 1 }, dateFormat: 'ymd', decimalSeparator: '.' },
      });
      expectProblem(generic, 400);
      expect(generic.json().errors).toEqual([{ path: 'mapping.columns.date', message: 'Required' }]);
      expect(snapshot(db)).toEqual({ readings: [], fuelLogs: 0, maintenance: 0 });
    });
  });

  describe('input', () => {
    it('uses the units of the vehicle and the settings', async () => {
      const { app, cookie, db, importCsv } = await setup();
      const patched = await app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { cookie },
        payload: { distanceUnit: 'mi' },
      });
      expect(patched.statusCode).toBe(200);

      const response = await importCsv(fixture('fuelio.csv'));
      expectProblem(response, 400);
      expect(response.json().errors).toEqual([
        { path: 'sourceUnits', message: 'The file units (km) differ from the vehicle units (mi, l)' },
      ]);

      // The request cannot pick the target units.
      const target = await importCsv(fixture('fuelio.csv'), { target: { distance: 'km', quantity: 'l' } });
      expectProblem(target, 400);
      expect(target.json().title).toBe('Validation failed');
      expect(snapshot(db)).toEqual({ readings: [], fuelLogs: 0, maintenance: 0 });
    });

    it('decodes a UTF-8 file with a BOM', async () => {
      const { db, importCsv } = await setup();
      const csv = Buffer.from(
        '﻿Date,Odometer,Description,Cost,Notes\n2025-02-15,30700,Revisión general,20.00,\n',
      );

      const response = await importCsv(csv);

      expect(response.statusCode, response.body).toBe(201);
      expect(response.json()).toMatchObject({
        format: 'lubelogger',
        created: { maintenance: 1 },
        encodingReplaced: false,
      });
      expect(db.select({ title: maintenanceRecords.title }).from(maintenanceRecords).all()).toEqual([
        { title: 'Revisión general' },
      ]);
    });

    it('flags a file that is not UTF-8', async () => {
      const { db, importCsv } = await setup();
      const latin1 = fixture('lubelogger-service-latin1.csv');

      const preview = await importCsv(latin1, { dryRun: true });
      expect(preview.statusCode, preview.body).toBe(200);
      expect(preview.json()).toMatchObject({
        dryRun: true,
        encodingReplaced: true,
        created: { maintenance: 2 },
      });

      const applied = await importCsv(latin1);
      expect(applied.statusCode, applied.body).toBe(201);
      expect(applied.json()).toMatchObject({
        dryRun: false,
        encodingReplaced: true,
        created: { maintenance: 2 },
      });
      expect(snapshot(db).maintenance).toBe(2);

      const utf8 = await importCsv(fixture('lubelogger-service.csv'), { dryRun: true });
      expect(utf8.json()).toMatchObject({ encodingReplaced: false });
    });
  });
});
