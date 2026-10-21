import { addDays } from '@ikrive/shared';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { maintenanceRecords, maintenanceSchedules } from '../src/db/schema';
import { todayIn } from '../src/lib/dates';
import { createTestApp, signUp } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];

const oilRule = { title: 'Cambio de aceite', category: 'oil_change', intervalMonths: 12 } as const;
const oilChange = { date: '2025-05-10', category: 'oil_change', title: 'Cambio de aceite' } as const;

/** The user's default time zone, as the service computes «today». */
const today = () => todayIn('Europe/Madrid');

async function setup(vehicle: Record<string, unknown> = {}) {
  const { app, db } = await createTestApp();
  const { cookie } = await signUp(app);
  const created = await createVehicle(app, cookie, vehicle);
  return { app, db, cookie, vehicle: created, api: client(app, cookie, created.id) };
}

async function createVehicle(app: TestApp, cookie: string, fields: Record<string, unknown> = {}) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/vehicles',
    headers: { cookie },
    payload: { make: 'Seat', model: 'León', ...fields },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string };
}

/** Shortcuts for the schedule, maintenance and odometer endpoints of one vehicle. */
function client(app: TestApp, cookie: string, vehicleId: string) {
  const base = `/api/vehicles/${vehicleId}`;
  const headers = { cookie };
  return {
    base,
    list: () => app.inject({ method: 'GET', url: `${base}/schedules`, headers }),
    create: (payload: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: `${base}/schedules`, headers, payload }),
    get: (scheduleId: string) =>
      app.inject({ method: 'GET', url: `${base}/schedules/${scheduleId}`, headers }),
    patch: (scheduleId: string, payload: Record<string, unknown>) =>
      app.inject({ method: 'PATCH', url: `${base}/schedules/${scheduleId}`, headers, payload }),
    remove: (scheduleId: string) =>
      app.inject({ method: 'DELETE', url: `${base}/schedules/${scheduleId}`, headers }),
    createRecord: (payload: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: `${base}/maintenance`, headers, payload }),
    patchRecord: (recordId: string, payload: Record<string, unknown>) =>
      app.inject({ method: 'PATCH', url: `${base}/maintenance/${recordId}`, headers, payload }),
    getRecord: (recordId: string) =>
      app.inject({ method: 'GET', url: `${base}/maintenance/${recordId}`, headers }),
    records: async () =>
      (await app.inject({ method: 'GET', url: `${base}/maintenance`, headers })).json() as unknown[],
    addReading: async (date: string, value: number) => {
      const response = await app.inject({
        method: 'POST',
        url: `${base}/odometer`,
        headers,
        payload: { date, value },
      });
      expect(response.statusCode).toBe(201);
    },
  };
}

describe('maintenance schedules', () => {
  it('creates, lists, reads, updates and deletes schedules', async () => {
    const { db, vehicle, api } = await setup();

    const created = await api.create({
      ...oilRule,
      intervalDistance: 15_000,
      warnDays: 15,
      warnDistance: 500,
      lastDoneDate: '2024-03-31',
      lastDoneOdometer: 30_000,
    });
    expect(created.statusCode).toBe(201);
    const schedule = created.json();
    expect(schedule).toEqual({
      id: expect.any(String),
      vehicleId: vehicle.id,
      title: 'Cambio de aceite',
      category: 'oil_change',
      intervalMonths: 12,
      intervalDistance: 15_000,
      warnDays: 15,
      warnDistance: 500,
      lastDoneDate: '2024-03-31',
      lastDoneOdometer: 30_000,
      nextDueDate: '2025-03-31',
      nextDueDateEstimated: false,
      nextDueOdometer: 45_000,
      status: 'overdue',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    const [row] = db
      .select()
      .from(maintenanceSchedules)
      .where(eq(maintenanceSchedules.id, schedule.id))
      .all();
    expect(row).toMatchObject({ vehicleId: vehicle.id, intervalMonths: 12, lastDoneDate: '2024-03-31' });

    const second = (await api.create({ title: 'ITV', category: 'inspection', intervalMonths: 24 })).json();
    expect((await api.list()).json().map((s: { id: string }) => s.id)).toEqual([schedule.id, second.id]);
    expect((await api.get(schedule.id)).json()).toEqual(schedule);

    const patched = await api.patch(schedule.id, { intervalMonths: 1, intervalDistance: null });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({
      title: 'Cambio de aceite',
      warnDays: 15,
      warnDistance: 500,
      intervalMonths: 1,
      intervalDistance: null,
      nextDueDate: '2024-04-30',
      nextDueOdometer: null,
    });

    const removed = await api.remove(schedule.id);
    expect(removed.statusCode).toBe(204);
    expect((await api.get(schedule.id)).statusCode).toBe(404);
    expect((await api.list()).json()).toEqual([second]);
  });

  it('validates the payload', async () => {
    const { api } = await setup();

    for (const payload of [
      { title: 'Aceite', category: 'oil_change' },
      { title: 'Aceite', category: 'oil_change', intervalMonths: null, intervalDistance: null },
    ]) {
      const response = await api.create(payload);
      expect(response.statusCode).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json().errors).toEqual([expect.objectContaining({ path: 'intervalMonths' })]);
    }
    expect((await api.create({ ...oilRule, category: 'car_wash' })).statusCode).toBe(400);
    expect((await api.list()).json()).toEqual([]);

    const schedule = (await api.create(oilRule)).json();
    const response = await api.patch(schedule.id, { intervalMonths: null });
    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json().detail).toBe('A schedule needs an interval in months or distance');
    expect((await api.patch(schedule.id, { category: 'car_wash' })).statusCode).toBe(400);
    expect((await api.get(schedule.id)).json()).toEqual(schedule);
  });

  it("hides other users' vehicles and schedules", async () => {
    const { app } = await createTestApp();
    const owner = await signUp(app, 'owner@example.com');
    const intruder = await signUp(app, 'intruder@example.com');
    const vehicle = await createVehicle(app, owner.cookie);
    const ownerApi = client(app, owner.cookie, vehicle.id);
    const schedule = (await ownerApi.create(oilRule)).json();

    const base = `${ownerApi.base}/schedules`;
    const attempts = [
      { method: 'GET', url: base },
      { method: 'POST', url: base, payload: oilRule },
      { method: 'GET', url: `${base}/${schedule.id}` },
      { method: 'PATCH', url: `${base}/${schedule.id}`, payload: { title: 'Hacked' } },
      { method: 'DELETE', url: `${base}/${schedule.id}` },
    ] as const;
    for (const attempt of attempts) {
      const response = await app.inject({ ...attempt, headers: { cookie: intruder.cookie } });
      expect(response.statusCode, `${attempt.method} ${attempt.url}`).toBe(404);
      expect(response.json().detail).toBe('Vehicle not found');
    }

    // A schedule id from another vehicle, owned by the same user or by someone else.
    const otherVehicle = await createVehicle(app, owner.cookie);
    const otherVehicleApi = client(app, owner.cookie, otherVehicle.id);
    const intruderVehicle = await createVehicle(app, intruder.cookie);
    const intruderApi = client(app, intruder.cookie, intruderVehicle.id);
    const intruderSchedule = (await intruderApi.create(oilRule)).json();

    for (const [api, scheduleId] of [
      [otherVehicleApi, schedule.id],
      [ownerApi, intruderSchedule.id],
    ] as const) {
      for (const response of [
        await api.get(scheduleId),
        await api.patch(scheduleId, { title: 'Hacked' }),
        await api.remove(scheduleId),
      ]) {
        expect(response.statusCode).toBe(404);
        expect(response.json().detail).toBe('Maintenance schedule not found');
      }
    }

    expect((await ownerApi.list()).json()).toEqual([schedule]);
    expect((await intruderApi.list()).json()).toEqual([intruderSchedule]);
  });

  it('stores the given last done values', async () => {
    const { api } = await setup({ purchaseDate: '2020-01-01', purchaseOdometer: 1_000 });
    const schedule = (
      await api.create({ ...oilRule, lastDoneDate: '2024-06-01', lastDoneOdometer: 40_000 })
    ).json();
    expect(schedule).toMatchObject({ lastDoneDate: '2024-06-01', lastDoneOdometer: 40_000 });
    // An explicit null odometer is kept, not replaced by the purchase.
    const withoutOdometer = (await api.create({ ...oilRule, lastDoneOdometer: null })).json();
    expect(withoutOdometer).toMatchObject({ lastDoneDate: '2020-01-01', lastDoneOdometer: null });
  });

  it('defaults last done to the vehicle purchase', async () => {
    const { api } = await setup({ purchaseDate: '2020-01-01', purchaseOdometer: 1_000 });
    await api.addReading('2024-01-01', 50_000);
    expect((await api.create(oilRule)).json()).toMatchObject({
      lastDoneDate: '2020-01-01',
      lastDoneOdometer: 1_000,
    });
  });

  it('defaults last done to today and the latest reading', async () => {
    const { app, cookie, api } = await setup();
    expect((await api.create(oilRule)).json()).toMatchObject({
      lastDoneDate: today(),
      lastDoneOdometer: null,
    });

    await api.addReading('2024-01-01', 40_000);
    await api.addReading('2024-06-01', 45_000);
    expect((await api.create(oilRule)).json()).toMatchObject({
      lastDoneDate: today(),
      lastDoneOdometer: 45_000,
    });

    // Each field falls back on its own: purchase date without purchase odometer.
    const vehicle = await createVehicle(app, cookie, { purchaseDate: '2020-01-01' });
    const vehicleApi = client(app, cookie, vehicle.id);
    await vehicleApi.addReading('2024-01-01', 40_000);
    expect((await vehicleApi.create(oilRule)).json()).toMatchObject({
      lastDoneDate: '2020-01-01',
      lastDoneOdometer: 40_000,
    });
  });

  it('returns the computed due fields', async () => {
    const { api } = await setup();

    // By months, long past: overdue.
    expect(
      (await api.create({ ...oilRule, lastDoneDate: '2020-01-31', intervalMonths: 1 })).json(),
    ).toMatchObject({
      nextDueDate: '2020-02-29',
      nextDueDateEstimated: false,
      nextDueOdometer: null,
      status: 'overdue',
    });

    // By distance without readings: no estimated date.
    const byDistance = {
      title: 'Neumáticos',
      category: 'tires',
      intervalDistance: 10_000,
      lastDoneOdometer: 10_000,
    };
    expect((await api.create(byDistance)).json()).toMatchObject({
      nextDueDate: null,
      nextDueDateEstimated: false,
      nextDueOdometer: 20_000,
      status: 'ok',
    });

    // 6000 in 60 days = 100/day; 4000 left → 40 days after the latest reading.
    await api.addReading(addDays(today(), -70), 10_000);
    await api.addReading(addDays(today(), -10), 16_000);
    const estimated = (await api.create(byDistance)).json();
    expect(estimated).toMatchObject({
      nextDueDate: addDays(today(), 30),
      nextDueDateEstimated: true,
      nextDueOdometer: 20_000,
      status: 'ok',
    });
    // Within the distance threshold.
    expect((await api.patch(estimated.id, { warnDistance: 4_000 })).json()).toMatchObject({
      status: 'due_soon',
    });
  });

  it('updates the schedule when a linked record is created or edited', async () => {
    const { api } = await setup();
    const schedule = (
      await api.create({
        ...oilRule,
        intervalDistance: 15_000,
        lastDoneDate: '2024-01-01',
        lastDoneOdometer: 30_000,
      })
    ).json();

    const created = await api.createRecord({ ...oilChange, odometer: 45_000, scheduleId: schedule.id });
    expect(created.statusCode).toBe(201);
    expect(created.json().scheduleId).toBe(schedule.id);
    expect((await api.get(schedule.id)).json()).toMatchObject({
      lastDoneDate: '2025-05-10',
      lastDoneOdometer: 45_000,
      nextDueDate: '2026-05-10',
      nextDueOdometer: 60_000,
    });

    // Linking an existing record through an edit.
    const record = (await api.createRecord({ ...oilChange, date: '2025-06-01', odometer: 46_000 })).json();
    expect(record.scheduleId).toBeNull();
    const patched = await api.patchRecord(record.id, { scheduleId: schedule.id });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().scheduleId).toBe(schedule.id);
    expect((await api.get(schedule.id)).json()).toMatchObject({
      lastDoneDate: '2025-06-01',
      lastDoneOdometer: 46_000,
      nextDueDate: '2026-06-01',
      nextDueOdometer: 61_000,
    });

    // Editing the date of a linked record moves the last done; without odometer it becomes null.
    await api.patchRecord(record.id, { date: '2025-07-01', odometer: null });
    expect((await api.get(schedule.id)).json()).toMatchObject({
      lastDoneDate: '2025-07-01',
      lastDoneOdometer: null,
      nextDueDate: '2026-07-01',
      nextDueOdometer: null,
    });
  });

  it('keeps last done for an older linked record', async () => {
    const { api } = await setup();
    const schedule = (
      await api.create({ ...oilRule, lastDoneDate: '2025-03-01', lastDoneOdometer: 40_000 })
    ).json();

    const created = await api.createRecord({
      ...oilChange,
      date: '2025-01-01',
      odometer: 35_000,
      scheduleId: schedule.id,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().scheduleId).toBe(schedule.id);
    const record = (await api.createRecord({ ...oilChange, date: '2025-02-01', odometer: 38_000 })).json();
    expect((await api.patchRecord(record.id, { scheduleId: schedule.id })).statusCode).toBe(200);

    expect((await api.get(schedule.id)).json()).toMatchObject({
      lastDoneDate: '2025-03-01',
      lastDoneOdometer: 40_000,
    });
  });

  it('rejects a schedule from another vehicle', async () => {
    const { app, cookie, api } = await setup();
    const intruder = await signUp(app, 'intruder@example.com');
    const otherVehicle = await createVehicle(app, cookie);
    const otherSchedule = (
      await client(app, cookie, otherVehicle.id).create({ ...oilRule, lastDoneDate: '2024-01-01' })
    ).json();
    const intruderVehicle = await createVehicle(app, intruder.cookie);
    const intruderSchedule = (
      await client(app, intruder.cookie, intruderVehicle.id).create({
        ...oilRule,
        lastDoneDate: '2024-01-01',
      })
    ).json();

    for (const scheduleId of [otherSchedule.id, intruderSchedule.id, 'missing']) {
      const response = await api.createRecord({ ...oilChange, odometer: 45_000, scheduleId });
      expect(response.statusCode).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json().detail).toBe('Maintenance schedule not found for this vehicle');
    }
    expect(await api.records()).toEqual([]);

    const record = (await api.createRecord(oilChange)).json();
    const response = await api.patchRecord(record.id, { title: 'Otro', scheduleId: otherSchedule.id });
    expect(response.statusCode).toBe(400);
    expect((await api.getRecord(record.id)).json()).toEqual(record);

    expect((await client(app, cookie, otherVehicle.id).get(otherSchedule.id)).json()).toEqual(otherSchedule);
    expect((await client(app, intruder.cookie, intruderVehicle.id).get(intruderSchedule.id)).json()).toEqual(
      intruderSchedule,
    );
  });

  it('unlinks records when a schedule is deleted', async () => {
    const { db, api } = await setup();
    const schedule = (await api.create({ ...oilRule, lastDoneDate: '2024-01-01' })).json();
    const record = (await api.createRecord({ ...oilChange, scheduleId: schedule.id })).json();
    expect(record.scheduleId).toBe(schedule.id);

    expect((await api.remove(schedule.id)).statusCode).toBe(204);

    const kept = await api.getRecord(record.id);
    expect(kept.statusCode).toBe(200);
    // The FK action unlinks the record without touching `updatedAt` (no application-level UPDATE).
    expect(kept.json()).toEqual({ ...record, scheduleId: null });
    const [row] = db.select().from(maintenanceRecords).where(eq(maintenanceRecords.id, record.id)).all();
    expect(row?.scheduleId).toBeNull();
    const fks = db.all<{ table: string; on_delete: string }>(
      sql`PRAGMA foreign_key_list(maintenance_records)`,
    );
    expect(fks).toContainEqual(
      expect.objectContaining({ table: 'maintenance_schedules', on_delete: 'SET NULL' }),
    );
  });

  it('deletes the schedules with the vehicle', async () => {
    const { app, db, cookie, vehicle, api } = await setup();
    const schedule = (await api.create({ ...oilRule, lastDoneDate: '2024-01-01' })).json();
    await api.createRecord({ ...oilChange, scheduleId: schedule.id });

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/vehicles/${vehicle.id}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(204);
    expect(db.select().from(maintenanceSchedules).all()).toEqual([]);
    expect(db.select().from(maintenanceRecords).all()).toEqual([]);
  });
});
