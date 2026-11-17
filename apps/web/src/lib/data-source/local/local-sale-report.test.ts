import { attachments } from '@ikrive/db/schema';
import type { Problem, SaleReportOptions } from '@ikrive/shared';
import {
  CROSS_MAINTENANCE,
  CROSS_NOW,
  CROSS_OPTIONS,
  CROSS_READINGS,
  CROSS_SETTINGS,
  CROSS_VEHICLE,
  crossScenarioFiles,
  textPdf,
} from '@ikrive/shared/sale-report-pdf/cross-scenario';
import { eq } from 'drizzle-orm';
import { extractText, getDocumentProxy } from 'unpdf';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { type FakeImages, fakeImages } from '@/test/fake-images';
import { createMemoryFileStore, type MemoryFileStore } from '@/test/memory-file-store';
import { createMemorySqlite } from '@/test/memory-sqlite';
import { loadNodeSaleReportPdf } from '@/test/node-sale-report-pdf';
import type { DataSource } from '../types';
import type { LocalDb } from './database';
import type { LocalDeps } from './files';
import { createLocalDataSource, openLocalDatabase } from './index';
import { LOCAL_MAX_ANNEX_MB } from './sale-report';

let db: LocalDb;
let local: DataSource;
let store: MemoryFileStore;
let images: FakeImages;
/** Keys read from the store, in order. */
let reads: string[];

/** A local `DataSource` over a fresh database, with `deps` replacing the defaults of the tests. */
function createLocal(deps: Partial<LocalDeps> = {}) {
  local = createLocalDataSource(db, {
    files: store,
    images,
    saleReportPdf: loadNodeSaleReportPdf,
    ...deps,
  });
}

beforeEach(async () => {
  db = await openLocalDatabase(createMemorySqlite());
  store = createMemoryFileStore();
  reads = [];
  const read = store.read.bind(store);
  store.read = (key, mimeType) => {
    reads.push(key);
    return read(key, mimeType);
  };
  images = fakeImages();
  createLocal();
});

afterEach(() => {
  vi.useRealTimers();
});

const OPTIONS: SaleReportOptions = {
  hidePrices: false,
  hidePlate: false,
  hideVin: false,
  includeInvoices: false,
};
const WITH_INVOICES: SaleReportOptions = { ...OPTIONS, includeInvoices: true };
const UNREADABLE = 'No se pudo anexar este archivo.';
const SIZE_LIMIT = 'No se anexó: se superó el tamaño máximo del informe.';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x70, 0x6e, 0x67]);

const file = (data: Uint8Array, name: string) => new File([data.slice()], name);

/** Page sizes in points, rounded. */
const A4: [number, number] = [595, 842];
const A5: [number, number] = [420, 595];

/** A PDF of one A5 page with `text`, told apart from the report's A4 pages. */
const invoicePdf = (text: string) => textPdf(text, [419.53, 595.28]);

/** Passes the upload type detection (it only checks the signature) but is not a PDF. */
const corruptPdf = () => Uint8Array.from([...new TextEncoder().encode('%PDF-1.7\n'), ...new Uint8Array(64)]);

/** The bytes of a downloaded file. */
const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

/** Text of every page of a PDF, with `Intl`'s (narrow) no-break spaces turned into plain ones. */
async function pdfText(pdf: Uint8Array): Promise<string> {
  const { text } = await extractText(pdf.slice(), { mergePages: true });
  return text.replace(/[\u00a0\u202f]/g, ' ');
}

/** Size of every page, rounded to points. */
async function pageSizes(pdf: Uint8Array): Promise<[number, number][]> {
  const doc = await getDocumentProxy(pdf.slice());
  const sizes: [number, number][] = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const { width, height } = (await doc.getPage(number)).getViewport({ scale: 1 });
    sizes.push([Math.round(width), Math.round(height)]);
  }
  return sizes;
}

/** The problem an operation rejected with (fails the test if it resolved or threw something else). */
async function problemOf(operation: Promise<unknown>): Promise<Problem> {
  const error = await operation.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ApiError);
  return (error as ApiError).problem;
}

/** A vehicle with two readings, an included and an excluded maintenance record. */
async function seed() {
  const vehicle = await local.vehicles.create({
    make: 'Seat',
    model: 'Ibiza',
    plate: '1234BCD',
    vin: 'VSSZZZ6JZKR000001',
  });
  await local.odometer.add(vehicle.id, { date: '2024-01-10', value: 30_000 });
  await local.odometer.add(vehicle.id, { date: '2025-06-01', value: 52_000 });
  const included = await local.maintenance.create(vehicle.id, {
    date: '2024-03-01',
    odometer: 31_000,
    category: 'oil_change',
    title: 'Cambio de aceite',
    cost: 89.9,
  });
  const excluded = await local.maintenance.create(vehicle.id, {
    date: '2025-04-01',
    category: 'repair',
    title: 'Reparación privada',
    cost: 80,
    includeInReport: false,
  });
  return { vehicle, included, excluded };
}

async function download(vehicleId: string, options = OPTIONS) {
  const { blob, fileName } = await local.saleReport.download(vehicleId, options);
  return { blob, fileName, pdf: await bytesOf(blob) };
}

/** Uploads `data` to a record and returns the stored row. */
async function attach(vehicleId: string, recordId: string, data: Uint8Array, name: string) {
  const { id } = await local.attachments.upload(vehicleId, recordId, file(data, name));
  const row = await db.select().from(attachments).where(eq(attachments.id, id)).get();
  if (!row) throw new Error('The attachment was not stored');
  return row;
}

describe('local sale report', () => {
  it('downloads the sale report as a pdf named after today in the settings time zone', async () => {
    const { vehicle } = await seed();
    await local.settings.update({ timezone: 'Europe/Madrid' });
    // Still the 16th in UTC, already the 17th in Madrid.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-16T23:30:00.000Z'));

    const { blob, fileName, pdf } = await download(vehicle.id);

    expect(fileName).toBe('ikrive-seat-ibiza-2026-11-17.pdf');
    expect(blob.type).toBe('application/pdf');
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
    expect(await pdfText(pdf)).toContain('Emitido el 17 nov 2026');
  });

  it('renders the local data with the report options', async () => {
    const { vehicle } = await seed();
    await local.settings.update({ locale: 'en', currency: 'USD', distanceUnit: 'mi' });

    const full = await pdfText((await download(vehicle.id)).pdf);
    expect(full).toContain('Sale report');
    expect(full).toContain('Seat Ibiza');
    expect(full).toContain('1234BCD');
    expect(full).toContain('VSSZZZ6JZKR000001');
    expect(full).toContain('Cambio de aceite');
    expect(full).toContain('$89.90');
    expect(full).toContain('52,000 mi');
    expect(full).not.toContain('Reparación privada');

    const hidden = await pdfText(
      (await download(vehicle.id, { ...OPTIONS, hidePlate: true, hideVin: true, hidePrices: true })).pdf,
    );
    expect(hidden).toContain('Cambio de aceite');
    for (const absent of ['1234BCD', 'VSSZZZ6JZKR000001', '$89.90']) expect(hidden).not.toContain(absent);
  });

  it('embeds the brand fonts', async () => {
    const { vehicle } = await seed();

    const { pdf } = await download(vehicle.id);

    // The font dictionaries are not compressed: their subset names are readable.
    const raw = new TextDecoder('latin1').decode(pdf);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Outfit-/);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+PlusJakartaSans-/);
    expect(raw).not.toContain('/Helvetica');
  });

  it('appends the invoices of included records only', async () => {
    const { vehicle, included, excluded } = await seed();
    const invoice = await attach(
      vehicle.id,
      included.id,
      await invoicePdf('Factura del taller'),
      'taller.pdf',
    );
    const hidden = await attach(vehicle.id, excluded.id, await invoicePdf('Factura privada'), 'privada.pdf');

    const without = await download(vehicle.id);
    reads = [];
    const { pdf } = await download(vehicle.id, WITH_INVOICES);

    expect(reads).toEqual([invoice.storageKey]);
    expect(reads).not.toContain(hidden.storageKey);
    expect(await pageSizes(without.pdf)).toEqual([A4]);
    expect(await pageSizes(pdf)).toEqual([A4, A5]);
    const text = await pdfText(pdf);
    expect(text).toContain('A1 · 1 mar 2024 · Cambio de aceite · taller.pdf');
    expect(text).toContain('Factura del taller');
    for (const absent of ['privada.pdf', 'Factura privada']) expect(text).not.toContain(absent);
  });

  it('appends image invoices on their own page', async () => {
    const { vehicle, included } = await seed();
    await attach(vehicle.id, included.id, PNG, 'ticket.png');

    const { pdf } = await download(vehicle.id, WITH_INVOICES);

    // The fake normalizer returns a 1×1 PNG: portrait A4.
    expect(await pageSizes(pdf)).toEqual([A4, A4]);
    expect(await pdfText(pdf)).toContain('A1 · 1 mar 2024 · Cambio de aceite · ticket.png');
  });

  it('skips unreadable invoices as the API does', async () => {
    const { vehicle, included } = await seed();
    const missing = await attach(vehicle.id, included.id, await invoicePdf('Borrada'), 'borrada.pdf');
    await store.remove(missing.storageKey);
    await attach(vehicle.id, included.id, corruptPdf(), 'rota.pdf');
    await attach(vehicle.id, included.id, PNG, 'foto.png');
    await attach(vehicle.id, included.id, await invoicePdf('Factura buena'), 'buena.pdf');
    // The image decoded when it was uploaded, but not when the report is generated.
    createLocal({ images: { ...images, toAnnexImage: async () => Promise.reject(new Error('No decode')) } });

    const { pdf } = await download(vehicle.id, WITH_INVOICES);

    const text = await pdfText(pdf);
    expect(text.split(UNREADABLE)).toHaveLength(4);
    expect(text).toContain('A4 · 1 mar 2024 · Cambio de aceite · buena.pdf');
    expect(text).toContain('Factura buena');
    // The notices push the report to a second page; then only the readable invoice follows.
    expect(text).toContain('2 / 2');
    expect(await pageSizes(pdf)).toEqual([A4, A4, A5]);
  });

  it('skips invoices over the 25 MB annex budget', async () => {
    const { vehicle, included } = await seed();
    const budget = LOCAL_MAX_ANNEX_MB * 1024 * 1024;
    expect(budget).toBe(25 * 1024 * 1024);
    const first = await attach(vehicle.id, included.id, await invoicePdf('Primera'), 'primera.pdf');
    const big = await attach(vehicle.id, included.id, await invoicePdf('Enorme'), 'enorme.pdf');
    const last = await attach(vehicle.id, included.id, await invoicePdf('Última'), 'ultima.pdf');
    // Sizes as stored: the first one leaves less than the second one needs; the last one still fits.
    await db
      .update(attachments)
      .set({ size: budget - 1000 })
      .where(eq(attachments.id, first.id));
    await db.update(attachments).set({ size: 2000 }).where(eq(attachments.id, big.id));
    await db.update(attachments).set({ size: 1000 }).where(eq(attachments.id, last.id));
    reads = [];

    const { pdf } = await download(vehicle.id, WITH_INVOICES);

    expect(reads).toEqual([first.storageKey, last.storageKey]);
    const text = await pdfText(pdf);
    expect(text).toContain(`A2 · 1 mar 2024 · Cambio de aceite · enorme.pdf\n${SIZE_LIMIT}`);
    expect(text).not.toContain('Enorme');
    expect(await pageSizes(pdf)).toEqual([A4, A5, A5]);
  });

  it('rejects with a 404 for a missing vehicle', async () => {
    expect(await problemOf(local.saleReport.download('missing', OPTIONS))).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: 'Vehicle not found',
    });
  });

  it('rejects with a 500 when the pdf module fails', async () => {
    const { vehicle } = await seed();
    const expected = {
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Could not generate the sale report',
    };

    createLocal({
      saleReportPdf: () => Promise.reject(new Error('Failed to fetch dynamically imported module')),
    });
    expect(await problemOf(local.saleReport.download(vehicle.id, OPTIONS))).toEqual(expected);

    const kit = await loadNodeSaleReportPdf();
    createLocal({
      saleReportPdf: async () => ({
        ...kit,
        generateSaleReportPdf: () => Promise.reject(new Error('Render')),
      }),
    });
    expect(await problemOf(local.saleReport.download(vehicle.id, OPTIONS))).toEqual(expected);
  });

  it('matches the cross-mode sale report', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(CROSS_NOW);
    await local.settings.update(CROSS_SETTINGS);
    const vehicle = await local.vehicles.create(CROSS_VEHICLE);
    for (const reading of CROSS_READINGS) await local.odometer.add(vehicle.id, reading);
    const records = new Map<string, string>();
    for (const { key, ...record } of CROSS_MAINTENANCE) {
      records.set(key, (await local.maintenance.create(vehicle.id, record)).id);
    }
    for (const crossFile of await crossScenarioFiles()) {
      const row = await attach(
        vehicle.id,
        records.get(crossFile.record) ?? '',
        crossFile.data,
        crossFile.name,
      );
      if (crossFile.storedSize !== undefined) {
        await db.update(attachments).set({ size: crossFile.storedSize }).where(eq(attachments.id, row.id));
      }
    }

    const { pdf } = await download(vehicle.id, CROSS_OPTIONS);

    await expect(await pdfText(pdf)).toMatchFileSnapshot(
      '../../../../../../packages/shared/src/sale-report-pdf/__snapshots__/cross-report.txt',
    );
  });
});
