import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/db/client';
import { notificationChannels, notifications } from '../src/db/schema';
import { runReminders } from '../src/jobs/reminders.job';
import { createTestApp, createTestDispatcher, signUp } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];

/** 12:00 in Madrid: past the default reminder hour. */
const NOW = new Date('2026-10-22T10:00:00.000Z');

/** Signs up a user with an overdue schedule on «name» and returns a helper to add channels. */
async function userWithOverdueSchedule(app: TestApp, email: string, name: string, locale = 'es') {
  const { response, cookie } = await signUp(app, email);
  const headers = { cookie };
  await app.inject({ method: 'PATCH', url: '/api/settings', headers, payload: { locale } });
  const vehicle = await app.inject({
    method: 'POST',
    url: '/api/vehicles',
    headers,
    payload: { make: 'Seat', model: 'León', name },
  });
  const vehicleId = (vehicle.json() as { id: string }).id;
  const schedule = await app.inject({
    method: 'POST',
    url: `/api/vehicles/${vehicleId}/schedules`,
    headers,
    payload: {
      title: 'Cambio de aceite',
      category: 'oil_change',
      intervalMonths: 12,
      lastDoneDate: '2025-01-01',
    },
  });
  expect(schedule.statusCode).toBe(201);

  const addChannel = async (payload: object) => {
    const created = await app.inject({ method: 'POST', url: '/api/notification-channels', headers, payload });
    expect(created.statusCode).toBe(201);
    return (created.json() as { id: string }).id;
  };
  return { userId: (response.json() as { user: { id: string } }).user.id, vehicleId, addChannel };
}

const webhook = (url: string, enabled = true) => ({ type: 'webhook', enabled, config: { url } });

/** Answers 200 except for the URLs in `failures` (a status, or a network error). */
function fakeFetch(failures: Record<string, number | Error> = {}) {
  return vi.fn<typeof globalThis.fetch>(async (input) => {
    const failure = failures[String(input)];
    if (failure instanceof Error) throw failure;
    return new Response(null, { status: failure ?? 200 });
  });
}

const sentUrls = (fetch: ReturnType<typeof fakeFetch>) => fetch.mock.calls.map(([url]) => String(url)).sort();
const sentBody = (fetch: ReturnType<typeof fakeFetch>, url: string) =>
  JSON.parse(String(fetch.mock.calls.find(([u]) => String(u) === url)?.[1]?.body));
const lastError = (db: Db, id: string) =>
  db.select().from(notificationChannels).where(eq(notificationChannels.id, id)).get()?.lastError;

describe('sending notifications through channels', () => {
  it("sends new notifications through the owner's enabled channels", async () => {
    const { app, db } = await createTestApp();
    const ada = await userWithOverdueSchedule(app, 'ada@example.com', 'Coche de Ada');
    const bob = await userWithOverdueSchedule(app, 'bob@example.com', "Bob's car", 'en');
    await ada.addChannel(webhook('https://hooks.example.com/ada'));
    await ada.addChannel({ type: 'ntfy', config: { serverUrl: 'https://ntfy.sh', topic: 'ada' } });
    await bob.addChannel(webhook('https://hooks.example.com/bob'));
    const fetch = fakeFetch();

    expect(await runReminders({ db, now: NOW, dispatcher: createTestDispatcher(db, fetch) })).toEqual({
      evaluated: 2,
      created: 2,
    });

    expect(sentUrls(fetch)).toEqual([
      'https://hooks.example.com/ada',
      'https://hooks.example.com/bob',
      'https://ntfy.sh/',
    ]);
    expect(sentBody(fetch, 'https://hooks.example.com/ada')).toEqual({
      event: 'notification',
      type: 'schedule_overdue',
      title: 'Mantenimiento vencido: Cambio de aceite',
      body: 'Coche de Ada',
      link: `http://localhost:3000/vehicles/${ada.vehicleId}`,
      createdAt: NOW.toISOString(),
    });
    expect(sentBody(fetch, 'https://ntfy.sh/')).toMatchObject({ topic: 'ada', message: 'Coche de Ada' });
    expect(sentBody(fetch, 'https://hooks.example.com/bob')).toMatchObject({
      title: 'Maintenance overdue: Cambio de aceite',
      body: "Bob's car",
      link: `http://localhost:3000/vehicles/${bob.vehicleId}`,
    });
  });

  it('skips disabled channels', async () => {
    const { app, db } = await createTestApp();
    const ada = await userWithOverdueSchedule(app, 'ada@example.com', 'Coche');
    await ada.addChannel(webhook('https://hooks.example.com/off', false));
    await ada.addChannel(webhook('https://hooks.example.com/on'));
    const fetch = fakeFetch();

    await runReminders({ db, now: NOW, dispatcher: createTestDispatcher(db, fetch) });

    expect(sentUrls(fetch)).toEqual(['https://hooks.example.com/on']);
  });

  it('does not resend deduplicated notifications', async () => {
    const { app, db } = await createTestApp();
    const ada = await userWithOverdueSchedule(app, 'ada@example.com', 'Coche');
    await ada.addChannel(webhook('https://hooks.example.com/ada'));
    const fetch = fakeFetch();
    const dispatcher = createTestDispatcher(db, fetch);

    expect((await runReminders({ db, now: NOW, dispatcher })).created).toBe(1);
    expect(fetch).toHaveBeenCalledOnce();
    expect((await runReminders({ db, now: NOW, dispatcher })).created).toBe(0);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('a failing channel stores last_error and does not stop the rest', async () => {
    const { app, db } = await createTestApp();
    const ada = await userWithOverdueSchedule(app, 'ada@example.com', 'Coche');
    const failing = await ada.addChannel(webhook('https://down.example.com/hook'));
    const working = await ada.addChannel(webhook('https://hooks.example.com/ada'));
    const fetch = fakeFetch({
      'https://down.example.com/hook': new TypeError('fetch failed', {
        cause: new Error('connect ECONNREFUSED'),
      }),
    });

    await expect(
      runReminders({ db, now: NOW, dispatcher: createTestDispatcher(db, fetch) }),
    ).resolves.toEqual({
      evaluated: 1,
      created: 1,
    });

    expect(db.select().from(notifications).where(eq(notifications.userId, ada.userId)).all()).toHaveLength(1);
    expect(sentUrls(fetch)).toEqual(['https://down.example.com/hook', 'https://hooks.example.com/ada']);
    expect(lastError(db, failing)).toBe('fetch failed: connect ECONNREFUSED');
    expect(lastError(db, working)).toBeNull();
  });

  it('a successful send clears last_error', async () => {
    const { app, db } = await createTestApp();
    const ada = await userWithOverdueSchedule(app, 'ada@example.com', 'Coche');
    const id = await ada.addChannel(webhook('https://hooks.example.com/ada'));
    db.update(notificationChannels)
      .set({ lastError: 'HTTP 502' })
      .where(eq(notificationChannels.id, id))
      .run();

    await runReminders({ db, now: NOW, dispatcher: createTestDispatcher(db, fakeFetch()) });

    expect(lastError(db, id)).toBeNull();
  });
});
