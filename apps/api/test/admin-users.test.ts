import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { type AdminUser, adminUserSchema } from '@ikrive/shared';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/db/client';
import {
  account,
  attachments,
  dataImports,
  notifications,
  session,
  user,
  userSettings,
  vehicles,
} from '../src/db/schema';
import { ConflictError } from '../src/lib/errors';
import type { LogStream } from '../src/lib/logging';
import { createFileStorage } from '../src/lib/storage';
import { createAdminUsersRepository } from '../src/modules/admin-users/repository';
import { createAdminUsersService } from '../src/modules/admin-users/service';
import { createTestApp, signUp } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];
type Response = Awaited<ReturnType<TestApp['inject']>>;

const PASSWORD = 'correct-horse-battery';

const expectProblem = (response: Response, status: number) => {
  expect(response.statusCode).toBe(status);
  expect(response.headers['content-type']).toContain('application/problem+json');
  expect(response.json()).toMatchObject({ status });
};

/** Signs up an account and returns its id and session cookie. The first account is the admin. */
async function createAccount(app: TestApp, email: string, name: string) {
  const { response, cookie } = await signUp(app, email, name);
  expect(response.statusCode).toBe(200);
  return { id: (response.json() as { user: { id: string } }).user.id, email, cookie };
}

const signIn = (app: TestApp, email: string) =>
  app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: 'http://localhost:3000' },
    payload: { email, password: PASSWORD },
  });

/** Shortcuts for the admin endpoints; `cookie` undefined sends the request without a session. */
function adminApi(app: TestApp) {
  const headers = (cookie?: string) => (cookie ? { cookie } : {});
  return {
    list: (cookie?: string) =>
      app.inject({ method: 'GET', url: '/api/admin/users', headers: headers(cookie) }),
    setRole: (id: string, payload: object, cookie?: string) =>
      app.inject({ method: 'PUT', url: `/api/admin/users/${id}/role`, headers: headers(cookie), payload }),
    disable: (id: string, cookie?: string) =>
      app.inject({ method: 'POST', url: `/api/admin/users/${id}/disable`, headers: headers(cookie) }),
    enable: (id: string, cookie?: string) =>
      app.inject({ method: 'POST', url: `/api/admin/users/${id}/enable`, headers: headers(cookie) }),
    remove: (id: string, cookie?: string) =>
      app.inject({ method: 'DELETE', url: `/api/admin/users/${id}`, headers: headers(cookie) }),
  };
}

async function setup({ logStream }: { logStream?: LogStream } = {}) {
  const { app, db, dataDir } = await createTestApp({}, { logStream });
  const admin = await createAccount(app, 'admin@example.com', 'Admin');
  const bob = await createAccount(app, 'bob@example.com', 'Bob');
  return { app, db, dataDir, admin, bob, api: adminApi(app) };
}

const userRow = (db: Db, id: string) => db.select().from(user).where(eq(user.id, id)).get();
const sessionCount = (db: Db, id: string) =>
  db.select().from(session).where(eq(session.userId, id)).all().length;

const me = (app: TestApp, cookie: string) =>
  app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });

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

const png = () =>
  sharp({ create: { width: 64, height: 32, channels: 3, background: '#c5e8e0' } })
    .png()
    .toBuffer();

const pdf = () =>
  Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');

/** Gives the user a vehicle with a photo, a maintenance record with an attachment and a notification. */
async function createUserData(app: TestApp, db: Db, owner: { id: string; cookie: string }) {
  const headers = { cookie: owner.cookie };
  const vehicleId = await createVehicle(app, owner.cookie);

  const photo = multipart(await png(), 'photo.png', 'image/png');
  const uploaded = await app.inject({
    method: 'PUT',
    url: `/api/vehicles/${vehicleId}/photo`,
    headers: { ...headers, ...photo.headers },
    payload: photo.payload,
  });
  expect(uploaded.statusCode).toBe(200);

  const record = await app.inject({
    method: 'POST',
    url: `/api/vehicles/${vehicleId}/maintenance`,
    headers,
    payload: { date: '2025-05-10', category: 'oil_change', title: 'Cambio de aceite' },
  });
  expect(record.statusCode).toBe(201);
  const recordId = (record.json() as { id: string }).id;
  const file = multipart(pdf(), 'factura.pdf', 'application/pdf');
  const attached = await app.inject({
    method: 'POST',
    url: `/api/vehicles/${vehicleId}/maintenance/${recordId}/attachments`,
    headers: { ...headers, ...file.headers },
    payload: file.payload,
  });
  expect(attached.statusCode).toBe(201);

  db.insert(notifications)
    .values({
      userId: owner.id,
      vehicleId,
      type: 'odometer_nudge',
      title: 'Coche',
      dedupeKey: `test:${owner.id}`,
    })
    .run();

  const photoKey = db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).get()?.photo;
  const attachmentKey = db
    .select()
    .from(attachments)
    .where(eq(attachments.ownerId, owner.id))
    .get()?.storageKey;
  if (!photoKey || !attachmentKey) throw new Error('The user files were not stored');
  return { vehicleId, photoKey, attachmentKey };
}

describe('GET /api/admin/users', () => {
  it('lists users with status and vehicle count', async () => {
    const { app, db, admin, bob, api } = await setup();
    const carol = await createAccount(app, 'carol@example.com', 'Carol');
    // Sign-up dates far apart so the order does not depend on the clock resolution.
    const signedUp = (id: string, iso: string) =>
      db
        .update(user)
        .set({ createdAt: new Date(iso) })
        .where(eq(user.id, id))
        .run();
    signedUp(admin.id, '2026-01-01T00:00:00.000Z');
    signedUp(bob.id, '2026-02-01T00:00:00.000Z');
    signedUp(carol.id, '2026-03-01T00:00:00.000Z');

    await createVehicle(app, bob.cookie);
    const archived = await createVehicle(app, bob.cookie);
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/vehicles/${archived}`,
      headers: { cookie: bob.cookie },
      payload: { archived: true },
    });
    expect(patched.statusCode).toBe(200);
    await createVehicle(app, admin.cookie);
    expect((await api.disable(carol.id, admin.cookie)).statusCode).toBe(200);

    const response = await api.list(admin.cookie);

    expect(response.statusCode).toBe(200);
    const users = response.json() as AdminUser[];
    for (const listed of users) adminUserSchema.parse(listed);
    expect(
      users.map(({ id, name, email, role, status, vehicleCount, createdAt }) => ({
        id,
        name,
        email,
        role,
        status,
        vehicleCount,
        createdAt,
      })),
    ).toEqual([
      {
        id: admin.id,
        name: 'Admin',
        email: 'admin@example.com',
        role: 'admin',
        status: 'active',
        vehicleCount: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: bob.id,
        name: 'Bob',
        email: 'bob@example.com',
        role: 'user',
        status: 'active',
        vehicleCount: 2,
        createdAt: '2026-02-01T00:00:00.000Z',
      },
      {
        id: carol.id,
        name: 'Carol',
        email: 'carol@example.com',
        role: 'user',
        status: 'disabled',
        vehicleCount: 0,
        createdAt: '2026-03-01T00:00:00.000Z',
      },
    ]);
    expect(users[0]?.disabledAt).toBeNull();
    expect(users[2]?.disabledAt).toEqual(expect.any(String));
  });

  it('returns locks for the actor and the last admin', async () => {
    const { admin, bob, api } = await setup();

    const users = (await api.list(admin.cookie)).json() as AdminUser[];

    expect(users.find((listed) => listed.id === admin.id)).toMatchObject({
      isSelf: true,
      locks: { demote: 'last_admin', disable: 'self', delete: 'self' },
    });
    expect(users.find((listed) => listed.id === bob.id)).toMatchObject({
      isSelf: false,
      locks: { demote: null, disable: null, delete: null },
    });
  });
});

describe('PUT /api/admin/users/:id/role', () => {
  it("changes a user's role", async () => {
    const { app, db, admin, bob, api } = await setup();

    const promoted = await api.setRole(bob.id, { role: 'admin' }, admin.cookie);
    expect(promoted.statusCode).toBe(200);
    expect(promoted.json()).toMatchObject({ id: bob.id, role: 'admin', isSelf: false });
    expect(userRow(db, bob.id)?.role).toBe('admin');
    // The new role applies from the next request, with the same session.
    expect((await api.list(bob.cookie)).statusCode).toBe(200);

    const demoted = await api.setRole(bob.id, { role: 'user' }, admin.cookie);
    expect(demoted.statusCode).toBe(200);
    expect(demoted.json()).toMatchObject({ id: bob.id, role: 'user' });
    expectProblem(await api.list(bob.cookie), 403);
    const bobMe = await me(app, bob.cookie);
    expect(bobMe.statusCode).toBe(200);
    expect(bobMe.json()).toMatchObject({ id: bob.id, role: 'user' });
  });

  it('rejects an invalid role', async () => {
    const { db, admin, bob, api } = await setup();

    expectProblem(await api.setRole(bob.id, { role: 'owner' }, admin.cookie), 400);
    expectProblem(await api.setRole(bob.id, { role: 'admin,user' }, admin.cookie), 400);
    expectProblem(await api.setRole(bob.id, {}, admin.cookie), 400);
    expect(userRow(db, bob.id)?.role).toBe('user');
  });
});

describe('POST /api/admin/users/:id/disable and /enable', () => {
  it('disables a user and closes their sessions', async () => {
    const { app, db, admin, bob, api } = await setup();
    expect(sessionCount(db, bob.id)).toBe(1);

    const before = Date.now();
    const response = await api.disable(bob.id, admin.cookie);

    expect(response.statusCode).toBe(200);
    const disabled = response.json() as AdminUser;
    expect(disabled).toMatchObject({ id: bob.id, status: 'disabled' });
    expect(new Date(disabled.disabledAt ?? 0).getTime()).toBeGreaterThanOrEqual(before);
    expect(userRow(db, bob.id)?.disabledAt).toEqual(new Date(disabled.disabledAt ?? 0));
    expect(sessionCount(db, bob.id)).toBe(0);
    expectProblem(await me(app, bob.cookie), 401);

    const signedIn = await signIn(app, bob.email);
    expect(signedIn.statusCode).toBe(403);
    expect(signedIn.headers['set-cookie']).toBeUndefined();
    expect(sessionCount(db, bob.id)).toBe(0);
    // The admin keeps their session.
    expect((await me(app, admin.cookie)).statusCode).toBe(200);
  });

  it('re-enables a user', async () => {
    const { app, db, admin, bob, api } = await setup();
    expect((await api.disable(bob.id, admin.cookie)).statusCode).toBe(200);

    const response = await api.enable(bob.id, admin.cookie);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: bob.id, status: 'active', disabledAt: null });
    expect(userRow(db, bob.id)?.disabledAt).toBeNull();
    const signedIn = await signIn(app, bob.email);
    expect(signedIn.statusCode).toBe(200);
    expect(sessionCount(db, bob.id)).toBe(1);
  });

  it('disable and enable are idempotent', async () => {
    const { db, admin, bob, api } = await setup();
    const first = (await api.disable(bob.id, admin.cookie)).json() as AdminUser;

    const again = await api.disable(bob.id, admin.cookie);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ status: 'disabled', disabledAt: first.disabledAt });
    expect(userRow(db, bob.id)?.disabledAt?.toISOString()).toBe(first.disabledAt);

    expect((await api.enable(bob.id, admin.cookie)).statusCode).toBe(200);
    const active = await api.enable(bob.id, admin.cookie);
    expect(active.statusCode).toBe(200);
    expect(active.json()).toMatchObject({ status: 'active', disabledAt: null });
  });
});

describe('DELETE /api/admin/users/:id', () => {
  it('deletes a user with all their data and files', async () => {
    const { app, db, dataDir, admin, bob, api } = await setup();
    const { photoKey, attachmentKey } = await createUserData(app, db, bob);
    const uploaded = (key: string) => existsSync(join(dataDir, 'uploads', key));
    expect(uploaded(photoKey)).toBe(true);
    expect(uploaded(attachmentKey)).toBe(true);

    const response = await api.remove(bob.id, admin.cookie);

    expect(response.statusCode).toBe(204);
    expect(db.select().from(user).where(eq(user.id, bob.id)).all()).toEqual([]);
    expect(db.select().from(session).where(eq(session.userId, bob.id)).all()).toEqual([]);
    expect(db.select().from(account).where(eq(account.userId, bob.id)).all()).toEqual([]);
    expect(db.select().from(userSettings).where(eq(userSettings.userId, bob.id)).all()).toEqual([]);
    expect(db.select().from(vehicles).where(eq(vehicles.ownerId, bob.id)).all()).toEqual([]);
    expect(db.select().from(attachments).where(eq(attachments.ownerId, bob.id)).all()).toEqual([]);
    expect(db.select().from(notifications).where(eq(notifications.userId, bob.id)).all()).toEqual([]);
    expect(uploaded(photoKey)).toBe(false);
    expect(uploaded(attachmentKey)).toBe(false);
    expect((await signIn(app, bob.email)).statusCode).toBe(401);
    // The admin's own rows are untouched.
    expect(userRow(db, admin.id)).toBeDefined();
  });

  it('deletes the import fingerprints with the account', async () => {
    const { app, db, admin, bob, api } = await setup();
    await createVehicle(app, bob.cookie);
    // Bob imports his own export: the import is recorded with its fingerprint.
    const exported = await app.inject({
      method: 'GET',
      url: '/api/me/export',
      headers: { cookie: bob.cookie },
    });
    expect(exported.statusCode).toBe(200);
    const zip = multipart(exported.rawPayload, 'ikrive-export.zip', 'application/zip');
    const imported = await app.inject({
      method: 'POST',
      url: '/api/me/import',
      headers: { cookie: bob.cookie, ...zip.headers },
      payload: zip.payload,
    });
    expect(imported.statusCode, imported.body).toBe(201);
    const fingerprints = (id: string) =>
      db.select().from(dataImports).where(eq(dataImports.userId, id)).all();
    expect(fingerprints(bob.id)).toHaveLength(1);

    const response = await api.remove(bob.id, admin.cookie);

    expect(response.statusCode).toBe(204);
    expect(fingerprints(bob.id)).toEqual([]);
    expect(db.select().from(dataImports).all()).toEqual([]);
  });

  it('still deletes when a file cannot be removed', async () => {
    const lines: string[] = [];
    const { app, db, dataDir, admin, bob, api } = await setup({
      logStream: { write: (line) => lines.push(line) },
    });
    const { photoKey, attachmentKey } = await createUserData(app, db, bob);
    // `rm` with `force` but without `recursive` fails on a directory.
    const photoPath = join(dataDir, 'uploads', photoKey);
    rmSync(photoPath);
    mkdirSync(photoPath);

    const response = await api.remove(bob.id, admin.cookie);

    expect(response.statusCode).toBe(204);
    expect(userRow(db, bob.id)).toBeUndefined();
    expect(existsSync(join(dataDir, 'uploads', attachmentKey))).toBe(false);
    const errors = lines
      .map((line) => JSON.parse(line) as { level: number; msg: string; key?: string })
      .filter((entry) => entry.msg === 'admin: could not remove a user file');
    expect(errors).toEqual([expect.objectContaining({ level: 50, key: photoKey })]);
  });
});

describe('admin user protections', () => {
  it('cannot demote the last admin', async () => {
    const { app, db, admin, bob, api } = await setup();

    const response = await api.setRole(admin.id, { role: 'user' }, admin.cookie);
    expectProblem(response, 409);
    expect(response.json()).toMatchObject({ detail: 'The instance must keep at least one active admin' });
    expect(userRow(db, admin.id)?.role).toBe('admin');

    expect((await api.setRole(bob.id, { role: 'admin' }, admin.cookie)).statusCode).toBe(200);
    const demoted = await api.setRole(admin.id, { role: 'user' }, admin.cookie);
    expect(demoted.statusCode).toBe(200);
    expect(demoted.json()).toMatchObject({ id: admin.id, role: 'user', isSelf: true });
    expect((await me(app, admin.cookie)).json()).toMatchObject({ role: 'user' });
  });

  it('cannot disable or delete yourself', async () => {
    const { db, admin, bob, api } = await setup();
    // With another active admin the only reason left is `self`.
    expect((await api.setRole(bob.id, { role: 'admin' }, admin.cookie)).statusCode).toBe(200);

    for (const response of [
      await api.disable(admin.id, admin.cookie),
      await api.remove(admin.id, admin.cookie),
    ]) {
      expectProblem(response, 409);
      expect(response.json()).toMatchObject({ detail: 'You cannot disable or delete your own account' });
    }
    expect(userRow(db, admin.id)).toMatchObject({ role: 'admin', disabledAt: null });
    expect(sessionCount(db, admin.id)).toBe(1);
  });

  it('disabled admins do not count as admins', async () => {
    const { db, admin, bob, api } = await setup();
    expect((await api.setRole(bob.id, { role: 'admin' }, admin.cookie)).statusCode).toBe(200);
    expect((await api.disable(bob.id, admin.cookie)).statusCode).toBe(200);

    expectProblem(await api.setRole(admin.id, { role: 'user' }, admin.cookie), 409);
    expect(userRow(db, admin.id)?.role).toBe('admin');
    // A disabled admin can be demoted: they are not the last active admin.
    const demoted = await api.setRole(bob.id, { role: 'user' }, admin.cookie);
    expect(demoted.statusCode).toBe(200);
    expect(demoted.json()).toMatchObject({ role: 'user', status: 'disabled' });
  });

  it('protects the last admin from being disabled or deleted', async () => {
    const { db, dataDir, admin } = await setup();
    // Through HTTP the actor is always an active admin, so the last admin can only be targeted by
    // `self`; an actor that does not count reaches the `last_admin` lock.
    const service = createAdminUsersService({
      repo: createAdminUsersRepository(db),
      storage: createFileStorage(join(dataDir, 'uploads')),
      log: { error: vi.fn() },
    });

    expect(() => service.disable('someone-else', admin.id)).toThrow(
      new ConflictError('The instance must keep at least one active admin'),
    );
    await expect(service.remove('someone-else', admin.id)).rejects.toThrow(
      new ConflictError('The instance must keep at least one active admin'),
    );
    expect(userRow(db, admin.id)).toMatchObject({ role: 'admin', disabledAt: null });
    expect(sessionCount(db, admin.id)).toBe(1);
  });
});

describe('admin user errors and authorization', () => {
  it('returns 404 for an unknown user', async () => {
    const { admin, api } = await setup();

    expectProblem(await api.setRole('missing', { role: 'admin' }, admin.cookie), 404);
    expectProblem(await api.disable('missing', admin.cookie), 404);
    expectProblem(await api.enable('missing', admin.cookie), 404);
    expectProblem(await api.remove('missing', admin.cookie), 404);
  });

  it('returns 401 without a session', async () => {
    const { db, bob, api } = await setup();

    expectProblem(await api.list(), 401);
    expectProblem(await api.setRole(bob.id, { role: 'admin' }), 401);
    expectProblem(await api.setRole(bob.id, { role: 'owner' }), 401);
    expectProblem(await api.disable(bob.id), 401);
    expectProblem(await api.enable(bob.id), 401);
    expectProblem(await api.remove(bob.id), 401);
    expect(userRow(db, bob.id)).toMatchObject({ role: 'user', disabledAt: null });
  });

  it('returns 403 for a regular user', async () => {
    const { app, db, admin, bob, api } = await setup();
    const carol = await createAccount(app, 'carol@example.com', 'Carol');

    expectProblem(await api.list(bob.cookie), 403);
    expectProblem(await api.setRole(bob.id, { role: 'admin' }, bob.cookie), 403);
    // Authorization runs before validation.
    expectProblem(await api.setRole(carol.id, { role: 'owner' }, bob.cookie), 403);
    expectProblem(await api.disable(admin.id, bob.cookie), 403);
    expectProblem(await api.enable(carol.id, bob.cookie), 403);
    expectProblem(await api.remove(carol.id, bob.cookie), 403);
    expect(userRow(db, bob.id)).toMatchObject({ role: 'user', disabledAt: null });
    expect(userRow(db, admin.id)).toMatchObject({ role: 'admin', disabledAt: null });
    expect(userRow(db, carol.id)).toMatchObject({ role: 'user', disabledAt: null });
    expect(sessionCount(db, admin.id)).toBe(1);
  });
});
