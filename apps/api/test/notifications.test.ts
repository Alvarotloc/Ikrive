import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { Db } from '../src/db/client';
import { notifications } from '../src/db/schema';
import { runReminders } from '../src/jobs/reminders.job';
import { createTestApp, createTestDispatcher, signUp } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];

async function signUpUser(app: TestApp, email: string) {
  const { response, cookie } = await signUp(app, email);
  return { cookie, userId: (response.json() as { user: { id: string } }).user.id };
}

/** Inserts a notification `minutesAgo` minutes old directly in the database. */
function seed(db: Db, userId: string, key: string, { minutesAgo = 0, readAt = null as Date | null } = {}) {
  return db
    .insert(notifications)
    .values({
      userId,
      type: 'schedule_due_soon',
      title: `Regla ${key}`,
      body: 'Seat León',
      link: '/vehicles/v1',
      dedupeKey: `test:${key}`,
      readAt,
      createdAt: new Date(Date.UTC(2026, 9, 22, 12, 0) - minutesAgo * 60_000),
    })
    .returning()
    .get();
}

const list = (app: TestApp, cookie: string, query = '') =>
  app.inject({ method: 'GET', url: `/api/notifications${query}`, headers: { cookie } });
const markRead = (app: TestApp, cookie: string, id: string) =>
  app.inject({ method: 'PATCH', url: `/api/notifications/${id}/read`, headers: { cookie } });
const markAllRead = (app: TestApp, cookie: string) =>
  app.inject({ method: 'POST', url: '/api/notifications/read-all', headers: { cookie } });

describe('notifications', () => {
  it('lists notifications newest first with total and unread count', async () => {
    const { app, db } = await createTestApp();
    const { cookie, userId } = await signUpUser(app, 'ada@example.com');
    seed(db, userId, 'old', { minutesAgo: 60, readAt: new Date() });
    const newest = seed(db, userId, 'new');
    seed(db, userId, 'middle', { minutesAgo: 30 });

    const response = await list(app, cookie);
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ total: 3, unreadCount: 2 });
    expect(body.items.map((n: { title: string }) => n.title)).toEqual([
      'Regla new',
      'Regla middle',
      'Regla old',
    ]);
    expect(body.items[0]).toEqual({
      id: newest.id,
      type: 'schedule_due_soon',
      title: 'Regla new',
      body: 'Seat León',
      link: '/vehicles/v1',
      readAt: null,
      createdAt: '2026-10-22T12:00:00.000Z',
    });
    expect(body.items[2].readAt).toEqual(expect.any(String));
  });

  it('paginates with limit and offset', async () => {
    const { app, db } = await createTestApp();
    const { cookie, userId } = await signUpUser(app, 'ada@example.com');
    for (let i = 0; i < 25; i++) seed(db, userId, String(i), { minutesAgo: i });

    const first = (await list(app, cookie)).json();
    expect(first.items).toHaveLength(20);
    expect(first).toMatchObject({ total: 25, unreadCount: 25 });

    const page = (await list(app, cookie, '?limit=2&offset=3')).json();
    expect(page.items.map((n: { title: string }) => n.title)).toEqual(['Regla 3', 'Regla 4']);
    expect(page.total).toBe(25);

    const last = (await list(app, cookie, '?offset=20')).json();
    expect(last.items).toHaveLength(5);
  });

  it('rejects invalid pagination', async () => {
    const { app } = await createTestApp();
    const { cookie } = await signUpUser(app, 'ada@example.com');
    for (const query of ['?limit=0', '?limit=101', '?limit=abc', '?offset=-1']) {
      const response = await list(app, cookie, query);
      expect(response.statusCode).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
    }
  });

  it('marks a notification as read', async () => {
    const { app, db } = await createTestApp();
    const { cookie, userId } = await signUpUser(app, 'ada@example.com');
    const notification = seed(db, userId, 'a');

    const response = await markRead(app, cookie, notification.id);
    expect(response.statusCode).toBe(200);
    const read = response.json();
    expect(read).toMatchObject({ id: notification.id, readAt: expect.any(String) });

    const again = await markRead(app, cookie, notification.id);
    expect(again.statusCode).toBe(200);
    expect(again.json().readAt).toBe(read.readAt);
    expect((await list(app, cookie)).json().unreadCount).toBe(0);
  });

  it('marks all notifications as read', async () => {
    const { app, db } = await createTestApp();
    const { cookie, userId } = await signUpUser(app, 'ada@example.com');
    const earlier = new Date('2026-01-01T00:00:00.000Z');
    seed(db, userId, 'a');
    seed(db, userId, 'b', { minutesAgo: 1 });
    seed(db, userId, 'c', { minutesAgo: 2, readAt: earlier });

    const response = await markAllRead(app, cookie);
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');

    const body = (await list(app, cookie)).json();
    expect(body).toMatchObject({ total: 3, unreadCount: 0 });
    expect(body.items[2].readAt).toBe(earlier.toISOString());
  });

  it('deletes notifications with their vehicle', async () => {
    const { app, db } = await createTestApp();
    // 12:00 in Madrid: past the default reminder hour.
    const now = new Date('2026-10-22T10:00:00.000Z');
    const { cookie } = await signUpUser(app, 'ada@example.com');
    const headers = { cookie };
    const vehicleIds: string[] = [];
    for (const name of ['Primero', 'Segundo']) {
      const vehicle = await app.inject({
        method: 'POST',
        url: '/api/vehicles',
        headers,
        payload: { make: 'Seat', model: 'León', name },
      });
      const vehicleId = (vehicle.json() as { id: string }).id;
      vehicleIds.push(vehicleId);
      const schedule = await app.inject({
        method: 'POST',
        url: `/api/vehicles/${vehicleId}/schedules`,
        headers,
        payload: { title: 'Aceite', category: 'oil_change', intervalMonths: 12, lastDoneDate: '2025-01-01' },
      });
      expect(schedule.statusCode).toBe(201);
    }
    const [first, second] = vehicleIds as [string, string];
    expect(await runReminders({ db, now, dispatcher: createTestDispatcher(db) })).toMatchObject({
      created: 2,
    });

    const removed = await app.inject({ method: 'DELETE', url: `/api/vehicles/${first}`, headers });
    expect(removed.statusCode).toBe(204);

    const body = (await list(app, cookie)).json();
    expect(body).toMatchObject({ total: 1, unreadCount: 1 });
    expect(body.items.map((n: { body: string }) => n.body)).toEqual(['Segundo']);
    expect(db.select().from(notifications).where(eq(notifications.vehicleId, first)).all()).toEqual([]);
    expect(db.select().from(notifications).where(eq(notifications.vehicleId, second)).all()).toHaveLength(1);
  });

  describe('authorization', () => {
    it("hides other users' notifications", async () => {
      const { app, db } = await createTestApp();
      const ada = await signUpUser(app, 'ada@example.com');
      const bob = await signUpUser(app, 'bob@example.com');
      seed(db, ada.userId, 'ada');
      seed(db, bob.userId, 'bob-1');
      seed(db, bob.userId, 'bob-2');

      const body = (await list(app, ada.cookie)).json();
      expect(body).toMatchObject({ total: 1, unreadCount: 1 });
      expect(body.items.map((n: { title: string }) => n.title)).toEqual(['Regla ada']);
    });

    it("returns 404 when marking another user's notification", async () => {
      const { app, db } = await createTestApp();
      const ada = await signUpUser(app, 'ada@example.com');
      const bob = await signUpUser(app, 'bob@example.com');
      const bobs = seed(db, bob.userId, 'bob');

      for (const id of [bobs.id, 'missing']) {
        const response = await markRead(app, ada.cookie, id);
        expect(response.statusCode).toBe(404);
        expect(response.headers['content-type']).toContain('application/problem+json');
        expect(response.json()).toMatchObject({ detail: 'Notification not found' });
      }
      expect(db.select().from(notifications).where(eq(notifications.id, bobs.id)).get()?.readAt).toBeNull();
    });

    it("read-all does not touch other users' notifications", async () => {
      const { app, db } = await createTestApp();
      const ada = await signUpUser(app, 'ada@example.com');
      const bob = await signUpUser(app, 'bob@example.com');
      seed(db, ada.userId, 'ada');
      seed(db, bob.userId, 'bob');

      expect((await markAllRead(app, ada.cookie)).statusCode).toBe(204);
      expect((await list(app, ada.cookie)).json().unreadCount).toBe(0);
      expect((await list(app, bob.cookie)).json().unreadCount).toBe(1);
    });

    it('requires a session', async () => {
      const { app, db } = await createTestApp();
      const ada = await signUpUser(app, 'ada@example.com');
      const notification = seed(db, ada.userId, 'ada');

      for (const request of [
        { method: 'GET', url: '/api/notifications' },
        { method: 'PATCH', url: `/api/notifications/${notification.id}/read` },
        { method: 'POST', url: '/api/notifications/read-all' },
      ] as const) {
        expect((await app.inject(request)).statusCode).toBe(401);
      }
      expect(db.select().from(notifications).get()?.readAt).toBeNull();
    });
  });
});
