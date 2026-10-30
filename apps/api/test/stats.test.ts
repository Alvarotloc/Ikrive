import { describe, expect, it } from 'vitest';
import { createTestApp, signUp } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];

async function createVehicle(app: TestApp, cookie: string, payload: Record<string, unknown> = {}) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/vehicles',
    headers: { cookie },
    payload: { make: 'Seat', model: 'León', ...payload },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string };
}

/** Shortcuts for the endpoints of one vehicle that feed its statistics. */
function client(app: TestApp, cookie: string, vehicleId: string) {
  const base = `/api/vehicles/${vehicleId}`;
  const headers = { cookie };
  const post = async (path: string, payload: Record<string, unknown>) => {
    const response = await app.inject({ method: 'POST', url: `${base}/${path}`, headers, payload });
    expect(response.statusCode).toBe(201);
  };
  return {
    stats: () => app.inject({ method: 'GET', url: `${base}/stats`, headers }),
    maintenanceSpending: () => app.inject({ method: 'GET', url: `${base}/maintenance/spending`, headers }),
    addReading: (date: string, value: number) => post('odometer', { date, value }),
    addFuelLog: (payload: Record<string, unknown>) => post('fuel-logs', payload),
    addMaintenance: (payload: Record<string, unknown>) => post('maintenance', payload),
  };
}

async function setup() {
  const { app } = await createTestApp();
  const { cookie } = await signUp(app);
  return { app, cookie };
}

/**
 * Readings: 10 000 (Jan 1), the three refuels and 11 000 (Mar 1), so 1 000 km in 59 days. The full
 * tanks of Jan 10 and Feb 10 close a 600 km segment with the partial of Jan 25: 45 l, 7.5 l/100 km.
 */
async function seed(api: ReturnType<typeof client>) {
  await api.addReading('2025-01-01', 10_000);
  await api.addFuelLog({ date: '2025-01-10', odometer: 10_200, quantity: 40, totalPrice: 60 });
  await api.addFuelLog({
    date: '2025-01-25',
    odometer: 10_500,
    quantity: 20,
    totalPrice: 30,
    fullTank: false,
  });
  await api.addFuelLog({ date: '2025-02-10', odometer: 10_800, quantity: 25, totalPrice: 40 });
  await api.addReading('2025-03-01', 11_000);
  await api.addMaintenance({ date: '2025-02-15', category: 'oil_change', title: 'Aceite', cost: 89.9 });
  await api.addMaintenance({ date: '2025-02-20', category: 'repair', title: 'Revisión ruido' });
  await api.addMaintenance({ date: '2025-03-01', category: 'tires', title: 'Neumáticos', cost: 400 });
}

const expectedStats = {
  distance: { driven: 1_000, perYear: 6_186, perMonth: 516 },
  consumption: { average: 7.5 },
  costPerDistance: { fuel: 0.13, maintenance: 0.49 },
  spending: {
    purchase: 15_000,
    fuel: 130,
    maintenance: 489.9,
    total: 15_619.9,
    byCategory: [
      { category: 'tires', total: 400 },
      { category: 'oil_change', total: 89.9 },
    ],
  },
  series: {
    // Feb 1 is interpolated between Jan 25 (10 500) and Feb 10 (10 800): 10 631.
    distanceByMonth: [
      { month: '2025-01', distance: 631 },
      { month: '2025-02', distance: 369 },
      { month: '2025-03', distance: 0 },
    ],
    consumptionBySegment: [
      { startDate: '2025-01-10', endDate: '2025-02-10', distance: 600, quantity: 45, consumption: 7.5 },
    ],
    spendingByMonth: [
      { month: '2025-01', fuel: 90, maintenance: 0 },
      { month: '2025-02', fuel: 40, maintenance: 89.9 },
      { month: '2025-03', fuel: 0, maintenance: 400 },
    ],
  },
};

describe('vehicle stats', () => {
  it('returns the stats of a vehicle with data', async () => {
    const { app, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie, { purchasePrice: 15_000 });
    const api = client(app, cookie, vehicle.id);
    await seed(api);

    const response = await api.stats();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expectedStats);

    const spending = await api.maintenanceSpending();
    expect(spending.json().total).toBe(response.json().spending.maintenance);
  });

  it('returns empty stats for a vehicle without data', async () => {
    const { app, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie, { purchasePrice: 9_999.99 });

    const response = await client(app, cookie, vehicle.id).stats();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      distance: { driven: null, perYear: null, perMonth: null },
      consumption: { average: null },
      costPerDistance: { fuel: null, maintenance: null },
      spending: { purchase: 9_999.99, fuel: 0, maintenance: 0, total: 9_999.99, byCategory: [] },
      series: { distanceByMonth: [], consumptionBySegment: [], spendingByMonth: [] },
    });
  });

  it("hides other users' vehicles", async () => {
    const { app, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie);
    const { cookie: otherCookie } = await signUp(app, 'grace@example.com', 'Grace');

    for (const [url, headers] of [
      [`/api/vehicles/${vehicle.id}/stats`, { cookie: otherCookie }],
      ['/api/vehicles/missing/stats', { cookie }],
    ] as const) {
      const response = await app.inject({ method: 'GET', url, headers });
      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json()).toMatchObject({ status: 404, detail: 'Vehicle not found' });
    }

    const anonymous = await app.inject({ method: 'GET', url: `/api/vehicles/${vehicle.id}/stats` });
    expect(anonymous.statusCode).toBe(401);
  });

  it('keeps the stored units', async () => {
    const { app, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie, { purchasePrice: 15_000 });
    const api = client(app, cookie, vehicle.id);
    await seed(api);

    const settings = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie },
      payload: { distanceUnit: 'mi', volumeUnit: 'gal', currency: 'USD' },
    });
    expect(settings.statusCode).toBe(200);

    const response = await api.stats();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expectedStats);
  });
});
