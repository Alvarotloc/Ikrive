import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  attachmentExportPath,
  buildDataExport,
  type DataExport,
  type DataImportSummary,
  DUPLICATE_IMPORT_PROBLEM_TYPE,
  dataExportSchema,
  dataImportSummarySchema,
  photoExportPath,
} from '@ikrive/shared';
import { streamDataExportZip } from '@ikrive/shared/data-export-zip';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import yauzl from 'yauzl';
import { ZipFile } from 'yazl';
import type { Db } from '../src/db/client';
import {
  attachments,
  dataImports,
  expenses,
  fuelLogs,
  maintenanceRecords,
  maintenanceSchedules,
  notificationChannels,
  notifications,
  odometerReadings,
  userSettings,
  vehicleDocuments,
  vehicles,
} from '../src/db/schema';
import { createFileStorage } from '../src/lib/storage';
import { createDataExportRepository } from '../src/modules/data-export/repository';
import { createDataImportRepository, type DataImportRepository } from '../src/modules/data-import/repository';
import { createDataImportService, type ImportLimits } from '../src/modules/data-import/service';
import { createSettingsRepository } from '../src/modules/settings/repository';
import { createSettingsService } from '../src/modules/settings/service';
import { createTestApp, incompleteMultipart, signUp } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];

const EXPORT = '/api/me/export';
const IMPORT = '/api/me/import';
const MIB = 1024 * 1024;

const pdf = (text = 'factura') =>
  Buffer.from(
    `%PDF-1.7\n% ${text}\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`,
  );

const png = (background = '#c5e8e0') =>
  sharp({ create: { width: 64, height: 32, channels: 3, background } })
    .png()
    .toBuffer();

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

/** Entries of a zip, by name and in order. */
function readZip(buffer: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const entries = new Map<string, Buffer>();
      zip.on('error', reject);
      zip.on('end', () => resolve(entries));
      zip.on('entry', (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) return reject(streamError);
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => {
            entries.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

interface ZipEntry {
  name: string;
  data: Buffer;
  /** Deflate the entry (default: stored, like the export does with the files). */
  compress?: boolean;
}

/** Builds a zip with `yazl`, entries in order. */
function buildZip(entries: ZipEntry[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new ZipFile();
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on('error', reject);
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    for (const { name, data, compress = false } of entries) zip.addBuffer(data, name, { compress });
    zip.end();
  });
}

/**
 * Rewrites the name (same length), the declared uncompressed size and/or the encryption flag of an
 * entry, in both its central directory header and its local header. Lets the tests build zips
 * `yazl` refuses to write.
 */
function patchZipEntry(
  zip: Buffer,
  name: string,
  patch: { name?: string; uncompressedSize?: number; encrypted?: boolean },
): Buffer {
  const out = Buffer.from(zip);
  const eocd = out.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const entryCount = out.readUInt16LE(eocd + 10);
  let cursor = out.readUInt32LE(eocd + 16);
  const target = Buffer.from(name);
  let found = 0;
  for (let i = 0; i < entryCount; i++) {
    const nameLength = out.readUInt16LE(cursor + 28);
    const next = cursor + 46 + nameLength + out.readUInt16LE(cursor + 30) + out.readUInt16LE(cursor + 32);
    if (out.subarray(cursor + 46, cursor + 46 + nameLength).equals(target)) {
      found += 1;
      const local = out.readUInt32LE(cursor + 42);
      if (patch.uncompressedSize !== undefined) {
        out.writeUInt32LE(patch.uncompressedSize, cursor + 24);
        out.writeUInt32LE(patch.uncompressedSize, local + 22);
      }
      if (patch.encrypted) {
        // Bit 0 of the general purpose flag.
        out.writeUInt16LE(out.readUInt16LE(cursor + 8) | 1, cursor + 8);
        out.writeUInt16LE(out.readUInt16LE(local + 6) | 1, local + 6);
      }
      if (patch.name !== undefined) {
        const renamed = Buffer.from(patch.name);
        if (renamed.length !== nameLength) throw new Error('patchZipEntry: names must have the same length');
        renamed.copy(out, cursor + 46);
        renamed.copy(out, local + 30);
      }
    }
    cursor = next;
  }
  if (found !== 1) throw new Error(`patchZipEntry: ${name} found ${found} times`);
  return out;
}

function multipart(data: Buffer, filename: string, mimetype: string, field = 'file') {
  const boundary = '----ikrive-test-boundary';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

/** Uploads a zip to the import endpoint. */
function upload(
  app: TestApp,
  cookie: string,
  zip: Buffer,
  { filename = 'ikrive-export.zip', mimetype = 'application/zip', field = 'file' } = {},
) {
  const body = multipart(zip, filename, mimetype, field);
  return app.inject({
    method: 'POST',
    url: IMPORT,
    headers: { cookie, ...body.headers },
    payload: body.payload,
  });
}

/** Downloads the export of a user: the zip, its entries and the parsed document. */
async function download(app: TestApp, cookie: string) {
  const response = await app.inject({ method: 'GET', url: EXPORT, headers: { cookie } });
  expect(response.statusCode).toBe(200);
  const zip = response.rawPayload;
  const entries = await readZip(zip);
  const document = JSON.parse(entries.get('data.json')?.toString('utf8') ?? '') as DataExport;
  return { zip, entries, document };
}

/** Zips the entries of an export again, replacing `data.json` and some files. */
function rezip(
  entries: Map<string, Buffer>,
  {
    document,
    files = {},
    extra = [],
    omit = [],
    compressFiles = false,
  }: {
    document?: unknown;
    files?: Record<string, Buffer>;
    extra?: ZipEntry[];
    omit?: string[];
    compressFiles?: boolean;
  } = {},
) {
  const list: ZipEntry[] = [];
  for (const [name, data] of entries) {
    if (omit.includes(name)) continue;
    if (name === 'data.json') {
      const json = document === undefined ? data : Buffer.from(JSON.stringify(document));
      list.push({ name, data: json, compress: true });
    } else {
      list.push({ name, data: files[name] ?? data, compress: compressFiles });
    }
  }
  return buildZip([...list, ...extra]);
}

/** Authenticated JSON requests of one user that must succeed. */
function client(app: TestApp, cookie: string) {
  const send = async (method: 'POST' | 'PATCH' | 'PUT', url: string, payload: object, status: number) => {
    const response = await app.inject({ method, url, headers: { cookie }, payload });
    expect(response.statusCode, response.body).toBe(status);
    return response.json();
  };
  return {
    post: (url: string, payload: object = {}) => send('POST', url, payload, 201),
    patch: (url: string, payload: object) => send('PATCH', url, payload, 200),
    upload: async (url: string, method: 'POST' | 'PUT', data: Buffer, filename: string, mimetype: string) => {
      const body = multipart(data, filename, mimetype);
      const response = await app.inject({
        method,
        url,
        headers: { cookie, ...body.headers },
        payload: body.payload,
      });
      expect(response.statusCode, response.body).toBe(method === 'POST' ? 201 : 200);
      return response.json();
    },
  };
}

async function newUser(app: TestApp, email: string, name: string) {
  const { cookie, response } = await signUp(app, email, name);
  const userId = (response.json() as { user: { id: string } }).user.id;
  return { cookie, userId, api: client(app, cookie) };
}

/**
 * A user with a bit of everything: active, archived and sold vehicles, readings of the three
 * sources, a schedule, a maintenance record linked to it with km and two attachments (PDF and PNG),
 * a photo, a fuel log, an expense, an ntfy channel without token and a gotify channel with one.
 */
async function seedUser(app: TestApp, email = 'ada@example.com', name = 'Ada') {
  const user = await newUser(app, email, name);
  const { api } = user;
  const active = await api.post('/api/vehicles', {
    make: 'Seat',
    model: 'Ibiza',
    plate: '1234ABC',
    purchaseDate: '2018-03-01',
    purchasePrice: 12000,
  });
  await api.post(`/api/vehicles/${active.id}/odometer`, { date: '2025-01-01', value: 1000 });
  const archived = await api.post('/api/vehicles', { make: 'Renault', model: 'Clio' });
  await api.patch(`/api/vehicles/${archived.id}`, { archived: true });
  const sold = await api.post('/api/vehicles', { make: 'Ford', model: 'Focus' });
  await api.patch(`/api/vehicles/${sold.id}`, { soldAt: '2025-01-15' });

  const schedule = await api.post(`/api/vehicles/${active.id}/schedules`, {
    title: 'Aceite',
    category: 'oil_change',
    intervalMonths: 12,
    intervalDistance: 15000,
  });
  const record = await api.post(`/api/vehicles/${active.id}/maintenance`, {
    date: '2025-05-10',
    odometer: 1200,
    category: 'oil_change',
    title: 'Cambio de aceite',
    cost: 89.9,
    scheduleId: schedule.id,
  });
  const files = { pdf: pdf(`factura ${name}`), png: await png() };
  const url = `/api/vehicles/${active.id}/maintenance/${record.id}/attachments`;
  const pdfAttachment = await api.upload(url, 'POST', files.pdf, 'factura.pdf', 'application/pdf');
  const pngAttachment = await api.upload(url, 'POST', files.png, 'foto.png', 'image/png');
  await api.upload(`/api/vehicles/${active.id}/photo`, 'PUT', await png('#2d3a3a'), 'photo.png', 'image/png');
  await api.post(`/api/vehicles/${active.id}/fuel-logs`, {
    date: '2025-06-01',
    odometer: 1500,
    quantity: 40.5,
    totalPrice: 60.75,
  });
  const expense = await api.post(`/api/vehicles/${active.id}/expenses`, {
    date: '2025-04-01',
    category: 'insurance',
    title: 'Seguro anual',
    description: 'Póliza',
    cost: 420.5,
  });
  await api.post('/api/notification-channels', {
    type: 'ntfy',
    config: { serverUrl: 'https://ntfy.example.com', topic: 'ikrive' },
  });
  await api.post('/api/notification-channels', {
    type: 'gotify',
    config: { serverUrl: 'https://gotify.example.com', token: 'gotify-secret-token' },
  });
  return { ...user, active, archived, sold, schedule, record, expense, files, pdfAttachment, pngAttachment };
}

/** Rows per table touched by the import, and every file in `uploads/` and `tmp/`. */
function snapshot(db: Db, dataDir: string) {
  const rows = (table: SQLiteTable) => db.select({ n: count() }).from(table).get()?.n ?? 0;
  const files = (dir: string): string[] =>
    existsSync(dir)
      ? readdirSync(dir, { recursive: true, withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => relative(dataDir, join(entry.parentPath, entry.name)))
          .sort()
      : [];
  return {
    vehicles: rows(vehicles),
    odometerReadings: rows(odometerReadings),
    maintenanceSchedules: rows(maintenanceSchedules),
    maintenanceRecords: rows(maintenanceRecords),
    fuelLogs: rows(fuelLogs),
    expenses: rows(expenses),
    documents: rows(vehicleDocuments),
    attachments: rows(attachments),
    notificationChannels: rows(notificationChannels),
    notifications: rows(notifications),
    dataImports: rows(dataImports),
    userSettings: rows(userSettings),
    uploads: files(join(dataDir, 'uploads')),
    tmp: files(join(dataDir, 'tmp')),
  };
}

/** An app with a seeded user A, A's export and an empty user B with the same settings. */
async function setup(env: Record<string, string> = {}, options: Parameters<typeof createTestApp>[1] = {}) {
  const { app, db, dataDir } = await createTestApp(env, options);
  const a = await seedUser(app);
  const exported = await download(app, a.cookie);
  const b = await newUser(app, 'bob@example.com', 'Bob');
  return { app, db, dataDir, a, b, exported };
}

/** Expects a problem response and that nothing changed. */
function expectRejected(
  response: Awaited<ReturnType<typeof upload>>,
  status: number,
  before: ReturnType<typeof snapshot>,
  after: ReturnType<typeof snapshot>,
) {
  expect(response.statusCode, response.body).toBe(status);
  expect(response.headers['content-type']).toContain('application/problem+json');
  expect(after).toEqual(before);
}

const clone = <T>(value: T): T => structuredClone(value);

/** Every id in a document, in order of appearance. */
function idsOf(value: unknown, ids: string[] = []): string[] {
  if (Array.isArray(value)) for (const item of value) idsOf(item, ids);
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'id' && typeof child === 'string') ids.push(child);
      else idsOf(child, ids);
    }
  }
  return ids;
}

/** The document without `exportedAt` and with every id (also in references and paths) replaced by its ordinal. */
function normalize(document: DataExport) {
  const { exportedAt: _exportedAt, ...rest } = document;
  let text = JSON.stringify(rest);
  idsOf(rest).forEach((id, i) => {
    text = text.replaceAll(id, `#${i}`);
  });
  return JSON.parse(text) as Omit<DataExport, 'exportedAt'>;
}

/** Every file path the document references. */
const referencedPaths = (document: DataExport) =>
  document.vehicles.flatMap((vehicle) => [
    ...(vehicle.photoPath ? [vehicle.photoPath] : []),
    ...[...vehicle.maintenanceRecords, ...vehicle.documents].flatMap((parent) =>
      parent.attachments.map((attachment) => attachment.path),
    ),
  ]);

/** Size of the pieces `clientBuiltZip` feeds each file in. */
const CLIENT_PIECE_BYTES = 64 * 1024;

/**
 * A user's export zip built like the phone does in local mode: the shared builder and the streaming zip
 * writer, the files read one by one from `uploads/` in pieces and `data.json` last.
 */
function clientBuiltZip(db: Db, dataDir: string, userId: string) {
  const rows = createDataExportRepository(db).load(userId);
  const settings = createSettingsService(createSettingsRepository(db)).get(userId);
  const chunks: Uint8Array[] = [];
  const zip = streamDataExportZip((chunk) => chunks.push(chunk));
  // Each file in pieces through an open entry, as the phone reads it by ranges.
  const copy = (path: string, key: string) => {
    const data = readFileSync(join(dataDir, 'uploads', key));
    const entry = zip.openFile(path);
    for (let offset = 0; offset < data.length; offset += CLIENT_PIECE_BYTES) {
      entry.push(data.subarray(offset, offset + CLIENT_PIECE_BYTES));
    }
    entry.push(new Uint8Array(0), true);
  };
  const attachmentIds = new Set<string>();
  for (const row of rows.attachments) {
    copy(attachmentExportPath(row.id, row.mimeType), row.storageKey);
    attachmentIds.add(row.id);
  }
  const photoVehicleIds = new Set<string>();
  for (const row of rows.vehicles) {
    if (row.photo === null) continue;
    copy(photoExportPath(row.id), row.photo);
    photoVehicleIds.add(row.id);
  }
  const { document } = buildDataExport({
    rows,
    settings,
    appVersion: '0.0.0-local',
    exportedAt: new Date(),
    present: { attachmentIds, photoVehicleIds },
  });
  zip.finish(document);
  return { document, zip: Buffer.concat(chunks) };
}

const DEFAULT_LIMITS: ImportLimits = {
  zipBytes: 1024 * MIB,
  totalBytes: 1024 * MIB,
  fileBytes: 20 * MIB,
  dataJsonBytes: 32 * MIB,
  entries: 50_000,
};

/** The service with other limits (or repository), importing a zip written to disk. */
function importWith(
  db: Db,
  dataDir: string,
  limits: Partial<ImportLimits>,
  repo: Partial<DataImportRepository> = {},
) {
  const service = createDataImportService({
    repo: { ...createDataImportRepository(db), ...repo },
    settings: createSettingsService(createSettingsRepository(db)),
    storage: createFileStorage(join(dataDir, 'uploads')),
    tmpDir: join(dataDir, 'tmp'),
    limits: { ...DEFAULT_LIMITS, ...limits },
    log: { error: vi.fn() },
  });
  return (userId: string, zip: Buffer) => {
    const path = join(dataDir, 'upload.zip');
    writeFileSync(path, zip);
    return service.import(userId, path);
  };
}

describe('data import', () => {
  describe('POST /api/me/import', () => {
    it('imports an export', async () => {
      const { app, b, exported } = await setup();

      const response = await upload(app, b.cookie, exported.zip);

      expect(response.statusCode, response.body).toBe(201);
      const summary = response.json() as DataImportSummary;
      expect(dataImportSummarySchema.safeParse(summary).success).toBe(true);
      expect(summary).toEqual({
        vehicles: 3,
        odometerReadings: 3,
        maintenanceSchedules: 1,
        maintenanceRecords: 1,
        fuelLogs: 1,
        expenses: 1,
        documents: 0,
        attachments: 2,
        photos: 1,
        notificationChannels: 1,
        skipped: { notificationChannels: 1 },
        matchingVehicles: [],
      });
      const list = await app.inject({ method: 'GET', url: '/api/vehicles', headers: { cookie: b.cookie } });
      expect(list.json()).toHaveLength(1);
    });

    it('requires a session', async () => {
      const { app, db, dataDir, exported } = await setup();
      const before = snapshot(db, dataDir);

      const response = await upload(app, '', exported.zip);

      expectRejected(response, 401, before, snapshot(db, dataDir));
    });
  });

  describe('validation', () => {
    it('rejects a request without a zip', async () => {
      const { app, db, dataDir, b } = await setup();
      const before = snapshot(db, dataDir);

      const noFile = await app.inject({
        method: 'POST',
        url: IMPORT,
        headers: { cookie: b.cookie, 'content-type': 'multipart/form-data; boundary=x' },
        payload: '--x\r\nContent-Disposition: form-data; name="note"\r\n\r\nhola\r\n--x--\r\n',
      });
      expectRejected(noFile, 400, before, snapshot(db, dataDir));

      const notMultipart = await app.inject({
        method: 'POST',
        url: IMPORT,
        headers: { cookie: b.cookie },
        payload: { file: 'ikrive-export.zip' },
      });
      expectRejected(notMultipart, 400, before, snapshot(db, dataDir));

      const otherField = await upload(app, b.cookie, await buildZip([]), { field: 'zip' });
      expectRejected(otherField, 400, before, snapshot(db, dataDir));

      const notZip = await upload(app, b.cookie, pdf(), { filename: 'export.zip' });
      expectRejected(notZip, 400, before, snapshot(db, dataDir));
      expect(notZip.json().detail).toMatch(/not a valid zip/);
    });

    it('rejects a multipart body that never completes', async () => {
      const { app, db, dataDir, b, exported } = await setup();
      const before = snapshot(db, dataDir);
      const truncated = (data: Buffer) => {
        const { payload, headers } = multipart(data, 'ikrive-export.zip', 'application/zip');
        return app.inject({
          method: 'POST',
          url: IMPORT,
          headers: { cookie: b.cookie, ...headers },
          payload: incompleteMultipart(payload).whole,
        });
      };

      for (const data of [Buffer.from('abc'), exported.zip]) {
        const response = await truncated(data);
        expectRejected(response, 400, before, snapshot(db, dataDir));
        expect(response.json().detail).toBe('The upload ended before the zip was complete');
      }

      const { payload, headers } = multipart(exported.zip, 'ikrive-export.zip', 'application/zip');
      const { whole, chunked: stream } = incompleteMultipart(payload);
      const chunked = await app.inject({
        method: 'POST',
        url: IMPORT,
        headers: { cookie: b.cookie, ...headers, 'content-length': String(whole.length) },
        payload: stream(),
      });
      expectRejected(chunked, 400, before, snapshot(db, dataDir));
      expect(chunked.json().detail).toBe('The upload ended before the zip was complete');
      expect(readdirSync(join(dataDir, 'tmp'))).toEqual([]);
    });

    it('answers 500 when the zip cannot be written to disk', async () => {
      const { app, db, dataDir, b, exported } = await setup();
      const before = snapshot(db, dataDir);
      // A read-only temporary directory: the upload is fine, writing it is what fails.
      const tmp = join(dataDir, 'tmp');
      mkdirSync(tmp, { recursive: true });
      chmodSync(tmp, 0o500);
      try {
        const response = await upload(app, b.cookie, exported.zip);
        expectRejected(response, 500, before, snapshot(db, dataDir));
      } finally {
        chmodSync(tmp, 0o700);
      }
      expect(readdirSync(tmp)).toEqual([]);
    });

    it('rejects a zip without a valid data.json', async () => {
      const { app, db, dataDir, b, exported } = await setup();
      const before = snapshot(db, dataDir);

      const missing = await upload(app, b.cookie, await rezip(exported.entries, { omit: ['data.json'] }));
      expectRejected(missing, 400, before, snapshot(db, dataDir));
      expect(missing.json().detail).toContain('data.json');

      const nested = await buildZip([
        { name: 'export/data.json', data: exported.entries.get('data.json') ?? Buffer.alloc(0) },
      ]);
      expectRejected(await upload(app, b.cookie, nested), 400, before, snapshot(db, dataDir));

      const broken = await buildZip([{ name: 'data.json', data: Buffer.from('{"formatVersion": 1,') }]);
      const response = await upload(app, b.cookie, broken);
      expectRejected(response, 400, before, snapshot(db, dataDir));
      expect(response.json().detail).toBe('data.json is not valid JSON');
    });

    it('rejects an unsupported formatVersion', async () => {
      const { app, db, dataDir, b, exported } = await setup();
      const before = snapshot(db, dataDir);

      const future = await upload(
        app,
        b.cookie,
        await rezip(exported.entries, { document: { ...exported.document, formatVersion: 2 } }),
      );
      expectRejected(future, 400, before, snapshot(db, dataDir));
      expect(future.json().detail).toBe('Unsupported export format version 2 (supported: 1)');

      const { formatVersion: _version, ...withoutVersion } = exported.document;
      const missing = await upload(
        app,
        b.cookie,
        await rezip(exported.entries, { document: withoutVersion }),
      );
      expectRejected(missing, 400, before, snapshot(db, dataDir));
      expect(missing.json().detail).toBe('Unsupported export format version missing (supported: 1)');
    });

    it('rejects an invalid document', async () => {
      const { app, db, dataDir, b, exported } = await setup();
      const before = snapshot(db, dataDir);
      const document = clone(exported.document);
      const record = document.vehicles[0]?.maintenanceRecords[0];
      if (!record) throw new Error('seed without a maintenance record');
      record.scheduleId = 'missing-schedule';
      (document.vehicles[0] as { make: unknown }).make = 42;

      const response = await upload(app, b.cookie, await rezip(exported.entries, { document }));

      expectRejected(response, 400, before, snapshot(db, dataDir));
      const body = response.json() as { errors: { path: string; message: string }[] };
      expect(body.errors.map((error) => error.path)).toEqual(expect.arrayContaining(['vehicles.0.make']));
      // The integrity check only runs on a structurally valid document: fix it and see the reference.
      (document.vehicles[0] as { make: unknown }).make = 'Seat';
      const dangling = await upload(app, b.cookie, await rezip(exported.entries, { document }));
      expectRejected(dangling, 400, before, snapshot(db, dataDir));
      expect(dangling.json().errors).toEqual([
        { path: 'vehicles.0.maintenanceRecords.0.scheduleId', message: 'Unknown maintenance schedule' },
      ]);
    });

    it('rejects duplicate expense ids', async () => {
      const { app, db, dataDir, b, exported } = await setup();
      const before = snapshot(db, dataDir);
      const document = clone(exported.document);
      const vehicle = document.vehicles[0];
      const expense = vehicle?.expenses[0];
      if (!vehicle || !expense) throw new Error('seed without an expense');
      // The same id in another vehicle of the document.
      (document.vehicles[1] as typeof vehicle).expenses = [{ ...expense, category: 'tax' }];

      const response = await upload(app, b.cookie, await rezip(exported.entries, { document }));

      expectRejected(response, 400, before, snapshot(db, dataDir));
      expect(response.json().errors).toEqual([
        { path: 'vehicles.1.expenses.0.id', message: 'Duplicate id in expenses' },
      ]);
    });

    it('rejects duplicate document ids', async () => {
      const { app, db, dataDir, a, b } = await setup();
      const vehicleDocument = await a.api.post(`/api/vehicles/${a.active.id}/documents`, {
        type: 'insurance',
        title: 'Póliza',
      });
      const exported = await download(app, a.cookie);
      const before = snapshot(db, dataDir);
      const document = clone(exported.document);
      const vehicle = document.vehicles[0];
      const original = vehicle?.documents[0];
      if (!vehicle || !original) throw new Error('seed without a document');
      expect(original.id).toBe(vehicleDocument.id);
      // The same id in another vehicle of the document.
      (document.vehicles[1] as typeof vehicle).documents = [{ ...original, title: 'Copia' }];

      const response = await upload(app, b.cookie, await rezip(exported.entries, { document }));

      expectRejected(response, 400, before, snapshot(db, dataDir));
      expect(response.json().errors).toEqual([
        { path: 'vehicles.1.documents.0.id', message: 'Duplicate id in documents' },
      ]);
    });

    it('rejects an invalid document attachment', async () => {
      const { app, db, dataDir, a, b } = await setup();
      const vehicleDocument = await a.api.post(`/api/vehicles/${a.active.id}/documents`, {
        type: 'insurance',
        title: 'Póliza',
      });
      await a.api.upload(
        `/api/vehicles/${a.active.id}/documents/${vehicleDocument.id}/attachments`,
        'POST',
        pdf('poliza'),
        'poliza.pdf',
        'application/pdf',
      );
      const exported = await download(app, a.cookie);
      const before = snapshot(db, dataDir);
      const attachment = exported.document.vehicles[0]?.documents[0]?.attachments[0];
      const recordAttachment = exported.document.vehicles[0]?.maintenanceRecords[0]?.attachments[0];
      if (!attachment || !recordAttachment) throw new Error('seed without attachments');

      const withAttachment = (changes: Partial<typeof attachment>) => {
        const document = clone(exported.document);
        const target = document.vehicles[0]?.documents[0];
        if (target) target.attachments = [{ ...attachment, ...changes }];
        return document;
      };
      for (const [document, error] of [
        [
          withAttachment({ path: '../poliza.pdf' }),
          { path: 'vehicles.0.documents.0.attachments.0.path', message: 'Invalid attachment path' },
        ],
        // An id already used by a maintenance attachment (with its own path, so only the id clashes).
        [
          withAttachment({
            id: recordAttachment.id,
            path: recordAttachment.path,
            mimeType: recordAttachment.mimeType,
          }),
          { path: 'vehicles.0.documents.0.attachments.0.id', message: 'Duplicate id in attachments' },
        ],
      ] as const) {
        const response = await upload(app, b.cookie, await rezip(exported.entries, { document }));
        expectRejected(response, 400, before, snapshot(db, dataDir));
        expect(response.json().errors).toEqual([error]);
      }
    });

    it('rejects different currency or units', async () => {
      const { app, db, dataDir, b, exported } = await setup();
      await b.api.patch('/api/settings', { distanceUnit: 'mi' });
      const before = snapshot(db, dataDir);

      const response = await upload(app, b.cookie, exported.zip);

      expectRejected(response, 409, before, snapshot(db, dataDir));
      const { detail } = response.json() as { detail: string };
      expect(detail).toContain('distanceUnit');
      expect(detail).not.toContain('currency');
      expect(detail).not.toContain('volumeUnit');
    });
  });

  describe('creation', () => {
    it('creates new ids and remaps references', async () => {
      const { app, db, dataDir, a, b, exported } = await setup();
      const document = clone(exported.document);
      const pdfAttachment = document.vehicles[0]?.maintenanceRecords[0]?.attachments[0];
      if (!pdfAttachment) throw new Error('seed without attachments');
      pdfAttachment.originalName = 'facturas/2025\\taller/factura.pdf';

      const response = await upload(app, b.cookie, await rezip(exported.entries, { document }));
      expect(response.statusCode, response.body).toBe(201);

      const imported = await download(app, b.cookie);
      const oldIds = new Set(idsOf(exported.document));
      expect(idsOf(imported.document).filter((id) => oldIds.has(id))).toEqual([]);

      const vehicle = imported.document.vehicles[0];
      const record = vehicle?.maintenanceRecords[0];
      const fuelLog = vehicle?.fuelLogs[0];
      expect(vehicle?.maintenanceSchedules.find((s) => s.id === record?.scheduleId)?.title).toBe('Aceite');
      expect(vehicle?.odometerReadings.find((r) => r.id === record?.odometerReadingId)).toMatchObject({
        value: 1200,
        source: 'maintenance',
      });
      expect(vehicle?.odometerReadings.find((r) => r.id === fuelLog?.odometerReadingId)).toMatchObject({
        value: 1500,
        source: 'fuel',
      });
      // The rows in the database belong to B and to B's vehicle.
      const recordRow = db
        .select()
        .from(maintenanceRecords)
        .where(eq(maintenanceRecords.id, record?.id ?? ''))
        .get();
      const scheduleRow = db
        .select()
        .from(maintenanceSchedules)
        .where(eq(maintenanceSchedules.id, recordRow?.scheduleId ?? ''))
        .get();
      expect(scheduleRow?.vehicleId).toBe(vehicle?.id);
      const vehicleRow = db
        .select()
        .from(vehicles)
        .where(eq(vehicles.id, vehicle?.id ?? ''))
        .get();
      expect(vehicleRow?.ownerId).toBe(b.userId);

      // Attachments: new random keys, same bytes, sanitized name.
      const aRows = db.select().from(attachments).where(eq(attachments.ownerId, a.userId)).all();
      const bRows = db.select().from(attachments).where(eq(attachments.ownerId, b.userId)).all();
      expect(bRows).toHaveLength(2);
      for (const row of bRows) {
        expect(row.entityId).toBe(record?.id);
        expect(aRows.map((r) => r.storageKey)).not.toContain(row.storageKey);
        expect(row.storageKey).toMatch(/^attachments\/[0-9a-f-]{36}\.(pdf|png)$/);
        const bytes = readFileSync(join(dataDir, 'uploads', row.storageKey));
        expect(sha256(bytes)).toBe(row.sha256);
        expect(bytes.length).toBe(row.size);
      }
      expect(
        bRows.map(({ originalName, mimeType, size, sha256: hash }) => ({
          originalName,
          mimeType,
          size,
          hash,
        })),
      ).toEqual([
        {
          originalName: 'factura.pdf',
          mimeType: 'application/pdf',
          size: a.files.pdf.length,
          hash: sha256(a.files.pdf),
        },
        {
          originalName: 'foto.png',
          mimeType: 'image/png',
          size: a.files.png.length,
          hash: sha256(a.files.png),
        },
      ]);
      expect(vehicleRow?.photo).toMatch(/^vehicles\/[0-9a-f-]{36}\.webp$/);
      const aPhoto = db.select().from(vehicles).where(eq(vehicles.id, a.active.id)).get()?.photo;
      expect(vehicleRow?.photo).not.toBe(aPhoto);
    });

    it('imports the expenses of an export', async () => {
      const { app, db, a, b, exported } = await setup();

      const response = await upload(app, b.cookie, exported.zip);
      expect(response.statusCode, response.body).toBe(201);
      expect((response.json() as DataImportSummary).expenses).toBe(1);

      const bVehicles = db.select().from(vehicles).where(eq(vehicles.ownerId, b.userId)).all();
      const imported = bVehicles.find((vehicle) => vehicle.plate === '1234ABC');
      const rows = db
        .select()
        .from(expenses)
        .where(
          inArray(
            expenses.vehicleId,
            bVehicles.map((vehicle) => vehicle.id),
          ),
        )
        .all();
      expect(rows).toEqual([
        {
          id: expect.any(String),
          vehicleId: imported?.id,
          date: '2025-04-01',
          category: 'insurance',
          title: 'Seguro anual',
          description: 'Póliza',
          cost: 420.5,
          createdAt: new Date(a.expense.createdAt),
          updatedAt: new Date(a.expense.updatedAt),
        },
      ]);
      expect(rows[0]?.id).not.toBe(a.expense.id);
      expect(imported?.id).not.toBe(a.active.id);
      // A keeps its own expense.
      expect(db.select().from(expenses).where(eq(expenses.id, a.expense.id)).get()?.vehicleId).toBe(
        a.active.id,
      );
    });

    it('imports a v1 zip without expenses', async () => {
      const { app, db, b, exported } = await setup();
      // A document written before expenses existed: no `expenses` key in its vehicles.
      const document = clone(exported.document);
      const old = {
        ...document,
        vehicles: document.vehicles.map(({ expenses: _expenses, ...vehicle }) => vehicle),
      };
      expect(JSON.stringify(old)).not.toContain('"expenses"');
      const before = db.select({ n: count() }).from(expenses).get()?.n;

      const response = await upload(app, b.cookie, await rezip(exported.entries, { document: old }));

      expect(response.statusCode, response.body).toBe(201);
      expect(response.json()).toMatchObject({ vehicles: 3, fuelLogs: 1, maintenanceRecords: 1, expenses: 0 });
      expect(db.select({ n: count() }).from(expenses).get()?.n).toBe(before);
    });

    it('imports the documents of an export with their files', async () => {
      const { app, db, dataDir, a, b } = await setup();
      const vehicleDocument = await a.api.post(`/api/vehicles/${a.active.id}/documents`, {
        type: 'insurance',
        title: 'Póliza',
        expiryDate: '2026-03-01',
        warnDays: 15,
        notes: 'Todo riesgo',
      });
      await a.api.post(`/api/vehicles/${a.sold.id}/documents`, { type: 'registration', title: 'Permiso' });
      const policy = pdf('poliza');
      const attachment = await a.api.upload(
        `/api/vehicles/${a.active.id}/documents/${vehicleDocument.id}/attachments`,
        'POST',
        policy,
        'poliza.pdf',
        'application/pdf',
      );
      const exported = await download(app, a.cookie);

      const response = await upload(app, b.cookie, exported.zip);

      expect(response.statusCode, response.body).toBe(201);
      expect(response.json()).toMatchObject({ documents: 2, attachments: 3 });
      const bVehicles = db.select().from(vehicles).where(eq(vehicles.ownerId, b.userId)).all();
      const imported = bVehicles.find((vehicle) => vehicle.plate === '1234ABC');
      const rows = db
        .select()
        .from(vehicleDocuments)
        .where(
          inArray(
            vehicleDocuments.vehicleId,
            bVehicles.map((vehicle) => vehicle.id),
          ),
        )
        .all();
      const policyRow = rows.find((row) => row.title === 'Póliza');
      expect(rows).toHaveLength(2);
      expect(policyRow).toEqual({
        id: expect.any(String),
        vehicleId: imported?.id,
        type: 'insurance',
        title: 'Póliza',
        expiryDate: '2026-03-01',
        warnDays: 15,
        notes: 'Todo riesgo',
        createdAt: new Date(vehicleDocument.createdAt),
        updatedAt: new Date(vehicleDocument.updatedAt),
      });
      expect(policyRow?.id).not.toBe(vehicleDocument.id);

      const [file] = db
        .select()
        .from(attachments)
        .where(and(eq(attachments.ownerId, b.userId), eq(attachments.entityType, 'document')))
        .all();
      expect(file).toMatchObject({
        entityId: policyRow?.id,
        originalName: 'poliza.pdf',
        mimeType: 'application/pdf',
        size: policy.length,
        sha256: sha256(policy),
      });
      expect(file?.id).not.toBe(attachment.id);
      expect(file?.storageKey).toMatch(/^attachments\/[0-9a-f-]{36}\.pdf$/);
      expect(sha256(readFileSync(join(dataDir, 'uploads', file?.storageKey ?? '')))).toBe(sha256(policy));

      // B can read it through the API like any other document attachment.
      const served = await app.inject({
        method: 'GET',
        url: `/api/vehicles/${imported?.id}/documents/${policyRow?.id}/attachments/${file?.id}`,
        headers: { cookie: b.cookie },
      });
      expect(served.statusCode).toBe(200);
      expect(sha256(served.rawPayload)).toBe(sha256(policy));
    });

    it('imports a v1 zip without documents', async () => {
      const { app, db, b, exported } = await setup();
      // A document written before vehicle documents existed: no `documents` key in its vehicles.
      const document = clone(exported.document);
      const old = {
        ...document,
        vehicles: document.vehicles.map(({ documents: _documents, ...vehicle }) => vehicle),
      };
      expect(JSON.stringify(old)).not.toContain('"documents"');

      const response = await upload(app, b.cookie, await rezip(exported.entries, { document: old }));

      expect(response.statusCode, response.body).toBe(201);
      expect(response.json()).toMatchObject({ vehicles: 3, expenses: 1, attachments: 2, documents: 0 });
      expect(db.select({ n: count() }).from(vehicleDocuments).get()?.n).toBe(0);
    });

    it('adds to existing data', async () => {
      const { app, db, b, exported } = await setup();
      const own = await b.api.post('/api/vehicles', { make: 'Toyota', model: 'Yaris' });
      await b.api.post(`/api/vehicles/${own.id}/odometer`, { date: '2025-02-01', value: 500 });
      await b.api.post('/api/notification-channels', {
        type: 'webhook',
        config: { url: 'https://hooks.example.com/bob' },
      });
      await b.api.patch('/api/settings', { locale: 'en', timezone: 'Europe/London', reminderHour: 20 });
      const rowsOf = () => ({
        vehicle: db.select().from(vehicles).where(eq(vehicles.id, own.id)).get(),
        readings: db.select().from(odometerReadings).where(eq(odometerReadings.vehicleId, own.id)).all(),
        channels: db
          .select()
          .from(notificationChannels)
          .where(eq(notificationChannels.userId, b.userId))
          .all(),
        settings: db.select().from(userSettings).where(eq(userSettings.userId, b.userId)).get(),
      });
      const before = rowsOf();

      const response = await upload(app, b.cookie, exported.zip);

      expect(response.statusCode, response.body).toBe(201);
      const after = rowsOf();
      expect(after.vehicle).toEqual(before.vehicle);
      expect(after.readings).toEqual(before.readings);
      expect(after.settings).toEqual(before.settings);
      expect(after.channels.slice(0, 1)).toEqual(before.channels);
      expect(after.channels).toHaveLength(2);
      const list = await app.inject({ method: 'GET', url: '/api/vehicles', headers: { cookie: b.cookie } });
      expect(list.json()).toHaveLength(2);
      expect(db.select({ n: count() }).from(vehicles).where(eq(vehicles.ownerId, b.userId)).get()?.n).toBe(4);
    });

    it('round-trips an export into another account', async () => {
      const { app, b, exported } = await setup();
      await b.api.patch('/api/settings', exported.document.settings);

      const response = await upload(app, b.cookie, exported.zip);
      expect(response.statusCode, response.body).toBe(201);
      const reexported = await download(app, b.cookie);

      // A's document without the channel that had a token (skipped on import).
      const expected = clone(exported.document);
      expected.notificationChannels = expected.notificationChannels.filter((channel) => !channel.hasToken);
      expect(exported.document.notificationChannels).toHaveLength(2);
      expect(normalize(reexported.document)).toEqual(normalize(expected));

      // Same bytes in each referenced file, matched by position.
      const before = referencedPaths(exported.document);
      const after = referencedPaths(reexported.document);
      expect(after).toHaveLength(3);
      before.forEach((path, i) => {
        const original = exported.entries.get(path);
        expect(original).toBeDefined();
        expect(reexported.entries.get(after[i] ?? '')?.equals(original ?? Buffer.alloc(0))).toBe(true);
      });
    });
    it('skips channels whose config is no longer valid', async () => {
      const { app, db, dataDir, b, exported } = await setup();
      const at = exported.document.exportedAt;
      const channel = (type: string, config: Record<string, unknown>) => ({
        type,
        enabled: true,
        hasToken: false,
        config,
        createdAt: at,
        updatedAt: at,
      });
      const document = {
        ...exported.document,
        vehicles: [],
        notificationChannels: [
          channel('webhook', { url: 'file:///etc/passwd' }),
          channel('webhook', { url: 'http://user:pw@evil.example.com/hook' }),
          channel('ntfy', { serverUrl: 'gopher://ntfy.example.com', topic: 'ikrive' }),
          channel('ntfy', { serverUrl: 'https://ntfy.example.com', topic: '../x' }),
          // The export schema drops the smuggled token and the strict one requires it.
          channel('gotify', { serverUrl: 'https://gotify.example.com', token: 'smuggled' }),
          // Valid once the smuggled token is dropped.
          channel('webhook', { url: 'https://hooks.example.com/ikrive', token: 'smuggled' }),
        ],
      };
      const before = snapshot(db, dataDir);

      const response = await upload(app, b.cookie, await rezip(exported.entries, { document }));

      expect(response.statusCode, response.body).toBe(201);
      expect(response.json()).toMatchObject({
        vehicles: 0,
        notificationChannels: 1,
        skipped: { notificationChannels: 5 },
      });
      const rows = db
        .select()
        .from(notificationChannels)
        .where(eq(notificationChannels.userId, b.userId))
        .all();
      expect(rows.map((row) => ({ type: row.type, config: row.config }))).toEqual([
        { type: 'webhook', config: { url: 'https://hooks.example.com/ikrive' } },
      ]);
      expect(snapshot(db, dataDir).notificationChannels).toBe(before.notificationChannels + 1);
    });
  });

  describe('client-built zip', () => {
    it('imports a zip built with the shared builder and zip writer', async () => {
      const { app, db, dataDir, a, b, exported } = await setup();
      await b.api.patch('/api/settings', exported.document.settings);
      const built = clientBuiltZip(db, dataDir, a.userId);

      const entries = await readZip(built.zip);
      const parsed = dataExportSchema.safeParse(JSON.parse(entries.get('data.json')?.toString('utf8') ?? ''));
      expect(parsed.error).toBeUndefined();
      expect([...entries.keys()].sort()).toEqual([...exported.entries.keys()].sort());

      const response = await upload(app, b.cookie, built.zip);
      expect(response.statusCode, response.body).toBe(201);
      const reexported = await download(app, b.cookie);

      // A's export without the channel that had a token (skipped on import).
      const expected = clone(exported.document);
      expected.notificationChannels = expected.notificationChannels.filter((channel) => !channel.hasToken);
      expect(normalize(reexported.document)).toEqual(normalize(expected));

      // Same bytes in each referenced file, matched by position.
      const before = referencedPaths(exported.document);
      const after = referencedPaths(reexported.document);
      expect(after).toHaveLength(3);
      before.forEach((path, i) => {
        const original = exported.entries.get(path);
        expect(original).toBeDefined();
        expect(entries.get(path)?.equals(original ?? Buffer.alloc(0))).toBe(true);
        expect(reexported.entries.get(after[i] ?? '')?.equals(original ?? Buffer.alloc(0))).toBe(true);
      });
    });

    it('builds the same document as GET /api/me/export', async () => {
      const { db, dataDir, a, exported } = await setup();

      const { document } = clientBuiltZip(db, dataDir, a.userId);

      const { exportedAt: _a, appVersion: _b, ...client } = document;
      const { exportedAt: _c, appVersion: _d, ...server } = exported.document;
      expect(client).toEqual(server);
      expect(document.appVersion).toBe('0.0.0-local');
    });
  });

  describe('files', () => {
    it('rejects attachments whose type does not match', async () => {
      const { app, db, dataDir, b, exported } = await setup();
      const before = snapshot(db, dataDir);
      const [pdfPath, pngPath] =
        exported.document.vehicles[0]?.maintenanceRecords[0]?.attachments.map((a) => a.path) ?? [];
      if (!pdfPath || !pngPath) throw new Error('seed without attachments');
      const corruptPng = Buffer.concat([(await png()).subarray(0, 16), Buffer.alloc(200, 7)]);

      for (const files of [
        { [pdfPath]: await png() },
        { [pdfPath]: Buffer.from('just some text, not a pdf') },
        { [pngPath]: corruptPng },
      ]) {
        const response = await upload(app, b.cookie, await rezip(exported.entries, { files }));
        expectRejected(response, 415, before, snapshot(db, dataDir));
        expect(response.json().detail).toMatch(/^attachments\//);
      }
    });

    it('rejects files that do not match size or sha256', async () => {
      const { app, db, dataDir, b, exported } = await setup();
      const before = snapshot(db, dataDir);
      const attachment = exported.document.vehicles[0]?.maintenanceRecords[0]?.attachments[0];
      if (!attachment) throw new Error('seed without attachments');

      const otherPdf = await upload(
        app,
        b.cookie,
        await rezip(exported.entries, { files: { [attachment.path]: pdf('otra factura distinta') } }),
      );
      expectRejected(otherPdf, 400, before, snapshot(db, dataDir));
      expect(otherPdf.json().detail).toContain(attachment.path);

      // Same length, different contents: only the hash tells.
      const original = exported.entries.get(attachment.path) ?? Buffer.alloc(0);
      const sameSize = Buffer.from(original);
      sameSize[sameSize.length - 2] = 0x41;
      const response = await upload(
        app,
        b.cookie,
        await rezip(exported.entries, { files: { [attachment.path]: sameSize } }),
      );
      expectRejected(response, 400, before, snapshot(db, dataDir));
    });

    it('rejects an invalid photo', async () => {
      const { app, db, dataDir, b, exported } = await setup();
      const before = snapshot(db, dataDir);
      const photoPath = exported.document.vehicles[0]?.photoPath;
      if (!photoPath) throw new Error('seed without a photo');
      const webp = exported.entries.get(photoPath) ?? Buffer.alloc(0);

      for (const data of [
        await png(),
        Buffer.from('garbage'),
        Buffer.concat([webp.subarray(0, 20), Buffer.alloc(100)]),
      ]) {
        const response = await upload(
          app,
          b.cookie,
          await rezip(exported.entries, { files: { [photoPath]: data } }),
        );
        expectRejected(response, 415, before, snapshot(db, dataDir));
        expect(response.json().detail).toBe(`${photoPath} is not a valid WebP image`);
      }
    });

    it('rejects a missing referenced file', async () => {
      const { app, db, dataDir, b, exported } = await setup();
      const before = snapshot(db, dataDir);
      const path = exported.document.vehicles[0]?.maintenanceRecords[0]?.attachments[1]?.path ?? '';

      const response = await upload(app, b.cookie, await rezip(exported.entries, { omit: [path] }));

      expectRejected(response, 400, before, snapshot(db, dataDir));
      expect(response.json().detail).toContain(path);
    });

    it('ignores unreferenced entries', async () => {
      const { app, db, dataDir, b, exported } = await setup();
      const before = snapshot(db, dataDir);
      const zip = await rezip(exported.entries, {
        extra: [
          { name: '__MACOSX/x', data: Buffer.from('resource fork'), compress: true },
          { name: 'extra.bin', data: Buffer.alloc(4096, 1), compress: true },
        ],
      });
      // A lying header: reading it would fail, and counting it would go over the total limit.
      const lying = patchZipEntry(zip, 'extra.bin', { uncompressedSize: 0x7fff_ffff });

      const response = await upload(app, b.cookie, lying);

      expect(response.statusCode, response.body).toBe(201);
      const after = snapshot(db, dataDir);
      const added = after.uploads.filter((file) => !before.uploads.includes(file));
      expect(added).toHaveLength(3);
      expect(
        added.every((file) => /^uploads\/(attachments|vehicles)\/[0-9a-f-]{36}\.(pdf|png|webp)$/.test(file)),
      ).toBe(true);
    });
  });

  describe('atomicity', () => {
    it('removes written files when a later file fails', async () => {
      const { app, db, dataDir, b, exported } = await setup();
      const before = snapshot(db, dataDir);
      // The photo and the PDF are valid and saved first; the PNG fails.
      const pngPath = exported.document.vehicles[0]?.maintenanceRecords[0]?.attachments[1]?.path ?? '';

      const response = await upload(
        app,
        b.cookie,
        await rezip(exported.entries, { files: { [pngPath]: pdf() } }),
      );

      expectRejected(response, 415, before, snapshot(db, dataDir));
    });

    it('rolls back when the database insert fails', async () => {
      const { app, db, dataDir, b, exported } = await setup();
      db.run(
        sql.raw("CREATE TRIGGER fail_fuel BEFORE INSERT ON fuel_logs BEGIN SELECT RAISE(ABORT, 'boom'); END"),
      );
      const before = snapshot(db, dataDir);

      const response = await upload(app, b.cookie, exported.zip);

      expectRejected(response, 500, before, snapshot(db, dataDir));
      expect(db.select({ n: count() }).from(vehicles).where(eq(vehicles.ownerId, b.userId)).get()?.n).toBe(0);
    });

    it('deletes the temporary zip', async () => {
      const { app, dataDir, b, exported } = await setup();
      const tmp = join(dataDir, 'tmp');

      expect((await upload(app, b.cookie, exported.zip)).statusCode).toBe(201);
      expect(readdirSync(tmp)).toEqual([]);

      expect((await upload(app, b.cookie, pdf())).statusCode).toBe(400);
      expect(readdirSync(tmp)).toEqual([]);
    });
  });

  describe('limits', () => {
    it('rejects a zip over IMPORT_MAX_MB', async () => {
      const { app, db, dataDir, b, exported } = await setup({ IMPORT_MAX_MB: '1' });
      const before = snapshot(db, dataDir);
      const big = await rezip(exported.entries, {
        extra: [
          {
            name: 'padding.bin',
            data: Buffer.from(Array.from({ length: 2 * MIB }, (_, i) => (i * 7919) % 251)),
          },
        ],
      });

      const response = await upload(app, b.cookie, big);

      expectRejected(response, 413, before, snapshot(db, dataDir));
    });

    it('rejects entries over the size limits', async () => {
      const { app, db, dataDir, b, exported } = await setup({ MAX_UPLOAD_MB: '1' });
      const before = snapshot(db, dataDir);
      const attachment = exported.document.vehicles[0]?.maintenanceRecords[0]?.attachments[0];
      if (!attachment) throw new Error('seed without attachments');
      // 2 MiB of zeros, a few KiB once deflated: the declared size is what counts.
      const huge = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(2 * MIB)]);
      const document = clone(exported.document);
      const declared = document.vehicles[0]?.maintenanceRecords[0]?.attachments[0];
      if (declared) Object.assign(declared, { size: huge.length, sha256: sha256(huge) });
      const zip = await rezip(exported.entries, {
        document,
        files: { [attachment.path]: huge },
        compressFiles: true,
      });
      expect(zip.length).toBeLessThan(MIB);

      const response = await upload(app, b.cookie, zip);
      expectRejected(response, 413, before, snapshot(db, dataDir));
      expect(response.json().detail).toContain(attachment.path);

      const dataJsonSize = exported.entries.get('data.json')?.length ?? 0;
      const tooBigJson = importWith(db, dataDir, { dataJsonBytes: dataJsonSize - 1 });
      await expect(tooBigJson(b.userId, exported.zip)).rejects.toMatchObject({ status: 413 });
      const tooBigTotal = importWith(db, dataDir, { totalBytes: dataJsonSize + 100 });
      await expect(tooBigTotal(b.userId, exported.zip)).rejects.toMatchObject({ status: 413 });
      const { tmp: _tmp, ...rows } = snapshot(db, dataDir);
      const { tmp: _beforeTmp, ...beforeRows } = before;
      expect(rows).toEqual(beforeRows);
    });

    it('rejects an entry whose real size lies', async () => {
      const { app, db, dataDir, b, exported } = await setup();
      const before = snapshot(db, dataDir);
      const attachment = exported.document.vehicles[0]?.maintenanceRecords[0]?.attachments[0];
      if (!attachment) throw new Error('seed without attachments');

      // Deflated entry: the stream yields more bytes than declared.
      const deflated = await rezip(exported.entries, { compressFiles: true });
      const shrunk = patchZipEntry(deflated, attachment.path, { uncompressedSize: 10 });
      const response = await upload(app, b.cookie, shrunk);
      expectRejected(response, 400, before, snapshot(db, dataDir));
      expect(response.json().detail).toContain(attachment.path);

      // Stored entry (as the export writes them): sizes that disagree are rejected on open.
      const stored = patchZipEntry(exported.zip, attachment.path, { uncompressedSize: 10 });
      expectRejected(await upload(app, b.cookie, stored), 400, before, snapshot(db, dataDir));
    });

    it('rejects unsafe entry names', async () => {
      const { app, db, dataDir, b, exported } = await setup();
      const before = snapshot(db, dataDir);
      const withEntry = (name: string) =>
        rezip(exported.entries, { extra: [{ name, data: pdf('evil'), compress: true }] });

      for (const [placeholder, unsafe] of [
        ['aa/evil.pdf', '../evil.pdf'],
        ['etc/xy', '/etc/x'],
        ['a_b', 'a\\b'],
      ] as const) {
        const zip = patchZipEntry(await withEntry(placeholder), placeholder, { name: unsafe });
        const response = await upload(app, b.cookie, zip);
        expectRejected(response, 400, before, snapshot(db, dataDir));
        expect(response.json().detail).toContain(unsafe);
      }

      const twice = await rezip(exported.entries, {
        extra: [
          { name: 'extra1.bin', data: Buffer.from('one') },
          { name: 'extra2.bin', data: Buffer.from('two') },
        ],
      });
      const duplicate = await upload(
        app,
        b.cookie,
        patchZipEntry(twice, 'extra2.bin', { name: 'extra1.bin' }),
      );
      expectRejected(duplicate, 400, before, snapshot(db, dataDir));
      expect(duplicate.json().detail).toBe('Duplicate zip entry: extra1.bin');

      const encrypted = patchZipEntry(await withEntry('enc.pdf'), 'enc.pdf', { encrypted: true });
      const encryptedResponse = await upload(app, b.cookie, encrypted);
      expectRejected(encryptedResponse, 400, before, snapshot(db, dataDir));
      expect(encryptedResponse.json().detail).toBe('Encrypted zip entry: enc.pdf');

      const fewEntries = importWith(db, dataDir, { entries: 2 });
      await expect(fewEntries(b.userId, exported.zip)).rejects.toMatchObject({
        status: 400,
        message: 'The zip has more than 2 entries',
      });

      expect(existsSync(join(dataDir, 'evil.pdf'))).toBe(false);
      expect(existsSync(join(dataDir, 'uploads', 'evil.pdf'))).toBe(false);
    });

    it('imports without notifying', async () => {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 200 }));
      const { app, db, b, exported } = await setup({}, { fetch });

      const response = await upload(app, b.cookie, exported.zip);

      expect(response.statusCode, response.body).toBe(201);
      expect((response.json() as DataImportSummary).notificationChannels).toBe(1);
      expect(
        db.select().from(notificationChannels).where(eq(notificationChannels.userId, b.userId)).all(),
      ).toEqual([expect.objectContaining({ type: 'ntfy', enabled: true })]);
      expect(fetch).not.toHaveBeenCalled();
      expect(db.select().from(notifications).where(eq(notifications.userId, b.userId)).all()).toEqual([]);
    });
  });

  describe('dedupe', () => {
    const fingerprint = (exported: { entries: Map<string, Buffer> }) =>
      sha256(exported.entries.get('data.json') ?? Buffer.alloc(0));
    const fingerprintsOf = (db: Db, userId: string) =>
      db.select().from(dataImports).where(eq(dataImports.userId, userId)).all();

    /** Expects the repeated import problem and that nothing changed. */
    function expectRepeated(
      response: Awaited<ReturnType<typeof upload>>,
      before: ReturnType<typeof snapshot>,
      after: ReturnType<typeof snapshot>,
    ) {
      expectRejected(response, 409, before, after);
      expect(response.json()).toMatchObject({ type: DUPLICATE_IMPORT_PROBLEM_TYPE, status: 409 });
    }

    it('records the fingerprint of an import', async () => {
      const { app, db, b, exported } = await setup();

      const response = await upload(app, b.cookie, exported.zip);

      expect(response.statusCode, response.body).toBe(201);
      expect(fingerprintsOf(db, b.userId)).toEqual([
        expect.objectContaining({ userId: b.userId, dataSha256: fingerprint(exported) }),
      ]);
      expect(db.select().from(dataImports).all()).toHaveLength(1);
    });

    it('rejects an export already imported into the account', async () => {
      const { app, db, dataDir, b, exported } = await setup();
      expect((await upload(app, b.cookie, exported.zip)).statusCode).toBe(201);
      const before = snapshot(db, dataDir);

      // Zipped again (other bytes, same data.json): still the same export.
      const response = await upload(app, b.cookie, await rezip(exported.entries, { compressFiles: true }));

      expectRepeated(response, before, snapshot(db, dataDir));
      const [row] = fingerprintsOf(db, b.userId);
      expect(response.json().detail).toBe(
        `This export was already imported into your account on ${row?.createdAt.toISOString()}`,
      );
    });

    it('reports a repeated import before different settings', async () => {
      const { app, db, dataDir, b, exported } = await setup();
      expect((await upload(app, b.cookie, exported.zip)).statusCode).toBe(201);
      await b.api.patch('/api/settings', { distanceUnit: 'mi' });
      const before = snapshot(db, dataDir);

      const response = await upload(app, b.cookie, exported.zip);

      expectRepeated(response, before, snapshot(db, dataDir));
    });

    it('rejects concurrent imports of the same export', async () => {
      const { app, db, dataDir, b, exported } = await setup();
      const before = snapshot(db, dataDir);

      const responses = await Promise.all([
        upload(app, b.cookie, exported.zip),
        upload(app, b.cookie, exported.zip),
      ]);

      expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
      const rejected = responses.find((response) => response.statusCode === 409);
      expect(rejected?.json()).toMatchObject({ type: DUPLICATE_IMPORT_PROBLEM_TYPE });
      const after = snapshot(db, dataDir);
      expect(after.vehicles).toBe(before.vehicles + exported.document.vehicles.length);
      expect(after.attachments).toBe(before.attachments + 2);
      expect(after.dataImports).toBe(before.dataImports + 1);
      // The photo and the two attachments of one import only.
      expect(after.uploads).toHaveLength(before.uploads.length + 3);
      expect(after.tmp).toEqual([]);
    });

    it('relies on the unique index when the pre-check misses', async () => {
      const { app, db, dataDir, b, exported } = await setup();
      expect((await upload(app, b.cookie, exported.zip)).statusCode).toBe(201);
      const before = snapshot(db, dataDir);
      const withoutCheck = importWith(db, dataDir, {}, { hasImport: () => null });

      await expect(withoutCheck(b.userId, exported.zip)).rejects.toMatchObject({
        status: 409,
        type: DUPLICATE_IMPORT_PROBLEM_TYPE,
        message: expect.stringMatching(/^This export was already imported into your account on /),
      });

      expect(snapshot(db, dataDir)).toEqual(before);
    });

    it('imports the same export into another account', async () => {
      const { app, db, a, b, exported } = await setup();

      expect((await upload(app, b.cookie, exported.zip)).statusCode).toBe(201);
      const again = await upload(app, a.cookie, exported.zip);

      expect(again.statusCode, again.body).toBe(201);
      expect(fingerprintsOf(db, a.userId).map((row) => row.dataSha256)).toEqual([fingerprint(exported)]);
      expect(fingerprintsOf(db, b.userId).map((row) => row.dataSha256)).toEqual([fingerprint(exported)]);
    });

    it('does not record the fingerprint of a failed import', async () => {
      const { app, db, dataDir, b, exported } = await setup();
      const pdfPath = exported.document.vehicles[0]?.maintenanceRecords[0]?.attachments[0]?.path ?? '';
      const before = snapshot(db, dataDir);

      // Same data.json, one attachment of the wrong type.
      const failed = await upload(
        app,
        b.cookie,
        await rezip(exported.entries, { files: { [pdfPath]: await png() } }),
      );
      expectRejected(failed, 415, before, snapshot(db, dataDir));
      expect(fingerprintsOf(db, b.userId)).toEqual([]);

      const fixed = await upload(app, b.cookie, exported.zip);
      expect(fixed.statusCode, fixed.body).toBe(201);
      expect(fingerprintsOf(db, b.userId)).toHaveLength(1);
    });

    it('reports vehicles matching by plate or VIN', async () => {
      const { app, db, b, exported } = await setup();
      const byPlate = await b.api.post('/api/vehicles', { make: 'Kia', model: 'Ceed', plate: '1234-ABC' });
      const byVin = await b.api.post('/api/vehicles', {
        name: 'Furgo',
        make: 'Toyota',
        model: 'Proace',
        vin: 'VF1ABCDEFGH123456',
      });
      const document = clone(exported.document);
      const [seat, renault, ford] = document.vehicles;
      if (!seat || !renault || !ford) throw new Error('seed without three vehicles');
      seat.plate = '1234 abc';
      renault.vin = 'vf1abcdefgh123456';
      expect([ford.plate, ford.vin]).toEqual([null, null]);
      const ownRows = () =>
        db
          .select()
          .from(vehicles)
          .where(inArray(vehicles.id, [byPlate.id, byVin.id]))
          .orderBy(vehicles.make)
          .all();
      const before = ownRows();

      const response = await upload(app, b.cookie, await rezip(exported.entries, { document }));

      expect(response.statusCode, response.body).toBe(201);
      const summary = response.json() as DataImportSummary;
      expect(summary.vehicles).toBe(3);
      const importedId = (make: string) =>
        db
          .select({ id: vehicles.id })
          .from(vehicles)
          .where(and(eq(vehicles.ownerId, b.userId), eq(vehicles.make, make)))
          .get()?.id;
      expect(summary.matchingVehicles).toEqual([
        {
          imported: { id: importedId('Seat'), name: null, make: 'Seat', model: 'Ibiza' },
          existing: { id: byPlate.id, name: null, make: 'Kia', model: 'Ceed' },
          matchedBy: ['plate'],
        },
        {
          imported: { id: importedId('Renault'), name: null, make: 'Renault', model: 'Clio' },
          existing: { id: byVin.id, name: 'Furgo', make: 'Toyota', model: 'Proace' },
          matchedBy: ['vin'],
        },
      ]);
      // Nothing merged or changed: the existing vehicles as they were, every imported one created.
      expect(ownRows()).toEqual(before);
      expect(db.select({ n: count() }).from(vehicles).where(eq(vehicles.ownerId, b.userId)).get()?.n).toBe(5);
      expect(
        db
          .select()
          .from(vehicles)
          .where(eq(vehicles.id, importedId('Seat') ?? ''))
          .get()?.plate,
      ).toBe('1234 abc');

      const carol = await newUser(app, 'carol@example.com', 'Carol');
      const withoutMatches = await upload(app, carol.cookie, exported.zip);
      expect(withoutMatches.statusCode, withoutMatches.body).toBe(201);
      expect((withoutMatches.json() as DataImportSummary).matchingVehicles).toEqual([]);
    });
  });
});
