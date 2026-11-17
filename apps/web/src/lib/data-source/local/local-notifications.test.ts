import { LOCAL_USER_ID } from '@ikrive/db';
import {
  maintenanceSchedules,
  notifications,
  odometerReadings,
  userSettings,
  vehicles,
} from '@ikrive/db/schema';
import {
  notificationListSchema,
  notificationSchema,
  odometerNudgeNotification,
  type Problem,
  scheduleReminderNotification,
} from '@ikrive/shared';
import { asc, eq } from 'drizzle-orm';
import type { AsyncRemoteCallback } from 'drizzle-orm/sqlite-proxy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { fakeImages } from '@/test/fake-images';
import { createMemoryFileStore } from '@/test/memory-file-store';
import { createMemorySqlite } from '@/test/memory-sqlite';
import type { DataSource } from '../types';
import { createLocalDataSource, type LocalDb, openLocalDatabase } from './index';
import { generateLocalReminders } from './notifications';

/** Thursday 2026-10-22, 12:00 in Madrid (CEST) and 06:00 in New York (EDT). */
const NOW = new Date('2026-10-22T10:00:00.000Z');
/** Sunday 2026-10-25, 11:00 in Madrid (CET): the default odometer reminder weekday (0). */
const SUNDAY = new Date('2026-10-25T10:00:00.000Z');
/** Well before NOW: vehicles created then and without readings are pending for the nudge. */
const LONG_AGO = new Date('2026-01-01T10:00:00.000Z');
const at = (iso: string) => new Date(iso);

/** Due 2026-01-01: overdue on NOW. */
const overdueRule = {
  title: 'Cambio de aceite',
  category: 'oil_change',
  intervalMonths: 12,
  intervalDistance: null,
  warnDays: 30,
  warnDistance: 1000,
  lastDoneDate: '2025-01-01',
  lastDoneOdometer: 10_000,
} as const;
/** Due 2026-11-10 with 30 warning days: due soon on NOW. */
const dueSoonRule = {
  ...overdueRule,
  title: 'ITV',
  category: 'inspection',
  lastDoneDate: '2025-11-10',
  lastDoneOdometer: null,
} as const;
/** Due 2027-06-01: ok on NOW. */
const okRule = { ...overdueRule, title: 'Frenos', category: 'brakes', lastDoneDate: '2026-06-01' } as const;

let db: LocalDb;
/** Every statement that reached the engine. */
let statements: string[];

async function openDb(): Promise<LocalDb> {
  const memory = createMemorySqlite();
  const recording: AsyncRemoteCallback = (sql, params, method) => {
    statements.push(sql);
    return memory(sql, params, method);
  };
  return openLocalDatabase(recording);
}

beforeEach(async () => {
  statements = [];
  db = await openDb();
});

async function addVehicle(
  fields: Partial<typeof vehicles.$inferInsert> = {},
  target: LocalDb = db,
): Promise<typeof vehicles.$inferSelect> {
  return target
    .insert(vehicles)
    .values({ ownerId: LOCAL_USER_ID, make: 'Seat', model: 'León', createdAt: LONG_AGO, ...fields })
    .returning()
    .get();
}

async function addSchedule(
  vehicleId: string,
  rule: Omit<typeof maintenanceSchedules.$inferInsert, 'vehicleId'>,
  target: LocalDb = db,
) {
  return target
    .insert(maintenanceSchedules)
    .values({ ...rule, vehicleId })
    .returning()
    .get();
}

async function addReading(vehicleId: string, date: string, value: number) {
  await db.insert(odometerReadings).values({ vehicleId, date, value });
}

async function setSettings(changes: Partial<typeof userSettings.$inferInsert>) {
  await db.update(userSettings).set(changes).where(eq(userSettings.userId, LOCAL_USER_ID));
}

const rows = () => db.select().from(notifications).orderBy(asc(notifications.title)).all();

describe('generateLocalReminders', () => {
  it('stores due soon and overdue reminders with the shared drafts', async () => {
    const named = await addVehicle({ name: 'Mi coche' });
    const unnamed = await addVehicle({ make: 'Honda', model: 'Civic' });
    const overdue = await addSchedule(named.id, overdueRule);
    const dueSoon = await addSchedule(unnamed.id, dueSoonRule);
    await addSchedule(named.id, okRule);
    await addReading(named.id, '2026-10-01', 15_000);

    expect(await generateLocalReminders(db, NOW)).toBe(2);

    const expected = [
      scheduleReminderNotification(overdue, named, [{ date: '2026-10-01', value: 15_000 }], '2026-10-22'),
      scheduleReminderNotification(dueSoon, unnamed, [], '2026-10-22'),
    ];
    expect(expected).toEqual([
      expect.objectContaining({ type: 'schedule_overdue', title: 'Cambio de aceite', body: 'Mi coche' }),
      expect.objectContaining({ type: 'schedule_due_soon', title: 'ITV', body: 'Honda Civic' }),
    ]);
    expect(await rows()).toEqual(
      expected.map((draft) => ({
        ...draft,
        id: expect.any(String),
        userId: LOCAL_USER_ID,
        readAt: null,
        createdAt: NOW,
      })),
    );
    expect((await rows()).map((row) => row.dedupeKey)).toEqual([
      `schedule:${overdue.id}:overdue:2025-01-01:10000`,
      `schedule:${dueSoon.id}:due_soon:2025-11-10:`,
    ]);
  });

  it('does nothing before the reminder hour', async () => {
    await setSettings({ reminderHour: 13 });
    const vehicle = await addVehicle();
    await addSchedule(vehicle.id, overdueRule);

    // 12:00 in Madrid on Thursday, then 12:00 on Sunday (the odometer weekday).
    expect(await generateLocalReminders(db, NOW)).toBe(0);
    expect(await generateLocalReminders(db, at('2026-10-25T11:00:00.000Z'))).toBe(0);
    expect(await rows()).toEqual([]);

    // From 13:00 in Madrid.
    expect(await generateLocalReminders(db, at('2026-10-22T11:00:00.000Z'))).toBe(1);
  });

  it("uses the user's time zone and reminder hour", async () => {
    await setSettings({ timezone: 'America/New_York', reminderHour: 7 });
    const vehicle = await addVehicle();
    await addSchedule(vehicle.id, overdueRule);

    // 06:00 in New York (12:00 in Madrid).
    expect(await generateLocalReminders(db, NOW)).toBe(0);
    // 07:00 in New York.
    expect(await generateLocalReminders(db, at('2026-10-22T11:00:00.000Z'))).toBe(1);

    // Due 2026-11-22, so due soon from 2026-10-23: at 2026-10-22T23:30Z it is already that day in UTC, but still Thursday
    // 19:30 in New York, so «today» is the user's and nothing new is stored.
    const fromFriday = await addSchedule(vehicle.id, { ...dueSoonRule, lastDoneDate: '2025-11-22' });
    expect(scheduleReminderNotification(fromFriday, vehicle, [], '2026-10-23')).not.toBeNull();
    expect(scheduleReminderNotification(fromFriday, vehicle, [], '2026-10-22')).toBeNull();
    expect(await generateLocalReminders(db, at('2026-10-22T23:30:00.000Z'))).toBe(0);
    expect(await rows()).toHaveLength(1);
  });

  it('skips archived and sold vehicles', async () => {
    const active = await addVehicle({ name: 'Activo' });
    const archived = await addVehicle({ name: 'Archivado', archivedAt: LONG_AGO });
    const sold = await addVehicle({ name: 'Vendido', soldAt: '2026-03-01' });
    for (const vehicle of [active, archived, sold]) await addSchedule(vehicle.id, overdueRule);

    expect(await generateLocalReminders(db, NOW)).toBe(1);
    expect(await rows()).toMatchObject([{ vehicleId: active.id, body: 'Activo' }]);

    // The odometer nudge only lists the active vehicle.
    expect(await generateLocalReminders(db, SUNDAY)).toBe(1);
    expect(await rows()).toMatchObject([
      { type: 'odometer_nudge', title: 'Activo' },
      { vehicleId: active.id, body: 'Activo' },
    ]);
  });

  it('stores the odometer nudge on the weekday from the reminder hour', async () => {
    const golf = await addVehicle({ make: 'Volkswagen', model: 'Golf', name: 'Golf' });
    const clio = await addVehicle({
      make: 'Renault',
      model: 'Clio',
      createdAt: at('2026-09-02T10:00:00.000Z'),
    });
    const sevenDays = await addVehicle({ name: 'Siete', createdAt: at('2026-09-03T10:00:00.000Z') });
    const sixDays = await addVehicle({ name: 'Seis', createdAt: at('2026-09-04T10:00:00.000Z') });
    // Without readings: created 7 days before Sunday in Madrid, and 6 days (still 2026-10-18 in UTC).
    const old = await addVehicle({ name: 'Antiguo', createdAt: at('2026-10-18T10:00:00.000Z') });
    await addVehicle({ name: 'Reciente', createdAt: at('2026-10-18T22:30:00.000Z') });
    await addReading(golf.id, '2026-10-01', 10_000);
    await addReading(clio.id, '2026-10-10', 20_000);
    // Today is 2026-10-25; the latest reading decides, not the earlier ones.
    await addReading(sevenDays.id, '2026-10-01', 9_000);
    await addReading(sevenDays.id, '2026-10-18', 10_000);
    await addReading(sixDays.id, '2026-10-01', 19_000);
    await addReading(sixDays.id, '2026-10-19', 20_000);

    // 08:00 in Madrid (CET): before the reminder hour (9), then from it.
    await setSettings({ reminderHour: 9 });
    expect(await generateLocalReminders(db, at('2026-10-25T07:00:00.000Z'))).toBe(0);
    expect(await generateLocalReminders(db, at('2026-10-25T08:00:00.000Z'))).toBe(1);

    const expected = odometerNudgeNotification({
      userId: LOCAL_USER_ID,
      today: '2026-10-25',
      timezone: 'Europe/Madrid',
      vehicles: [
        { ...golf, lastReadingDate: '2026-10-01' },
        { ...clio, lastReadingDate: '2026-10-10' },
        { ...sevenDays, lastReadingDate: '2026-10-18' },
        { ...sixDays, lastReadingDate: '2026-10-19' },
        { ...old, lastReadingDate: null },
      ],
    });
    expect(expected).toMatchObject({ title: 'Golf, Renault Clio, Siete, Antiguo' });
    expect(await rows()).toEqual([
      {
        ...expected,
        id: expect.any(String),
        userId: LOCAL_USER_ID,
        readAt: null,
        createdAt: at('2026-10-25T08:00:00.000Z'),
      },
    ]);
    expect((await rows())[0]).toMatchObject({
      vehicleId: null,
      type: 'odometer_nudge',
      body: null,
      link: '/odometer',
      dedupeKey: `odometer_nudge:${LOCAL_USER_ID}:2026-W43`,
    });
  });

  // Regression: on Android the plugin reads each column by name and an unaliased `max(…)` has a `.` in its
  // name, so the whole `list()` failed on the nudge day. `createMemorySqlite` rejects it as the plugin does.
  it('aliases the last reading date of the odometer nudge for the device plugin', async () => {
    const vehicle = await addVehicle();
    await addReading(vehicle.id, '2026-10-01', 10_000);
    statements = [];

    expect(await generateLocalReminders(db, SUNDAY)).toBe(1);

    const nudgeQuery = statements.find((sql) => sql.includes('max('));
    expect(nudgeQuery).toContain('max("odometer_readings"."date") as "last_reading_date"');
  });

  it('does not nudge on other days or without a weekday', async () => {
    await addVehicle();

    // Thursday, with the default weekday (Sunday).
    expect(await generateLocalReminders(db, NOW)).toBe(0);
    // Monday 2026-10-26 with the weekday on Monday nudges.
    await setSettings({ odometerReminderWeekday: 1 });
    expect(await generateLocalReminders(db, SUNDAY)).toBe(0);
    expect(await generateLocalReminders(db, at('2026-10-26T10:00:00.000Z'))).toBe(1);

    // Without a weekday: never.
    await db.delete(notifications);
    await setSettings({ odometerReminderWeekday: null });
    for (let day = 0; day < 7; day++) {
      expect(await generateLocalReminders(db, at(`2026-11-0${day + 1}T12:00:00.000Z`))).toBe(0);
    }
    expect(await rows()).toEqual([]);
  });

  it('never stores the same reminder twice', async () => {
    const vehicle = await addVehicle();
    await addSchedule(vehicle.id, overdueRule);

    expect(await generateLocalReminders(db, SUNDAY)).toBe(2);
    expect(await generateLocalReminders(db, at('2026-10-25T18:00:00.000Z'))).toBe(0);

    // Read ones count as stored too.
    await db.update(notifications).set({ readAt: SUNDAY });
    expect(await generateLocalReminders(db, at('2026-10-25T20:00:00.000Z'))).toBe(0);
    expect(await rows()).toHaveLength(2);
  });
});

describe('notifications', () => {
  let local: DataSource;

  const createDataSource = (target: LocalDb) =>
    createLocalDataSource(target, { files: createMemoryFileStore(), images: fakeImages() });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    local = createDataSource(db);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** The problem an operation rejected with (fails the test if it resolved or threw something else). */
  async function problemOf(operation: Promise<unknown>): Promise<Problem> {
    const error = await operation.then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(ApiError);
    return (error as ApiError).problem;
  }

  /** `count` stored notifications, one millisecond apart from `LONG_AGO`, the first one read. */
  async function addNotifications(count: number) {
    const values = Array.from({ length: count }, (_, index) => ({
      userId: LOCAL_USER_ID,
      type: 'odometer_nudge' as const,
      title: `Aviso ${index}`,
      dedupeKey: `test:${index}`,
      link: '/odometer',
      readAt: index === 0 ? LONG_AGO : null,
      createdAt: new Date(LONG_AGO.getTime() + index),
    }));
    return db.insert(notifications).values(values).returning().all();
  }

  it('list generates and returns the newest page with totals', async () => {
    await addNotifications(20);
    const vehicle = await addVehicle({ name: 'Mi coche' });
    await addSchedule(vehicle.id, overdueRule);

    const list = notificationListSchema.parse(await local.notifications.list());

    expect(list.total).toBe(21);
    expect(list.unreadCount).toBe(20);
    expect(list.items).toHaveLength(20);
    // The generated reminder first, then the stored ones newest first; the oldest one is left out.
    expect(list.items[0]).toEqual({
      id: expect.any(String),
      type: 'schedule_overdue',
      title: 'Cambio de aceite',
      body: 'Mi coche',
      link: `/vehicles/${vehicle.id}`,
      readAt: null,
      createdAt: NOW.toISOString(),
    });
    expect(list.items.slice(1).map((item) => item.title)).toEqual(
      Array.from({ length: 19 }, (_, index) => `Aviso ${19 - index}`),
    );
  });

  it('orders notifications of the same time by id', async () => {
    const stored = await db
      .insert(notifications)
      .values(
        ['a', 'b', 'c'].map((key) => ({
          userId: LOCAL_USER_ID,
          type: 'odometer_nudge' as const,
          title: key,
          dedupeKey: key,
          createdAt: LONG_AGO,
        })),
      )
      .returning()
      .all();

    const list = await local.notifications.list();

    expect(list.items.map((item) => item.id)).toEqual(
      stored
        .map((row) => row.id)
        .sort()
        .reverse(),
    );
  });

  it('markRead keeps the first read time', async () => {
    const [, unreadRow] = await addNotifications(2);
    if (!unreadRow) throw new Error('missing notification');

    const read = notificationSchema.parse(await local.notifications.markRead(unreadRow.id));
    expect(read).toMatchObject({ id: unreadRow.id, title: 'Aviso 1', readAt: NOW.toISOString() });

    vi.setSystemTime(at('2026-10-23T10:00:00.000Z'));
    expect(await local.notifications.markRead(unreadRow.id)).toEqual(read);
    expect((await local.notifications.list()).unreadCount).toBe(0);
  });

  it('markRead of a missing notification is a 404', async () => {
    expect(await problemOf(local.notifications.markRead('missing'))).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: 'Notification not found',
    });
  });

  it('markAllRead marks every unread notification', async () => {
    await addNotifications(3);

    await local.notifications.markAllRead();

    const stored = await db.select().from(notifications).orderBy(asc(notifications.title)).all();
    expect(stored.map((row) => row.readAt)).toEqual([LONG_AGO, NOW, NOW]);
    expect(await local.notifications.list()).toMatchObject({ total: 3, unreadCount: 0 });
  });

  it('list runs through the serial queue', async () => {
    const seed = async (target: LocalDb) => {
      const vehicle = await addVehicle({}, target);
      await addSchedule(vehicle.id, overdueRule, target);
    };

    await seed(db);
    statements = [];
    const [first, second] = await Promise.all([local.notifications.list(), local.notifications.list()]);
    const concurrent = statements;

    statements = [];
    const sequentialDb = await openDb();
    const sequential = createDataSource(sequentialDb);
    await seed(sequentialDb);
    statements = [];
    await sequential.notifications.list();
    await sequential.notifications.list();

    expect(concurrent).toEqual(statements);
    expect(first.total).toBe(1);
    expect(second).toEqual(first);
    expect(await db.select().from(notifications).all()).toHaveLength(1);
  });
});
