import { createHash } from 'node:crypto';
import { createReadStream, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { type DataExport, dataExportSchema, todayIn } from '@ikrive/shared';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import yauzl from 'yauzl';
import {
  account,
  attachments,
  calendarFeeds,
  notifications,
  reportShares,
  session,
  vehicles,
} from '../src/db/schema';
import { createFileStorage } from '../src/lib/storage';
import { APP_VERSION } from '../src/lib/version';
import { createDataExportRepository } from '../src/modules/data-export/repository';
import { createDataExportService } from '../src/modules/data-export/service';
import { createSettingsRepository } from '../src/modules/settings/repository';
import { createSettingsService } from '../src/modules/settings/service';
import { createTestApp, signUp } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];

const EXPORT = '/api/me/export';

const pdf = (text = 'factura') =>
  Buffer.from(
    `%PDF-1.7\n% ${text}\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`,
  );

const png = (background = '#c5e8e0') =>
  sharp({ create: { width: 64, height: 32, channels: 3, background } })
    .png()
    .toBuffer();

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

/** Entries of a zip, by name, read with `yauzl` (the library the import will use). */
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

function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/** Downloads the export of a user and returns the response, the zip entries and the parsed document. */
async function download(app: TestApp, cookie: string) {
  const response = await app.inject({ method: 'GET', url: EXPORT, headers: { cookie } });
  expect(response.statusCode).toBe(200);
  const entries = await readZip(response.rawPayload);
  const json = entries.get('data.json');
  expect(json).toBeDefined();
  const text = json?.toString('utf8') ?? '';
  return { response, entries, text, document: JSON.parse(text) as DataExport };
}

function multipart(data: Buffer, filename: string, mimetype: string) {
  const boundary = '----ikrive-test-boundary';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
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
    postOk: (url: string, payload: object = {}) => send('POST', url, payload, 200),
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

/** A user with a vehicle, a maintenance record with one attachment, a photo and an ntfy channel. */
async function seedUser(app: TestApp, email: string, tag: string) {
  const { cookie, response } = await signUp(app, email, tag);
  const userId = (response.json() as { user: { id: string } }).user.id;
  const api = client(app, cookie);
  const vehicle = await api.post('/api/vehicles', {
    make: 'Seat',
    model: `Modelo ${tag}`,
    plate: `PLATE${tag}`,
  });
  const record = await api.post(`/api/vehicles/${vehicle.id}/maintenance`, {
    date: '2025-05-10',
    category: 'repair',
    title: `Reparación ${tag}`,
  });
  const file = pdf(`factura ${tag}`);
  const attachment = await api.upload(
    `/api/vehicles/${vehicle.id}/maintenance/${record.id}/attachments`,
    'POST',
    file,
    `factura-${tag}.pdf`,
    'application/pdf',
  );
  await api.upload(`/api/vehicles/${vehicle.id}/photo`, 'PUT', await png(), 'photo.png', 'image/png');
  const channel = await api.post('/api/notification-channels', {
    type: 'ntfy',
    config: { serverUrl: `https://ntfy-${tag}.example.com`, topic: `topic-${tag}` },
  });
  return { cookie, userId, api, vehicle, record, attachment, file, channel };
}

/** Every file path the document references. */
const referencedPaths = (document: DataExport) =>
  document.vehicles.flatMap((vehicle) => [
    ...(vehicle.photoPath ? [vehicle.photoPath] : []),
    ...vehicle.maintenanceRecords.flatMap((record) =>
      record.attachments.map((attachment) => attachment.path),
    ),
  ]);

describe('data export', () => {
  describe('GET /api/me/export', () => {
    it('downloads a dated zip', async () => {
      const { app } = await createTestApp();
      const { cookie } = await signUp(app);

      const { response, entries } = await download(app, cookie);

      expect(response.headers['content-type']).toBe('application/zip');
      const fileName = `ikrive-export-${todayIn('Europe/Madrid')}.zip`;
      expect(response.headers['content-disposition']).toMatch(
        new RegExp(`^attachment; filename="${fileName}"`),
      );
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect([...entries.keys()]).toEqual(['data.json']);
    });

    it('requires a session', async () => {
      const { app } = await createTestApp();

      const response = await app.inject({ method: 'GET', url: EXPORT });

      expect(response.statusCode).toBe(401);
      expect(response.headers['content-type']).toContain('application/problem+json');
    });
  });

  describe('data.json', () => {
    it('exports every vehicle with its records', async () => {
      const { app } = await createTestApp();
      const { cookie } = await signUp(app);
      const api = client(app, cookie);
      await api.patch('/api/settings', { currency: 'USD', distanceUnit: 'mi', timezone: 'America/New_York' });

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
      const fuelLog = await api.post(`/api/vehicles/${active.id}/fuel-logs`, {
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
      const vehicleDocument = await api.post(`/api/vehicles/${active.id}/documents`, {
        type: 'insurance',
        title: 'Póliza',
        expiryDate: '2026-03-01',
        warnDays: 15,
        notes: 'Todo riesgo',
      });
      await api.post('/api/notification-channels', {
        type: 'ntfy',
        config: { serverUrl: 'https://ntfy.example.com', topic: 'ikrive' },
      });

      const { document, response } = await download(app, cookie);

      expect(dataExportSchema.safeParse(document).success).toBe(true);
      expect(response.headers['content-disposition']).toContain(
        `ikrive-export-${todayIn('America/New_York')}.zip`,
      );
      expect(document).toMatchObject({ formatVersion: 1, appVersion: APP_VERSION });
      expect(Number.isNaN(Date.parse(document.exportedAt))).toBe(false);
      expect(document.settings).toEqual({
        currency: 'USD',
        distanceUnit: 'mi',
        volumeUnit: 'l',
        locale: 'es',
        timezone: 'America/New_York',
        odometerReminderWeekday: 0,
        reminderHour: 8,
      });
      expect(document.notificationChannels).toEqual([
        expect.objectContaining({
          type: 'ntfy',
          enabled: true,
          hasToken: false,
          config: { serverUrl: 'https://ntfy.example.com', topic: 'ikrive' },
        }),
      ]);

      // Oldest first, whatever their status.
      expect(document.vehicles.map((vehicle) => vehicle.id)).toEqual([active.id, archived.id, sold.id]);
      const [first, second, third] = document.vehicles;
      expect(second?.archivedAt).not.toBeNull();
      expect(third?.soldAt).toBe('2025-01-15');
      expect(first).toMatchObject({
        make: 'Seat',
        model: 'Ibiza',
        plate: '1234ABC',
        purchaseDate: '2018-03-01',
        purchasePrice: 12000,
        photoPath: null,
        soldAt: null,
        archivedAt: null,
      });
      expect(first?.odometerReadings.map(({ value, source }) => ({ value, source }))).toEqual([
        { value: 1000, source: 'manual' },
        { value: 1200, source: 'maintenance' },
        { value: 1500, source: 'fuel' },
      ]);
      expect(first?.maintenanceSchedules).toEqual([
        expect.objectContaining({
          id: schedule.id,
          title: 'Aceite',
          intervalMonths: 12,
          intervalDistance: 15000,
        }),
      ]);
      expect(first?.maintenanceRecords).toEqual([
        expect.objectContaining({
          id: record.id,
          odometer: 1200,
          cost: 89.9,
          scheduleId: schedule.id,
          attachments: [],
        }),
      ]);
      expect(first?.fuelLogs).toEqual([
        expect.objectContaining({ id: fuelLog.id, odometer: 1500, quantity: 40.5, totalPrice: 60.75 }),
      ]);
      expect(first?.expenses).toEqual([
        {
          id: expense.id,
          date: '2025-04-01',
          category: 'insurance',
          title: 'Seguro anual',
          description: 'Póliza',
          cost: 420.5,
          createdAt: expense.createdAt,
          updatedAt: expense.updatedAt,
        },
      ]);
      expect(second?.expenses).toEqual([]);
      // Every field but the computed `status`, with its attachments.
      expect(first?.documents).toEqual([
        {
          id: vehicleDocument.id,
          type: 'insurance',
          title: 'Póliza',
          expiryDate: '2026-03-01',
          warnDays: 15,
          notes: 'Todo riesgo',
          createdAt: vehicleDocument.createdAt,
          updatedAt: vehicleDocument.updatedAt,
          attachments: [],
        },
      ]);
      expect(second?.documents).toEqual([]);

      // The references point to elements of the same vehicle.
      const readingIds = first?.odometerReadings.map((reading) => reading.id) ?? [];
      const recordReading = first?.odometerReadings.find(
        (r) => r.id === first.maintenanceRecords[0]?.odometerReadingId,
      );
      const fuelReading = first?.odometerReadings.find((r) => r.id === first.fuelLogs[0]?.odometerReadingId);
      expect(recordReading?.value).toBe(1200);
      expect(fuelReading?.value).toBe(1500);
      expect(readingIds).toContain(first?.fuelLogs[0]?.odometerReadingId);
      expect(first?.maintenanceSchedules.map((s) => s.id)).toContain(
        first?.maintenanceRecords[0]?.scheduleId,
      );
    });

    it('exports an empty account', async () => {
      const { app } = await createTestApp();
      const { cookie } = await signUp(app);

      const { document, entries } = await download(app, cookie);

      expect(document.vehicles).toEqual([]);
      expect(document.notificationChannels).toEqual([]);
      expect(dataExportSchema.safeParse(document).success).toBe(true);
      expect([...entries.keys()]).toEqual(['data.json']);
    });
  });

  describe('files', () => {
    it('includes the attachment files', async () => {
      const { app } = await createTestApp();
      const { cookie } = await signUp(app);
      const api = client(app, cookie);
      const vehicle = await api.post('/api/vehicles', { make: 'Seat', model: 'León' });
      const record = await api.post(`/api/vehicles/${vehicle.id}/maintenance`, {
        date: '2025-05-10',
        category: 'repair',
        title: 'Reparación',
      });
      const url = `/api/vehicles/${vehicle.id}/maintenance/${record.id}/attachments`;
      const invoice = pdf();
      const picture = await png();
      const pdfAttachment = await api.upload(url, 'POST', invoice, 'factura.pdf', 'application/pdf');
      const pngAttachment = await api.upload(url, 'POST', picture, 'foto.png', 'image/png');

      const { document, entries } = await download(app, cookie);

      const exported = document.vehicles[0]?.maintenanceRecords[0]?.attachments;
      expect(exported).toEqual([
        {
          id: pdfAttachment.id,
          originalName: 'factura.pdf',
          mimeType: 'application/pdf',
          size: invoice.length,
          sha256: sha256(invoice),
          path: `attachments/${pdfAttachment.id}.pdf`,
          createdAt: pdfAttachment.createdAt,
        },
        {
          id: pngAttachment.id,
          originalName: 'foto.png',
          mimeType: 'image/png',
          size: picture.length,
          sha256: sha256(picture),
          path: `attachments/${pngAttachment.id}.png`,
          createdAt: pngAttachment.createdAt,
        },
      ]);
      expect(sha256(entries.get(`attachments/${pdfAttachment.id}.pdf`) ?? Buffer.alloc(0))).toBe(
        sha256(invoice),
      );
      expect(sha256(entries.get(`attachments/${pngAttachment.id}.png`) ?? Buffer.alloc(0))).toBe(
        sha256(picture),
      );

      // The attachments of a document go under it, with their file in the zip as well.
      const vehicleDocument = await api.post(`/api/vehicles/${vehicle.id}/documents`, {
        type: 'insurance',
        title: 'Póliza',
      });
      const policy = pdf('poliza');
      const documentAttachment = await api.upload(
        `/api/vehicles/${vehicle.id}/documents/${vehicleDocument.id}/attachments`,
        'POST',
        policy,
        'poliza.pdf',
        'application/pdf',
      );
      const again = await download(app, cookie);
      expect(again.document.vehicles[0]?.maintenanceRecords[0]?.attachments).toEqual(exported);
      expect(again.document.vehicles[0]?.documents[0]?.attachments).toEqual([
        {
          id: documentAttachment.id,
          originalName: 'poliza.pdf',
          mimeType: 'application/pdf',
          size: policy.length,
          sha256: sha256(policy),
          path: `attachments/${documentAttachment.id}.pdf`,
          createdAt: documentAttachment.createdAt,
        },
      ]);
      expect(sha256(again.entries.get(`attachments/${documentAttachment.id}.pdf`) ?? Buffer.alloc(0))).toBe(
        sha256(policy),
      );
    });

    it('includes the vehicle photo', async () => {
      const { app } = await createTestApp();
      const { cookie } = await signUp(app);
      const api = client(app, cookie);
      const withPhoto = await api.post('/api/vehicles', { make: 'Seat', model: 'León' });
      const withoutPhoto = await api.post('/api/vehicles', { make: 'Seat', model: 'Ibiza' });
      await api.upload(`/api/vehicles/${withPhoto.id}/photo`, 'PUT', await png(), 'photo.png', 'image/png');
      const stored = await app.inject({
        method: 'GET',
        url: `/api/vehicles/${withPhoto.id}/photo`,
        headers: { cookie },
      });

      const { document, entries } = await download(app, cookie);

      const path = `photos/${withPhoto.id}.webp`;
      expect(document.vehicles.find((v) => v.id === withPhoto.id)?.photoPath).toBe(path);
      expect(document.vehicles.find((v) => v.id === withoutPhoto.id)?.photoPath).toBeNull();
      expect(sha256(entries.get(path) ?? Buffer.alloc(0))).toBe(sha256(stored.rawPayload));
    });

    it('zips only data.json and referenced files', async () => {
      const { app } = await createTestApp();
      const user = await seedUser(app, 'ada@example.com', 'ada');
      // A second attachment and a vehicle without files.
      await user.api.upload(
        `/api/vehicles/${user.vehicle.id}/maintenance/${user.record.id}/attachments`,
        'POST',
        await png(),
        'foto.png',
        'image/png',
      );
      await user.api.post('/api/vehicles', { make: 'Seat', model: 'Ibiza' });

      const { document, entries } = await download(app, user.cookie);

      const paths = referencedPaths(document);
      expect(paths).toHaveLength(3);
      expect(new Set(entries.keys())).toEqual(new Set(['data.json', ...paths]));
      expect(entries.size).toBe(paths.length + 1);
    });
  });

  it("never exports other users' data", async () => {
    const { app } = await createTestApp();
    const ada = await seedUser(app, 'ada@example.com', 'ada');
    const bob = await seedUser(app, 'bob@example.com', 'bob');

    for (const [me, other] of [
      [ada, bob],
      [bob, ada],
    ] as const) {
      const { document, text, entries } = await download(app, me.cookie);

      expect(document.vehicles.map((vehicle) => vehicle.id)).toEqual([me.vehicle.id]);
      expect(document.notificationChannels).toHaveLength(1);
      for (const value of [
        other.vehicle.id,
        other.vehicle.plate,
        other.vehicle.model,
        other.record.id,
        other.record.title,
        other.attachment.id,
        other.attachment.originalName,
        other.channel.id,
        other.channel.config.serverUrl,
        other.channel.config.topic,
        other.userId,
      ]) {
        expect(text).not.toContain(value);
      }
      expect(text).toContain(me.vehicle.plate);
      const names = [...entries.keys()];
      expect(
        names.some((name) => name.includes(other.vehicle.id) || name.includes(other.attachment.id)),
      ).toBe(false);
      const hashes = [...entries.values()].map(sha256);
      expect(hashes).not.toContain(sha256(other.file));
      expect(hashes).toContain(sha256(me.file));
    }
  });

  it('never exports secrets', async () => {
    const { app, db } = await createTestApp();
    const user = await seedUser(app, 'ada@example.com', 'ada');
    const gotify = await user.api.post('/api/notification-channels', {
      type: 'gotify',
      config: { serverUrl: 'https://gotify.example.com', token: 'gotify-secret-token' },
    });
    const webhook = await user.api.post('/api/notification-channels', {
      type: 'webhook',
      config: { url: 'https://hooks.example.com/ikrive', token: 'webhook-secret-token' },
    });
    const share = await user.api.post(`/api/vehicles/${user.vehicle.id}/report-shares`, {});
    const shareToken = /\/([^/]+)$/.exec(new URL(share.url).pathname)?.[1] ?? '';
    const feed = await user.api.postOk('/api/settings/calendar-feed');
    const feedToken = /\/([^/]+)\.ics$/.exec(new URL(feed.url).pathname)?.[1] ?? '';
    expect(shareToken).toHaveLength(80);
    expect(feedToken).toHaveLength(80);
    db.insert(notifications)
      .values({
        userId: user.userId,
        vehicleId: user.vehicle.id,
        type: 'schedule_due_soon',
        title: 'notification-title-secret',
        dedupeKey: 'test:notification-dedupe-key',
      })
      .run();

    const { document, text } = await download(app, user.cookie);

    const shareRow = db.select().from(reportShares).where(eq(reportShares.id, share.id)).get();
    const feedRow = db.select().from(calendarFeeds).where(eq(calendarFeeds.userId, user.userId)).get();
    const passwordHash = db.select().from(account).where(eq(account.userId, user.userId)).get()?.password;
    const sessionToken = db.select().from(session).where(eq(session.userId, user.userId)).get()?.token;
    const storageKey = db
      .select()
      .from(attachments)
      .where(eq(attachments.id, user.attachment.id))
      .get()?.storageKey;
    const photoKey = db.select().from(vehicles).where(eq(vehicles.id, user.vehicle.id)).get()?.photo;
    const cookieValue = user.cookie.split('=').slice(1).join('=');

    const secrets = [
      'gotify-secret-token',
      'webhook-secret-token',
      shareToken,
      shareRow?.selector,
      shareRow?.verifierHash,
      share.id,
      feedToken,
      feedRow?.selector,
      feedRow?.verifierHash,
      passwordHash,
      sessionToken,
      cookieValue,
      storageKey,
      photoKey,
      'notification-title-secret',
      'notification-dedupe-key',
    ];
    for (const secret of secrets) {
      expect(secret).toBeTruthy();
      expect(text).not.toContain(secret);
    }
    for (const key of [
      'password',
      'token',
      'selector',
      'verifierHash',
      'storageKey',
      'photo',
      'ownerId',
      'userId',
      'lastError',
      'reportShares',
      'notifications',
      'calendarFeed',
    ]) {
      expect(text).not.toContain(`"${key}"`);
    }
    expect(
      document.notificationChannels.map(({ type, hasToken, config }) => ({ type, hasToken, config })),
    ).toEqual([
      {
        type: 'ntfy',
        hasToken: false,
        config: { serverUrl: user.channel.config.serverUrl, topic: 'topic-ada' },
      },
      { type: 'gotify', hasToken: true, config: { serverUrl: 'https://gotify.example.com' } },
      { type: 'webhook', hasToken: true, config: { url: 'https://hooks.example.com/ikrive' } },
    ]);
    expect([gotify.hasToken, webhook.hasToken]).toEqual([true, true]);
  });

  describe('streaming', () => {
    it('opens files lazily and one at a time', async () => {
      const { app, db, dataDir } = await createTestApp();
      const user = await seedUser(app, 'ada@example.com', 'ada');
      const url = `/api/vehicles/${user.vehicle.id}/maintenance/${user.record.id}/attachments`;
      await user.api.upload(url, 'POST', pdf('second'), 'second.pdf', 'application/pdf');
      await user.api.upload(url, 'POST', pdf('third'), 'third.pdf', 'application/pdf');

      const storage = createFileStorage(join(dataDir, 'uploads'));
      let reads = 0;
      let open = 0;
      let maxOpen = 0;
      const service = createDataExportService({
        repo: createDataExportRepository(db),
        settings: createSettingsService(createSettingsRepository(db)),
        storage: {
          exists: storage.exists,
          read: (key: string) => {
            reads += 1;
            open += 1;
            maxOpen = Math.max(maxOpen, open);
            const stream = storage.read(key);
            stream.on('close', () => {
              open -= 1;
            });
            return stream;
          },
        },
        log: { warn: vi.fn(), error: vi.fn() },
      });

      const { stream, document } = await service.export(user.userId);
      expect(reads).toBe(0);

      const entries = await readZip(await collect(stream));

      // Three attachments and the photo, opened one after the other.
      expect(reads).toBe(4);
      expect(maxOpen).toBe(1);
      expect(entries.size).toBe(5);
      expect(referencedPaths(document)).toHaveLength(4);
    });

    it('cuts the download short when a file cannot be read', async () => {
      const { app, db, dataDir } = await createTestApp();
      const user = await seedUser(app, 'ada@example.com', 'ada');
      const log = { warn: vi.fn(), error: vi.fn() };
      const service = createDataExportService({
        repo: createDataExportRepository(db),
        settings: createSettingsService(createSettingsRepository(db)),
        // The file is there when checked but fails on open (deleted meanwhile, EACCES…).
        storage: {
          exists: async () => true,
          read: () => createReadStream(join(dataDir, 'uploads', 'gone.pdf')),
        },
        log,
      });

      const { stream } = await service.export(user.userId);

      await expect(collect(stream)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.objectContaining({ code: 'ENOENT' }) }),
        'export: file read failed',
      );
      // The process is still alive and the next export works.
      const { entries } = await download(app, user.cookie);
      expect(entries.size).toBe(3);
    });

    it('closes the open file when the download is aborted', async () => {
      const { app, db } = await createTestApp();
      const user = await seedUser(app, 'ada@example.com', 'ada');
      let output: Readable | null = null;
      let fileClosed: Promise<void> | null = null;
      const service = createDataExportService({
        repo: createDataExportRepository(db),
        settings: createSettingsService(createSettingsRepository(db)),
        storage: {
          exists: async () => true,
          read: () => {
            // A file that never ends on its own: only destroying it closes it.
            const file = new Readable({ read() {} });
            fileClosed ??= new Promise((resolve) => file.once('close', () => resolve()));
            // The client goes away while the file is being copied.
            setImmediate(() => output?.destroy());
            return file;
          },
        },
        log: { warn: vi.fn(), error: vi.fn() },
      });

      const { stream } = await service.export(user.userId);
      output = stream;
      stream.resume();

      await vi.waitFor(() => expect(fileClosed).not.toBeNull());
      await fileClosed;
      expect(stream.destroyed).toBe(true);
    });

    it('skips files missing on disk', async () => {
      const lines: string[] = [];
      const { app, db, dataDir } = await createTestApp(
        {},
        { logStream: { write: (line) => lines.push(line) } },
      );
      const user = await seedUser(app, 'ada@example.com', 'ada');
      const storageKey = db
        .select()
        .from(attachments)
        .where(eq(attachments.id, user.attachment.id))
        .get()?.storageKey;
      const photoKey = db.select().from(vehicles).where(eq(vehicles.id, user.vehicle.id)).get()?.photo;
      rmSync(join(dataDir, 'uploads', storageKey ?? 'missing'));
      rmSync(join(dataDir, 'uploads', photoKey ?? 'missing'));

      const { document, entries } = await download(app, user.cookie);

      const [vehicle] = document.vehicles;
      expect(vehicle?.photoPath).toBeNull();
      expect(vehicle?.maintenanceRecords[0]?.attachments).toEqual([]);
      expect([...entries.keys()]).toEqual(['data.json']);
      const warnings = lines
        .map(
          (line) =>
            JSON.parse(line) as { level: number; msg: string; attachmentId?: string; vehicleId?: string },
        )
        .filter((line) => line.msg === 'export: missing file');
      expect(warnings).toEqual([
        expect.objectContaining({ level: 40, attachmentId: user.attachment.id }),
        expect.objectContaining({ level: 40, vehicleId: user.vehicle.id }),
      ]);
    });
  });
});
