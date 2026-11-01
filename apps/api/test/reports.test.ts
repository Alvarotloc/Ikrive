import { extractText } from 'unpdf';
import { describe, expect, it } from 'vitest';
import { todayIn } from '../src/lib/dates';
import { createTestApp, signUp } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];

const PLATE = '1234BCD';
const VIN = 'VSSZZZ5FZKR123456';

async function setup() {
  const { app } = await createTestApp();
  const { cookie } = await signUp(app);
  return { app, cookie };
}

async function createVehicle(app: TestApp, cookie: string, payload: Record<string, unknown> = {}) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/vehicles',
    headers: { cookie },
    payload: { make: 'Seat', model: 'León', version: 'FR', plate: PLATE, vin: VIN, ...payload },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string };
}

/** Vehicle with readings on several days and two maintenance records, the second one excluded. */
async function seed(app: TestApp, cookie: string) {
  const vehicle = await createVehicle(app, cookie);
  const headers = { cookie };
  const post = async (path: string, payload: Record<string, unknown>) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/vehicles/${vehicle.id}/${path}`,
      headers,
      payload,
    });
    expect(response.statusCode).toBe(201);
  };
  await post('odometer', { date: '2025-01-01', value: 40_000 });
  await post('odometer', { date: '2026-01-01', value: 52_000 });
  await post('maintenance', {
    date: '2025-06-15',
    odometer: 46_000,
    category: 'oil_change',
    title: 'Cambio de aceite y filtro',
    cost: 12_345.67,
  });
  await post('maintenance', {
    date: '2025-09-01',
    category: 'repair',
    title: 'Reparación privada',
    cost: 80,
    includeInReport: false,
  });
  return vehicle;
}

const reportUrl = (vehicleId: string, query = '') => `/api/vehicles/${vehicleId}/report.pdf${query}`;

/** Text of every page of a PDF, with `Intl`'s (narrow) no-break spaces turned into plain ones. */
async function pdfText(pdf: Buffer): Promise<string> {
  const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
  return text.replace(/[  ]/g, ' ');
}

describe('sale report', () => {
  it('serves the sale report as a pdf', async () => {
    const { app, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie, { name: 'Mi León Ñ' });
    // A zone far from UTC, so the issue date really comes from the owner's settings.
    const patched = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie },
      payload: { timezone: 'Pacific/Kiritimati' },
    });
    expect(patched.statusCode).toBe(200);

    const response = await app.inject({ method: 'GET', url: reportUrl(vehicle.id), headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.rawPayload.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const fileName = `ikrive-mi-leon-n-${todayIn('Pacific/Kiritimati')}.pdf`;
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`,
    );
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('renders the report contents', async () => {
    const { app, cookie } = await setup();
    const vehicle = await seed(app, cookie);

    const response = await app.inject({ method: 'GET', url: reportUrl(vehicle.id), headers: { cookie } });
    expect(response.statusCode).toBe(200);
    const text = await pdfText(response.rawPayload);

    for (const expected of [
      'Informe de venta',
      'Seat León',
      'Seat León FR',
      'Vehículo',
      'Resumen',
      'Histórico del cuentakilómetros',
      'Historial de mantenimiento',
      // Summary: latest reading and the single included record.
      '52.000 km',
      'Cambio de aceite y filtro',
      'Aceite',
      // Chart axis labels: first and last date, minimum and maximum value.
      '1 ene 2025',
      '1 ene 2026',
      '40.000 km',
    ]) {
      expect(text).toContain(expected);
    }
    expect(text).not.toContain('Reparación privada');
  });

  it('hides the vin and the plate', async () => {
    const { app, cookie } = await setup();
    const vehicle = await seed(app, cookie);
    const textOf = async (query: string) => {
      const response = await app.inject({
        method: 'GET',
        url: reportUrl(vehicle.id, query),
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      return pdfText(response.rawPayload);
    };

    const full = await textOf('');
    expect(full).toContain(VIN);
    expect(full).toContain(PLATE);
    expect(full).toContain('12.345,67');

    const withoutVin = await textOf('?hideVin=true');
    expect(withoutVin).not.toContain(VIN);
    expect(withoutVin).toContain(PLATE);

    const withoutPlate = await textOf('?hidePlate=1');
    expect(withoutPlate).not.toContain(PLATE);
    expect(withoutPlate).toContain(VIN);

    const withoutPrices = await textOf('?hidePrices=true');
    expect(withoutPrices).not.toContain('12.345,67');
    expect(withoutPrices).not.toContain('€');
    expect(withoutPrices).toContain('Cambio de aceite y filtro');
  });

  it("uses the owner's settings", async () => {
    const { app, cookie } = await setup();
    const vehicle = await seed(app, cookie);

    const before = await app.inject({ method: 'GET', url: reportUrl(vehicle.id), headers: { cookie } });
    const spanish = await pdfText(before.rawPayload);
    expect(spanish).toContain('Informe de venta');
    expect(spanish).toContain('12.345,67 €');

    const patched = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie },
      payload: { locale: 'en', currency: 'USD', distanceUnit: 'mi' },
    });
    expect(patched.statusCode).toBe(200);

    const after = await app.inject({ method: 'GET', url: reportUrl(vehicle.id), headers: { cookie } });
    const english = await pdfText(after.rawPayload);
    for (const expected of [
      'Sale report',
      'Summary',
      'Maintenance history',
      'Odometer history',
      'Oil',
      '$12,345.67',
      '52,000 mi',
      'Jun 15, 2025',
    ]) {
      expect(english).toContain(expected);
    }
    expect(english).not.toContain('Informe de venta');
    expect(english).not.toContain('€');
  });

  it("hides other users' vehicles", async () => {
    const { app, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie);
    const { cookie: otherCookie } = await signUp(app, 'grace@example.com', 'Grace');

    for (const [url, headers] of [
      [reportUrl(vehicle.id), { cookie: otherCookie }],
      [reportUrl('missing'), { cookie }],
    ] as const) {
      const response = await app.inject({ method: 'GET', url, headers });
      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json()).toMatchObject({ status: 404, detail: 'Vehicle not found' });
    }
  });

  it('requires a session', async () => {
    const { app, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie);

    const response = await app.inject({ method: 'GET', url: reportUrl(vehicle.id) });
    expect(response.statusCode).toBe(401);
  });

  it('rejects invalid options', async () => {
    const { app, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie);

    for (const query of ['?hideVin=yes', '?hidePrices=2', '?hidePlate=true&hidePlate=false']) {
      const response = await app.inject({
        method: 'GET',
        url: reportUrl(vehicle.id, query),
        headers: { cookie },
      });
      expect(response.statusCode, query).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
    }
  });

  it('embeds the brand fonts', async () => {
    const { app, cookie } = await setup();
    const vehicle = await seed(app, cookie);

    const response = await app.inject({ method: 'GET', url: reportUrl(vehicle.id), headers: { cookie } });
    // Font dictionaries are not compressed: their names can be read from the raw bytes.
    const raw = response.rawPayload.toString('latin1');
    expect(raw).toMatch(/\/BaseFont\s*\/[A-Z]{6}\+Outfit-/);
    expect(raw).toMatch(/\/BaseFont\s*\/[A-Z]{6}\+PlusJakartaSans-/);
  });

  it('rate limits the report', async () => {
    const { app, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie);

    for (let i = 0; i < 10; i++) {
      const response = await app.inject({ method: 'GET', url: reportUrl(vehicle.id), headers: { cookie } });
      expect(response.statusCode, `#${i}`).toBe(200);
    }
    const limited = await app.inject({ method: 'GET', url: reportUrl(vehicle.id), headers: { cookie } });
    expect(limited.statusCode).toBe(429);
  });
});
