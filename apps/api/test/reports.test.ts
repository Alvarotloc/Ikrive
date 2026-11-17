import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { todayIn } from '@ikrive/shared';
import { fitImage } from '@ikrive/shared/sale-report-pdf';
import {
  CROSS_MAINTENANCE,
  CROSS_NOW,
  CROSS_OPTIONS,
  CROSS_READINGS,
  CROSS_SETTINGS,
  CROSS_VEHICLE,
  crossScenarioFiles,
} from '@ikrive/shared/sale-report-pdf/cross-scenario';
import { eq } from 'drizzle-orm';
import { PageSizes, PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { extractText } from 'unpdf';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config';
import { attachments } from '../src/db/schema';
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

/** PDF with one page per size, generated on the fly (no binary fixtures in the repo). */
async function makePdf(sizes: [number, number][], options: { useObjectStreams?: boolean } = {}) {
  const doc = await PDFDocument.create();
  for (const size of sizes) doc.addPage(size);
  return Buffer.from(await doc.save(options));
}

/** Valid PDF padded with an unreferenced stream until it stores about `bytes` bytes. */
async function paddedPdf(size: [number, number], bytes: number) {
  const doc = await PDFDocument.create();
  doc.addPage(size);
  doc.context.register(doc.context.stream(new Uint8Array(bytes)));
  return Buffer.from(await doc.save());
}

/** Valid PDF whose trailer declares an encryption dictionary: pdf-lib refuses to load it. */
async function encryptedPdf() {
  const raw = (await makePdf([[300, 300]], { useObjectStreams: false })).toString('latin1');
  return Buffer.from(
    raw.replace(/trailer\s*<</, 'trailer\n<<\n/Encrypt << /Filter /Standard >>\n'),
    'latin1',
  );
}

/** Passes the upload type detection (it only checks the signature) but is not a PDF. */
const corruptPdf = (bytes = 64) => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(bytes)]);

/** Valid PDF without a single page (pdf-lib adds a blank one unless told not to). */
const emptyPdf = async () => Buffer.from(await (await PDFDocument.create()).save({ addDefaultPage: false }));

/** PNG signature followed by garbage: sharp cannot decode it. */
const brokenPng = () =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(256, 0x5a)]);

const image = (format: 'png' | 'webp', width: number, height: number) => {
  const base = sharp({ create: { width, height, channels: 3, background: '#c5e8e0' } });
  return (format === 'png' ? base.png() : base.webp()).toBuffer();
};

function multipart(data: Buffer, filename: string) {
  const boundary = '----ikrive-report-boundary';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        'Content-Type: application/octet-stream\r\n\r\n',
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

/** Helpers bound to one vehicle of the signed-in user. */
function vehicleApi(app: TestApp, cookie: string, vehicleId: string) {
  return {
    async addMaintenance(payload: Record<string, unknown>) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/vehicles/${vehicleId}/maintenance`,
        headers: { cookie },
        payload: { category: 'repair', ...payload },
      });
      expect(response.statusCode).toBe(201);
      return (response.json() as { id: string }).id;
    },
    async attach(recordId: string, data: Buffer, filename: string) {
      const { payload, headers } = multipart(data, filename);
      const response = await app.inject({
        method: 'POST',
        url: `/api/vehicles/${vehicleId}/maintenance/${recordId}/attachments`,
        headers: { cookie, ...headers },
        payload,
      });
      expect(response.statusCode, filename).toBe(201);
      return (response.json() as { id: string }).id;
    },
    async report(query = '') {
      const response = await app.inject({
        method: 'GET',
        url: reportUrl(vehicleId, query),
        headers: { cookie },
      });
      expect(response.statusCode, query).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      return response.rawPayload;
    },
  };
}

const pageSizes = async (pdf: Buffer) =>
  (await PDFDocument.load(pdf)).getPages().map((page) => {
    const { width, height } = page.getSize();
    return [Math.round(width), Math.round(height)];
  });

const pageCount = async (pdf: Buffer) => (await PDFDocument.load(pdf)).getPageCount();

const occurrences = (text: string, search: string) => text.split(search).length - 1;

/** App whose log lines are kept, to look for the warnings of skipped annexes. */
async function setupWithLogs(env: Record<string, string> = {}) {
  const lines: string[] = [];
  const { app, db, dataDir } = await createTestApp(env, { logStream: { write: (line) => lines.push(line) } });
  const { cookie } = await signUp(app);
  const warnings = () =>
    lines
      .map((line) => JSON.parse(line) as { level: number; vehicleId?: string; attachmentId?: string })
      .filter((entry) => entry.level === 40);
  return { app, db, dataDir, cookie, warnings };
}

const A4: [number, number] = [Math.round(PageSizes.A4[0]), Math.round(PageSizes.A4[1])];
const A4_LANDSCAPE: [number, number] = [A4[1], A4[0]];
const UNREADABLE = 'No se pudo anexar este archivo.';
const SIZE_LIMIT = 'No se anexó: se superó el tamaño máximo del informe.';

describe('sale report invoices', () => {
  it('fits annex images without distortion', () => {
    const box = { width: 500, height: 800 };
    // Taller than the box: scaled to its height, centred horizontally.
    expect(fitImage({ width: 1000, height: 2000 }, box)).toEqual({ x: 50, y: 0, width: 400, height: 800 });
    // Wider than the box: scaled to its width, centred vertically.
    expect(fitImage({ width: 2000, height: 1000 }, box)).toEqual({ x: 0, y: 275, width: 500, height: 250 });
    // Smaller than the box: never enlarged, just centred.
    expect(fitImage({ width: 100, height: 50 }, box)).toEqual({ x: 200, y: 375, width: 100, height: 50 });
  });

  it('appends invoices in table order', async () => {
    const { app, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie);
    const api = vehicleApi(app, cookie, vehicle.id);
    // Created first but newer: it goes second in the table.
    const newer = await api.addMaintenance({ date: '2026-03-01', title: 'Frenos' });
    const older = await api.addMaintenance({ date: '2025-06-15', title: 'Cambio de aceite' });
    await api.attach(
      newer,
      await makePdf([
        [300, 400],
        [300, 400],
      ]),
      'frenos.pdf',
    );
    await api.attach(older, await makePdf([[500, 500]]), 'aceite.pdf');
    await api.attach(older, await image('png', 800, 400), 'ticket.png');
    await api.attach(older, await image('webp', 300, 600), 'recibo.webp');

    const base = await pageSizes(await api.report('?includeInvoices=false'));
    const sizes = await pageSizes(await api.report('?includeInvoices=true'));

    expect(sizes).toHaveLength(base.length + 3 + 2);
    expect(sizes.slice(0, base.length)).toEqual(base);
    expect(sizes.slice(base.length)).toEqual([[500, 500], A4_LANDSCAPE, A4, [300, 400], [300, 400]]);
  });

  it('does not change the report without includeInvoices', async () => {
    const { app, cookie } = await setup();
    const reference = await seed(app, cookie);
    const vehicle = await seed(app, cookie);
    const api = vehicleApi(app, cookie, vehicle.id);
    const record = await api.addMaintenance({ date: '2025-07-01', title: 'Neumáticos' });
    await api.attach(record, await makePdf([[300, 400]]), 'neumaticos.pdf');
    const referencePages = await pageCount(await vehicleApi(app, cookie, reference.id).report());

    for (const query of ['', '?includeInvoices=false', '?includeInvoices=0']) {
      const pdf = await api.report(query);
      expect(await pageCount(pdf), query).toBe(referencePages);
      const text = await pdfText(pdf);
      expect(text).toContain('Neumáticos');
      for (const absent of ['Facturas anexadas', 'Anexos', 'neumaticos.pdf'])
        expect(text).not.toContain(absent);
    }
  });

  it('never annexes excluded maintenance', async () => {
    const { app, db, dataDir, cookie, warnings } = await setupWithLogs();
    const vehicle = await seed(app, cookie);
    const api = vehicleApi(app, cookie, vehicle.id);
    const excluded = await api.addMaintenance({
      date: '2025-08-01',
      title: 'Privado',
      includeInReport: false,
    });
    const privateInvoice = await api.attach(excluded, await makePdf([[300, 400]]), 'factura-privada.pdf');
    // Deleted from disk: reading it would log a warning.
    const row = db.select().from(attachments).where(eq(attachments.id, privateInvoice)).get();
    rmSync(join(dataDir, 'uploads', row?.storageKey ?? 'missing'));

    const without = await api.report();
    const withInvoices = await api.report('?includeInvoices=true');
    expect(await pageCount(withInvoices)).toBe(await pageCount(without));
    const text = await pdfText(withInvoices);
    expect(text).not.toContain('factura-privada.pdf');
    expect(text).not.toContain('Facturas anexadas');
    expect(warnings().filter((entry) => entry.vehicleId === vehicle.id)).toEqual([]);
  });

  it('references each annex', async () => {
    const { app, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie);
    const api = vehicleApi(app, cookie, vehicle.id);
    const record = await api.addMaintenance({ date: '2025-06-15', title: 'Cambio de aceite' });
    await api.attach(record, await makePdf([[300, 400]]), 'factura-taller.pdf');

    const text = await pdfText(await api.report('?includeInvoices=1'));
    for (const expected of ['Anexos', 'Facturas anexadas', 'A1', 'Cambio de aceite', 'factura-taller.pdf']) {
      expect(text).toContain(expected);
    }
    expect(text).toContain('A1 · 15 jun 2025 · Cambio de aceite · factura-taller.pdf');
  });

  it('rejects invalid includeInvoices', async () => {
    const { app, cookie } = await setup();
    const vehicle = await createVehicle(app, cookie);

    for (const query of ['?includeInvoices=yes', '?includeInvoices=', '?includeInvoices=2']) {
      const response = await app.inject({
        method: 'GET',
        url: reportUrl(vehicle.id, query),
        headers: { cookie },
      });
      expect(response.statusCode, query).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
    }
  });

  it('skips unreadable invoices', async () => {
    const { app, db, dataDir, cookie, warnings } = await setupWithLogs();
    const vehicle = await createVehicle(app, cookie);
    const api = vehicleApi(app, cookie, vehicle.id);
    const record = await api.addMaintenance({ date: '2025-06-15', title: 'Cambio de aceite' });
    const encrypted = await api.attach(record, await encryptedPdf(), 'cifrada.pdf');
    const corrupt = await api.attach(record, corruptPdf(), 'corrupta.pdf');
    await api.attach(record, await makePdf([[300, 400]]), 'buena.pdf');
    const missing = await api.attach(record, await makePdf([[500, 500]]), 'borrada.pdf');
    const row = db.select().from(attachments).where(eq(attachments.id, missing)).get();
    rmSync(join(dataDir, 'uploads', row?.storageKey ?? 'missing'));

    const base = await pageSizes(await api.report());
    const pdf = await api.report('?includeInvoices=true');
    const sizes = await pageSizes(pdf);
    expect(sizes).toHaveLength(base.length + 1);
    expect(sizes.at(-1)).toEqual([300, 400]);

    const text = await pdfText(pdf);
    expect(occurrences(text, UNREADABLE)).toBe(3);
    for (const name of ['cifrada.pdf', 'corrupta.pdf', 'buena.pdf', 'borrada.pdf'])
      expect(text).toContain(name);

    const warned = warnings().filter((entry) => entry.vehicleId === vehicle.id);
    expect(warned.map((entry) => entry.attachmentId).sort()).toEqual([encrypted, corrupt, missing].sort());
  });

  it('skips pdfs without pages and images that do not decode', async () => {
    const { app, db, dataDir, cookie, warnings } = await setupWithLogs();
    const vehicle = await createVehicle(app, cookie);
    const api = vehicleApi(app, cookie, vehicle.id);
    const record = await api.addMaintenance({ date: '2025-06-15', title: 'Cambio de aceite' });
    const empty = await api.attach(record, await emptyPdf(), 'vacia.pdf');
    // Uploads reject images that do not decode, so a valid one is broken on disk afterwards.
    const broken = await api.attach(record, await image('png', 200, 100), 'rota.png');
    const row = db.select().from(attachments).where(eq(attachments.id, broken)).get();
    writeFileSync(join(dataDir, 'uploads', row?.storageKey ?? 'missing'), brokenPng());
    await api.attach(record, await makePdf([[300, 400]]), 'buena.pdf');

    const base = await pageSizes(await api.report());
    const pdf = await api.report('?includeInvoices=true');
    const sizes = await pageSizes(pdf);
    expect(sizes).toHaveLength(base.length + 1);
    expect(sizes.at(-1)).toEqual([300, 400]);

    const text = await pdfText(pdf);
    expect(occurrences(text, UNREADABLE)).toBe(2);
    for (const name of ['vacia.pdf', 'rota.png', 'buena.pdf']) expect(text).toContain(name);

    const warned = warnings().filter((entry) => entry.vehicleId === vehicle.id);
    expect(warned.map((entry) => entry.attachmentId).sort()).toEqual([empty, broken].sort());
  });

  it('reads REPORT_MAX_ANNEX_MB', () => {
    expect(loadConfig({}).REPORT_MAX_ANNEX_MB).toBe(100);
    expect(loadConfig({ REPORT_MAX_ANNEX_MB: '5' }).REPORT_MAX_ANNEX_MB).toBe(5);
    for (const value of ['0', '-1', '1.5']) {
      expect(() => loadConfig({ REPORT_MAX_ANNEX_MB: value }), value).toThrow(/REPORT_MAX_ANNEX_MB/);
    }
  });

  it('skips annexes over the size limit and keeps going', async () => {
    const { app, cookie, warnings } = await setupWithLogs({ REPORT_MAX_ANNEX_MB: '1' });
    const vehicle = await createVehicle(app, cookie);
    const api = vehicleApi(app, cookie, vehicle.id);
    const record = await api.addMaintenance({ date: '2025-06-15', title: 'Cambio de aceite' });
    await api.attach(record, await makePdf([[300, 400]]), 'primera.pdf');
    // Unreadable if it were read: its size-limit notice proves the size is checked before loading it.
    const big = await api.attach(record, corruptPdf(1.1 * 1024 * 1024), 'enorme.pdf');
    await api.attach(record, await makePdf([[500, 500]]), 'tercera.pdf');

    const base = await pageSizes(await api.report());
    const sizes = await pageSizes(await api.report('?includeInvoices=true'));
    expect(sizes).toHaveLength(base.length + 2);
    expect(sizes.slice(base.length)).toEqual([
      [300, 400],
      [500, 500],
    ]);

    const text = await pdfText(await api.report('?includeInvoices=true'));
    expect(occurrences(text, SIZE_LIMIT)).toBe(1);
    expect(text).not.toContain(UNREADABLE);
    expect(text).toContain('A2 · 15 jun 2025 · Cambio de aceite · enorme.pdf');

    const warned = warnings().filter((entry) => entry.vehicleId === vehicle.id);
    expect(warned.map((entry) => entry.attachmentId)).toContain(big);
  });

  it('counts the size limit over all the annexes of the report', async () => {
    const { app, cookie, warnings } = await setupWithLogs({ REPORT_MAX_ANNEX_MB: '1' });
    const vehicle = await createVehicle(app, cookie);
    const api = vehicleApi(app, cookie, vehicle.id);
    const record = await api.addMaintenance({ date: '2025-06-15', title: 'Cambio de aceite' });
    // Each one fits in 1 MB on its own; the third one no longer fits after the first two.
    const chunk = 0.4 * 1024 * 1024;
    await api.attach(record, await paddedPdf([300, 400], chunk), 'primera.pdf');
    await api.attach(record, await paddedPdf([400, 300], chunk), 'segunda.pdf');
    const third = await api.attach(record, await paddedPdf([500, 500], chunk), 'tercera.pdf');
    // Still fits in what is left of the budget.
    await api.attach(record, await makePdf([[200, 200]]), 'pequena.pdf');

    const base = await pageSizes(await api.report());
    const pdf = await api.report('?includeInvoices=true');
    const sizes = await pageSizes(pdf);
    expect(sizes.slice(0, base.length)).toEqual(base);
    expect(sizes.slice(base.length)).toEqual([
      [300, 400],
      [400, 300],
      [200, 200],
    ]);

    const text = await pdfText(pdf);
    expect(occurrences(text, SIZE_LIMIT)).toBe(1);
    expect(text).not.toContain(UNREADABLE);

    const warned = warnings().filter((entry) => entry.vehicleId === vehicle.id);
    expect(warned.map((entry) => entry.attachmentId)).toEqual([third]);
  });

  it('does not count unreadable annexes against the size limit', async () => {
    const { app, cookie, warnings } = await setupWithLogs({ REPORT_MAX_ANNEX_MB: '1' });
    const vehicle = await createVehicle(app, cookie);
    const api = vehicleApi(app, cookie, vehicle.id);
    const record = await api.addMaintenance({ date: '2025-06-15', title: 'Cambio de aceite' });
    // Fits in 1 MB but cannot be read; the two valid ones after it only fit if it used up nothing.
    const corrupt = await api.attach(record, corruptPdf(0.6 * 1024 * 1024), 'corrupta.pdf');
    const chunk = 0.4 * 1024 * 1024;
    await api.attach(record, await paddedPdf([300, 400], chunk), 'primera.pdf');
    await api.attach(record, await paddedPdf([400, 300], chunk), 'segunda.pdf');

    const base = await pageSizes(await api.report());
    const pdf = await api.report('?includeInvoices=true');
    expect((await pageSizes(pdf)).slice(base.length)).toEqual([
      [300, 400],
      [400, 300],
    ]);

    const text = await pdfText(pdf);
    expect(occurrences(text, UNREADABLE)).toBe(1);
    expect(text).not.toContain(SIZE_LIMIT);

    const warned = warnings().filter((entry) => entry.vehicleId === vehicle.id);
    expect(warned.map((entry) => entry.attachmentId)).toEqual([corrupt]);
  });
});

describe('cross-mode sale report', () => {
  it('matches the cross-mode sale report', async () => {
    // Only `Date` is faked: Fastify and Better Auth keep their real timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(CROSS_NOW);
    try {
      // The local annex budget (`LOCAL_MAX_ANNEX_MB`); the API's default stays at 100.
      const { app, db, cookie } = await setupWithLogs({ REPORT_MAX_ANNEX_MB: '25' });
      const settings = await app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { cookie },
        payload: CROSS_SETTINGS,
      });
      expect(settings.statusCode).toBe(200);
      const vehicle = await createVehicle(app, cookie, CROSS_VEHICLE);
      const api = vehicleApi(app, cookie, vehicle.id);
      for (const reading of CROSS_READINGS) {
        const response = await app.inject({
          method: 'POST',
          url: `/api/vehicles/${vehicle.id}/odometer`,
          headers: { cookie },
          payload: reading,
        });
        expect(response.statusCode).toBe(201);
      }
      const records = new Map<string, string>();
      for (const { key, ...record } of CROSS_MAINTENANCE) records.set(key, await api.addMaintenance(record));
      for (const file of await crossScenarioFiles()) {
        const id = await api.attach(records.get(file.record) ?? '', Buffer.from(file.data), file.name);
        if (file.storedSize !== undefined) {
          db.update(attachments).set({ size: file.storedSize }).where(eq(attachments.id, id)).run();
        }
      }

      const query = new URLSearchParams(
        Object.entries(CROSS_OPTIONS).map(([key, value]) => [key, String(value)]),
      ).toString();
      const text = await pdfText(await api.report(`?${query}`));

      await expect(text).toMatchFileSnapshot(
        '../../../packages/shared/src/sale-report-pdf/__snapshots__/cross-report.txt',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
