import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { maintenanceRecords } from '../src/db/schema';
import { createTestApp, signUp } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];

const oilChange = { date: '2025-05-10', category: 'oil_change', title: 'Cambio de aceite' } as const;

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

/** Shortcuts for the maintenance and odometer endpoints of one vehicle. */
function client(app: TestApp, cookie: string, vehicleId: string) {
  const base = `/api/vehicles/${vehicleId}`;
  const headers = { cookie };
  return {
    base,
    list: () => app.inject({ method: 'GET', url: `${base}/maintenance`, headers }),
    create: (payload: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: `${base}/maintenance`, headers, payload }),
    get: (recordId: string) => app.inject({ method: 'GET', url: `${base}/maintenance/${recordId}`, headers }),
    patch: (recordId: string, payload: Record<string, unknown>) =>
      app.inject({ method: 'PATCH', url: `${base}/maintenance/${recordId}`, headers, payload }),
    remove: (recordId: string) =>
      app.inject({ method: 'DELETE', url: `${base}/maintenance/${recordId}`, headers }),
    spending: () => app.inject({ method: 'GET', url: `${base}/maintenance/spending`, headers }),
    addReading: (date: string, value: number) =>
      app.inject({ method: 'POST', url: `${base}/odometer`, headers, payload: { date, value } }),
    readings: async () =>
      (await app.inject({ method: 'GET', url: `${base}/odometer`, headers })).json() as {
        id: string;
        date: string;
        value: number;
        source: string;
      }[],
  };
}

describe('maintenance records', () => {
  it('creates, lists, reads, updates and deletes maintenance records', async () => {
    const { db, vehicle, api } = await setup();

    const created = await api.create({
      ...oilChange,
      odometer: 45_000,
      description: '  5W30 y filtro  ',
      workshop: 'Taller Paco',
      cost: 89.9,
      includeInReport: false,
    });
    expect(created.statusCode).toBe(201);
    const record = created.json();
    expect(record).toEqual({
      id: expect.any(String),
      vehicleId: vehicle.id,
      date: '2025-05-10',
      odometer: 45_000,
      category: 'oil_change',
      title: 'Cambio de aceite',
      description: '5W30 y filtro',
      workshop: 'Taller Paco',
      cost: 89.9,
      includeInReport: false,
      scheduleId: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const minimal = (await api.create({ date: '2025-03-01', category: 'tires', title: 'Neumáticos' })).json();
    expect(minimal).toMatchObject({
      odometer: null,
      description: null,
      workshop: null,
      cost: null,
      includeInReport: true,
    });
    const latest = (await api.create({ date: '2025-08-20', category: 'inspection', title: 'ITV' })).json();
    const sameDay = (await api.create({ date: '2025-08-20', category: 'repair', title: 'Luna' })).json();
    // Same date: the most recently created comes first. Make the creation order unambiguous.
    db.update(maintenanceRecords)
      .set({ createdAt: new Date('2020-01-01T00:00:00Z') })
      .where(eq(maintenanceRecords.id, latest.id))
      .run();

    const list = await api.list();
    expect(list.statusCode).toBe(200);
    expect(list.json().map((r: { id: string }) => r.id)).toEqual([
      sameDay.id,
      latest.id,
      record.id,
      minimal.id,
    ]);

    const read = await api.get(record.id);
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual(record);

    const updated = await api.patch(record.id, { title: 'Aceite y filtros', cost: 95 });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({
      ...record,
      title: 'Aceite y filtros',
      cost: 95,
      updatedAt: expect.any(String),
    });

    expect((await api.remove(record.id)).statusCode).toBe(204);
    expect((await api.get(record.id)).statusCode).toBe(404);
    expect((await api.patch(record.id, { title: 'x' })).statusCode).toBe(404);
    expect((await api.remove(record.id)).statusCode).toBe(404);
    expect(await api.list().then((r) => r.json())).toHaveLength(3);
  });

  it('validates the payload', async () => {
    const { api } = await setup();
    const invalid = [
      { ...oilChange, category: 'car_wash' },
      { ...oilChange, title: '   ' },
      { ...oilChange, cost: -1 },
      { ...oilChange, date: '10/05/2025' },
      { category: 'oil_change', title: 'Sin fecha' },
    ];
    for (const payload of invalid) {
      const response = await api.create(payload);
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json()).toMatchObject({ status: 400, title: 'Validation failed' });
    }
    expect((await api.list()).json()).toEqual([]);

    const record = (await api.create(oilChange)).json();
    const badPatch = await api.patch(record.id, { category: 'car_wash' });
    expect(badPatch.statusCode).toBe(400);
    expect(badPatch.headers['content-type']).toContain('application/problem+json');
    expect((await api.get(record.id)).json()).toEqual(record);
  });

  it('creates a maintenance odometer reading', async () => {
    const { api } = await setup();
    const record = (await api.create({ ...oilChange, odometer: 45_000 })).json();
    expect(record.odometer).toBe(45_000);
    expect(await api.readings()).toEqual([
      expect.objectContaining({ date: '2025-05-10', value: 45_000, source: 'maintenance' }),
    ]);
  });

  it('does not create a reading without odometer', async () => {
    const { api } = await setup();
    expect((await api.create(oilChange)).statusCode).toBe(201);
    expect((await api.create({ ...oilChange, odometer: null })).statusCode).toBe(201);
    expect(await api.readings()).toEqual([]);
  });

  it('updates the linked reading when date or odometer change', async () => {
    const { api } = await setup();
    const record = (await api.create({ ...oilChange, odometer: 45_000 })).json();
    const [original] = await api.readings();

    const moved = await api.patch(record.id, { date: '2025-05-20' });
    expect(moved.statusCode).toBe(200);
    expect(moved.json()).toMatchObject({ date: '2025-05-20', odometer: 45_000 });
    expect(await api.readings()).toEqual([
      expect.objectContaining({ id: original?.id, date: '2025-05-20', value: 45_000, source: 'maintenance' }),
    ]);

    const corrected = await api.patch(record.id, { odometer: 46_000 });
    expect(corrected.json()).toMatchObject({ date: '2025-05-20', odometer: 46_000 });
    expect(await api.readings()).toEqual([
      expect.objectContaining({ id: original?.id, date: '2025-05-20', value: 46_000 }),
    ]);

    // A record without odometer gets its reading once the odometer is added.
    const tires = (await api.create({ date: '2025-07-01', category: 'tires', title: 'Neumáticos' })).json();
    const withOdometer = await api.patch(tires.id, { odometer: 50_000 });
    expect(withOdometer.statusCode).toBe(200);
    expect(withOdometer.json().odometer).toBe(50_000);
    const readings = await api.readings();
    expect(readings).toHaveLength(2);
    expect(readings[0]).toMatchObject({ date: '2025-07-01', value: 50_000, source: 'maintenance' });

    // The stored odometer always matches the linked reading.
    const records = (await api.list()).json() as { date: string; odometer: number }[];
    expect(records.map(({ date, odometer }) => ({ date, value: odometer }))).toEqual(
      readings.map(({ date, value }) => ({ date, value })),
    );
  });

  it('ignores its own reading when validating an edit', async () => {
    const { api } = await setup();
    const record = (
      await api.create({ date: '2025-05-10', odometer: 10_000, category: 'brakes', title: 'Frenos' })
    ).json();

    const edited = await api.patch(record.id, { date: '2025-05-01', odometer: 10_500 });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ date: '2025-05-01', odometer: 10_500 });
    expect(await api.readings()).toEqual([expect.objectContaining({ date: '2025-05-01', value: 10_500 })]);
  });

  it('removes the linked reading when odometer is cleared', async () => {
    const { api } = await setup();
    const record = (await api.create({ ...oilChange, odometer: 45_000 })).json();

    const cleared = await api.patch(record.id, { odometer: null });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json()).toMatchObject({ odometer: null, title: 'Cambio de aceite' });
    expect(await api.readings()).toEqual([]);
    expect((await api.get(record.id)).statusCode).toBe(200);
  });

  it('rejects a conflicting odometer on create and edit', async () => {
    const { api } = await setup();
    expect((await api.addReading('2025-06-01', 50_000)).statusCode).toBe(201);

    const conflict = await api.create({ ...oilChange, date: '2025-07-01', odometer: 49_000 });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.headers['content-type']).toContain('application/problem+json');
    expect(conflict.json()).toMatchObject({
      status: 409,
      detail: 'The odometer cannot go backwards: there is a reading of 50000 on 2025-06-01',
    });
    expect((await api.list()).json()).toEqual([]);
    expect(await api.readings()).toHaveLength(1);

    const record = (await api.create({ ...oilChange, date: '2025-05-10', odometer: 45_000 })).json();
    const before = await api.readings();

    const backwards = await api.patch(record.id, { odometer: 51_000, title: 'Cambiado' });
    expect(backwards.statusCode).toBe(409);
    expect(backwards.headers['content-type']).toContain('application/problem+json');
    const later = await api.patch(record.id, { date: '2025-06-15' });
    expect(later.statusCode).toBe(409);

    expect((await api.get(record.id)).json()).toEqual(record);
    expect(await api.readings()).toEqual(before);
  });

  it('rejects a future date', async () => {
    const { api } = await setup();
    const future = await api.create({ ...oilChange, date: '2999-01-01', odometer: 1_000 });
    expect(future.statusCode).toBe(400);
    expect(future.headers['content-type']).toContain('application/problem+json');
    expect(future.json().detail).toBe('The maintenance date cannot be in the future');
    expect((await api.create({ ...oilChange, date: '2999-01-01' })).statusCode).toBe(400);
    expect((await api.list()).json()).toEqual([]);
    expect(await api.readings()).toEqual([]);

    const record = (await api.create(oilChange)).json();
    const futureEdit = await api.patch(record.id, { date: '2999-01-01', title: 'Cambiado' });
    expect(futureEdit.statusCode).toBe(400);
    expect((await api.get(record.id)).json()).toEqual(record);
  });

  it('deletes the linked reading with the record', async () => {
    const { api } = await setup();
    expect((await api.addReading('2025-01-01', 40_000)).statusCode).toBe(201);
    const record = (await api.create({ ...oilChange, odometer: 45_000 })).json();
    expect(await api.readings()).toHaveLength(2);

    expect((await api.remove(record.id)).statusCode).toBe(204);
    expect(await api.readings()).toEqual([expect.objectContaining({ value: 40_000, source: 'manual' })]);
  });

  it("hides other users' vehicles and records", async () => {
    const { app } = await createTestApp();
    const owner = await signUp(app, 'owner@example.com');
    const intruder = await signUp(app, 'intruder@example.com');
    const vehicle = await createVehicle(app, owner.cookie);
    const ownerApi = client(app, owner.cookie, vehicle.id);
    const record = (await ownerApi.create({ ...oilChange, odometer: 45_000 })).json();

    const base = `${ownerApi.base}/maintenance`;
    const attempts = [
      { method: 'GET', url: base },
      { method: 'POST', url: base, payload: oilChange },
      { method: 'GET', url: `${base}/${record.id}` },
      { method: 'PATCH', url: `${base}/${record.id}`, payload: { title: 'Hacked' } },
      { method: 'DELETE', url: `${base}/${record.id}` },
    ] as const;
    for (const attempt of attempts) {
      const response = await app.inject({ ...attempt, headers: { cookie: intruder.cookie } });
      expect(response.statusCode, `${attempt.method} ${attempt.url}`).toBe(404);
      expect(response.json().detail).toBe('Vehicle not found');
    }

    // A record id from another vehicle, owned by the same user or by someone else.
    const otherVehicle = await createVehicle(app, owner.cookie);
    const otherVehicleApi = client(app, owner.cookie, otherVehicle.id);
    const intruderVehicle = await createVehicle(app, intruder.cookie);
    const intruderApi = client(app, intruder.cookie, intruderVehicle.id);
    const intruderRecord = (await intruderApi.create(oilChange)).json();

    for (const [api, recordId] of [
      [otherVehicleApi, record.id],
      [ownerApi, intruderRecord.id],
    ] as const) {
      for (const response of [
        await api.get(recordId),
        await api.patch(recordId, { title: 'Hacked' }),
        await api.remove(recordId),
      ]) {
        expect(response.statusCode).toBe(404);
        expect(response.json().detail).toBe('Maintenance record not found');
      }
    }

    expect((await ownerApi.get(record.id)).json()).toEqual(record);
    expect(await ownerApi.readings()).toHaveLength(1);
    expect((await intruderApi.get(intruderRecord.id)).json()).toEqual(intruderRecord);
  });
});

describe('maintenance spending', () => {
  it("sums the costs of the vehicle's records", async () => {
    const { app, cookie, api } = await setup();
    const first = (await api.create({ ...oilChange, cost: 10.1 })).json();
    const second = (
      await api.create({ date: '2025-06-01', category: 'tires', title: 'Neumáticos', cost: 20.2 })
    ).json();
    await api.create({ date: '2025-07-01', category: 'inspection', title: 'ITV', cost: null });
    const otherVehicle = await createVehicle(app, cookie);
    await client(app, cookie, otherVehicle.id).create({ ...oilChange, cost: 500 });

    const response = await api.spending();
    expect(response.statusCode).toBe(200);
    // 10.1 + 20.2 is 30.299999999999997 in floating point: the API rounds to cents.
    expect(response.json()).toEqual({ total: 30.3 });

    expect((await api.patch(first.id, { cost: 15.55 })).statusCode).toBe(200);
    expect((await api.spending()).json()).toEqual({ total: 35.75 });

    expect((await api.remove(second.id)).statusCode).toBe(204);
    expect((await api.spending()).json()).toEqual({ total: 15.55 });
  });

  it('returns zero without records with cost', async () => {
    const { api } = await setup();
    const empty = await api.spending();
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ total: 0 });

    await api.create(oilChange);
    const withoutCost = await api.spending();
    expect(withoutCost.statusCode).toBe(200);
    expect(withoutCost.json()).toEqual({ total: 0 });
  });

  it("hides other users' spending", async () => {
    const { app } = await createTestApp();
    const owner = await signUp(app, 'owner@example.com');
    const intruder = await signUp(app, 'intruder@example.com');
    const vehicle = await createVehicle(app, owner.cookie);
    await client(app, owner.cookie, vehicle.id).create({ ...oilChange, cost: 89.9 });

    for (const vehicleId of [vehicle.id, 'missing-vehicle']) {
      const response = await client(app, intruder.cookie, vehicleId).spending();
      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json().detail).toBe('Vehicle not found');
    }

    const anonymous = await app.inject({
      method: 'GET',
      url: `/api/vehicles/${vehicle.id}/maintenance/spending`,
    });
    expect(anonymous.statusCode).toBe(401);
  });
});
