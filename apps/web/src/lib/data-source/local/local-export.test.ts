import { type DataExport, dataExportSchema, type Problem, todayIn } from '@ikrive/shared';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { fakeImages } from '@/test/fake-images';
import { createMemoryFileStore, type MemoryFileStore } from '@/test/memory-file-store';
import { createMemorySqlite } from '@/test/memory-sqlite';
import type { DataSource } from '../types';
import { LOCAL_APP_VERSION } from './data-export';
import { createLocalDataSource, openLocalDatabase } from './index';

let local: DataSource;
let store: MemoryFileStore;

beforeEach(async () => {
  const db = await openLocalDatabase(createMemorySqlite());
  store = createMemoryFileStore();
  local = createLocalDataSource(db, { files: store, images: fakeImages() });
});

afterEach(() => {
  vi.useRealTimers();
});

const encode = (text: string) => new TextEncoder().encode(text);
const PDF = encode('%PDF-1.7\nfactura');
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...encode('png')]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...encode('jpeg')]);

const file = (data: Uint8Array, name: string) => new File([data.slice()], name);

/** Entries of the exported zip and its parsed `data.json`. */
async function unzip(blob: Blob) {
  const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const document = JSON.parse(strFromU8(entries['data.json'] ?? new Uint8Array())) as DataExport;
  return { entries, document };
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

/**
 * A vehicle with a photo, a reading, a schedule, a maintenance record (with km) with a PDF and a JPEG
 * attachment, and a fuel log; and a second vehicle without anything.
 */
async function seed() {
  const vehicle = await local.vehicles.create({ make: 'Seat', model: 'Ibiza', plate: '1234ABC' });
  await local.vehicles.setPhoto(vehicle.id, file(PNG, 'photo.png'));
  await local.odometer.add(vehicle.id, { date: '2024-01-01', value: 1000 });
  const schedule = await local.schedules.create(vehicle.id, {
    title: 'Aceite',
    category: 'oil_change',
    intervalMonths: 12,
  });
  const record = await local.maintenance.create(vehicle.id, {
    date: '2024-03-01',
    odometer: 1200,
    category: 'oil_change',
    title: 'Cambio de aceite',
    cost: 89.9,
    scheduleId: schedule.id,
  });
  const pdf = await local.attachments.upload(vehicle.id, record.id, file(PDF, 'factura.pdf'));
  const jpeg = await local.attachments.upload(vehicle.id, record.id, file(JPEG, 'ticket.jpg'));
  await local.fuelLogs.create(vehicle.id, {
    date: '2024-02-01',
    odometer: 1100,
    quantity: 40,
    totalPrice: 60,
  });
  const empty = await local.vehicles.create({ make: 'Renault', model: 'Clio' });
  return { vehicle, empty, schedule, record, pdf, jpeg };
}

describe('local data export', () => {
  it('exports a zip whose data.json satisfies dataExportSchema', async () => {
    await local.settings.update({ currency: 'USD', distanceUnit: 'mi' });
    const { vehicle, empty, schedule, record, pdf, jpeg } = await seed();

    const { blob } = await local.dataPortability.export();

    expect(blob.type).toBe('application/zip');
    const { document } = await unzip(blob);
    const parsed = dataExportSchema.safeParse(document);
    expect(parsed.error).toBeUndefined();
    expect(document).toMatchObject({
      formatVersion: 1,
      appVersion: LOCAL_APP_VERSION,
      settings: await local.settings.get(),
      notificationChannels: [],
    });
    expect(document.settings).toMatchObject({ currency: 'USD', distanceUnit: 'mi' });
    expect(document.vehicles.map((v) => v.id)).toEqual([vehicle.id, empty.id]);
    const [exported, other] = document.vehicles;
    expect(exported).toMatchObject({ make: 'Seat', model: 'Ibiza', plate: '1234ABC' });
    expect(exported?.photoPath).toBe(`photos/${vehicle.id}.webp`);
    expect(exported?.odometerReadings.map((r) => [r.date, r.value, r.source])).toEqual([
      ['2024-01-01', 1000, 'manual'],
      ['2024-02-01', 1100, 'fuel'],
      ['2024-03-01', 1200, 'maintenance'],
    ]);
    expect(exported?.maintenanceSchedules.map((s) => s.id)).toEqual([schedule.id]);
    expect(exported?.maintenanceRecords).toHaveLength(1);
    expect(exported?.maintenanceRecords[0]).toMatchObject({
      id: record.id,
      scheduleId: schedule.id,
      cost: 89.9,
    });
    expect(exported?.maintenanceRecords[0]?.attachments).toEqual([
      {
        id: pdf.id,
        originalName: 'factura.pdf',
        mimeType: 'application/pdf',
        size: PDF.length,
        sha256: pdf.sha256,
        path: `attachments/${pdf.id}.pdf`,
        createdAt: pdf.createdAt,
      },
      {
        id: jpeg.id,
        originalName: 'ticket.jpg',
        mimeType: 'image/jpeg',
        size: JPEG.length,
        sha256: jpeg.sha256,
        path: `attachments/${jpeg.id}.jpg`,
        createdAt: jpeg.createdAt,
      },
    ]);
    expect(exported?.fuelLogs.map((f) => [f.date, f.odometer, f.quantity, f.totalPrice])).toEqual([
      ['2024-02-01', 1100, 40, 60],
    ]);
    expect(other).toMatchObject({
      photoPath: null,
      odometerReadings: [],
      maintenanceSchedules: [],
      maintenanceRecords: [],
      fuelLogs: [],
    });
    // No storage key or owner id leaves the device.
    const json = JSON.stringify(document);
    for (const key of store.keys()) expect(json).not.toContain(key);
    expect(json).not.toContain('ownerId');
  });

  it('names the zip after today in the settings time zone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 23:30 UTC on 1 March is already 2 March in Kiritimati (UTC+14).
    vi.setSystemTime(new Date('2026-03-01T23:30:00Z'));
    await local.settings.update({ timezone: 'Pacific/Kiritimati' });

    const { fileName } = await local.dataPortability.export();

    expect(todayIn('Pacific/Kiritimati')).toBe('2026-03-02');
    expect(fileName).toBe('ikrive-export-2026-03-02.zip');
  });

  it('copies every stored file with its bytes', async () => {
    const { vehicle, pdf, jpeg } = await seed();
    const photoKey = store.keys().find((key) => key.startsWith('vehicles/')) ?? '';
    const [pdfKey, jpegKey] = ['.pdf', '.jpg'].map(
      (ext) => store.keys().find((key) => key.endsWith(ext)) ?? '',
    );

    const { entries } = await unzip((await local.dataPortability.export()).blob);

    expect(Object.keys(entries).sort()).toEqual(
      [
        `attachments/${pdf.id}.pdf`,
        `attachments/${jpeg.id}.jpg`,
        `photos/${vehicle.id}.webp`,
        'data.json',
      ].sort(),
    );
    expect(entries[`attachments/${pdf.id}.pdf`]).toEqual(store.bytes(pdfKey ?? ''));
    expect(entries[`attachments/${pdf.id}.pdf`]).toEqual(PDF);
    expect(entries[`attachments/${jpeg.id}.jpg`]).toEqual(store.bytes(jpegKey ?? ''));
    expect(entries[`photos/${vehicle.id}.webp`]).toEqual(store.bytes(photoKey));
  });

  it('skips files missing from the device', async () => {
    const { vehicle, pdf, jpeg } = await seed();
    const photoKey = store.keys().find((key) => key.startsWith('vehicles/')) ?? '';
    const pdfKey = store.keys().find((key) => key.endsWith('.pdf')) ?? '';
    await store.remove(photoKey);
    await store.remove(pdfKey);

    const { entries, document } = await unzip((await local.dataPortability.export()).blob);

    expect(dataExportSchema.safeParse(document).error).toBeUndefined();
    expect(Object.keys(entries).sort()).toEqual([`attachments/${jpeg.id}.jpg`, 'data.json']);
    expect(document.vehicles[0]?.photoPath).toBeNull();
    expect(document.vehicles[0]?.maintenanceRecords[0]?.attachments.map((a) => a.id)).toEqual([jpeg.id]);
    expect(JSON.stringify(document)).not.toContain(pdf.id);
    expect(document.vehicles[0]?.id).toBe(vehicle.id);
  });

  it('rejects with a 500 when a file cannot be read', async () => {
    await seed();
    store.failOn.add('read');

    expect(await problemOf(local.dataPortability.export())).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Could not read a file of the export',
    });
  });
});
