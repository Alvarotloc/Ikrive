import { AVERAGE_WINDOW_DAYS, addDays, computeScheduleDue } from '@ikrive/shared';
import { asc, eq } from 'drizzle-orm';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config';
import type { Db } from '../src/db/client';
import { maintenanceSchedules, notifications, odometerReadings, userSettings } from '../src/db/schema';
import {
  REMINDERS_CRON,
  reminderDedupeKey,
  runReminders,
  startRemindersJob,
} from '../src/jobs/reminders.job';
import { hourIn } from '../src/lib/dates';
import { createNotificationsRepository } from '../src/modules/notifications/repository';
import { createVehiclesRepository } from '../src/modules/vehicles/repository';
import { createTestApp, signUp } from './helpers';

type TestApp = Awaited<ReturnType<typeof createTestApp>>['app'];

/** 12:00 in Madrid (CEST) and 06:00 in New York (EDT); «today» is 2026-10-22 in both. */
const NOW = new Date('2026-10-22T10:00:00.000Z');
const at = (iso: string) => new Date(iso);

/** Due 2026-01-01: overdue on NOW. */
const overdueRule = {
  title: 'Cambio de aceite',
  category: 'oil_change',
  intervalMonths: 12,
  lastDoneDate: '2025-01-01',
  lastDoneOdometer: 10_000,
} as const;
/** Due 2026-11-10 with 30 warning days: due soon on NOW. */
const dueSoonRule = {
  title: 'ITV',
  category: 'inspection',
  intervalMonths: 12,
  warnDays: 30,
  lastDoneDate: '2025-11-10',
  lastDoneOdometer: null,
} as const;
/** Due 2027-06-01: ok on NOW. */
const okRule = {
  title: 'Frenos',
  category: 'brakes',
  intervalMonths: 12,
  lastDoneDate: '2026-06-01',
} as const;

async function createUser(app: TestApp, email: string, settings: Record<string, unknown> = {}) {
  const { response, cookie } = await signUp(app, email);
  if (Object.keys(settings).length > 0) {
    const patched = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie },
      payload: settings,
    });
    expect(patched.statusCode).toBe(200);
  }
  const userId = (response.json() as { user: { id: string } }).user.id;

  const createVehicle = async (fields: Record<string, unknown> = {}) => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers: { cookie },
      payload: { make: 'Seat', model: 'León', ...fields },
    });
    expect(created.statusCode).toBe(201);
    return (created.json() as { id: string }).id;
  };
  const createSchedule = async (vehicleId: string, payload: Record<string, unknown>) => {
    const created = await app.inject({
      method: 'POST',
      url: `/api/vehicles/${vehicleId}/schedules`,
      headers: { cookie },
      payload,
    });
    expect(created.statusCode).toBe(201);
    return (created.json() as { id: string }).id;
  };
  const patchSchedule = async (vehicleId: string, scheduleId: string, payload: Record<string, unknown>) => {
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/vehicles/${vehicleId}/schedules/${scheduleId}`,
      headers: { cookie },
      payload,
    });
    expect(patched.statusCode).toBe(200);
  };
  return { cookie, userId, createVehicle, createSchedule, patchSchedule };
}

const rows = (db: Db) => db.select().from(notifications).orderBy(asc(notifications.title)).all();

describe('reminders job scheduling', () => {
  it('validates REMINDERS_ENABLED', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).REMINDERS_ENABLED).toBe(true);
    expect(loadConfig({ NODE_ENV: 'test', REMINDERS_ENABLED: 'false' }).REMINDERS_ENABLED).toBe(false);
    expect(loadConfig({ NODE_ENV: 'test', REMINDERS_ENABLED: '0' }).REMINDERS_ENABLED).toBe(false);
    expect(loadConfig({ NODE_ENV: 'test', REMINDERS_ENABLED: '1' }).REMINDERS_ENABLED).toBe(true);
    expect(() => loadConfig({ NODE_ENV: 'test', REMINDERS_ENABLED: 'yes' })).toThrow(/REMINDERS_ENABLED/);
  });

  it('schedules the job hourly when enabled', async () => {
    const run = vi.fn();
    const job = startRemindersJob({ enabled: true, run, logger: Fastify().log });
    try {
      expect(job).not.toBeNull();
      expect(REMINDERS_CRON).toBe('0 * * * *');
      expect(job?.getPattern()).toBe('0 * * * *');
      expect(job?.isRunning()).toBe(true);
      await job?.trigger();
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      job?.stop();
    }
    expect(job?.isRunning()).toBe(false);
  });

  it('logs a failing run instead of crashing', async () => {
    const logger = Fastify().log;
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const failure = new Error('boom');
    const job = startRemindersJob({
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

  it('does not schedule the job when disabled', () => {
    const run = vi.fn();
    expect(startRemindersJob({ enabled: false, run, logger: Fastify().log })).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
});

describe('runReminders', () => {
  it('notifies due soon and overdue schedules', async () => {
    const { app, db } = await createTestApp();
    const ada = await createUser(app, 'ada@example.com');
    const named = await ada.createVehicle({ name: 'Mi coche' });
    const unnamed = await ada.createVehicle({ make: 'Honda', model: 'Civic' });
    const overdueId = await ada.createSchedule(named, overdueRule);
    const dueSoonId = await ada.createSchedule(unnamed, dueSoonRule);
    await ada.createSchedule(named, okRule);

    expect(runReminders({ db, now: NOW })).toEqual({ evaluated: 3, created: 2 });

    expect(rows(db)).toEqual([
      {
        id: expect.any(String),
        userId: ada.userId,
        vehicleId: named,
        type: 'schedule_overdue',
        title: 'Cambio de aceite',
        body: 'Mi coche',
        link: `/vehicles/${named}`,
        dedupeKey: `schedule:${overdueId}:overdue:2025-01-01:10000`,
        readAt: null,
        createdAt: NOW,
      },
      {
        id: expect.any(String),
        userId: ada.userId,
        vehicleId: unnamed,
        type: 'schedule_due_soon',
        title: 'ITV',
        body: 'Honda Civic',
        link: `/vehicles/${unnamed}`,
        dedupeKey: `schedule:${dueSoonId}:due_soon:2025-11-10:`,
        readAt: null,
        createdAt: NOW,
      },
    ]);

    // The owner sees them through the API, unread.
    const list = await app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { cookie: ada.cookie },
    });
    expect(list.json()).toMatchObject({ total: 2, unreadCount: 2 });
  });

  it('skips ok schedules', async () => {
    const { app, db } = await createTestApp();
    const ada = await createUser(app, 'ada@example.com');
    const vehicle = await ada.createVehicle();
    await ada.createSchedule(vehicle, okRule);
    // Distance rule far from its due odometer.
    await ada.createSchedule(vehicle, {
      title: 'Neumáticos',
      category: 'tires',
      intervalDistance: 40_000,
      lastDoneDate: '2026-01-01',
      lastDoneOdometer: 20_000,
    });
    db.insert(odometerReadings).values({ vehicleId: vehicle, date: '2026-10-01', value: 25_000 }).run();

    expect(runReminders({ db, now: NOW })).toEqual({ evaluated: 2, created: 0 });
    expect(rows(db)).toEqual([]);
  });

  it('skips archived and sold vehicles', async () => {
    const { app, db } = await createTestApp();
    const ada = await createUser(app, 'ada@example.com');
    const archived = await ada.createVehicle();
    const sold = await ada.createVehicle();
    await ada.createSchedule(archived, overdueRule);
    await ada.createSchedule(sold, dueSoonRule);
    const headers = { cookie: ada.cookie };
    for (const [id, payload] of [
      [archived, { archived: true }],
      [sold, { soldAt: '2026-03-01' }],
    ] as const) {
      expect(
        (await app.inject({ method: 'PATCH', url: `/api/vehicles/${id}`, headers, payload })).statusCode,
      ).toBe(200);
    }

    expect(runReminders({ db, now: NOW })).toEqual({ evaluated: 0, created: 0 });
    expect(rows(db)).toEqual([]);
  });

  it("uses the owner's time zone for today", async () => {
    const { app, db } = await createTestApp();
    // 2026-10-22T23:30Z: already 2026-10-23 in Madrid (01:30), still 2026-10-22 in New York (19:30).
    const now = at('2026-10-22T23:30:00.000Z');
    const madrid = await createUser(app, 'ada@example.com', { timezone: 'Europe/Madrid', reminderHour: 0 });
    const newYork = await createUser(app, 'bob@example.com', {
      timezone: 'America/New_York',
      reminderHour: 0,
    });
    // Due exactly on 2026-10-23, without warning days.
    const rule = { ...overdueRule, warnDays: 0, lastDoneDate: '2025-10-23' };
    await madrid.createSchedule(await madrid.createVehicle(), rule);
    await newYork.createSchedule(await newYork.createVehicle(), rule);

    expect(runReminders({ db, now })).toEqual({ evaluated: 2, created: 1 });
    expect(rows(db)).toMatchObject([{ userId: madrid.userId, type: 'schedule_overdue' }]);
  });

  describe('deduplication', () => {
    it('does not duplicate notifications when run twice the same day', async () => {
      const { app, db } = await createTestApp();
      const ada = await createUser(app, 'ada@example.com');
      const vehicle = await ada.createVehicle();
      await ada.createSchedule(vehicle, overdueRule);
      await ada.createSchedule(vehicle, dueSoonRule);

      expect(runReminders({ db, now: NOW })).toEqual({ evaluated: 2, created: 2 });
      const first = rows(db);
      expect(runReminders({ db, now: at('2026-10-22T18:00:00.000Z') })).toEqual({ evaluated: 2, created: 0 });
      expect(rows(db)).toEqual(first);
      // Still the same status and period on later days: nothing new either.
      expect(runReminders({ db, now: at('2026-10-24T10:00:00.000Z') })).toEqual({ evaluated: 2, created: 0 });
      expect(rows(db)).toHaveLength(2);
    });

    it('notifies again when the schedule becomes overdue', async () => {
      const { app, db } = await createTestApp();
      const ada = await createUser(app, 'ada@example.com');
      const scheduleId = await ada.createSchedule(await ada.createVehicle(), dueSoonRule);

      expect(runReminders({ db, now: NOW }).created).toBe(1);
      // Due on 2026-11-10.
      expect(runReminders({ db, now: at('2026-11-10T10:00:00.000Z') }).created).toBe(1);
      expect(rows(db).map((row) => [row.type, row.dedupeKey])).toEqual([
        ['schedule_due_soon', `schedule:${scheduleId}:due_soon:2025-11-10:`],
        ['schedule_overdue', `schedule:${scheduleId}:overdue:2025-11-10:`],
      ]);
    });

    it('notifies again in a new period', async () => {
      const { app, db } = await createTestApp();
      const ada = await createUser(app, 'ada@example.com');
      const vehicle = await ada.createVehicle();
      const scheduleId = await ada.createSchedule(vehicle, overdueRule);

      expect(runReminders({ db, now: NOW }).created).toBe(1);
      // Done again, but already overdue for the new period too (due 2026-10-01).
      await ada.patchSchedule(vehicle, scheduleId, { lastDoneDate: '2025-10-01', lastDoneOdometer: 20_000 });
      expect(runReminders({ db, now: NOW }).created).toBe(1);
      // A new odometer alone also starts a new period.
      await ada.patchSchedule(vehicle, scheduleId, { lastDoneOdometer: 21_000 });
      expect(runReminders({ db, now: NOW }).created).toBe(1);

      expect(
        rows(db)
          .map((row) => row.dedupeKey)
          .sort(),
      ).toEqual([
        `schedule:${scheduleId}:overdue:2025-01-01:10000`,
        `schedule:${scheduleId}:overdue:2025-10-01:20000`,
        `schedule:${scheduleId}:overdue:2025-10-01:21000`,
      ]);
    });

    it('ignores a duplicated dedupe key on insert', async () => {
      const { app, db } = await createTestApp();
      const ada = await createUser(app, 'ada@example.com');
      const repo = createNotificationsRepository(db);
      const row = (key: string) => ({
        userId: ada.userId,
        type: 'schedule_overdue' as const,
        title: key,
        dedupeKey:
          reminderDedupeKey('s1', 'overdue', { lastDoneDate: '2025-01-01', lastDoneOdometer: null }) + key,
      });

      expect(repo.createMany([row('a')])).toHaveLength(1);
      expect(repo.createMany([row('a')])).toEqual([]);
      const inserted = repo.createMany([row('a'), row('b')]);
      expect(inserted.map((r) => r.title)).toEqual(['b']);
      expect(rows(db).map((r) => r.title)).toEqual(['a', 'b']);
    });
  });

  describe('reminder hour', () => {
    it('hourIn returns the local hour of the time zone', () => {
      expect(hourIn('Europe/Madrid', NOW)).toBe(12);
      expect(hourIn('America/New_York', NOW)).toBe(6);
      expect(hourIn('UTC', at('2026-10-22T00:30:00.000Z'))).toBe(0);
      expect(hourIn('Not/AZone', NOW)).toBe(10);
    });

    it('only evaluates owners whose local hour reached their reminder hour', async () => {
      const { app, db } = await createTestApp();
      // On NOW: 12:00 in Madrid, 06:00 in New York.
      const inTime = await createUser(app, 'ada@example.com', { reminderHour: 12 });
      const later = await createUser(app, 'bob@example.com', { reminderHour: 20 });
      const otherZone = await createUser(app, 'eve@example.com', {
        timezone: 'America/New_York',
        reminderHour: 8,
      });
      for (const user of [inTime, later, otherZone]) {
        await user.createSchedule(await user.createVehicle(), overdueRule);
      }

      expect(runReminders({ db, now: NOW })).toEqual({ evaluated: 1, created: 1 });
      expect(rows(db)).toMatchObject([{ userId: inTime.userId }]);
    });

    it('uses the default reminder hour without settings', async () => {
      const { app, db } = await createTestApp();
      const ada = await createUser(app, 'ada@example.com');
      await ada.createSchedule(await ada.createVehicle(), overdueRule);
      db.delete(userSettings).where(eq(userSettings.userId, ada.userId)).run();

      // 07:59 and 08:00 in Madrid.
      expect(runReminders({ db, now: at('2026-10-22T05:59:00.000Z') })).toEqual({ evaluated: 0, created: 0 });
      expect(runReminders({ db, now: at('2026-10-22T06:00:00.000Z') })).toEqual({ evaluated: 1, created: 1 });
    });

    it('catches up later the same day', async () => {
      const { app, db } = await createTestApp();
      const ada = await createUser(app, 'ada@example.com', { reminderHour: 8 });
      await ada.createSchedule(await ada.createVehicle(), overdueRule);

      // 07:00, then 17:00 (the 08:00 run was missed), then 18:00 in Madrid.
      expect(runReminders({ db, now: at('2026-10-22T05:00:00.000Z') }).created).toBe(0);
      expect(runReminders({ db, now: at('2026-10-22T15:00:00.000Z') }).created).toBe(1);
      expect(runReminders({ db, now: at('2026-10-22T16:00:00.000Z') }).created).toBe(0);
      expect(rows(db)).toHaveLength(1);
    });
  });

  it('bounded readings give the same due status as the full history', async () => {
    const { app, db } = await createTestApp();
    const ada = await createUser(app, 'ada@example.com');
    const recent = await ada.createVehicle();
    const stale = await ada.createVehicle();
    const today = '2026-10-22';
    const since = addDays(today, -AVERAGE_WINDOW_DAYS);
    db.insert(odometerReadings)
      .values([
        // Old readings that the 90-day average ignores, then readings inside the window.
        { vehicleId: recent, date: '2024-01-01', value: 1_000 },
        { vehicleId: recent, date: '2025-06-01', value: 9_000 },
        { vehicleId: recent, date: since, value: 18_000 },
        { vehicleId: recent, date: '2026-09-01', value: 20_000 },
        { vehicleId: recent, date: '2026-10-20', value: 22_000 },
        // Last reading before the window, twice on the same date.
        { vehicleId: stale, date: '2024-05-01', value: 3_000 },
        { vehicleId: stale, date: '2025-03-01', value: 5_000 },
        { vehicleId: stale, date: '2025-03-01', value: 5_100 },
      ])
      .run();
    const distanceRule = { title: 'Aceite', category: 'oil_change', lastDoneDate: '2026-01-01' } as const;
    await ada.createSchedule(recent, { ...distanceRule, intervalDistance: 12_000, lastDoneOdometer: 10_000 });
    await ada.createSchedule(recent, { ...distanceRule, intervalDistance: 30_000, lastDoneOdometer: 10_000 });
    await ada.createSchedule(stale, { ...distanceRule, intervalDistance: 600, lastDoneOdometer: 4_600 });
    await ada.createSchedule(stale, { ...distanceRule, intervalMonths: 24, intervalDistance: 10_000 });

    const vehicles = createVehiclesRepository(db);
    const bounded = vehicles.listRecentReadingsByVehicles([recent, stale], since);
    expect(
      bounded
        .map(({ vehicleId, date, value }) => [vehicleId === recent ? 'recent' : 'stale', date, value])
        .sort(),
    ).toEqual(
      [
        ['recent', '2026-07-24', 18_000],
        ['recent', '2026-09-01', 20_000],
        ['recent', '2026-10-20', 22_000],
        ['stale', '2025-03-01', 5_000],
        ['stale', '2025-03-01', 5_100],
      ].sort(),
    );

    const schedules = db.select().from(maintenanceSchedules).all();
    const statuses = schedules.map((rule) => {
      const full = computeScheduleDue(rule, vehicles.listReadings(rule.vehicleId), today);
      const fromBounded = computeScheduleDue(
        rule,
        bounded.filter((reading) => reading.vehicleId === rule.vehicleId),
        today,
      );
      expect(fromBounded).toEqual(full);
      return full.status;
    });
    // The fixture covers every status, and an estimated date from the recent average.
    expect(new Set(statuses)).toEqual(new Set(['ok', 'due_soon', 'overdue']));
  });
});
