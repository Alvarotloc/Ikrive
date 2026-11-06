import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { attachmentSchema } from '@ikrive/shared';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { attachments } from '../src/db/schema';
import { createTestApp, incompleteMultipart, signUp } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];
type Response = Awaited<ReturnType<TestApp['inject']>>;

const pdf = () =>
  Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');

const png = (width = 64, height = 32) =>
  sharp({ create: { width, height, channels: 3, background: '#c5e8e0' } })
    .png()
    .toBuffer();

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

/** Multipart body with one part. `filename: null` sends a plain field instead of a file. */
function multipart(data: Buffer, filename: string | null = 'factura.pdf', mimetype = 'application/pdf') {
  const boundary = '----ikrive-test-boundary';
  const disposition =
    filename === null
      ? 'form-data; name="note"'
      : `form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimetype}`;
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: ${disposition}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

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

async function createRecord(app: TestApp, cookie: string, vehicleId: string) {
  const response = await app.inject({
    method: 'POST',
    url: `/api/vehicles/${vehicleId}/maintenance`,
    headers: { cookie },
    payload: { date: '2025-05-10', category: 'oil_change', title: 'Cambio de aceite' },
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

/** Shortcuts for the attachment endpoints of one maintenance record. */
function client(app: TestApp, cookie: string, vehicleId: string, recordId: string) {
  const base = `/api/vehicles/${vehicleId}/maintenance/${recordId}/attachments`;
  const headers = { cookie };
  return {
    base,
    list: () => app.inject({ method: 'GET', url: base, headers }),
    upload: (data: Buffer, filename?: string | null, mimetype?: string) => {
      const body = multipart(data, filename, mimetype);
      return app.inject({
        method: 'POST',
        url: base,
        headers: { ...headers, ...body.headers },
        payload: body.payload,
      });
    },
    download: (id: string) => app.inject({ method: 'GET', url: `${base}/${id}`, headers }),
    view: (id: string, query = 'inline=1') =>
      app.inject({ method: 'GET', url: `${base}/${id}?${query}`, headers }),
    thumbnail: (id: string) => app.inject({ method: 'GET', url: `${base}/${id}/thumbnail`, headers }),
    remove: (id: string) => app.inject({ method: 'DELETE', url: `${base}/${id}`, headers }),
  };
}

async function setup(env: Record<string, string> = {}) {
  const { app, db, dataDir } = await createTestApp(env);
  const { cookie } = await signUp(app);
  const vehicleId = await createVehicle(app, cookie);
  const recordId = await createRecord(app, cookie, vehicleId);
  const attachmentsDir = join(dataDir, 'uploads', 'attachments');
  const storedFiles = () => (existsSync(attachmentsDir) ? readdirSync(attachmentsDir) : []);
  return { app, db, cookie, vehicleId, recordId, storedFiles, api: client(app, cookie, vehicleId, recordId) };
}

const IMAGE_POLICY =
  "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; sandbox";
const PDF_POLICY =
  "default-src 'none'; object-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

const expectProblem = (response: Response, status: number) => {
  expect(response.statusCode).toBe(status);
  expect(response.headers['content-type']).toContain('application/problem+json');
  expect(response.json()).toMatchObject({ status });
};

describe('maintenance attachments', () => {
  it('uploads several invoices to a maintenance record', async () => {
    const { api } = await setup();
    const invoice = pdf();
    const photo = await png();

    const first = await api.upload(invoice, 'Factura taller.pdf');
    expect(first.statusCode).toBe(201);
    const firstBody = attachmentSchema.parse(first.json());
    expect(firstBody).toMatchObject({
      originalName: 'Factura taller.pdf',
      mimeType: 'application/pdf',
      size: invoice.length,
      sha256: sha256(invoice),
      url: `${api.base}/${firstBody.id}`,
      thumbnailUrl: null,
    });

    const second = await api.upload(photo, 'ticket.png', 'image/png');
    expect(second.statusCode).toBe(201);
    const secondBody = attachmentSchema.parse(second.json());
    expect(secondBody).toMatchObject({
      originalName: 'ticket.png',
      mimeType: 'image/png',
      size: photo.length,
      sha256: sha256(photo),
      url: `${api.base}/${secondBody.id}`,
      thumbnailUrl: `${api.base}/${secondBody.id}/thumbnail`,
    });

    const list = await api.list();
    expect(list.statusCode).toBe(200);
    expect(list.json().map((attachment: { id: string }) => attachment.id)).toEqual([
      firstBody.id,
      secondBody.id,
    ]);
  });

  it('stores files under uploads/attachments with a random name', async () => {
    const { api, storedFiles } = await setup();
    expect((await api.upload(pdf(), 'factura.pdf')).statusCode).toBe(201);
    expect((await api.upload(await png(), 'ticket.png', 'image/png')).statusCode).toBe(201);

    const files = storedFiles().sort();
    expect(files).toHaveLength(2);
    for (const file of files) {
      expect(file).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png)$/);
      expect(file).not.toContain('factura');
      expect(file).not.toContain('ticket');
    }
  });

  it('detects the type by content', async () => {
    const { api, storedFiles } = await setup();
    const response = await api.upload(await png(), 'factura.pdf', 'application/pdf');
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ originalName: 'factura.pdf', mimeType: 'image/png' });
    expect(storedFiles()[0]).toMatch(/\.png$/);
  });

  it('rejects unsupported files', async () => {
    const { api, db, storedFiles } = await setup();
    const gif = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#2d3a3a' } })
      .gif()
      .toBuffer();

    expectProblem(await api.upload(Buffer.from('not really a PDF'), 'factura.pdf', 'application/pdf'), 415);
    expectProblem(await api.upload(gif, 'ticket.gif', 'image/gif'), 415);

    expect(db.select().from(attachments).all()).toHaveLength(0);
    expect(storedFiles()).toHaveLength(0);
  });

  it('rejects corrupt images', async () => {
    const { api, db, storedFiles } = await setup();
    const corrupt = Buffer.concat([(await png()).subarray(0, 8), Buffer.from('definitely not image data')]);

    expectProblem(await api.upload(corrupt, 'ticket.png', 'image/png'), 415);
    expect(db.select().from(attachments).all()).toHaveLength(0);
    expect(storedFiles()).toHaveLength(0);
  });

  it('requires a file', async () => {
    const { api } = await setup();
    expectProblem(await api.upload(Buffer.from('hello'), null), 400);
  });

  it('rejects files larger than MAX_UPLOAD_MB', async () => {
    const { api, db, storedFiles } = await setup({ MAX_UPLOAD_MB: '1' });
    const big = Buffer.concat([pdf(), Buffer.alloc(1024 * 1024 + 1 - pdf().length, 0x20)]);
    expect(big.length).toBe(1024 * 1024 + 1);

    expectProblem(await api.upload(big, 'factura.pdf'), 413);
    expect(storedFiles()).toHaveLength(0);
    expect(db.select().from(attachments).all()).toHaveLength(0);
    expect((await api.list()).json()).toEqual([]);
  });

  it('rejects a multipart body that never completes', async () => {
    const { app, db, cookie, api, storedFiles } = await setup();
    const expectIncomplete = (response: Response) => {
      expectProblem(response, 400);
      expect(response.json().detail).toBe('The upload ended before the file was complete');
    };
    const send = (payload: Buffer | NodeJS.ReadableStream, length?: number) =>
      app.inject({
        method: 'POST',
        url: api.base,
        headers: {
          cookie,
          ...multipart(Buffer.alloc(0)).headers,
          ...(length === undefined ? {} : { 'content-length': String(length) }),
        },
        payload,
      });

    const big = Buffer.concat([pdf(), Buffer.alloc(64 * 1024, 0x20)]);
    for (const data of [pdf(), big]) {
      expectIncomplete(await send(incompleteMultipart(multipart(data).payload).whole));
    }
    const { whole, chunked } = incompleteMultipart(multipart(big).payload);
    expectIncomplete(await send(chunked(), whole.length));

    expect(storedFiles()).toHaveLength(0);
    expect(db.select().from(attachments).all()).toHaveLength(0);
    expect((await api.list()).json()).toEqual([]);
  });

  it('downloads the original with its name and mime', async () => {
    const { api } = await setup();
    const invoice = pdf();
    const { id } = (await api.upload(invoice, 'Factura taller ñ.pdf')).json();

    const response = await api.download(id);
    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.equals(invoice)).toBe(true);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-length']).toBe(String(invoice.length));
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="Factura taller _.pdf"; filename*=UTF-8''Factura%20taller%20%C3%B1.pdf`,
    );
    expect(response.headers['cache-control']).toBe('private, max-age=31536000, immutable');
  });

  it('serves an attachment inline with a safe policy for user content', async () => {
    const { api } = await setup();
    const invoice = pdf();
    const document = (await api.upload(invoice, 'Factura taller ñ.pdf')).json();

    const response = await api.view(document.id);
    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.equals(invoice)).toBe(true);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-length']).toBe(String(invoice.length));
    expect(response.headers['content-disposition']).toBe(
      `inline; filename="Factura taller _.pdf"; filename*=UTF-8''Factura%20taller%20%C3%B1.pdf`,
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toBe(PDF_POLICY);
    expect(response.headers['cache-control']).toBe('private, max-age=31536000, immutable');

    const photo = await png();
    const image = (await api.upload(photo, 'ticket.png', 'image/png')).json();
    const imageResponse = await api.view(image.id);
    expect(imageResponse.statusCode).toBe(200);
    expect(imageResponse.rawPayload.equals(photo)).toBe(true);
    expect(imageResponse.headers['content-type']).toBe('image/png');
    expect(imageResponse.headers['content-disposition']).toBe(
      `inline; filename="ticket.png"; filename*=UTF-8''ticket.png`,
    );
    expect(imageResponse.headers['x-content-type-options']).toBe('nosniff');
    expect(imageResponse.headers['content-security-policy']).toBe(IMAGE_POLICY);
  });

  it('serves inline the type detected by content', async () => {
    const { api } = await setup();
    const disguised = (await api.upload(await png(), 'factura.pdf', 'application/pdf')).json();

    const response = await api.view(disguised.id);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['content-disposition']).toBe(
      `inline; filename="factura.pdf"; filename*=UTF-8''factura.pdf`,
    );
    expect(response.headers['content-security-policy']).toBe(IMAGE_POLICY);
  });

  it('keeps downloading by default', async () => {
    const { api } = await setup();
    const invoice = pdf();
    const { id } = (await api.upload(invoice, 'factura.pdf')).json();
    const attachmentDisposition = `attachment; filename="factura.pdf"; filename*=UTF-8''factura.pdf`;

    for (const response of [await api.download(id), await api.view(id, 'inline=0')]) {
      expect(response.statusCode).toBe(200);
      expect(response.rawPayload.equals(invoice)).toBe(true);
      expect(response.headers['content-disposition']).toBe(attachmentDisposition);
    }
  });

  it('rejects an invalid inline value', async () => {
    const { api } = await setup();
    const { id } = (await api.upload(pdf(), 'factura.pdf')).json();

    for (const query of ['inline=true', 'inline=yes', 'inline=']) {
      const response = await api.view(id, query);
      expectProblem(response, 400);
      expect(response.headers['content-disposition']).toBeUndefined();
    }
  });

  it('requires a session to view an attachment inline', async () => {
    const { app, api } = await setup();
    const { id } = (await api.upload(pdf(), 'factura.pdf')).json();

    const response = await app.inject({ method: 'GET', url: `${api.base}/${id}?inline=1` });
    expectProblem(response, 401);
    expect(response.headers['content-disposition']).toBeUndefined();
  });

  it('serves a WebP thumbnail for images only', async () => {
    const { api } = await setup();
    const image = (await api.upload(await png(1000, 500), 'ticket.png', 'image/png')).json();

    const thumbnail = await api.thumbnail(image.id);
    expect(thumbnail.statusCode).toBe(200);
    expect(thumbnail.headers['content-type']).toBe('image/webp');
    const metadata = await sharp(thumbnail.rawPayload).metadata();
    expect(metadata.format).toBe('webp');
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(320);
    expect(metadata.width).toBe(320);

    const document = (await api.upload(pdf(), 'factura.pdf')).json();
    expect(document.thumbnailUrl).toBeNull();
    expectProblem(await api.thumbnail(document.id), 404);
  });

  it('deletes an attachment and its file', async () => {
    const { api, storedFiles } = await setup();
    const kept = (await api.upload(pdf(), 'kept.pdf')).json();
    const removed = (await api.upload(await png(), 'removed.png', 'image/png')).json();
    expect(storedFiles()).toHaveLength(2);

    const response = await api.remove(removed.id);
    expect(response.statusCode).toBe(204);
    expect((await api.list()).json().map((a: { id: string }) => a.id)).toEqual([kept.id]);
    expect(storedFiles()).toHaveLength(1);
    expect(storedFiles()[0]).toMatch(/\.pdf$/);
    expectProblem(await api.download(removed.id), 404);
  });

  it('deletes attachments with their maintenance record', async () => {
    const { app, db, cookie, vehicleId, recordId, api, storedFiles } = await setup();
    const otherRecordId = await createRecord(app, cookie, vehicleId);
    const other = client(app, cookie, vehicleId, otherRecordId);
    await api.upload(pdf(), 'a.pdf');
    await api.upload(await png(), 'b.png', 'image/png');
    const kept = (await other.upload(pdf(), 'c.pdf')).json();

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/vehicles/${vehicleId}/maintenance/${recordId}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(204);
    expect(
      db
        .select()
        .from(attachments)
        .all()
        .map((row) => row.id),
    ).toEqual([kept.id]);
    expect(storedFiles()).toHaveLength(1);
  });

  it('deletes attachments with their vehicle', async () => {
    const { app, db, cookie, vehicleId, api, storedFiles } = await setup();
    const secondRecordId = await createRecord(app, cookie, vehicleId);
    await api.upload(pdf(), 'a.pdf');
    await client(app, cookie, vehicleId, secondRecordId).upload(await png(), 'b.png', 'image/png');
    const otherVehicleId = await createVehicle(app, cookie);
    const otherRecordId = await createRecord(app, cookie, otherVehicleId);
    const kept = (await client(app, cookie, otherVehicleId, otherRecordId).upload(pdf(), 'c.pdf')).json();
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
        .from(attachments)
        .all()
        .map((row) => row.id),
    ).toEqual([kept.id]);
    expect(storedFiles()).toHaveLength(1);
  });

  it("hides other users' attachments", async () => {
    const { app, cookie, vehicleId, recordId, api } = await setup();
    const invoice = pdf();
    const attachment = (await api.upload(invoice, 'factura.pdf')).json();

    // Another user cannot reach any endpoint of the owner's record.
    const { cookie: intruder } = await signUp(app, 'mallory@example.com', 'Mallory');
    const foreign = client(app, intruder, vehicleId, recordId);
    expectProblem(await foreign.list(), 404);
    expectProblem(await foreign.upload(pdf(), 'x.pdf'), 404);
    expectProblem(await foreign.download(attachment.id), 404);
    expectProblem(await foreign.view(attachment.id), 404);
    expectProblem(await foreign.thumbnail(attachment.id), 404);
    expectProblem(await foreign.remove(attachment.id), 404);

    // A record of another of the owner's vehicles does not belong to this vehicle.
    const otherVehicleId = await createVehicle(app, cookie);
    const otherVehicleRecordId = await createRecord(app, cookie, otherVehicleId);
    const mismatched = client(app, cookie, vehicleId, otherVehicleRecordId);
    expectProblem(await mismatched.list(), 404);
    expectProblem(await mismatched.upload(pdf(), 'x.pdf'), 404);
    expectProblem(await mismatched.download(attachment.id), 404);
    expectProblem(await mismatched.view(attachment.id), 404);
    expectProblem(await mismatched.thumbnail(attachment.id), 404);
    expectProblem(await mismatched.remove(attachment.id), 404);

    // An attachment of another record of the same vehicle is not reachable from this one.
    const siblingRecordId = await createRecord(app, cookie, vehicleId);
    const sibling = client(app, cookie, vehicleId, siblingRecordId);
    expect((await sibling.list()).json()).toEqual([]);
    expectProblem(await sibling.download(attachment.id), 404);
    expectProblem(await sibling.view(attachment.id), 404);
    expectProblem(await sibling.thumbnail(attachment.id), 404);
    expectProblem(await sibling.remove(attachment.id), 404);

    // The owner's attachment is untouched.
    const download = await api.download(attachment.id);
    expect(download.statusCode).toBe(200);
    expect(download.rawPayload.equals(invoice)).toBe(true);
    expect((await api.list()).json()).toHaveLength(1);
  });
});
