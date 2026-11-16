import { createHash } from 'node:crypto';
import { attachments } from '@ikrive/db/schema';
import { attachmentSchema, type Problem, vehicleSchema } from '@ikrive/shared';
import { eq } from 'drizzle-orm';
import type { AsyncRemoteCallback } from 'drizzle-orm/sqlite-proxy';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { CORRUPT, type FakeImages, fakeImages } from '@/test/fake-images';
import { createMemoryFileStore, type MemoryFileStore } from '@/test/memory-file-store';
import { createMemorySqlite } from '@/test/memory-sqlite';
import type { DataSource } from '../types';
import { createLocalDataSource, type LocalDb, openLocalDatabase } from './index';

let db: LocalDb;
let local: DataSource;
let store: MemoryFileStore;
let images: FakeImages;
/** Every statement that reached the engine, to check that a rejected operation wrote nothing. */
let statements: string[];
/** Statements matching it fail, as a full disk or a broken database would. */
let failOn: RegExp | null;

beforeEach(async () => {
  const memory = createMemorySqlite();
  statements = [];
  failOn = null;
  const recording: AsyncRemoteCallback = async (sql, params, method) => {
    statements.push(sql);
    if (failOn?.test(sql)) throw new Error('disk I/O error');
    return memory(sql, params, method);
  };
  db = await openLocalDatabase(recording);
  statements = [];
  store = createMemoryFileStore();
  images = fakeImages();
  local = createLocalDataSource(db, { files: store, images });
});

const encode = (text: string) => new TextEncoder().encode(text);
const concat = (...parts: (number[] | string)[]) =>
  Uint8Array.from(parts.flatMap((part) => (typeof part === 'string' ? [...encode(part)] : part)));

const PDF = encode('%PDF-1.7\nfactura');
const JPEG = concat([0xff, 0xd8, 0xff, 0xe0], 'jpeg');
const PNG = concat([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'png');
const GIF = concat('GIF89a', 'gif');
const CORRUPT_PNG = concat([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], CORRUPT);
const CORRUPT_JPEG = concat([0xff, 0xd8, 0xff, 0xe0], CORRUPT);
const TEXT = encode('just some text');

const file = (data: Uint8Array, name: string, type = 'application/octet-stream') =>
  new File([data.slice()], name, { type });

/** One byte over the 20 MB of `maxUploadMb`. */
const tooBig = (name: string) => {
  const data = new Uint8Array(20 * 1024 * 1024 + 1);
  data.set(PDF);
  return file(data, name);
};

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

const writes = () => statements.filter((sql) => /^\s*(insert|update|delete|begin)/i.test(sql));

/** The problem an operation rejected with (fails the test if it resolved or threw something else). */
async function problemOf(operation: Promise<unknown>): Promise<Problem> {
  const error = await operation.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ApiError);
  return (error as ApiError).problem;
}

const notFound = (detail: string) => ({ type: 'about:blank', title: 'Not Found', status: 404, detail });

/** A vehicle with a maintenance record. */
async function vehicleWithRecord(title = 'Revisión') {
  const vehicle = await local.vehicles.create({ make: 'Seat', model: 'Ibiza' });
  const record = await local.maintenance.create(vehicle.id, { date: '2024-03-01', category: 'other', title });
  return { vehicle, record };
}

describe('local DataSource files', () => {
  it('uploads an attachment with its detected type, hash and sanitized name', async () => {
    const { vehicle, record } = await vehicleWithRecord();

    const pdf = attachmentSchema.parse(
      await local.attachments.upload(vehicle.id, record.id, file(PDF, 'docs/Factura taller.pdf  ')),
    );

    const url = `local://vehicles/${vehicle.id}/maintenance/${record.id}/attachments/${pdf.id}`;
    expect(pdf).toMatchObject({
      originalName: 'Factura taller.pdf',
      mimeType: 'application/pdf',
      size: PDF.length,
      sha256: sha256(PDF),
      url,
      thumbnailUrl: null,
    });
    const [pdfKey] = store.keys();
    expect(store.keys()).toEqual([expect.stringMatching(/^attachments\/[0-9a-f-]{36}\.pdf$/)]);
    expect(store.bytes(pdfKey ?? '')).toEqual(PDF);

    // The declared name and type do not matter: the bytes are a JPEG.
    const jpeg = attachmentSchema.parse(
      await local.attachments.upload(vehicle.id, record.id, file(JPEG, 'ticket.pdf', 'application/pdf')),
    );
    expect(jpeg).toMatchObject({ originalName: 'ticket.pdf', mimeType: 'image/jpeg', sha256: sha256(JPEG) });
    expect(jpeg.thumbnailUrl).toBe(`${jpeg.url}/thumbnail`);
    expect(store.keys().filter((key) => key !== pdfKey)).toEqual([
      expect.stringMatching(/^attachments\/[0-9a-f-]{36}\.jpg$/),
    ]);

    const rows = await db.select().from(attachments);
    expect(rows.map((row) => row.storageKey).sort()).toEqual(store.keys());
    expect(rows.every((row) => row.entityType === 'maintenance' && row.entityId === record.id)).toBe(true);
  });

  it('rejects unsupported or corrupt attachments with 415 and writes nothing', async () => {
    const { vehicle, record } = await vehicleWithRecord();
    statements = [];

    for (const data of [TEXT, GIF, CORRUPT_PNG, new Uint8Array(0)]) {
      expect(await problemOf(local.attachments.upload(vehicle.id, record.id, file(data, 'x.png')))).toEqual({
        type: 'about:blank',
        title: 'Unsupported Media Type',
        status: 415,
        detail: 'Only PDF, JPEG, PNG and WebP files are allowed',
      });
    }

    expect(writes()).toEqual([]);
    expect(store.keys()).toEqual([]);
  });

  it('rejects files over maxUploadMb with 413 and writes nothing', async () => {
    const { vehicle, record } = await vehicleWithRecord();
    statements = [];
    const tooLarge = { type: 'about:blank', title: 'request file too large', status: 413 };

    expect(await problemOf(local.attachments.upload(vehicle.id, record.id, tooBig('big.pdf')))).toEqual(
      tooLarge,
    );
    expect(await problemOf(local.vehicles.setPhoto(vehicle.id, tooBig('big.jpg')))).toEqual(tooLarge);

    expect(writes()).toEqual([]);
    expect(store.keys()).toEqual([]);
    expect(images.requested).toEqual([]);
    expect((await local.vehicles.get(vehicle.id)).photoUrl).toBeNull();
  });

  it('lists attachments in upload order', async () => {
    const { vehicle, record } = await vehicleWithRecord();
    const other = await local.maintenance.create(vehicle.id, {
      date: '2024-04-01',
      category: 'other',
      title: 'Otra',
    });

    const uploaded = await Promise.all(
      ['a.pdf', 'b.jpg', 'c.png'].map((name, i) =>
        local.attachments.upload(vehicle.id, record.id, file([PDF, JPEG, PNG][i] ?? PDF, name)),
      ),
    );

    const listed = await local.attachments.list(vehicle.id, record.id);
    expect(listed.map((attachment) => attachmentSchema.parse(attachment))).toEqual(uploaded);
    expect(listed.map((attachment) => attachment.originalName)).toEqual(['a.pdf', 'b.jpg', 'c.png']);
    expect(await local.attachments.list(vehicle.id, other.id)).toEqual([]);
  });

  it('deletes an attachment and its file', async () => {
    const { vehicle, record } = await vehicleWithRecord();
    const kept = await local.attachments.upload(vehicle.id, record.id, file(PDF, 'kept.pdf'));
    const [keptKey] = store.keys();
    const removed = await local.attachments.upload(vehicle.id, record.id, file(JPEG, 'removed.jpg'));

    await local.attachments.remove(vehicle.id, record.id, removed.id);

    expect(await local.attachments.list(vehicle.id, record.id)).toEqual([kept]);
    expect(store.keys()).toEqual([keptKey]);
    expect(await problemOf(local.attachments.remove(vehicle.id, record.id, removed.id))).toEqual(
      notFound('Attachment not found'),
    );
  });

  it('rejects attachments of unknown vehicles, records or ids with 404', async () => {
    const { vehicle, record } = await vehicleWithRecord();
    const sibling = await local.maintenance.create(vehicle.id, {
      date: '2024-04-01',
      category: 'other',
      title: 'Otra',
    });
    const otherVehicle = await vehicleWithRecord('Ajena');
    const attachment = await local.attachments.upload(vehicle.id, record.id, file(PDF, 'a.pdf'));
    const keys = store.keys();
    statements = [];

    expect(await problemOf(local.attachments.list('nope', record.id))).toEqual(notFound('Vehicle not found'));
    expect(await problemOf(local.attachments.list(vehicle.id, 'nope'))).toEqual(
      notFound('Maintenance record not found'),
    );
    // A record of another vehicle is not reachable through this one.
    expect(await problemOf(local.attachments.list(vehicle.id, otherVehicle.record.id))).toEqual(
      notFound('Maintenance record not found'),
    );
    expect(await problemOf(local.attachments.upload(vehicle.id, 'nope', file(PDF, 'a.pdf')))).toEqual(
      notFound('Maintenance record not found'),
    );
    expect(await problemOf(local.attachments.upload('nope', record.id, file(PDF, 'a.pdf')))).toEqual(
      notFound('Vehicle not found'),
    );
    expect(await problemOf(local.attachments.remove(vehicle.id, record.id, 'nope'))).toEqual(
      notFound('Attachment not found'),
    );
    // An attachment of another record of the same vehicle.
    expect(await problemOf(local.attachments.remove(vehicle.id, sibling.id, attachment.id))).toEqual(
      notFound('Attachment not found'),
    );

    expect(writes()).toEqual([]);
    expect(store.keys()).toEqual(keys);
  });

  it('stores the photo as WebP and replaces the previous one', async () => {
    const created = await local.vehicles.create({ make: 'Seat', model: 'Ibiza' });

    const first = vehicleSchema.parse(await local.vehicles.setPhoto(created.id, file(JPEG, 'IMG_0001.jpg')));

    expect(images.requested).toEqual([1600]);
    const [firstKey] = store.keys();
    expect(store.keys()).toEqual([expect.stringMatching(/^vehicles\/[0-9a-f-]{36}\.webp$/)]);
    expect(store.bytes(firstKey ?? '')?.slice(8, 12)).toEqual(encode('WEBP'));
    expect(first.photoUrl).toMatch(new RegExp(`^local://vehicles/${created.id}/photo\\?v=[0-9a-f-]{8}$`));

    const second = vehicleSchema.parse(await local.vehicles.setPhoto(created.id, file(GIF, 'anim.gif')));

    expect(images.requested).toEqual([1600, 1600]);
    expect(store.keys()).toEqual([expect.stringMatching(/^vehicles\/[0-9a-f-]{36}\.webp$/)]);
    expect(store.keys()).not.toContain(firstKey);
    expect(second.photoUrl).not.toBeNull();
    expect(second.photoUrl).not.toBe(first.photoUrl);
    expect((await local.vehicles.get(created.id)).photoUrl).toBe(second.photoUrl);
    expect((await local.vehicles.list('all'))[0]?.photoUrl).toBe(second.photoUrl);
  });

  it('rejects an unsupported photo with 400 and keeps the current one', async () => {
    const vehicle = await local.vehicles.setPhoto(
      (await local.vehicles.create({ make: 'Seat', model: 'Ibiza' })).id,
      file(PNG, 'photo.png'),
    );
    const keys = store.keys();
    statements = [];

    for (const data of [TEXT, PDF, CORRUPT_JPEG, new Uint8Array(0)]) {
      expect(await problemOf(local.vehicles.setPhoto(vehicle.id, file(data, 'photo.jpg')))).toEqual({
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'The file is not a supported image (JPEG, PNG, WebP, AVIF, GIF or TIFF)',
      });
    }

    expect(writes()).toEqual([]);
    expect(store.keys()).toEqual(keys);
    expect((await local.vehicles.get(vehicle.id)).photoUrl).toBe(vehicle.photoUrl);
  });

  it('rejects when the device does not produce WebP', async () => {
    const pngImages = fakeImages({ output: PNG });
    local = createLocalDataSource(db, { files: store, images: pngImages });
    const { vehicle, record } = await vehicleWithRecord();
    const attachment = await local.attachments.upload(vehicle.id, record.id, file(JPEG, 'ticket.jpg'));
    const keys = store.keys();
    statements = [];
    const cannotEncode = {
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      detail: 'This device cannot encode WebP images',
    };

    expect(await problemOf(local.vehicles.setPhoto(vehicle.id, file(JPEG, 'photo.jpg')))).toEqual(
      cannotEncode,
    );
    expect(await problemOf(local.files.get(attachment.thumbnailUrl ?? ''))).toEqual(cannotEncode);

    expect(pngImages.requested).toEqual([1600, 320]);
    expect(writes()).toEqual([]);
    expect(store.keys()).toEqual(keys);
    expect((await local.vehicles.get(vehicle.id)).photoUrl).toBeNull();
  });

  it('removes the photo and its file', async () => {
    const created = await local.vehicles.create({ make: 'Seat', model: 'Ibiza' });
    const withPhoto = await local.vehicles.setPhoto(created.id, file(JPEG, 'photo.jpg'));

    const removed = vehicleSchema.parse(await local.vehicles.removePhoto(created.id));

    expect(removed.photoUrl).toBeNull();
    expect(store.keys()).toEqual([]);
    expect(await problemOf(local.files.get(withPhoto.photoUrl ?? ''))).toEqual(
      notFound('This vehicle has no photo'),
    );
    // Removing it again changes nothing.
    expect((await local.vehicles.removePhoto(created.id)).photoUrl).toBeNull();
  });

  it('files.get returns the photo, the original and the thumbnail', async () => {
    const { vehicle, record } = await vehicleWithRecord();
    const withPhoto = await local.vehicles.setPhoto(vehicle.id, file(JPEG, 'photo.jpg'));
    const [photoKey] = store.keys();
    const pdf = await local.attachments.upload(vehicle.id, record.id, file(PDF, 'Factura.pdf'));
    const jpeg = await local.attachments.upload(vehicle.id, record.id, file(JPEG, 'Ticket.jpg'));
    images.requested.length = 0;

    const photo = await local.files.get(withPhoto.photoUrl ?? '');
    expect(photo.fileName).toBeNull();
    expect(photo.blob.type).toBe('image/webp');
    expect(await bytesOf(photo.blob)).toEqual(store.bytes(photoKey ?? ''));

    for (const url of [pdf.url, `${pdf.url}?inline=1`]) {
      const original = await local.files.get(url);
      expect(original.fileName).toBe('Factura.pdf');
      expect(original.blob.type).toBe('application/pdf');
      expect(await bytesOf(original.blob)).toEqual(PDF);
    }

    const image = await local.files.get(`${jpeg.url}?inline=1`);
    expect(image).toMatchObject({ fileName: 'Ticket.jpg' });
    expect(image.blob.type).toBe('image/jpeg');
    expect(await bytesOf(image.blob)).toEqual(JPEG);

    const thumbnail = await local.files.get(jpeg.thumbnailUrl ?? '');
    expect(thumbnail.fileName).toBeNull();
    expect(thumbnail.blob.type).toBe('image/webp');
    expect((await bytesOf(thumbnail.blob)).slice(8, 12)).toEqual(encode('WEBP'));
    expect(images.requested).toEqual([320]);
  });

  it('files.get rejects unknown or foreign urls with 404', async () => {
    const { vehicle, record } = await vehicleWithRecord();
    const pdf = await local.attachments.upload(vehicle.id, record.id, file(PDF, 'Factura.pdf'));
    const base = `local://vehicles/${vehicle.id}/maintenance/${record.id}/attachments`;

    for (const url of [
      `/api/vehicles/${vehicle.id}/photo`,
      `/api${pdf.url.slice('local://'.length)}`,
      'https://ikrive.example.com/api/vehicles/x/photo',
      `local://vehicles/${vehicle.id}/odometer`,
      `${base}/${pdf.id}/other`,
      '',
    ]) {
      expect(await problemOf(local.files.get(url)), url).toEqual(notFound('Not Found'));
    }
    expect(await problemOf(local.files.get('local://vehicles/nope/photo?v=12345678'))).toEqual(
      notFound('Vehicle not found'),
    );
    expect(await problemOf(local.files.get(`local://vehicles/${vehicle.id}/photo?v=12345678`))).toEqual(
      notFound('This vehicle has no photo'),
    );
    expect(await problemOf(local.files.get(`${base}/nope`))).toEqual(notFound('Attachment not found'));
    expect(
      await problemOf(
        local.files.get(`local://vehicles/${vehicle.id}/maintenance/nope/attachments/${pdf.id}`),
      ),
    ).toEqual(notFound('Maintenance record not found'));
    expect(await problemOf(local.files.get(`${pdf.url}/thumbnail`))).toEqual(
      notFound('Only images have a thumbnail'),
    );
  });

  it('files.get rejects with 404 when the row exists but its file is gone', async () => {
    const { vehicle, record } = await vehicleWithRecord();
    const withPhoto = await local.vehicles.setPhoto(vehicle.id, file(JPEG, 'photo.jpg'));
    const jpeg = await local.attachments.upload(vehicle.id, record.id, file(JPEG, 'Ticket.jpg'));
    const urls = [withPhoto.photoUrl ?? '', jpeg.url, jpeg.thumbnailUrl ?? ''];
    images.requested.length = 0;

    // Another store error is not a 404: it is rethrown as the store gave it.
    store.failOn.add('read');
    for (const url of urls) {
      const error = await local.files.get(url).catch((reason: unknown) => reason);
      expect(error, url).not.toBeInstanceOf(ApiError);
      expect(error, url).toEqual(new Error('File store read failed'));
    }
    store.failOn.delete('read');

    // The files go away, the rows stay.
    for (const key of store.keys()) await store.remove(key);
    expect(store.keys()).toEqual([]);
    expect(await db.select().from(attachments)).toHaveLength(1);

    for (const url of urls) {
      expect(await problemOf(local.files.get(url)), url).toEqual(notFound('File not found'));
    }
    expect(images.requested).toEqual([]);
  });

  it('deleting a maintenance record deletes its attachments and files', async () => {
    const { vehicle, record } = await vehicleWithRecord();
    const other = await local.maintenance.create(vehicle.id, {
      date: '2024-04-01',
      category: 'other',
      title: 'Otra',
    });
    await local.attachments.upload(vehicle.id, record.id, file(PDF, 'a.pdf'));
    await local.attachments.upload(vehicle.id, record.id, file(JPEG, 'b.jpg'));
    const kept = await local.attachments.upload(vehicle.id, other.id, file(PNG, 'c.png'));
    const [keptRow] = await db.select().from(attachments).where(eq(attachments.id, kept.id));

    await local.maintenance.remove(vehicle.id, record.id);

    expect((await db.select().from(attachments)).map((row) => row.id)).toEqual([kept.id]);
    expect(store.keys()).toEqual([keptRow?.storageKey]);
    expect(await local.attachments.list(vehicle.id, other.id)).toEqual([kept]);
  });

  it('deleting a vehicle deletes its attachments, files and photo', async () => {
    const { vehicle, record } = await vehicleWithRecord();
    const second = await local.maintenance.create(vehicle.id, {
      date: '2024-04-01',
      category: 'other',
      title: 'Otra',
    });
    await local.vehicles.setPhoto(vehicle.id, file(JPEG, 'photo.jpg'));
    await local.attachments.upload(vehicle.id, record.id, file(PDF, 'a.pdf'));
    await local.attachments.upload(vehicle.id, second.id, file(PNG, 'b.png'));
    const other = await vehicleWithRecord('Ajena');
    const kept = await local.attachments.upload(other.vehicle.id, other.record.id, file(PDF, 'kept.pdf'));
    const [keptRow] = await db.select().from(attachments).where(eq(attachments.id, kept.id));
    expect(store.keys()).toHaveLength(4);

    await local.vehicles.remove(vehicle.id);

    expect((await db.select().from(attachments)).map((row) => row.id)).toEqual([kept.id]);
    expect(store.keys()).toEqual([keptRow?.storageKey]);

    // A file that cannot be removed does not undo nor reject the deletion: it is left orphaned.
    store.failOn.add('remove');
    await local.vehicles.remove(other.vehicle.id);

    expect(await db.select().from(attachments)).toEqual([]);
    expect(await problemOf(local.vehicles.get(other.vehicle.id))).toEqual(notFound('Vehicle not found'));
    expect(store.keys()).toEqual([keptRow?.storageKey]);
  });

  it('removes the stored file when the database write fails', async () => {
    const { vehicle, record } = await vehicleWithRecord();
    const withPhoto = await local.vehicles.setPhoto(vehicle.id, file(PNG, 'photo.png'));
    const keys = store.keys();

    failOn = /^insert into "attachments"/i;
    await expect(local.attachments.upload(vehicle.id, record.id, file(PDF, 'a.pdf'))).rejects.toThrow(
      'Failed query: insert into "attachments"',
    );
    expect(store.keys()).toEqual(keys);

    failOn = /^update "vehicles"/i;
    await expect(local.vehicles.setPhoto(vehicle.id, file(JPEG, 'new.jpg'))).rejects.toThrow(
      'Failed query: update "vehicles"',
    );
    expect(store.keys()).toEqual(keys);

    failOn = null;
    expect(await db.select().from(attachments)).toEqual([]);
    expect((await local.vehicles.get(vehicle.id)).photoUrl).toBe(withPhoto.photoUrl);
    expect(await bytesOf((await local.files.get(withPhoto.photoUrl ?? '')).blob)).toEqual(
      store.bytes(keys[0] ?? ''),
    );
  });
});
