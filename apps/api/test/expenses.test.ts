import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { expenses } from '../src/db/schema';
import { createTestApp, signUp } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];

const insurance = { date: '2025-05-10', category: 'insurance', title: 'Seguro anual', cost: 420.5 } as const;

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

/** Shortcuts for the expense endpoints of one vehicle. */
function client(app: TestApp, cookie: string, vehicleId: string) {
  const base = `/api/vehicles/${vehicleId}/expenses`;
  const headers = { cookie };
  return {
    base,
    list: () => app.inject({ method: 'GET', url: base, headers }),
    create: (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: base, headers, payload }),
    get: (expenseId: string) => app.inject({ method: 'GET', url: `${base}/${expenseId}`, headers }),
    patch: (expenseId: string, payload: Record<string, unknown>) =>
      app.inject({ method: 'PATCH', url: `${base}/${expenseId}`, headers, payload }),
    remove: (expenseId: string) => app.inject({ method: 'DELETE', url: `${base}/${expenseId}`, headers }),
  };
}

describe('expenses', () => {
  it('creates, lists, reads, updates and deletes an expense', async () => {
    const { db, vehicle, api } = await setup();

    const created = await api.create({ ...insurance, description: '  Póliza a todo riesgo ' });
    expect(created.statusCode).toBe(201);
    const expense = created.json();
    expect(expense).toEqual({
      id: expect.any(String),
      vehicleId: vehicle.id,
      date: '2025-05-10',
      category: 'insurance',
      title: 'Seguro anual',
      description: 'Póliza a todo riesgo',
      cost: 420.5,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(db.select().from(expenses).where(eq(expenses.id, expense.id)).get()).toMatchObject({
      vehicleId: vehicle.id,
      category: 'insurance',
      title: 'Seguro anual',
      description: 'Póliza a todo riesgo',
      cost: 420.5,
    });

    const untitled = (await api.create({ date: '2025-06-01', category: 'parking', cost: 3.2 })).json();
    expect(untitled).toMatchObject({ title: null, description: null });
    // Same date: the most recently created first.
    const older = (await api.create({ date: '2025-06-01', category: 'tolls', cost: 12 })).json();
    db.update(expenses)
      .set({ createdAt: new Date('2020-01-01T00:00:00Z') })
      .where(eq(expenses.id, older.id))
      .run();
    const earlier = (await api.create({ date: '2025-01-15', category: 'tax', cost: 110 })).json();

    const list = await api.list();
    expect(list.statusCode).toBe(200);
    expect(list.json().map((e: { id: string }) => e.id)).toEqual([
      untitled.id,
      older.id,
      expense.id,
      earlier.id,
    ]);

    const read = await api.get(expense.id);
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual(expense);

    const updated = await api.patch(expense.id, { cost: 450, description: '' });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({
      ...expense,
      cost: 450,
      description: null,
      updatedAt: expect.any(String),
    });
    expect(db.select().from(expenses).where(eq(expenses.id, expense.id)).get()).toMatchObject({
      cost: 450,
      description: null,
      title: 'Seguro anual',
      category: 'insurance',
    });

    expect((await api.remove(expense.id)).statusCode).toBe(204);
    expect(db.select().from(expenses).where(eq(expenses.id, expense.id)).get()).toBeUndefined();
    expect((await api.get(expense.id)).statusCode).toBe(404);
    expect((await api.list()).json()).toHaveLength(3);
  });

  it('rejects invalid payloads without writing', async () => {
    const { db, api } = await setup();
    const { cost: _cost, ...withoutCost } = insurance;
    const invalid = [
      { ...insurance, category: 'car_wash' },
      withoutCost,
      { ...insurance, cost: 0 },
      { ...insurance, cost: -1 },
      { ...insurance, cost: 1_000_000_001 },
      { ...insurance, date: '10/05/2025' },
      { ...insurance, title: 'x'.repeat(121) },
      { ...insurance, description: 'x'.repeat(2001) },
    ];
    for (const payload of invalid) {
      const response = await api.create(payload);
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json()).toMatchObject({ status: 400, title: 'Validation failed' });
    }
    expect(db.select().from(expenses).all()).toEqual([]);

    const expense = (await api.create(insurance)).json();
    for (const payload of [
      { cost: 0 },
      { category: 'fuel' },
      { date: 'yesterday' },
      { title: 'x'.repeat(121) },
    ]) {
      const response = await api.patch(expense.id, payload);
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
    }
    expect((await api.get(expense.id)).json()).toEqual(expense);
  });

  it('rejects future dates on create and edit', async () => {
    const { db, api } = await setup();
    const future = await api.create({ ...insurance, date: '2999-01-01' });
    expect(future.statusCode).toBe(400);
    expect(future.headers['content-type']).toContain('application/problem+json');
    expect(future.json().detail).toBe('The expense date cannot be in the future');
    expect(db.select().from(expenses).all()).toEqual([]);

    const expense = (await api.create(insurance)).json();
    const futureEdit = await api.patch(expense.id, { date: '2999-01-01', cost: 1 });
    expect(futureEdit.statusCode).toBe(400);
    expect(futureEdit.headers['content-type']).toContain('application/problem+json');
    expect(futureEdit.json().detail).toBe('The expense date cannot be in the future');
    expect((await api.get(expense.id)).json()).toEqual(expense);
  });

  it("hides other users' vehicles and expenses", async () => {
    const { app } = await createTestApp();
    const owner = await signUp(app, 'owner@example.com');
    const intruder = await signUp(app, 'intruder@example.com');
    const vehicle = await createVehicle(app, owner.cookie);
    const ownerApi = client(app, owner.cookie, vehicle.id);
    const expense = (await ownerApi.create(insurance)).json();

    const base = ownerApi.base;
    const attempts = [
      { method: 'GET', url: base },
      { method: 'POST', url: base, payload: insurance },
      { method: 'GET', url: `${base}/${expense.id}` },
      { method: 'PATCH', url: `${base}/${expense.id}`, payload: { cost: 1 } },
      { method: 'DELETE', url: `${base}/${expense.id}` },
    ] as const;
    for (const attempt of attempts) {
      const response = await app.inject({ ...attempt, headers: { cookie: intruder.cookie } });
      expect(response.statusCode, `${attempt.method} ${attempt.url}`).toBe(404);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json().detail).toBe('Vehicle not found');
    }

    // An expense id from another vehicle, owned by the same user or by someone else.
    const otherVehicle = await createVehicle(app, owner.cookie);
    const otherVehicleApi = client(app, owner.cookie, otherVehicle.id);
    const intruderVehicle = await createVehicle(app, intruder.cookie);
    const intruderExpense = (await client(app, intruder.cookie, intruderVehicle.id).create(insurance)).json();

    for (const [api, expenseId] of [
      [otherVehicleApi, expense.id],
      [ownerApi, intruderExpense.id],
    ] as const) {
      for (const response of [
        await api.get(expenseId),
        await api.patch(expenseId, { cost: 1 }),
        await api.remove(expenseId),
      ]) {
        expect(response.statusCode).toBe(404);
        expect(response.headers['content-type']).toContain('application/problem+json');
        expect(response.json().detail).toBe('Expense not found');
      }
    }
    expect((await ownerApi.get(expense.id)).json()).toEqual(expense);
  });

  it('deletes the expenses with the vehicle', async () => {
    const { app, db, cookie, vehicle, api } = await setup();
    await api.create(insurance);
    await api.create({ date: '2025-06-01', category: 'fines', cost: 200 });
    expect(db.select().from(expenses).all()).toHaveLength(2);

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/vehicles/${vehicle.id}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(204);
    expect(db.select().from(expenses).all()).toHaveLength(0);
  });
});
