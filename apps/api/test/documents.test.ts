import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { addDays, attachmentSchema, todayIn, vehicleDocumentSchema } from '@ikrive/shared';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { attachments, vehicleDocuments } from '../src/db/schema';
import { createTestApp, signUp } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];
type Response = Awaited<ReturnType<TestApp['inject']>>;

const insurance = {
  type: 'insurance',
  title: 'Póliza Mapfre',
  expiryDate: '2099-03-01',
  warnDays: 15,
} as const;

const pdf = () =>
  Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');

const png = (width = 64, height = 32) =>
  sharp({ create: { width, height, channels: 3, background: '#c5e8e0' } })
    .png()
    .toBuffer();

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

const IMAGE_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; sandbox";
const PDF_POLICY =
  "default-src 'none'; object-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/** Multipart body with one file part in the `file` field. */
function multipart(data: Buffer, filename = 'poliza.pdf', mimetype = 'application/pdf') {
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

const expectProblem = (response: Response, status: number, detail?: string) => {
  expect(response.statusCode).toBe(status);
  expect(response.headers['content-type']).toContain('application/problem+json');
  expect(response.json()).toMatchObject(detail ? { status, detail } : { status });
};

async function createVehicle(app: TestApp, cookie: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/vehicles',
    headers: { cookie },
    payload: { make: 'Seat', model: 'León' },
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

/** Shortcuts for the document endpoints of one vehicle. */
function client(app: TestApp, cookie: string, vehicleId: string) {
  const base = `/api/vehicles/${vehicleId}/documents`;
  const headers = { cookie };
  return {
    base,
    list: () => app.inject({ method: 'GET', url: base, headers }),
    create: (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: base, headers, payload }),
    get: (documentId: string) => app.inject({ method: 'GET', url: `${base}/${documentId}`, headers }),
    patch: (documentId: string, payload: Record<string, unknown>) =>
      app.inject({ method: 'PATCH', url: `${base}/${documentId}`, headers, payload }),
    remove: (documentId: string) => app.inject({ method: 'DELETE', url: `${base}/${documentId}`, headers }),
  };
}

/** Shortcuts for the attachment endpoints of one document. */
function files(app: TestApp, cookie: string, vehicleId: string, documentId: string) {
  const base = `/api/vehicles/${vehicleId}/documents/${documentId}/attachments`;
  const headers = { cookie };
  return {
    base,
    list: () => app.inject({ method: 'GET', url: base, headers }),
    upload: (data: Buffer, filename?: string, mimetype?: string) => {
      const body = multipart(data, filename, mimetype);
      return app.inject({
        method: 'POST',
        url: base,
        headers: { ...headers, ...body.headers },
        payload: body.payload,
      });
    },
    download: (id: string) => app.inject({ method: 'GET', url: `${base}/${id}`, headers }),
    view: (id: string) => app.inject({ method: 'GET', url: `${base}/${id}?inline=1`, headers }),
    thumbnail: (id: string) => app.inject({ method: 'GET', url: `${base}/${id}/thumbnail`, headers }),
    remove: (id: string) => app.inject({ method: 'DELETE', url: `${base}/${id}`, headers }),
  };
}

async function setup(env: Record<string, string> = {}) {
  const { app, db, dataDir } = await createTestApp(env);
  const { cookie } = await signUp(app);
  const vehicleId = await createVehicle(app, cookie);
  const api = client(app, cookie, vehicleId);
  const attachmentsDir = join(dataDir, 'uploads', 'attachments');
  const storedFiles = () => (existsSync(attachmentsDir) ? readdirSync(attachmentsDir) : []);
  const createDocument = async (payload: Record<string, unknown> = insurance) => {
    const response = await api.create(payload);
    expect(response.statusCode).toBe(201);
    return response.json() as { id: string };
  };
  return { app, db, cookie, vehicleId, api, storedFiles, createDocument };
}

describe('vehicle documents', () => {
  it('creates, lists, reads, updates and deletes a document', async () => {
    const { db, vehicleId, api } = await setup();

    const created = await api.create({ ...insurance, notes: '  Todo riesgo ' });
    expect(created.statusCode).toBe(201);
    const document = created.json();
    expect(vehicleDocumentSchema.parse(document)).toEqual(document);
    expect(document).toEqual({
      id: expect.any(String),
      vehicleId,
      type: 'insurance',
      title: 'Póliza Mapfre',
      expiryDate: '2099-03-01',
      warnDays: 15,
      notes: 'Todo riesgo',
      status: 'valid',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(
      db.select().from(vehicleDocuments).where(eq(vehicleDocuments.id, document.id)).get(),
    ).toMatchObject({
      vehicleId,
      type: 'insurance',
      title: 'Póliza Mapfre',
      expiryDate: '2099-03-01',
      warnDays: 15,
      notes: 'Todo riesgo',
    });

    // Defaults: no expiry date and 30 warning days.
    const registration = (await api.create({ type: 'registration', title: 'Permiso de circulación' })).json();
    expect(registration).toMatchObject({ expiryDate: null, warnDays: 30, notes: null, status: 'valid' });
    // Same expiry date: the oldest first.
    const older = (await api.create({ type: 'inspection', title: 'ITV', expiryDate: '2099-03-01' })).json();
    db.update(vehicleDocuments)
      .set({ createdAt: new Date('2020-01-01T00:00:00Z') })
      .where(eq(vehicleDocuments.id, older.id))
      .run();
    const sooner = (await api.create({ type: 'other', title: 'Tarjeta', expiryDate: '2098-01-01' })).json();
    const undated = (await api.create({ type: 'other', title: 'Factura de compra' })).json();

    const list = await api.list();
    expect(list.statusCode).toBe(200);
    expect(list.json().map((d: { id: string }) => d.id)).toEqual([
      sooner.id,
      older.id,
      document.id,
      registration.id,
      undated.id,
    ]);

    const read = await api.get(document.id);
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual(document);

    const updated = await api.patch(document.id, { title: 'Póliza Allianz', notes: '' });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({
      ...document,
      title: 'Póliza Allianz',
      notes: null,
      updatedAt: expect.any(String),
    });
    expect(
      db.select().from(vehicleDocuments).where(eq(vehicleDocuments.id, document.id)).get(),
    ).toMatchObject({
      title: 'Póliza Allianz',
      notes: null,
      expiryDate: '2099-03-01',
      warnDays: 15,
      type: 'insurance',
    });

    expect((await api.remove(document.id)).statusCode).toBe(204);
    expect(
      db.select().from(vehicleDocuments).where(eq(vehicleDocuments.id, document.id)).get(),
    ).toBeUndefined();
    expectProblem(await api.get(document.id), 404, 'Document not found');
    expect((await api.list()).json()).toHaveLength(4);
  });

  it("computes the status in the user's time zone", async () => {
    const { app, cookie, api } = await setup();
    // UTC-12 and UTC+14 are always on different dates: the last valid day in one is already past in the other.
    const behind = 'Etc/GMT+12';
    const ahead = 'Pacific/Kiritimati';
    const lastDay = todayIn(behind);
    const setZone = async (timezone: string) => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { cookie },
        payload: { timezone },
      });
      expect(response.statusCode).toBe(200);
    };

    await setZone(behind);
    const document = (await api.create({ ...insurance, expiryDate: lastDay, warnDays: 0 })).json();
    expect(document.status).toBe('expiring');
    const later = (await api.create({ ...insurance, expiryDate: addDays(lastDay, 10), warnDays: 9 })).json();
    expect(later.status).toBe('valid');

    await setZone(ahead);
    expect((await api.get(document.id)).json().status).toBe('expired');
    expect((await api.list()).json().map((d: { status: string }) => d.status)).toEqual([
      'expired',
      'expiring',
    ]);
  });

  it('renews a document by patching its expiry date', async () => {
    const { api } = await setup();
    const today = todayIn('Europe/Madrid');
    const expired = (await api.create({ ...insurance, expiryDate: addDays(today, -1) })).json();
    expect(expired.status).toBe('expired');

    const renewed = await api.patch(expired.id, { expiryDate: addDays(today, 365) });
    expect(renewed.statusCode).toBe(200);
    expect(renewed.json()).toMatchObject({ expiryDate: addDays(today, 365), warnDays: 15, status: 'valid' });

    const cleared = await api.patch(expired.id, { expiryDate: null });
    expect(cleared.json()).toMatchObject({ expiryDate: null, warnDays: 15, status: 'valid' });
  });

  it('rejects invalid payloads without writing', async () => {
    const { db, api } = await setup();
    const { title: _title, ...withoutTitle } = insurance;
    const invalid = [
      { ...insurance, type: 'passport' },
      withoutTitle,
      { ...insurance, title: '   ' },
      { ...insurance, title: 'x'.repeat(121) },
      { ...insurance, expiryDate: '01/03/2099' },
      { ...insurance, warnDays: 1.5 },
      { ...insurance, warnDays: -1 },
      { ...insurance, warnDays: 366 },
      { ...insurance, notes: 'x'.repeat(2001) },
    ];
    for (const payload of invalid) {
      const response = await api.create(payload);
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json()).toMatchObject({ status: 400, title: 'Validation failed' });
    }
    expect(db.select().from(vehicleDocuments).all()).toEqual([]);

    const document = (await api.create(insurance)).json();
    for (const payload of [
      { type: 'passport' },
      { title: '' },
      { expiryDate: 'tomorrow' },
      { warnDays: 400 },
      { notes: 'x'.repeat(2001) },
    ]) {
      const response = await api.patch(document.id, payload);
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
    }
    expect((await api.get(document.id)).json()).toEqual(document);
  });

  it("hides other users' vehicles and documents", async () => {
    const { app } = await createTestApp();
    const owner = await signUp(app, 'owner@example.com');
    const intruder = await signUp(app, 'intruder@example.com');
    const vehicleId = await createVehicle(app, owner.cookie);
    const ownerApi = client(app, owner.cookie, vehicleId);
    const document = (await ownerApi.create(insurance)).json();

    const base = ownerApi.base;
    const attempts = [
      { method: 'GET', url: base },
      { method: 'POST', url: base, payload: insurance },
      { method: 'GET', url: `${base}/${document.id}` },
      { method: 'PATCH', url: `${base}/${document.id}`, payload: { title: 'x' } },
      { method: 'DELETE', url: `${base}/${document.id}` },
    ] as const;
    for (const attempt of attempts) {
      const response = await app.inject({ ...attempt, headers: { cookie: intruder.cookie } });
      expect(response.statusCode, `${attempt.method} ${attempt.url}`).toBe(404);
      expectProblem(response, 404, 'Vehicle not found');
    }

    // A document id from another vehicle, owned by the same user or by someone else.
    const otherVehicleApi = client(app, owner.cookie, await createVehicle(app, owner.cookie));
    const intruderVehicleId = await createVehicle(app, intruder.cookie);
    const intruderDocument = (await client(app, intruder.cookie, intruderVehicleId).create(insurance)).json();
    for (const [api, documentId] of [
      [otherVehicleApi, document.id],
      [ownerApi, intruderDocument.id],
    ] as const) {
      for (const response of [
        await api.get(documentId),
        await api.patch(documentId, { title: 'x' }),
        await api.remove(documentId),
      ]) {
        expectProblem(response, 404, 'Document not found');
      }
    }
    expect((await ownerApi.get(document.id)).json()).toEqual(document);
  });
});

describe('document attachments', () => {
  it('uploads several files to a document', async () => {
    const { app, cookie, vehicleId, createDocument, storedFiles } = await setup();
    const { id: documentId } = await createDocument();
    const api = files(app, cookie, vehicleId, documentId);
    const policy = pdf();
    const photo = await png();

    const first = await api.upload(policy, 'Póliza.pdf');
    expect(first.statusCode).toBe(201);
    const firstBody = attachmentSchema.parse(first.json());
    expect(firstBody).toEqual({
      id: expect.any(String),
      originalName: 'Póliza.pdf',
      mimeType: 'application/pdf',
      size: policy.length,
      sha256: sha256(policy),
      url: `/api/vehicles/${vehicleId}/documents/${documentId}/attachments/${firstBody.id}`,
      thumbnailUrl: null,
      createdAt: expect.any(String),
    });

    const second = attachmentSchema.parse((await api.upload(photo, 'foto.png', 'image/png')).json());
    expect(second).toMatchObject({
      mimeType: 'image/png',
      thumbnailUrl: `${api.base}/${second.id}/thumbnail`,
    });

    const list = await api.list();
    expect(list.statusCode).toBe(200);
    expect(list.json().map((a: { id: string }) => a.id)).toEqual([firstBody.id, second.id]);
    expect(storedFiles()).toHaveLength(2);
  });

  it('downloads and serves inline a document attachment with the user content policy', async () => {
    const { app, cookie, vehicleId, createDocument } = await setup();
    const api = files(app, cookie, vehicleId, (await createDocument()).id);
    const policy = pdf();
    const { id } = (await api.upload(policy, 'Póliza ñ.pdf')).json();

    const download = await api.download(id);
    expect(download.statusCode).toBe(200);
    expect(download.rawPayload.equals(policy)).toBe(true);
    expect(download.headers['content-type']).toBe('application/pdf');
    expect(download.headers['content-length']).toBe(String(policy.length));
    expect(download.headers['content-disposition']).toBe(
      `attachment; filename="P_liza _.pdf"; filename*=UTF-8''P%C3%B3liza%20%C3%B1.pdf`,
    );
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(download.headers['content-security-policy']).toBe(PDF_POLICY);
    expect(download.headers['cache-control']).toBe('private, max-age=31536000, immutable');

    const inline = await api.view(id);
    expect(inline.statusCode).toBe(200);
    expect(inline.rawPayload.equals(policy)).toBe(true);
    expect(inline.headers['content-disposition']).toBe(
      `inline; filename="P_liza _.pdf"; filename*=UTF-8''P%C3%B3liza%20%C3%B1.pdf`,
    );

    const image = (await api.upload(await png(), 'foto.png', 'image/png')).json();
    const imageResponse = await api.view(image.id);
    expect(imageResponse.headers['content-type']).toBe('image/png');
    expect(imageResponse.headers['x-content-type-options']).toBe('nosniff');
    expect(imageResponse.headers['content-security-policy']).toBe(IMAGE_POLICY);

    const invalid = await app.inject({
      method: 'GET',
      url: `${api.base}/${id}?inline=yes`,
      headers: { cookie },
    });
    expectProblem(invalid, 400);
  });

  it('serves a WebP thumbnail for document images only', async () => {
    const { app, cookie, vehicleId, createDocument } = await setup();
    const api = files(app, cookie, vehicleId, (await createDocument()).id);
    const image = (await api.upload(await png(1000, 500), 'foto.png', 'image/png')).json();

    const thumbnail = await api.thumbnail(image.id);
    expect(thumbnail.statusCode).toBe(200);
    expect(thumbnail.headers['content-type']).toBe('image/webp');
    const metadata = await sharp(thumbnail.rawPayload).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(320);

    const policy = (await api.upload(pdf(), 'poliza.pdf')).json();
    expect(policy.thumbnailUrl).toBeNull();
    expectProblem(await api.thumbnail(policy.id), 404);
  });

  it('rejects unsupported and corrupt files with 415 and stores nothing', async () => {
    const { app, db, cookie, vehicleId, createDocument, storedFiles } = await setup();
    const api = files(app, cookie, vehicleId, (await createDocument()).id);
    const gif = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#2d3a3a' } })
      .gif()
      .toBuffer();
    const corrupt = Buffer.concat([(await png()).subarray(0, 8), Buffer.from('definitely not image data')]);

    expectProblem(await api.upload(Buffer.from('not really a PDF'), 'poliza.pdf'), 415);
    expectProblem(await api.upload(gif, 'foto.gif', 'image/gif'), 415);
    expectProblem(await api.upload(corrupt, 'foto.png', 'image/png'), 415);
    expect(db.select().from(attachments).all()).toEqual([]);
    expect(storedFiles()).toEqual([]);
  });

  it('rejects files larger than MAX_UPLOAD_MB', async () => {
    const { app, db, cookie, vehicleId, createDocument, storedFiles } = await setup({ MAX_UPLOAD_MB: '1' });
    const api = files(app, cookie, vehicleId, (await createDocument()).id);
    const big = Buffer.concat([pdf(), Buffer.alloc(1024 * 1024 + 1 - pdf().length, 0x20)]);

    expectProblem(await api.upload(big, 'poliza.pdf'), 413);
    expect(db.select().from(attachments).all()).toEqual([]);
    expect(storedFiles()).toEqual([]);
    expect((await api.list()).json()).toEqual([]);
  });

  it('deletes a document attachment and its file', async () => {
    const { app, db, cookie, vehicleId, createDocument, storedFiles } = await setup();
    const api = files(app, cookie, vehicleId, (await createDocument()).id);
    const kept = (await api.upload(pdf(), 'kept.pdf')).json();
    const removed = (await api.upload(await png(), 'removed.png', 'image/png')).json();

    expect((await api.remove(removed.id)).statusCode).toBe(204);
    expect((await api.list()).json().map((a: { id: string }) => a.id)).toEqual([kept.id]);
    expect(
      db
        .select()
        .from(attachments)
        .all()
        .map((row) => row.id),
    ).toEqual([kept.id]);
    expect(storedFiles()).toHaveLength(1);
    expect(storedFiles()[0]).toMatch(/\.pdf$/);
    expectProblem(await api.download(removed.id), 404, 'Attachment not found');
  });

  it('deletes the attachments with their document', async () => {
    const { app, db, cookie, vehicleId, api, createDocument, storedFiles } = await setup();
    const document = await createDocument();
    const other = await createDocument({ type: 'inspection', title: 'ITV' });
    await files(app, cookie, vehicleId, document.id).upload(pdf(), 'a.pdf');
    await files(app, cookie, vehicleId, document.id).upload(await png(), 'b.png', 'image/png');
    const kept = (await files(app, cookie, vehicleId, other.id).upload(pdf(), 'c.pdf')).json();
    expect(storedFiles()).toHaveLength(3);

    expect((await api.remove(document.id)).statusCode).toBe(204);
    expect(
      db
        .select()
        .from(attachments)
        .all()
        .map((row) => row.id),
    ).toEqual([kept.id]);
    expect(storedFiles()).toHaveLength(1);
  });

  it('deletes documents and their files with the vehicle', async () => {
    const { app, db, cookie, vehicleId, createDocument, storedFiles } = await setup();
    const document = await createDocument();
    await files(app, cookie, vehicleId, document.id).upload(pdf(), 'a.pdf');
    const recordResponse = await app.inject({
      method: 'POST',
      url: `/api/vehicles/${vehicleId}/maintenance`,
      headers: { cookie },
      payload: { date: '2025-05-10', category: 'oil_change', title: 'Aceite' },
    });
    const recordId = (recordResponse.json() as { id: string }).id;
    const recordFile = multipart(pdf(), 'factura.pdf');
    await app.inject({
      method: 'POST',
      url: `/api/vehicles/${vehicleId}/maintenance/${recordId}/attachments`,
      headers: { cookie, ...recordFile.headers },
      payload: recordFile.payload,
    });
    const otherVehicleId = await createVehicle(app, cookie);
    const otherDocument = (await client(app, cookie, otherVehicleId).create(insurance)).json();
    const kept = (await files(app, cookie, otherVehicleId, otherDocument.id).upload(pdf(), 'c.pdf')).json();
    expect(storedFiles()).toHaveLength(3);

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/vehicles/${vehicleId}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(204);
    expect(
      db
        .select()
        .from(vehicleDocuments)
        .all()
        .map((row) => row.id),
    ).toEqual([otherDocument.id]);
    expect(
      db
        .select()
        .from(attachments)
        .all()
        .map((row) => row.id),
    ).toEqual([kept.id]);
    expect(storedFiles()).toHaveLength(1);
  });

  it('hides attachments of other documents, records and users', async () => {
    const { app, cookie, vehicleId, createDocument } = await setup();
    const document = await createDocument();
    const api = files(app, cookie, vehicleId, document.id);
    const attachment = (await api.upload(pdf(), 'poliza.pdf')).json();
    const expectAll404 = async (target: ReturnType<typeof files>, detail: string, withList = true) => {
      if (withList) {
        expectProblem(await target.list(), 404, detail);
        expectProblem(await target.upload(pdf(), 'x.pdf'), 404, detail);
      }
      expectProblem(await target.download(attachment.id), 404, detail);
      expectProblem(await target.view(attachment.id), 404, detail);
      expectProblem(await target.thumbnail(attachment.id), 404, detail);
      expectProblem(await target.remove(attachment.id), 404, detail);
    };

    // Another user cannot reach any endpoint of the owner's document.
    const { cookie: intruder } = await signUp(app, 'mallory@example.com', 'Mallory');
    await expectAll404(files(app, intruder, vehicleId, document.id), 'Vehicle not found');
    await expectAll404(files(app, cookie, 'missing', document.id), 'Vehicle not found');

    // A document of another of the owner's vehicles, or a missing one.
    const otherVehicleId = await createVehicle(app, cookie);
    await expectAll404(files(app, cookie, otherVehicleId, document.id), 'Document not found');
    await expectAll404(files(app, cookie, vehicleId, 'missing'), 'Document not found');

    // An attachment of a sibling document is not reachable from this one.
    const sibling = files(
      app,
      cookie,
      vehicleId,
      (await createDocument({ type: 'other', title: 'Otro' })).id,
    );
    expect((await sibling.list()).json()).toEqual([]);
    await expectAll404(sibling, 'Attachment not found', false);

    // A maintenance attachment is not reachable as a document attachment, nor the other way round.
    const recordResponse = await app.inject({
      method: 'POST',
      url: `/api/vehicles/${vehicleId}/maintenance`,
      headers: { cookie },
      payload: { date: '2025-05-10', category: 'oil_change', title: 'Aceite' },
    });
    const recordId = (recordResponse.json() as { id: string }).id;
    const recordBase = `/api/vehicles/${vehicleId}/maintenance/${recordId}/attachments`;
    const recordFile = multipart(pdf(), 'factura.pdf');
    const recordAttachment = (
      await app.inject({
        method: 'POST',
        url: recordBase,
        headers: { cookie, ...recordFile.headers },
        payload: recordFile.payload,
      })
    ).json() as { id: string };
    expectProblem(await api.download(recordAttachment.id), 404, 'Attachment not found');
    expectProblem(await api.remove(recordAttachment.id), 404, 'Attachment not found');
    // Under the maintenance routes, a document id is not a maintenance record.
    const asRecord = await app.inject({
      method: 'GET',
      url: `/api/vehicles/${vehicleId}/maintenance/${document.id}/attachments`,
      headers: { cookie },
    });
    expectProblem(asRecord, 404, 'Maintenance record not found');
    const crossed = await app.inject({
      method: 'GET',
      url: `${recordBase}/${attachment.id}`,
      headers: { cookie },
    });
    expectProblem(crossed, 404, 'Attachment not found');

    expect((await api.download(attachment.id)).statusCode).toBe(200);
  });
});
