import {
  attachmentExportPath,
  buildDataExport,
  type DataExport,
  dataExportSchema,
  type Problem,
  photoExportPath,
  todayIn,
} from '@ikrive/shared';
import { createDataExportZip } from '@ikrive/shared/data-export-zip';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { expectSameBytes } from '@/test/bytes';
import { fakeImages } from '@/test/fake-images';
import { createMeasuringExportSink, type MeasuringExportSink } from '@/test/measuring-export-sink';
import { createMemoryFileStore, type MemoryFileStore } from '@/test/memory-file-store';
import { createMemorySqlite } from '@/test/memory-sqlite';
import type { DataSource, DownloadedFile } from '../types';
import { EXPORT_READ_BYTES, LOCAL_APP_VERSION, loadLocalExportRows } from './data-export';
import { createLocalDataSource, type LocalDb, openLocalDatabase } from './index';

let db: LocalDb;
let local: DataSource;
let store: MemoryFileStore;

beforeEach(async () => {
  db = await openLocalDatabase(createMemorySqlite());
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

/** The export of `local`, which must be a `Blob` (no device target): what #66 returned. */
async function exportBlob(): Promise<DownloadedFile> {
  const exported = await local.dataPortability.export();
  if (!('blob' in exported)) throw new Error(`Expected a Blob, got the device file ${exported.uri}`);
  return exported;
}

/** Entries of the exported zip and its parsed `data.json`. */
async function unzip(zip: Blob | Uint8Array) {
  const bytes = zip instanceof Blob ? new Uint8Array(await zip.arrayBuffer()) : zip;
  const entries = unzipSync(bytes);
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

    const { blob } = await exportBlob();

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

    const { fileName } = await exportBlob();

    expect(todayIn('Pacific/Kiritimati')).toBe('2026-03-02');
    expect(fileName).toBe('ikrive-export-2026-03-02.zip');
  });

  it('copies every stored file with its bytes', async () => {
    const { vehicle, pdf, jpeg } = await seed();
    const photoKey = store.keys().find((key) => key.startsWith('vehicles/')) ?? '';
    const [pdfKey, jpegKey] = ['.pdf', '.jpg'].map(
      (ext) => store.keys().find((key) => key.endsWith(ext)) ?? '',
    );

    const { entries } = await unzip((await exportBlob()).blob);

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

    const { entries, document } = await unzip((await exportBlob()).blob);

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

const MIB = 1024 * 1024;

/** A PDF of `size` bytes whose content tells it apart from the others. */
const bigPdf = (size: number, fill: number) => {
  const data = new Uint8Array(size).fill(fill);
  data.set(encode('%PDF-1.7\n'));
  return data;
};

describe('local data export to a device target', () => {
  let sink: MeasuringExportSink;
  let device: DataSource;

  beforeEach(() => {
    sink = createMeasuringExportSink();
    device = createLocalDataSource(db, { files: store, images: fakeImages(), exportSink: sink.open });
  });

  /** A vehicle (returned) with one maintenance record carrying `count` PDFs of `size` bytes. */
  async function seedPdfs(count: number, size: number) {
    const vehicle = await local.vehicles.create({ make: 'Seat', model: 'Ibiza' });
    const record = await local.maintenance.create(vehicle.id, {
      date: '2024-03-01',
      category: 'oil_change',
      title: 'Cambio de aceite',
    });
    for (let i = 0; i < count; i++) {
      await local.attachments.upload(vehicle.id, record.id, file(bigPdf(size, i + 1), `f${i}.pdf`));
    }
    return vehicle;
  }

  it('writes each file to the sink before reading the next one', async () => {
    await seedPdfs(8, MIB);
    const reads: { size: number; received: number }[] = [];
    store.onRead = (key) => {
      reads.push({ size: store.bytes(key)?.length ?? 0, received: sink.received });
    };

    await device.dataPortability.export();

    expect(reads).toHaveLength(8);
    let before = 0;
    for (const read of reads) {
      expect(read.received).toBeGreaterThanOrEqual(before);
      before += read.size;
    }
    expect(sink.received).toBeGreaterThan(8 * MIB);
  });

  it('reads each file in chunks and never whole', async () => {
    const vehicle = await seedPdfs(2, MIB + 3);
    await local.vehicles.setPhoto(vehicle.id, file(PNG, 'photo.png'));
    const read = vi.spyOn(store, 'read');
    const readChunks = store.readChunks.bind(store);
    const asked: number[] = [];
    const sizes: number[] = [];
    store.readChunks = async function* (key, chunkBytes) {
      asked.push(chunkBytes);
      for await (const chunk of readChunks(key, chunkBytes)) {
        sizes.push(chunk.length);
        yield chunk;
      }
    };

    await device.dataPortability.export();

    expect(read).not.toHaveBeenCalled();
    // Two PDFs and the photo.
    expect(asked).toEqual([EXPORT_READ_BYTES, EXPORT_READ_BYTES, EXPORT_READ_BYTES]);
    // Each PDF in 5 pieces (4 of 256 KiB and 3 bytes), the photo in one.
    expect(sizes).toHaveLength(11);
    for (const size of sizes) expect(size).toBeLessThanOrEqual(EXPORT_READ_BYTES);
    expect(Math.max(...sizes)).toBe(EXPORT_READ_BYTES);
  });

  it('writes the pending pieces before reading the next chunk', async () => {
    await seedPdfs(3, MIB);
    const checks: { index: number; read: number; received: number }[] = [];
    store.onChunk = (_key, index) => {
      checks.push({ index, read: store.bytesRead, received: sink.received });
    };

    await device.dataPortability.export();

    expect(checks.filter((check) => check.index > 0)).toHaveLength(9);
    // Everything served so far (every earlier chunk) is already on disk, with its zip headers.
    for (const check of checks) expect(check.received).toBeGreaterThanOrEqual(check.read);
  });

  it('keeps at most two chunks read and not yet written', async () => {
    await seedPdfs(3, 4 * MIB);
    let held = 0;
    const measure = () => {
      held = Math.max(held, store.bytesRead - sink.received);
    };
    store.onRead = measure;
    store.onChunk = measure;
    sink.onWrite = measure;

    await device.dataPortability.export();

    expect(store.bytesRead).toBe(12 * MIB);
    expect(sink.received).toBeGreaterThan(12 * MIB);
    expect(held).toBeGreaterThan(0);
    // Whole reads would hold a file of 4 MiB.
    expect(held).toBeLessThanOrEqual(2 * EXPORT_READ_BYTES);
  });

  it('writes the same zip as one built from whole files', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-01T10:00:00Z'));
    await seed();
    await seedPdfs(2, MIB + 3);

    await device.dataPortability.export();

    // #75's zip: each file whole through `addFile`, in the same order, and the same document.
    const rows = await loadLocalExportRows(db);
    const zip = createDataExportZip();
    const attachmentIds = new Set<string>();
    for (const row of rows.attachments) {
      zip.addFile(
        attachmentExportPath(row.id, row.mimeType),
        store.bytes(row.storageKey) ?? new Uint8Array(),
      );
      attachmentIds.add(row.id);
    }
    const photoVehicleIds = new Set<string>();
    for (const row of rows.vehicles) {
      if (row.photo === null) continue;
      zip.addFile(photoExportPath(row.id), store.bytes(row.photo) ?? new Uint8Array());
      photoVehicleIds.add(row.id);
    }
    const { document } = buildDataExport({
      rows,
      settings: await local.settings.get(),
      appVersion: LOCAL_APP_VERSION,
      exportedAt: new Date(),
      present: { attachmentIds, photoVehicleIds },
    });
    const whole = new Uint8Array(await new Blob(zip.finish(document)).arrayBuffer());

    expect(attachmentIds.size).toBe(4);
    expect(photoVehicleIds.size).toBe(1);
    expectSameBytes(sink.written(), whole);
  });

  it('rejects with a 500 and aborts the sink when a file fails mid-read', async () => {
    await seedPdfs(1, MIB);
    store.onChunk = (_key, index) => {
      if (index === 1) throw new Error('I/O error');
    };

    expect(await problemOf(device.dataPortability.export())).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Could not read a file of the export',
    });
    expect(sink.aborted).toBe(true);
    expect(sink.events).not.toContain('close');
  });

  it('writes the same zip as the in-memory export', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-01T10:00:00Z'));
    await seed();

    const { blob, fileName } = await exportBlob();
    const exported = await device.dataPortability.export();

    expect(exported).toEqual({
      fileName,
      uri: `file:///cache/exports/${fileName}`,
      path: `exports/${fileName}`,
    });
    expect(sink.written()).toEqual(new Uint8Array(await blob.arrayBuffer()));
    const { document } = await unzip(sink.written());
    expect(dataExportSchema.safeParse(document).error).toBeUndefined();
    expect(sink.events.at(-1)).toBe('close');
    expect(sink.aborted).toBe(false);
  });

  it('aborts the sink when a file cannot be read', async () => {
    await seed();
    store.failOn.add('read');

    expect(await problemOf(device.dataPortability.export())).toMatchObject({
      status: 500,
      detail: 'Could not read a file of the export',
    });
    expect(sink.aborted).toBe(true);
    expect(sink.events).not.toContain('close');
  });

  it('rejects with a 500 and aborts the sink when writing fails', async () => {
    await seed();
    sink.failWrites = true;

    expect(await problemOf(device.dataPortability.export())).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Could not write the export',
    });
    expect(sink.aborted).toBe(true);
    expect(sink.written()).toHaveLength(0);
  });
});
