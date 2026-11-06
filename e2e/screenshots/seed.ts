import type { APIRequestContext } from '@playwright/test';
import { baseURL } from '../server-config';
import { type CreatedVehicle, createVehicle, expect, PNG_8x8 } from '../tests/fixtures';

/** First account of the instance (admin), registered by the screenshot script itself. */
export const DEMO_USER = { name: 'Lucía', email: 'lucia@ikrive.test', password: 'screenshots-password-123' };

export const DEMO_VEHICLE = { make: 'Toyota', model: 'Corolla', plate: '4821 LKP' };

/** `today` moved `days` days (negative = past), as `YYYY-MM-DD`. */
function shiftDays(today: Date, days: number): string {
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + days));
  return date.toISOString().slice(0, 10);
}

async function post(request: APIRequestContext, url: string, data: object): Promise<{ id: string }> {
  const response = await request.post(url, { data });
  expect(response.status(), `${url}: ${await response.text()}`).toBe(201);
  return (await response.json()) as { id: string };
}

/** Registers the first user through the API; its session cookie stays in `request`. */
export async function signUpDemoUser(request: APIRequestContext): Promise<void> {
  const response = await request.post('/api/auth/sign-up/email', {
    headers: { origin: baseURL },
    data: DEMO_USER,
  });
  expect(response.status(), await response.text()).toBe(200);
}

/**
 * A vehicle with a year and a half of history, dated relative to `today` so that the upcoming
 * schedule and the statistics make sense whatever the day of the run: odometer readings,
 * maintenance records (one with an invoice), a schedule due soon and full-tank refuels.
 */
export async function seedDemoData(request: APIRequestContext, today: Date): Promise<CreatedVehicle> {
  const vehicle = await createVehicle(request, DEMO_VEHICLE);
  const base = `/api/vehicles/${vehicle.id}`;
  const patch = await request.patch(base, {
    data: {
      version: '1.8 Hybrid Active Tech',
      year: 2021,
      fuelType: 'hybrid',
      purchaseDate: shiftDays(today, -540),
      purchasePrice: 24_500,
      purchaseOdometer: 31_200,
    },
  });
  expect(patch.status(), await patch.text()).toBe(200);

  // Every dated mileage below (readings, maintenance, refuels) grows with the date.
  for (const [days, value] of [
    [-450, 34_900],
    [-330, 39_400],
    [-210, 43_800],
  ] as const) {
    await post(request, `${base}/odometer`, { date: shiftDays(today, days), value });
  }

  const records = [
    {
      date: shiftDays(today, -365),
      odometer: 38_300,
      category: 'oil_change',
      title: 'Cambio de aceite y filtro',
      workshop: 'Talleres Martín',
      cost: 89.9,
    },
    {
      date: shiftDays(today, -270),
      odometer: 41_500,
      category: 'tires',
      title: 'Neumáticos delanteros',
      workshop: 'Neumáticos Sur',
      cost: 236,
    },
    {
      date: shiftDays(today, -150),
      odometer: 46_000,
      category: 'inspection',
      title: 'ITV',
      cost: 42.5,
    },
    {
      date: shiftDays(today, -45),
      odometer: 49_000,
      category: 'brakes',
      title: 'Pastillas de freno',
      workshop: 'Talleres Martín',
      cost: 145,
    },
  ] as const;
  const [oilChange, ...rest] = records;
  const invoiced = await post(request, `${base}/maintenance`, oilChange);
  for (const record of rest) await post(request, `${base}/maintenance`, record);
  const upload = await request.post(`${base}/maintenance/${invoiced.id}/attachments`, {
    multipart: { file: { name: 'factura-aceite.png', mimeType: 'image/png', buffer: PNG_8x8 } },
  });
  expect(upload.status(), await upload.text()).toBe(201);

  // Yearly, last done 350 days ago: due in about two weeks, so it shows as upcoming.
  await post(request, `${base}/schedules`, {
    title: 'Revisión anual',
    category: 'oil_change',
    intervalMonths: 12,
    intervalDistance: 15_000,
    lastDoneDate: shiftDays(today, -350),
    lastDoneOdometer: 38_700,
  });

  const refuels = [
    { days: -120, odometer: 47_400, quantity: 38.2, totalPrice: 59.6 },
    { days: -90, odometer: 48_050, quantity: 31.4, totalPrice: 48.3 },
    { days: -60, odometer: 48_720, quantity: 32.9, totalPrice: 51.9 },
    { days: -30, odometer: 49_380, quantity: 31.8, totalPrice: 49.1 },
    { days: -5, odometer: 50_040, quantity: 32.6, totalPrice: 50.2 },
  ];
  for (const { days, ...refuel } of refuels) {
    await post(request, `${base}/fuel-logs`, { ...refuel, date: shiftDays(today, days), fullTank: true });
  }
  return vehicle;
}
