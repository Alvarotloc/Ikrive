import { fuelLogs, maintenanceRecords, maintenanceSchedules, odometerReadings } from '@ikrive/db/schema';
import {
  clientConfigSchema,
  computeVehicleStats,
  DEFAULT_USER_SETTINGS,
  fuelLogSchema,
  maintenanceRecordSchema,
  maintenanceScheduleSchema,
  maintenanceSpendingSchema,
  meSchema,
  odometerReadingSchema,
  type Problem,
  todayIn,
  userSettingsSchema,
  vehicleSchema,
  vehicleStatsSchema,
} from '@ikrive/shared';
import type { AsyncRemoteCallback } from 'drizzle-orm/sqlite-proxy';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { createMemorySqlite } from '@/test/memory-sqlite';
import type { DataSource } from '../types';
import {
  createLocalDataSource,
  LOCAL_CLIENT_CONFIG,
  LOCAL_ME,
  type LocalDb,
  openLocalDatabase,
} from './index';

let db: LocalDb;
let local: DataSource;
/** Every statement that reached the engine, to check that a rejected operation wrote nothing. */
let statements: string[];

beforeEach(async () => {
  const memory = createMemorySqlite();
  statements = [];
  const recording: AsyncRemoteCallback = (sql, params, method) => {
    statements.push(sql);
    return memory(sql, params, method);
  };
  db = await openLocalDatabase(recording);
  statements = [];
  local = createLocalDataSource(db);
});

/** The problem an operation rejected with (fails the test if it resolved or threw something else). */
async function problemOf(operation: Promise<unknown>): Promise<Problem> {
  const error = await operation.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ApiError);
  return (error as ApiError).problem;
}

const writes = () => statements.filter((sql) => /^\s*(insert|update|delete|begin)/i.test(sql));

const createVehicle = (input: Partial<Parameters<DataSource['vehicles']['create']>[0]> = {}) =>
  local.vehicles.create({ make: 'Seat', model: 'Ibiza', ...input });

describe('local DataSource', () => {
  it('reads and updates the settings', async () => {
    expect(userSettingsSchema.parse(await local.settings.get())).toEqual(DEFAULT_USER_SETTINGS);

    const updated = await local.settings.update({ currency: 'usd', reminderHour: 20 });

    expect(updated).toEqual({ ...DEFAULT_USER_SETTINGS, currency: 'USD', reminderHour: 20 });
    expect(await local.settings.get()).toEqual(updated);
    // An empty update changes nothing.
    expect(await local.settings.update({})).toEqual(updated);
  });

  it('rejects invalid input with a validation problem and writes nothing', async () => {
    const vehicle = await createVehicle();
    statements = [];

    const problem = await problemOf(local.vehicles.create({ make: '', model: 'Ibiza', year: 1500 }));
    expect(problem).toMatchObject({ type: 'about:blank', status: 400, title: 'Validation failed' });
    expect(problem.errors?.map((error) => error.path).sort()).toEqual(['make', 'year']);
    expect(problem.errors?.every((error) => error.message.length > 0)).toBe(true);

    const fuel = await problemOf(
      local.fuelLogs.create(vehicle.id, { date: '2024-01-01', odometer: 1000, quantity: 40 }),
    );
    expect(fuel).toMatchObject({ status: 400, errors: [{ path: 'totalPrice' }] });

    expect(await problemOf(local.settings.update({ reminderHour: 30 }))).toMatchObject({ status: 400 });
    expect(writes()).toEqual([]);
  });

  it('creates a vehicle with its initial reading and lists it by status', async () => {
    const today = todayIn(DEFAULT_USER_SETTINGS.timezone);

    const vehicle = vehicleSchema.parse(await createVehicle({ plate: '1234abc', currentOdometer: 12000 }));
    const other = await createVehicle({ make: 'Renault', model: 'Clio' });
    await local.vehicles.update(other.id, { soldAt: '2024-05-01' });

    expect(vehicle).toMatchObject({
      make: 'Seat',
      plate: '1234ABC',
      status: 'active',
      photoUrl: null,
      archivedAt: null,
      odometer: { value: 12000, date: today },
    });
    const readings = await local.odometer.list(vehicle.id);
    expect(readings.map((reading) => odometerReadingSchema.parse(reading))).toMatchObject([
      { value: 12000, date: today, source: 'manual' },
    ]);
    expect((await local.vehicles.list('active')).map((v) => v.id)).toEqual([vehicle.id]);
    expect((await local.vehicles.list('sold')).map((v) => v.id)).toEqual([other.id]);
    expect((await local.vehicles.list('all')).map((v) => v.id).sort()).toEqual([vehicle.id, other.id].sort());
    expect(await local.vehicles.get(vehicle.id)).toEqual(vehicle);
  });

  it('archives and deletes a vehicle cascading its data', async () => {
    const vehicle = await createVehicle();
    await local.odometer.add(vehicle.id, { date: '2024-01-01', value: 1000 });

    const archived = vehicleSchema.parse(await local.vehicles.update(vehicle.id, { archived: true }));
    expect(archived.status).toBe('archived');
    expect(archived.archivedAt).not.toBeNull();
    expect((await local.vehicles.list('archived')).map((v) => v.id)).toEqual([vehicle.id]);
    expect(await local.vehicles.list('active')).toEqual([]);

    const schedule = await local.schedules.create(vehicle.id, {
      title: 'Aceite',
      category: 'oil_change',
      intervalMonths: 12,
    });
    await local.fuelLogs.create(vehicle.id, {
      date: '2024-02-01',
      odometer: 1500,
      quantity: 40,
      totalPrice: 60,
    });
    await local.maintenance.create(vehicle.id, {
      date: '2024-03-01',
      odometer: 2000,
      category: 'oil_change',
      title: 'Cambio de aceite',
      scheduleId: schedule.id,
    });

    await local.vehicles.remove(vehicle.id);

    expect(await problemOf(local.vehicles.get(vehicle.id))).toMatchObject({ status: 404 });
    expect(await db.select().from(odometerReadings)).toEqual([]);
    expect(await db.select().from(fuelLogs)).toEqual([]);
    expect(await db.select().from(maintenanceRecords)).toEqual([]);
    expect(await db.select().from(maintenanceSchedules)).toEqual([]);
  });

  it('rejects unknown ids with 404', async () => {
    const vehicle = await createVehicle();
    const notFound = { type: 'about:blank', title: 'Not Found', status: 404 };

    expect(await problemOf(local.vehicles.get('nope'))).toEqual({ ...notFound, detail: 'Vehicle not found' });
    expect(await problemOf(local.vehicles.update('nope', { make: 'X' }))).toMatchObject(notFound);
    expect(await problemOf(local.vehicles.remove('nope'))).toMatchObject(notFound);
    expect(await problemOf(local.odometer.list('nope'))).toMatchObject(notFound);
    expect(await problemOf(local.odometer.remove(vehicle.id, 'nope'))).toEqual({
      ...notFound,
      detail: 'Reading not found',
    });
    expect(await problemOf(local.fuelLogs.update(vehicle.id, 'nope', { quantity: 1 }))).toEqual({
      ...notFound,
      detail: 'Fuel log not found',
    });
    expect(await problemOf(local.fuelLogs.remove(vehicle.id, 'nope'))).toMatchObject(notFound);
    expect(await problemOf(local.maintenance.update(vehicle.id, 'nope', { title: 'X' }))).toEqual({
      ...notFound,
      detail: 'Maintenance record not found',
    });
    expect(await problemOf(local.maintenance.spending('nope'))).toMatchObject(notFound);
    expect(await problemOf(local.schedules.remove(vehicle.id, 'nope'))).toEqual({
      ...notFound,
      detail: 'Maintenance schedule not found',
    });
    expect(await problemOf(local.stats.get('nope'))).toMatchObject(notFound);
  });

  it('rejects a future or conflicting reading and keeps readings of other records', async () => {
    const vehicle = await createVehicle();
    await local.odometer.add(vehicle.id, { date: '2024-01-10', value: 1000 });
    statements = [];

    expect(await problemOf(local.odometer.add(vehicle.id, { date: '2999-01-01', value: 2000 }))).toEqual({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: 'The reading date cannot be in the future',
    });
    expect(await problemOf(local.odometer.add(vehicle.id, { date: '2024-02-10', value: 900 }))).toMatchObject(
      {
        status: 409,
        title: 'Conflict',
      },
    );
    expect(writes()).toEqual([]);

    await local.fuelLogs.create(vehicle.id, {
      date: '2024-03-01',
      odometer: 1500,
      quantity: 40,
      totalPrice: 60,
    });
    const fuelReading = (await local.odometer.list(vehicle.id)).find((reading) => reading.source === 'fuel');
    expect(fuelReading).toBeDefined();
    expect(await problemOf(local.odometer.remove(vehicle.id, fuelReading?.id ?? ''))).toMatchObject({
      status: 409,
      detail: 'This reading belongs to another record; edit or delete that record instead',
    });

    const manual = (await local.odometer.list(vehicle.id)).find((reading) => reading.source === 'manual');
    await local.odometer.remove(vehicle.id, manual?.id ?? '');
    expect((await local.odometer.list(vehicle.id)).map((reading) => reading.source)).toEqual(['fuel']);
  });

  it('keeps the fuel reading in sync on create, edit and delete', async () => {
    const vehicle = await createVehicle();

    const log = fuelLogSchema.parse(
      await local.fuelLogs.create(vehicle.id, {
        date: '2024-03-01',
        odometer: 1500,
        quantity: 40,
        totalPrice: 60,
      }),
    );
    expect(log).toMatchObject({ fullTank: true, missedPrevious: false, pricePerUnit: 1.5 });
    expect(await local.odometer.list(vehicle.id)).toMatchObject([
      { date: '2024-03-01', value: 1500, source: 'fuel' },
    ]);

    await local.fuelLogs.update(vehicle.id, log.id, { date: '2024-03-02', odometer: 1600 });
    expect(await local.odometer.list(vehicle.id)).toMatchObject([
      { date: '2024-03-02', value: 1600, source: 'fuel' },
    ]);
    expect((await local.vehicles.get(vehicle.id)).odometer).toEqual({ date: '2024-03-02', value: 1600 });

    await local.fuelLogs.remove(vehicle.id, log.id);
    expect(await local.fuelLogs.list(vehicle.id)).toEqual([]);
    expect(await local.odometer.list(vehicle.id)).toEqual([]);
  });

  it('recomputes fuel prices on edit', async () => {
    const vehicle = await createVehicle();
    const log = await local.fuelLogs.create(vehicle.id, {
      date: '2024-03-01',
      odometer: 1500,
      quantity: 40,
      totalPrice: 60,
    });

    const byQuantity = await local.fuelLogs.update(vehicle.id, log.id, { quantity: 50 });
    expect(byQuantity).toMatchObject({ quantity: 50, totalPrice: 60, pricePerUnit: 1.2 });

    const byUnitPrice = await local.fuelLogs.update(vehicle.id, log.id, { pricePerUnit: 2 });
    expect(byUnitPrice).toMatchObject({ quantity: 50, totalPrice: 100, pricePerUnit: 2 });
    expect((await local.fuelLogs.list(vehicle.id)).map((item) => fuelLogSchema.parse(item))).toEqual([
      byUnitPrice,
    ]);
  });

  it('keeps the maintenance reading and the schedule last done in sync', async () => {
    const vehicle = await createVehicle({ purchaseDate: '2020-01-01', purchaseOdometer: 0 });
    const schedule = await local.schedules.create(vehicle.id, {
      title: 'Aceite',
      category: 'oil_change',
      intervalDistance: 15000,
    });

    const record = maintenanceRecordSchema.parse(
      await local.maintenance.create(vehicle.id, {
        date: '2024-03-01',
        odometer: 30000,
        category: 'oil_change',
        title: 'Cambio de aceite',
        cost: 80,
        scheduleId: schedule.id,
      }),
    );
    expect(await local.odometer.list(vehicle.id)).toMatchObject([
      { date: '2024-03-01', value: 30000, source: 'maintenance' },
    ]);
    expect((await local.schedules.list(vehicle.id))[0]).toMatchObject({
      lastDoneDate: '2024-03-01',
      lastDoneOdometer: 30000,
      nextDueOdometer: 45000,
    });

    await local.maintenance.update(vehicle.id, record.id, { odometer: 31000, date: '2024-03-05' });
    expect(await local.odometer.list(vehicle.id)).toMatchObject([{ date: '2024-03-05', value: 31000 }]);
    expect((await local.schedules.list(vehicle.id))[0]).toMatchObject({
      lastDoneDate: '2024-03-05',
      lastDoneOdometer: 31000,
    });

    // Clearing the odometer removes its reading.
    await local.maintenance.update(vehicle.id, record.id, { odometer: null });
    expect(await local.odometer.list(vehicle.id)).toEqual([]);

    await local.maintenance.update(vehicle.id, record.id, { odometer: 32000 });
    expect(await local.odometer.list(vehicle.id)).toMatchObject([{ value: 32000, source: 'maintenance' }]);

    await local.maintenance.remove(vehicle.id, record.id);
    expect(await local.maintenance.list(vehicle.id)).toEqual([]);
    expect(await local.odometer.list(vehicle.id)).toEqual([]);
  });

  it('rejects a schedule of another vehicle without writing', async () => {
    const vehicle = await createVehicle();
    const other = await createVehicle({ make: 'Renault', model: 'Clio' });
    const schedule = await local.schedules.create(other.id, {
      title: 'Aceite',
      category: 'oil_change',
      intervalMonths: 12,
    });
    statements = [];

    const problem = await problemOf(
      local.maintenance.create(vehicle.id, {
        date: '2024-03-01',
        odometer: 1000,
        category: 'oil_change',
        title: 'Cambio de aceite',
        scheduleId: schedule.id,
      }),
    );

    expect(problem).toEqual({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: 'Maintenance schedule not found for this vehicle',
    });
    expect(writes()).toEqual([]);
    expect(await local.maintenance.list(vehicle.id)).toEqual([]);
    expect(await local.odometer.list(vehicle.id)).toEqual([]);
  });

  it('rounds the maintenance spending', async () => {
    const vehicle = await createVehicle();
    expect(await local.maintenance.spending(vehicle.id)).toEqual({ total: 0 });

    for (const cost of [10.1, 20.2, null]) {
      await local.maintenance.create(vehicle.id, {
        date: '2024-01-01',
        category: 'other',
        title: 'Algo',
        cost,
      });
    }

    expect(maintenanceSpendingSchema.parse(await local.maintenance.spending(vehicle.id))).toEqual({
      total: 30.3,
    });
  });

  it('creates schedules with defaults and requires an interval on edit', async () => {
    const vehicle = await createVehicle({ currentOdometer: 5000 });
    const today = todayIn(DEFAULT_USER_SETTINGS.timezone);

    const schedule = maintenanceScheduleSchema.parse(
      await local.schedules.create(vehicle.id, { title: 'ITV', category: 'inspection', intervalMonths: 24 }),
    );

    expect(schedule).toMatchObject({
      warnDays: 30,
      warnDistance: 1000,
      lastDoneDate: today,
      lastDoneOdometer: 5000,
      status: 'ok',
    });
    expect(
      await problemOf(local.schedules.update(vehicle.id, schedule.id, { intervalMonths: null })),
    ).toEqual({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: 'A schedule needs an interval in months or distance',
    });
    expect(
      await problemOf(local.schedules.create(vehicle.id, { title: 'ITV', category: 'inspection' })),
    ).toMatchObject({ status: 400, title: 'Validation failed', errors: [{ path: 'intervalMonths' }] });

    const edited = await local.schedules.update(vehicle.id, schedule.id, {
      intervalMonths: null,
      intervalDistance: 20000,
    });
    expect(edited).toMatchObject({ intervalMonths: null, intervalDistance: 20000, nextDueOdometer: 25000 });

    await local.schedules.remove(vehicle.id, schedule.id);
    expect(await local.schedules.list(vehicle.id)).toEqual([]);
  });

  it('computes the same stats as computeVehicleStats', async () => {
    const vehicle = await createVehicle({ purchasePrice: 10000 });
    await local.odometer.add(vehicle.id, { date: '2024-01-01', value: 500 });
    await local.fuelLogs.create(vehicle.id, {
      date: '2024-02-01',
      odometer: 1100,
      quantity: 30,
      totalPrice: 45,
    });
    await local.fuelLogs.create(vehicle.id, {
      date: '2024-02-01',
      odometer: 1400,
      quantity: 20,
      totalPrice: 30,
    });
    await local.fuelLogs.create(vehicle.id, {
      date: '2024-03-01',
      odometer: 1900,
      quantity: 35,
      totalPrice: 52.5,
    });
    await local.maintenance.create(vehicle.id, {
      date: '2024-02-15',
      category: 'tires',
      title: 'Ruedas',
      cost: 300,
    });

    const stats = vehicleStatsSchema.parse(await local.stats.get(vehicle.id));

    const readings = await local.odometer.list(vehicle.id);
    const logs = await local.fuelLogs.list(vehicle.id);
    const records = await local.maintenance.list(vehicle.id);
    expect(stats).toEqual(
      computeVehicleStats({
        purchasePrice: 10000,
        readings: readings.map(({ date, value }) => ({ date, value })),
        fuelLogs: [...logs]
          .reverse()
          .map(({ date, odometer, quantity, totalPrice, fullTank, missedPrevious }) => ({
            date,
            odometer,
            quantity,
            totalPrice,
            fullTank,
            missedPrevious,
          })),
        maintenance: records.map(({ date, category, cost }) => ({ date, category, cost })),
      }),
    );
    expect(stats.consumption.average).not.toBeNull();
    expect(stats.series.consumptionBySegment).toHaveLength(2);
  });

  it('returns the local user and config', async () => {
    expect(meSchema.parse(await local.me())).toEqual({
      id: 'local',
      name: 'Local',
      email: 'local@ikrive.invalid',
      role: 'user',
    });
    expect(LOCAL_ME.id).toBe('local');
    expect(clientConfigSchema.parse(await local.config())).toEqual(LOCAL_CLIENT_CONFIG);
    expect(statements).toEqual([]);
  });

  it('serializes concurrent writes', async () => {
    const vehicle = await createVehicle();

    // Each create opens a transaction: without the queue, the second `BEGIN` would land inside the first.
    const logs = await Promise.all(
      [1, 2, 3, 4, 5].map((day) =>
        local.fuelLogs.create(vehicle.id, {
          date: `2024-01-0${day}`,
          odometer: day * 100,
          quantity: 10,
          totalPrice: 15,
        }),
      ),
    );

    expect(logs).toHaveLength(5);
    expect(await local.fuelLogs.list(vehicle.id)).toHaveLength(5);
    expect(await local.odometer.list(vehicle.id)).toHaveLength(5);
  });

  it('rejects unsupported operations with 501', async () => {
    const vehicle = await createVehicle();
    const file = new File(['x'], 'x.png', { type: 'image/png' });
    const options = { hidePrices: false, hidePlate: false, hideVin: false, includeInvoices: false };
    statements = [];
    const unsupported = [
      local.vehicles.setPhoto(vehicle.id, file),
      local.vehicles.removePhoto(vehicle.id),
      local.attachments.list(vehicle.id, 'record'),
      local.attachments.upload(vehicle.id, 'record', file),
      local.attachments.remove(vehicle.id, 'record', 'attachment'),
      local.files.get('/api/vehicles/x/photo'),
      local.saleReport.download(vehicle.id, options),
      local.reportShares.list(vehicle.id),
      local.reportShares.create(vehicle.id, options),
      local.reportShares.revoke(vehicle.id, 'share'),
      local.notifications.list(),
      local.notifications.markRead('n'),
      local.notifications.markAllRead(),
      local.notificationChannels.list(),
      local.notificationChannels.create({
        type: 'ntfy',
        config: { serverUrl: 'https://ntfy.sh', topic: 'ikrive' },
      }),
      local.notificationChannels.update('c', { type: 'ntfy', enabled: false }),
      local.notificationChannels.remove('c'),
      local.notificationChannels.test('c'),
      local.calendarFeed.get(),
      local.calendarFeed.enable(),
      local.calendarFeed.disable(),
      local.dataPortability.import(file),
      local.adminUsers.list(),
      local.adminUsers.setRole('u', 'admin'),
      local.adminUsers.disable('u'),
      local.adminUsers.enable('u'),
      local.adminUsers.remove('u'),
    ];

    for (const operation of unsupported) {
      expect(await problemOf(operation)).toEqual({
        type: 'about:blank',
        title: 'Not Implemented',
        status: 501,
        detail: 'Not available on this device',
      });
    }
    expect(statements).toEqual([]);
  });
});
