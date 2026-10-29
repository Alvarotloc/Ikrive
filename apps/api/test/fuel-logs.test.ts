import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { fuelLogs, odometerReadings } from '../src/db/schema';
import { createTestApp, signUp } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];

const refuel = { date: '2025-05-10', odometer: 45_000, quantity: 40, totalPrice: 58.36 } as const;

async function setup() {
  const { app, db } = await createTestApp();
  const { cookie } = await signUp(app);
  const vehicle = await createVehicle(app, cookie);
  return { app, db, cookie, vehicle, api: client(app, cookie, vehicle.id) };
}

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

/** Shortcuts for the fuel log and odometer endpoints of one vehicle. */
function client(app: TestApp, cookie: string, vehicleId: string) {
  const base = `/api/vehicles/${vehicleId}`;
  const headers = { cookie };
  return {
    base,
    list: () => app.inject({ method: 'GET', url: `${base}/fuel-logs`, headers }),
    create: (payload: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: `${base}/fuel-logs`, headers, payload }),
    get: (logId: string) => app.inject({ method: 'GET', url: `${base}/fuel-logs/${logId}`, headers }),
    patch: (logId: string, payload: Record<string, unknown>) =>
      app.inject({ method: 'PATCH', url: `${base}/fuel-logs/${logId}`, headers, payload }),
    remove: (logId: string) => app.inject({ method: 'DELETE', url: `${base}/fuel-logs/${logId}`, headers }),
    addReading: (date: string, value: number) =>
      app.inject({ method: 'POST', url: `${base}/odometer`, headers, payload: { date, value } }),
    removeReading: (readingId: string) =>
      app.inject({ method: 'DELETE', url: `${base}/odometer/${readingId}`, headers }),
    readings: async () =>
      (await app.inject({ method: 'GET', url: `${base}/odometer`, headers })).json() as {
        id: string;
        date: string;
        value: number;
        source: string;
      }[],
  };
}

describe('fuel logs', () => {
  it('creates, lists, reads, updates and deletes fuel logs', async () => {
    const { db, vehicle, api } = await setup();

    const created = await api.create({
      ...refuel,
      pricePerUnit: 1.459,
      fullTank: false,
      missedPrevious: true,
    });
    expect(created.statusCode).toBe(201);
    const log = created.json();
    expect(log).toEqual({
      id: expect.any(String),
      vehicleId: vehicle.id,
      date: '2025-05-10',
      odometer: 45_000,
      quantity: 40,
      totalPrice: 58.36,
      pricePerUnit: 1.459,
      fullTank: false,
      missedPrevious: true,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(db.select().from(fuelLogs).where(eq(fuelLogs.id, log.id)).get()).toMatchObject({
      quantity: 40,
      totalPrice: 58.36,
      pricePerUnit: 1.459,
      fullTank: false,
      missedPrevious: true,
      odometerReadingId: expect.any(String),
    });

    const defaults = (await api.create({ ...refuel, date: '2025-04-01', odometer: 44_000 })).json();
    expect(defaults).toMatchObject({ fullTank: true, missedPrevious: false, pricePerUnit: 1.459 });
    // Same date: the higher odometer first; same date and odometer: the most recently created first.
    const later = (await api.create({ ...refuel, date: '2025-06-01', odometer: 46_000 })).json();
    const sameDayHigher = (await api.create({ ...refuel, date: '2025-06-01', odometer: 46_500 })).json();
    const sameOdometer = (await api.create({ ...refuel, date: '2025-06-01', odometer: 46_000 })).json();
    db.update(fuelLogs)
      .set({ createdAt: new Date('2020-01-01T00:00:00Z') })
      .where(eq(fuelLogs.id, later.id))
      .run();

    const list = await api.list();
    expect(list.statusCode).toBe(200);
    expect(list.json().map((l: { id: string }) => l.id)).toEqual([
      sameDayHigher.id,
      sameOdometer.id,
      later.id,
      log.id,
      defaults.id,
    ]);

    const read = await api.get(log.id);
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual(log);

    const updated = await api.patch(log.id, { missedPrevious: false });
    expect(updated.statusCode).toBe(200);
    // The partial PATCH keeps fullTank as it was (false), it does not reset it to its default.
    expect(updated.json()).toEqual({ ...log, missedPrevious: false, updatedAt: expect.any(String) });

    expect((await api.remove(log.id)).statusCode).toBe(204);
    expect((await api.get(log.id)).statusCode).toBe(404);
    expect((await api.patch(log.id, { fullTank: true })).statusCode).toBe(404);
    expect((await api.remove(log.id)).statusCode).toBe(404);
    expect((await api.list()).json()).toHaveLength(4);
  });

  it('validates the payload', async () => {
    const { api } = await setup();
    const { odometer: _odometer, ...withoutOdometer } = refuel;
    const { totalPrice: _totalPrice, ...withoutPrices } = refuel;
    const invalid = [
      { ...refuel, quantity: 0 },
      { ...refuel, totalPrice: -1 },
      { ...refuel, pricePerUnit: -1.5 },
      withoutOdometer,
      { ...refuel, odometer: null },
      withoutPrices,
      { ...refuel, date: '10/05/2025' },
    ];
    for (const payload of invalid) {
      const response = await api.create(payload);
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json()).toMatchObject({ status: 400, title: 'Validation failed' });
    }
    expect((await api.list()).json()).toEqual([]);
    expect(await api.readings()).toEqual([]);

    const log = (await api.create(refuel)).json();
    for (const payload of [{ quantity: 0 }, { totalPrice: 0 }, { odometer: null }, { fullTank: 'yes' }]) {
      const badPatch = await api.patch(log.id, payload);
      expect(badPatch.statusCode, JSON.stringify(payload)).toBe(400);
      expect(badPatch.headers['content-type']).toContain('application/problem+json');
    }
    expect((await api.get(log.id)).json()).toEqual(log);
  });

  it('completes the missing price on create', async () => {
    const { api } = await setup();
    const fromTotal = await api.create({ ...refuel, quantity: 3, totalPrice: 50 });
    expect(fromTotal.statusCode).toBe(201);
    expect(fromTotal.json()).toMatchObject({ quantity: 3, totalPrice: 50, pricePerUnit: 16.667 });

    const { totalPrice: _totalPrice, ...withoutTotal } = refuel;
    const fromUnit = await api.create({
      ...withoutTotal,
      date: '2025-05-11',
      odometer: 45_100,
      pricePerUnit: 1.549,
      quantity: 35.27,
    });
    expect(fromUnit.statusCode).toBe(201);
    expect(fromUnit.json()).toMatchObject({ quantity: 35.27, totalPrice: 54.63, pricePerUnit: 1.549 });

    // Both prices are stored as they come, even if they do not match the quantity exactly.
    const both = await api.create({
      ...refuel,
      date: '2025-05-12',
      odometer: 45_200,
      totalPrice: 60,
      pricePerUnit: 1.459,
    });
    expect(both.statusCode).toBe(201);
    expect(both.json()).toMatchObject({ quantity: 40, totalPrice: 60, pricePerUnit: 1.459 });
  });

  it('recomputes prices on edit', async () => {
    const { api } = await setup();
    const log = (await api.create(refuel)).json();
    expect(log).toMatchObject({ totalPrice: 58.36, pricePerUnit: 1.459 });

    // New quantity without prices: the total is kept and the price per unit recomputed.
    const quantity = await api.patch(log.id, { quantity: 50 });
    expect(quantity.statusCode).toBe(200);
    expect(quantity.json()).toMatchObject({ quantity: 50, totalPrice: 58.36, pricePerUnit: 1.167 });

    // Only the price per unit: the total is recomputed with the stored quantity.
    const unit = await api.patch(log.id, { pricePerUnit: 1.5 });
    expect(unit.json()).toMatchObject({ quantity: 50, totalPrice: 75, pricePerUnit: 1.5 });

    // Only the total, with a new quantity: the price per unit uses the resulting quantity.
    const total = await api.patch(log.id, { quantity: 40, totalPrice: 60 });
    expect(total.json()).toMatchObject({ quantity: 40, totalPrice: 60, pricePerUnit: 1.5 });

    // Both prices: kept as they come.
    const both = await api.patch(log.id, { totalPrice: 61, pricePerUnit: 1.49 });
    expect(both.json()).toMatchObject({ quantity: 40, totalPrice: 61, pricePerUnit: 1.49 });

    // Neither quantity nor prices: the stored prices are untouched.
    const dateOnly = await api.patch(log.id, { date: '2025-05-11', fullTank: false });
    expect(dateOnly.statusCode).toBe(200);
    expect(dateOnly.json()).toMatchObject({
      date: '2025-05-11',
      fullTank: false,
      quantity: 40,
      totalPrice: 61,
      pricePerUnit: 1.49,
    });
  });

  it('creates a fuel odometer reading', async () => {
    const { db, api } = await setup();
    const log = (await api.create(refuel)).json();
    const readings = await api.readings();
    expect(readings).toEqual([
      expect.objectContaining({ date: '2025-05-10', value: 45_000, source: 'fuel' }),
    ]);
    expect(db.select().from(fuelLogs).where(eq(fuelLogs.id, log.id)).get()?.odometerReadingId).toBe(
      readings[0]?.id,
    );
  });

  it('updates the linked reading when date or odometer change', async () => {
    const { db, api } = await setup();
    const log = (await api.create(refuel)).json();
    const [original] = await api.readings();

    const moved = await api.patch(log.id, { date: '2025-05-20' });
    expect(moved.statusCode).toBe(200);
    expect(moved.json()).toMatchObject({ date: '2025-05-20', odometer: 45_000 });
    expect(await api.readings()).toEqual([
      expect.objectContaining({ id: original?.id, date: '2025-05-20', value: 45_000, source: 'fuel' }),
    ]);

    const corrected = await api.patch(log.id, { odometer: 46_000 });
    expect(corrected.json()).toMatchObject({ date: '2025-05-20', odometer: 46_000 });
    expect(await api.readings()).toEqual([
      expect.objectContaining({ id: original?.id, date: '2025-05-20', value: 46_000 }),
    ]);

    // A log that lost its reading (FK set to null) gets a new one on its next date or odometer change.
    db.delete(odometerReadings)
      .where(eq(odometerReadings.id, original?.id ?? ''))
      .run();
    expect(db.select().from(fuelLogs).where(eq(fuelLogs.id, log.id)).get()?.odometerReadingId).toBeNull();
    const relinked = await api.patch(log.id, { odometer: 46_100 });
    expect(relinked.statusCode).toBe(200);
    const [recreated] = await api.readings();
    expect(recreated).toMatchObject({ date: '2025-05-20', value: 46_100, source: 'fuel' });
    expect(db.select().from(fuelLogs).where(eq(fuelLogs.id, log.id)).get()?.odometerReadingId).toBe(
      recreated?.id,
    );

    // The stored odometer always matches the linked reading.
    const second = (await api.create({ ...refuel, date: '2025-06-01', odometer: 47_000 })).json();
    await api.patch(second.id, { date: '2025-06-02', odometer: 47_500 });
    const logs = (await api.list()).json() as { date: string; odometer: number }[];
    expect(logs.map(({ date, odometer }) => ({ date, value: odometer }))).toEqual(
      (await api.readings()).map(({ date, value }) => ({ date, value })),
    );
  });

  it('ignores its own reading when validating an edit', async () => {
    const { api } = await setup();
    const log = (await api.create({ ...refuel, odometer: 10_000 })).json();

    const edited = await api.patch(log.id, { date: '2025-05-01', odometer: 10_500 });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ date: '2025-05-01', odometer: 10_500 });
    expect(await api.readings()).toEqual([expect.objectContaining({ date: '2025-05-01', value: 10_500 })]);
  });

  it('rejects a conflicting odometer on create and edit', async () => {
    const { api } = await setup();
    expect((await api.addReading('2025-06-01', 50_000)).statusCode).toBe(201);

    const conflict = await api.create({ ...refuel, date: '2025-07-01', odometer: 49_000 });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.headers['content-type']).toContain('application/problem+json');
    expect(conflict.json()).toMatchObject({
      status: 409,
      detail: 'The odometer cannot go backwards: there is a reading of 50000 on 2025-06-01',
    });
    expect((await api.list()).json()).toEqual([]);
    expect(await api.readings()).toHaveLength(1);

    const log = (await api.create(refuel)).json();
    const before = await api.readings();

    const backwards = await api.patch(log.id, { odometer: 51_000, quantity: 10 });
    expect(backwards.statusCode).toBe(409);
    expect(backwards.headers['content-type']).toContain('application/problem+json');
    const later = await api.patch(log.id, { date: '2025-06-15' });
    expect(later.statusCode).toBe(409);

    expect((await api.get(log.id)).json()).toEqual(log);
    expect(await api.readings()).toEqual(before);
  });

  it('rejects a future date', async () => {
    const { api } = await setup();
    const future = await api.create({ ...refuel, date: '2999-01-01' });
    expect(future.statusCode).toBe(400);
    expect(future.headers['content-type']).toContain('application/problem+json');
    expect(future.json().detail).toBe('The fuel log date cannot be in the future');
    expect((await api.list()).json()).toEqual([]);
    expect(await api.readings()).toEqual([]);

    const log = (await api.create(refuel)).json();
    const before = await api.readings();
    const futureEdit = await api.patch(log.id, { date: '2999-01-01', quantity: 10 });
    expect(futureEdit.statusCode).toBe(400);
    expect(futureEdit.headers['content-type']).toContain('application/problem+json');
    expect((await api.get(log.id)).json()).toEqual(log);
    expect(await api.readings()).toEqual(before);
  });

  it('deletes the linked reading with the log', async () => {
    const { api } = await setup();
    expect((await api.addReading('2025-01-01', 40_000)).statusCode).toBe(201);
    const log = (await api.create(refuel)).json();
    expect(await api.readings()).toHaveLength(2);

    expect((await api.remove(log.id)).statusCode).toBe(204);
    expect(await api.readings()).toEqual([expect.objectContaining({ value: 40_000, source: 'manual' })]);
  });

  it('cannot delete its reading from the odometer endpoint', async () => {
    const { api } = await setup();
    const log = (await api.create(refuel)).json();
    const [reading] = await api.readings();

    const response = await api.removeReading(reading?.id ?? '');
    expect(response.statusCode).toBe(409);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(await api.readings()).toEqual([reading]);
    expect((await api.get(log.id)).json()).toEqual(log);
  });

  it('deletes fuel logs with the vehicle', async () => {
    const { app, db, cookie, vehicle, api } = await setup();
    await api.create(refuel);
    await api.create({ ...refuel, date: '2025-06-01', odometer: 46_000 });
    expect(db.select().from(fuelLogs).all()).toHaveLength(2);

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/vehicles/${vehicle.id}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(204);
    expect(db.select().from(fuelLogs).all()).toHaveLength(0);
  });

  it("hides other users' vehicles and fuel logs", async () => {
    const { app } = await createTestApp();
    const owner = await signUp(app, 'owner@example.com');
    const intruder = await signUp(app, 'intruder@example.com');
    const vehicle = await createVehicle(app, owner.cookie);
    const ownerApi = client(app, owner.cookie, vehicle.id);
    const log = (await ownerApi.create(refuel)).json();

    const base = `${ownerApi.base}/fuel-logs`;
    const attempts = [
      { method: 'GET', url: base },
      { method: 'POST', url: base, payload: refuel },
      { method: 'GET', url: `${base}/${log.id}` },
      { method: 'PATCH', url: `${base}/${log.id}`, payload: { quantity: 1 } },
      { method: 'DELETE', url: `${base}/${log.id}` },
    ] as const;
    for (const attempt of attempts) {
      const response = await app.inject({ ...attempt, headers: { cookie: intruder.cookie } });
      expect(response.statusCode, `${attempt.method} ${attempt.url}`).toBe(404);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json().detail).toBe('Vehicle not found');
    }

    // A log id from another vehicle, owned by the same user or by someone else.
    const otherVehicle = await createVehicle(app, owner.cookie);
    const otherVehicleApi = client(app, owner.cookie, otherVehicle.id);
    const intruderVehicle = await createVehicle(app, intruder.cookie);
    const intruderApi = client(app, intruder.cookie, intruderVehicle.id);
    const intruderLog = (await intruderApi.create(refuel)).json();

    for (const [api, logId] of [
      [otherVehicleApi, log.id],
      [ownerApi, intruderLog.id],
    ] as const) {
      for (const response of [
        await api.get(logId),
        await api.patch(logId, { quantity: 1 }),
        await api.remove(logId),
      ]) {
        expect(response.statusCode).toBe(404);
        expect(response.json().detail).toBe('Fuel log not found');
      }
    }

    expect((await ownerApi.get(log.id)).json()).toEqual(log);
    expect(await ownerApi.readings()).toHaveLength(1);
    expect((await intruderApi.get(intruderLog.id)).json()).toEqual(intruderLog);
  });
});
