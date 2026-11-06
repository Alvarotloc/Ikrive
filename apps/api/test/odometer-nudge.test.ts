import { asc, eq } from 'drizzle-orm';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/db/client';
import { notifications, odometerReadings, user, userSettings, vehicles } from '../src/db/schema';
import {
  ODOMETER_NUDGE_CRON,
  odometerNudgeDedupeKey,
  runOdometerNudge,
  startOdometerNudgeJob,
} from '../src/jobs/odometer-nudge.job';
import { isoWeekOf, weekdayOf } from '../src/lib/dates';
import { createVehiclesRepository } from '../src/modules/vehicles/repository';
import { createTestApp, createTestDispatcher, signUp } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];

/** Sunday 2026-10-25, 11:00 in Madrid (CET): the default reminder day (0) past the default hour (8). */
const NOW = new Date('2026-10-25T10:00:00.000Z');
const at = (iso: string) => new Date(iso);
/** Well before NOW: vehicles created on this date and without readings are pending. */
const LONG_AGO = at('2026-09-01T10:00:00.000Z');

async function createUser(app: TestApp, email: string, settings: Record<string, unknown> = {}) {
  const { response, cookie } = await signUp(app, email);
  const headers = { cookie };
  if (Object.keys(settings).length > 0) {
    const patched = await app.inject({ method: 'PATCH', url: '/api/settings', headers, payload: settings });
    expect(patched.statusCode).toBe(200);
  }
  const userId = (response.json() as { user: { id: string } }).user.id;

  const patchSettings = async (payload: Record<string, unknown>) => {
    const patched = await app.inject({ method: 'PATCH', url: '/api/settings', headers, payload });
    expect(patched.statusCode).toBe(200);
  };
  const createVehicle = async (fields: Record<string, unknown> = {}) => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers,
      payload: { make: 'Seat', model: 'León', ...fields },
    });
    expect(created.statusCode).toBe(201);
    return (created.json() as { id: string }).id;
  };
  const patchVehicle = async (id: string, payload: Record<string, unknown>) => {
    const patched = await app.inject({ method: 'PATCH', url: `/api/vehicles/${id}`, headers, payload });
    expect(patched.statusCode).toBe(200);
  };
  const addChannel = async (payload: object) => {
    const created = await app.inject({ method: 'POST', url: '/api/notification-channels', headers, payload });
    expect(created.statusCode).toBe(201);
  };
  return { userId, patchSettings, createVehicle, patchVehicle, addChannel };
}

/** Moves a vehicle's creation date (the API always uses the current time). */
const setCreatedAt = (db: Db, vehicleId: string, createdAt: Date) =>
  db.update(vehicles).set({ createdAt }).where(eq(vehicles.id, vehicleId)).run();

const addReading = (db: Db, vehicleId: string, date: string, value: number) =>
  db.insert(odometerReadings).values({ vehicleId, date, value }).run();

/** Disables (an admin's `disabled_at`) or reactivates an account directly in the database. */
const setDisabled = (db: Db, userId: string, disabled: boolean) =>
  db
    .update(user)
    .set({ disabledAt: disabled ? new Date() : null })
    .where(eq(user.id, userId))
    .run();

const rows = (db: Db) => db.select().from(notifications).orderBy(asc(notifications.createdAt)).all();

const run = (db: Db, now = NOW, dispatcher = createTestDispatcher(db)) =>
  runOdometerNudge({ db, now, dispatcher });

describe('odometer nudge job scheduling', () => {
  it('schedules the job hourly when enabled', async () => {
    const run = vi.fn();
    const job = startOdometerNudgeJob({ enabled: true, run, logger: Fastify().log });
    try {
      expect(job).not.toBeNull();
      expect(ODOMETER_NUDGE_CRON).toBe('0 * * * *');
      expect(job?.getPattern()).toBe('0 * * * *');
      expect(job?.isRunning()).toBe(true);
      await job?.trigger();
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      job?.stop();
    }
    expect(job?.isRunning()).toBe(false);
  });

  it('does not schedule the job when disabled', () => {
    const run = vi.fn();
    expect(startOdometerNudgeJob({ enabled: false, run, logger: Fastify().log })).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it('logs a failing run instead of crashing', async () => {
    const logger = Fastify().log;
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const failure = new Error('boom');
    const job = startOdometerNudgeJob({
      enabled: true,
      run: () => {
        throw failure;
      },
      logger,
    });
    try {
      await job?.trigger();
      expect(error).toHaveBeenCalledWith(failure);
    } finally {
      job?.stop();
    }
  });
});

describe('weekdayOf and isoWeekOf', () => {
  it('returns the weekday of a date (0 = Sunday)', () => {
    expect(weekdayOf('2026-10-25')).toBe(0);
    expect(weekdayOf('2026-10-22')).toBe(4);
    expect(weekdayOf('2026-10-31')).toBe(6);
  });

  it('returns the ISO week of a date', () => {
    // Monday to Sunday of the same week.
    expect(isoWeekOf('2026-10-19')).toBe('2026-W43');
    expect(isoWeekOf('2026-10-25')).toBe('2026-W43');
    expect(isoWeekOf('2026-10-26')).toBe('2026-W44');
    // Weeks across a year boundary belong to the year of their Thursday.
    expect(isoWeekOf('2026-01-01')).toBe('2026-W01');
    expect(isoWeekOf('2027-01-03')).toBe('2026-W53');
    expect(isoWeekOf('2024-12-30')).toBe('2025-W01');
    expect(odometerNudgeDedupeKey('u1', '2026-10-25')).toBe('odometer_nudge:u1:2026-W43');
  });
});

describe('runOdometerNudge', () => {
  it('notifies stale active vehicles in one notification', async () => {
    const { app, db } = await createTestApp();
    const ada = await createUser(app, 'ada@example.com');
    const golf = await ada.createVehicle({ make: 'Volkswagen', model: 'Golf', name: 'Golf' });
    const clio = await ada.createVehicle({ make: 'Renault', model: 'Clio' });
    setCreatedAt(db, golf, LONG_AGO);
    setCreatedAt(db, clio, at('2026-09-02T10:00:00.000Z'));
    addReading(db, golf, '2026-10-01', 10_000);
    addReading(db, clio, '2026-10-10', 20_000);

    expect(await run(db)).toEqual({ evaluated: 1, created: 1, failed: 0 });
    expect(rows(db)).toEqual([
      {
        id: expect.any(String),
        userId: ada.userId,
        vehicleId: null,
        type: 'odometer_nudge',
        title: 'Golf, Renault Clio',
        body: null,
        link: '/odometer',
        dedupeKey: `odometer_nudge:${ada.userId}:2026-W43`,
        readAt: null,
        createdAt: NOW,
      },
    ]);
  });

  it('creates nothing without stale vehicles', async () => {
    const { app, db } = await createTestApp();
    const ada = await createUser(app, 'ada@example.com');
    const vehicle = await ada.createVehicle();
    setCreatedAt(db, vehicle, LONG_AGO);
    addReading(db, vehicle, '2026-10-24', 10_000);
    // A user without vehicles is not evaluated at all.
    await createUser(app, 'bob@example.com');

    expect(await run(db)).toEqual({ evaluated: 1, created: 0, failed: 0 });
    expect(rows(db)).toEqual([]);
  });

  describe('weekday and time zone', () => {
    it("only notifies on the user's weekday", async () => {
      const { app, db } = await createTestApp();
      const sunday = await createUser(app, 'ada@example.com', { odometerReminderWeekday: 0 });
      const monday = await createUser(app, 'bob@example.com', { odometerReminderWeekday: 1 });
      for (const user of [sunday, monday]) setCreatedAt(db, await user.createVehicle(), LONG_AGO);

      expect(await run(db)).toEqual({ evaluated: 1, created: 1, failed: 0 });
      expect(rows(db)).toMatchObject([{ userId: sunday.userId }]);
      // Monday 2026-10-26, 11:00 in Madrid.
      expect(await run(db, at('2026-10-26T10:00:00.000Z'))).toEqual({ evaluated: 1, created: 1, failed: 0 });
      expect(rows(db).map((row) => row.userId)).toEqual([sunday.userId, monday.userId]);
    });

    it("uses the user's time zone for the weekday", async () => {
      const { app, db } = await createTestApp();
      // 2026-10-22T20:00Z: Thursday 20:00 in UTC, already Friday 09:00 in Auckland (NZDT).
      const now = at('2026-10-22T20:00:00.000Z');
      const auckland = await createUser(app, 'ada@example.com', {
        timezone: 'Pacific/Auckland',
        odometerReminderWeekday: 5,
      });
      const utcFriday = await createUser(app, 'bob@example.com', {
        timezone: 'UTC',
        odometerReminderWeekday: 5,
      });
      const utcThursday = await createUser(app, 'eve@example.com', {
        timezone: 'UTC',
        odometerReminderWeekday: 4,
      });
      for (const user of [auckland, utcFriday, utcThursday]) {
        setCreatedAt(db, await user.createVehicle(), LONG_AGO);
      }

      expect(await run(db, now)).toEqual({ evaluated: 2, created: 2, failed: 0 });
      expect(
        rows(db)
          .map((row) => row.userId)
          .sort(),
      ).toEqual([auckland.userId, utcThursday.userId].sort());
    });

    it('skips users without a reminder weekday', async () => {
      const { app, db } = await createTestApp();
      const off = await createUser(app, 'ada@example.com', { odometerReminderWeekday: null });
      const noSettings = await createUser(app, 'bob@example.com');
      for (const user of [off, noSettings]) setCreatedAt(db, await user.createVehicle(), LONG_AGO);
      db.delete(userSettings).where(eq(userSettings.userId, noSettings.userId)).run();

      expect(createVehiclesRepository(db).listActiveForOdometerNudge()).toEqual([]);
      expect(await run(db)).toEqual({ evaluated: 0, created: 0, failed: 0 });
      expect(rows(db)).toEqual([]);
    });

    it('waits for the reminder hour', async () => {
      const { app, db } = await createTestApp();
      const ada = await createUser(app, 'ada@example.com', { reminderHour: 9 });
      setCreatedAt(db, await ada.createVehicle(), LONG_AGO);

      // 08:00, then 09:00 in Madrid (CET).
      expect(await run(db, at('2026-10-25T07:00:00.000Z'))).toEqual({ evaluated: 0, created: 0, failed: 0 });
      expect(await run(db, at('2026-10-25T08:00:00.000Z'))).toEqual({ evaluated: 1, created: 1, failed: 0 });
      // Catches up later the same day without notifying twice.
      expect(await run(db, at('2026-10-25T18:00:00.000Z'))).toEqual({ evaluated: 1, created: 0, failed: 0 });
    });
  });

  describe('threshold and exclusions', () => {
    it('uses a 7-day threshold', async () => {
      const { app, db } = await createTestApp();
      const ada = await createUser(app, 'ada@example.com');
      const sevenDays = await ada.createVehicle({ name: 'Siete' });
      const sixDays = await ada.createVehicle({ name: 'Seis' });
      for (const id of [sevenDays, sixDays]) setCreatedAt(db, id, LONG_AGO);
      // Today is 2026-10-25; the latest reading decides, not the earlier ones.
      addReading(db, sevenDays, '2026-10-01', 9_000);
      addReading(db, sevenDays, '2026-10-18', 10_000);
      addReading(db, sixDays, '2026-10-01', 19_000);
      addReading(db, sixDays, '2026-10-19', 20_000);

      expect(await run(db)).toEqual({ evaluated: 1, created: 1, failed: 0 });
      expect(rows(db)).toMatchObject([{ title: 'Siete' }]);
    });

    it('counts vehicles without readings from their creation date', async () => {
      const { app, db } = await createTestApp();
      const ada = await createUser(app, 'ada@example.com');
      const old = await ada.createVehicle({ name: 'Antiguo' });
      const recent = await ada.createVehicle({ name: 'Reciente' });
      // Local creation dates in Madrid: 2026-10-18 (7 days) and 2026-10-19 (6 days, though still
      // 2026-10-18 in UTC).
      setCreatedAt(db, old, at('2026-10-18T10:00:00.000Z'));
      setCreatedAt(db, recent, at('2026-10-18T22:30:00.000Z'));

      expect(await run(db)).toEqual({ evaluated: 1, created: 1, failed: 0 });
      expect(rows(db)).toMatchObject([{ title: 'Antiguo' }]);
    });

    it('skips archived and sold vehicles', async () => {
      const { app, db } = await createTestApp();
      const ada = await createUser(app, 'ada@example.com');
      const active = await ada.createVehicle({ name: 'Activo' });
      const archived = await ada.createVehicle({ name: 'Archivado' });
      const sold = await ada.createVehicle({ name: 'Vendido' });
      for (const id of [active, archived, sold]) setCreatedAt(db, id, LONG_AGO);
      await ada.patchVehicle(archived, { archived: true });
      await ada.patchVehicle(sold, { soldAt: '2026-03-01' });

      expect(await run(db)).toEqual({ evaluated: 1, created: 1, failed: 0 });
      expect(rows(db)).toMatchObject([{ title: 'Activo' }]);

      // Without active vehicles the user is not evaluated.
      await ada.patchVehicle(active, { archived: true });
      expect(await run(db, at('2026-11-01T10:00:00.000Z'))).toEqual({ evaluated: 0, created: 0, failed: 0 });
    });
  });

  describe('disabled users', () => {
    it('skips disabled users', async () => {
      const { app, db } = await createTestApp();
      const ada = await createUser(app, 'ada@example.com');
      const bob = await createUser(app, 'bob@example.com');
      setCreatedAt(db, await ada.createVehicle({ name: 'Golf' }), LONG_AGO);
      setCreatedAt(db, await bob.createVehicle({ name: 'Civic' }), LONG_AGO);
      await ada.addChannel({ type: 'webhook', config: { url: 'https://hooks.example.com/ada' } });
      await bob.addChannel({ type: 'webhook', config: { url: 'https://hooks.example.com/bob' } });
      setDisabled(db, ada.userId, true);
      const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 200 }));

      expect(await run(db, NOW, createTestDispatcher(db, fetch))).toEqual({
        evaluated: 1,
        created: 1,
        failed: 0,
      });
      expect(rows(db)).toMatchObject([{ userId: bob.userId, title: 'Civic' }]);
      expect(fetch.mock.calls.map(([url]) => String(url))).toEqual(['https://hooks.example.com/bob']);
    });

    it('nudges a reactivated user on the next run', async () => {
      const { app, db } = await createTestApp();
      const ada = await createUser(app, 'ada@example.com');
      setCreatedAt(db, await ada.createVehicle({ name: 'Golf' }), LONG_AGO);
      setDisabled(db, ada.userId, true);

      expect(await run(db)).toEqual({ evaluated: 0, created: 0, failed: 0 });
      expect(rows(db)).toEqual([]);

      setDisabled(db, ada.userId, false);
      const later = at('2026-10-25T11:00:00.000Z');
      expect(await run(db, later)).toEqual({ evaluated: 1, created: 1, failed: 0 });
      expect(rows(db)).toMatchObject([
        {
          userId: ada.userId,
          title: 'Golf',
          dedupeKey: `odometer_nudge:${ada.userId}:2026-W43`,
          createdAt: later,
        },
      ]);
    });
  });

  describe('deduplication and channels', () => {
    it('does not duplicate the notification in the same week', async () => {
      const { app, db } = await createTestApp();
      // Wednesday 2026-10-21 of ISO week 2026-W43.
      const ada = await createUser(app, 'ada@example.com', { odometerReminderWeekday: 3 });
      setCreatedAt(db, await ada.createVehicle(), LONG_AGO);

      const wednesday = at('2026-10-21T10:00:00.000Z');
      expect(await run(db, wednesday)).toEqual({ evaluated: 1, created: 1, failed: 0 });
      expect(await run(db, at('2026-10-21T11:00:00.000Z'))).toEqual({ evaluated: 1, created: 0, failed: 0 });
      // Changing the day to Sunday of the same week does not nudge again.
      await ada.patchSettings({ odometerReminderWeekday: 0 });
      expect(await run(db)).toEqual({ evaluated: 1, created: 0, failed: 0 });
      expect(rows(db)).toMatchObject([
        { userId: ada.userId, dedupeKey: `odometer_nudge:${ada.userId}:2026-W43`, createdAt: wednesday },
      ]);
    });

    it('notifies again the next week', async () => {
      const { app, db } = await createTestApp();
      const ada = await createUser(app, 'ada@example.com');
      setCreatedAt(db, await ada.createVehicle(), LONG_AGO);

      expect((await run(db)).created).toBe(1);
      expect((await run(db, at('2026-11-01T10:00:00.000Z'))).created).toBe(1);
      expect(rows(db).map((row) => row.dedupeKey)).toEqual([
        `odometer_nudge:${ada.userId}:2026-W43`,
        `odometer_nudge:${ada.userId}:2026-W44`,
      ]);
    });

    it("sends new notifications through the owner's channels", async () => {
      const { app, db } = await createTestApp();
      const ada = await createUser(app, 'ada@example.com');
      const bob = await createUser(app, 'bob@example.com', { locale: 'en' });
      setCreatedAt(db, await ada.createVehicle({ name: 'Golf' }), LONG_AGO);
      setCreatedAt(db, await ada.createVehicle({ name: 'Clio' }), at('2026-09-02T10:00:00.000Z'));
      setCreatedAt(db, await bob.createVehicle({ name: 'Civic' }), LONG_AGO);
      await ada.addChannel({ type: 'webhook', config: { url: 'https://hooks.example.com/ada' } });
      await ada.addChannel({
        type: 'webhook',
        enabled: false,
        config: { url: 'https://hooks.example.com/off' },
      });
      await bob.addChannel({ type: 'webhook', config: { url: 'https://hooks.example.com/bob' } });
      const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 200 }));

      expect(await run(db, NOW, createTestDispatcher(db, fetch))).toEqual({
        evaluated: 2,
        created: 2,
        failed: 0,
      });

      const sent = Object.fromEntries(
        fetch.mock.calls.map(([url, init]) => [String(url), JSON.parse(String(init?.body))]),
      );
      expect(Object.keys(sent).sort()).toEqual([
        'https://hooks.example.com/ada',
        'https://hooks.example.com/bob',
      ]);
      expect(sent['https://hooks.example.com/ada']).toEqual({
        event: 'notification',
        type: 'odometer_nudge',
        title: 'Registra los km: Golf, Clio',
        body: 'Golf, Clio',
        link: 'http://localhost:3000/odometer',
        createdAt: NOW.toISOString(),
      });
      expect(sent['https://hooks.example.com/bob']).toMatchObject({ title: 'Log your mileage: Civic' });
    });

    it('does not resend deduplicated notifications', async () => {
      const { app, db } = await createTestApp();
      const ada = await createUser(app, 'ada@example.com');
      setCreatedAt(db, await ada.createVehicle(), LONG_AGO);
      await ada.addChannel({ type: 'webhook', config: { url: 'https://hooks.example.com/ada' } });
      const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 200 }));
      const dispatcher = createTestDispatcher(db, fetch);

      expect((await run(db, NOW, dispatcher)).created).toBe(1);
      expect(fetch).toHaveBeenCalledOnce();
      expect((await run(db, at('2026-10-25T12:00:00.000Z'), dispatcher)).created).toBe(0);
      expect(fetch).toHaveBeenCalledOnce();
    });
  });
});
