import { LOCAL_USER_ID } from '@ikrive/db';
import {
  maintenanceSchedules,
  notifications,
  odometerReadings,
  vehicleDocuments,
  vehicles,
} from '@ikrive/db/schema';
import {
  documentReminderNotification,
  isOdometerNudgeTime,
  isReminderTime,
  type Notification,
  type NotificationDraft,
  odometerNudgeNotification,
  scheduleReminderNotification,
  todayIn,
} from '@ikrive/shared';
import { and, asc, count, desc, eq, isNotNull, isNull, max, type SQL, sql } from 'drizzle-orm';
import type { DataSource } from '../types';
import type { LocalDb } from './database';
import { notFound } from './problems';
import { settingsRow } from './settings';
import { listReadings } from './vehicles';

type NotificationRow = typeof notifications.$inferSelect;

/** Page size of the bell: the API's default `limit`. */
const PAGE_SIZE = 20;

/** Same filter as the API's `activeVehicleFilter`, on the local user's vehicles. */
const activeVehicle = and(
  eq(vehicles.ownerId, LOCAL_USER_ID),
  isNull(vehicles.soldAt),
  isNull(vehicles.archivedAt),
);

/** `userId`, `vehicleId` and `dedupeKey` stay out of the DTO, as in the API's `service.ts`. */
const toDto = ({ id, type, title, body, link, readAt, createdAt }: NotificationRow): Notification => ({
  id,
  type,
  title,
  body,
  link,
  readAt: readAt?.toISOString() ?? null,
  createdAt: createdAt.toISOString(),
});

/**
 * Reminders of the due soon and overdue schedules of the active vehicles (the API's reminders job). The
 * columns are picked one by one with no two of the same name: the device plugin keys each row by column.
 */
async function scheduleReminders(db: LocalDb, today: string): Promise<NotificationDraft[]> {
  const schedules = await db
    .select({
      id: maintenanceSchedules.id,
      title: maintenanceSchedules.title,
      intervalMonths: maintenanceSchedules.intervalMonths,
      intervalDistance: maintenanceSchedules.intervalDistance,
      warnDays: maintenanceSchedules.warnDays,
      warnDistance: maintenanceSchedules.warnDistance,
      lastDoneDate: maintenanceSchedules.lastDoneDate,
      lastDoneOdometer: maintenanceSchedules.lastDoneOdometer,
      vehicleId: maintenanceSchedules.vehicleId,
      name: vehicles.name,
      make: vehicles.make,
      model: vehicles.model,
    })
    .from(maintenanceSchedules)
    .innerJoin(vehicles, eq(vehicles.id, maintenanceSchedules.vehicleId))
    .where(activeVehicle)
    .orderBy(asc(maintenanceSchedules.createdAt), asc(sql`${maintenanceSchedules}.rowid`))
    .all();

  const readingsByVehicle = new Map<string, { date: string; value: number }[]>();
  const drafts: NotificationDraft[] = [];
  for (const schedule of schedules) {
    let readings = readingsByVehicle.get(schedule.vehicleId);
    if (!readings) {
      // Every reading: `computeScheduleDue` keeps its own 90-day window, as the job's bounded query does.
      readings = (await listReadings(db, schedule.vehicleId)).map(({ date, value }) => ({ date, value }));
      readingsByVehicle.set(schedule.vehicleId, readings);
    }
    const { vehicleId, name, make, model } = schedule;
    const draft = scheduleReminderNotification(
      schedule,
      { id: vehicleId, name, make, model },
      readings,
      today,
    );
    if (draft) drafts.push(draft);
  }
  return drafts;
}

/**
 * Reminders of the expiring and expired documents of the active vehicles (the documents of the API's
 * reminders job). Undated documents never remind. Columns picked one by one, as in `scheduleReminders`.
 */
async function documentReminders(db: LocalDb, today: string): Promise<NotificationDraft[]> {
  const documents = await db
    .select({
      id: vehicleDocuments.id,
      title: vehicleDocuments.title,
      expiryDate: vehicleDocuments.expiryDate,
      warnDays: vehicleDocuments.warnDays,
      vehicleId: vehicleDocuments.vehicleId,
      name: vehicles.name,
      make: vehicles.make,
      model: vehicles.model,
    })
    .from(vehicleDocuments)
    .innerJoin(vehicles, eq(vehicles.id, vehicleDocuments.vehicleId))
    .where(and(activeVehicle, isNotNull(vehicleDocuments.expiryDate)))
    .orderBy(asc(vehicleDocuments.createdAt), asc(sql`${vehicleDocuments}.rowid`))
    .all();

  const drafts: NotificationDraft[] = [];
  for (const { vehicleId, name, make, model, ...document } of documents) {
    const draft = documentReminderNotification(document, { id: vehicleId, name, make, model }, today);
    if (draft) drafts.push(draft);
  }
  return drafts;
}

/** The odometer nudge of the active vehicles (the API's odometer nudge job), or null when none is pending. */
async function odometerNudge(
  db: LocalDb,
  today: string,
  timezone: string,
): Promise<NotificationDraft | null> {
  const active = await db
    .select({
      name: vehicles.name,
      make: vehicles.make,
      model: vehicles.model,
      createdAt: vehicles.createdAt,
      // Aliased: an expression's column name has a `.` that the plugin cannot read (see `native-sqlite.ts`).
      lastReadingDate: max(odometerReadings.date).as('last_reading_date'),
    })
    .from(vehicles)
    .leftJoin(odometerReadings, eq(odometerReadings.vehicleId, vehicles.id))
    .where(activeVehicle)
    .groupBy(vehicles.id)
    .orderBy(asc(vehicles.createdAt), asc(sql`${vehicles}.rowid`))
    .all();
  return odometerNudgeNotification({ userId: LOCAL_USER_ID, today, timezone, vehicles: active });
}

/**
 * Stores the schedule and document reminders and the odometer nudge due at `now`, with the same rules and settings as
 * the API's hourly jobs (reminder hour, odometer weekday and time zone of the local user). A notification
 * whose `dedupeKey` is already stored, read or not, is skipped. Resolves to the number of new ones.
 */
export async function generateLocalReminders(db: LocalDb, now: Date): Promise<number> {
  const { timezone, reminderHour, odometerReminderWeekday } = await settingsRow(db);
  const today = todayIn(timezone, now);

  const drafts: NotificationDraft[] = [];
  if (isReminderTime({ timezone, reminderHour }, now)) {
    drafts.push(...(await scheduleReminders(db, today)), ...(await documentReminders(db, today)));
  }
  if (isOdometerNudgeTime({ timezone, reminderHour, weekday: odometerReminderWeekday }, now)) {
    const nudge = await odometerNudge(db, today, timezone);
    if (nudge) drafts.push(nudge);
  }
  if (drafts.length === 0) return 0;

  const created = await db
    .insert(notifications)
    .values(drafts.map((draft) => ({ ...draft, userId: LOCAL_USER_ID, createdAt: now })))
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning({ id: notifications.id })
    .all();
  return created.length;
}

const owned = (id: string) => and(eq(notifications.id, id), eq(notifications.userId, LOCAL_USER_ID));
const unread = and(eq(notifications.userId, LOCAL_USER_ID), isNull(notifications.readAt));

async function countWhere(db: LocalDb, where: SQL | undefined): Promise<number> {
  const row = await db.select({ value: count() }).from(notifications).where(where).get();
  return row?.value ?? 0;
}

/**
 * `notifications` of the local `DataSource`: the device's inbox. Listing first stores the reminders due at
 * `now()`, so whoever reads the inbox (the bell, the phone notifications) sees it up to date.
 */
export function localNotifications(
  db: LocalDb,
  now: () => Date = () => new Date(),
): DataSource['notifications'] {
  return {
    async list() {
      await generateLocalReminders(db, now());
      // Newest first; `id` breaks ties between rows stored in the same run.
      const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, LOCAL_USER_ID))
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(PAGE_SIZE)
        .offset(0)
        .all();
      return {
        items: rows.map(toDto),
        total: await countWhere(db, eq(notifications.userId, LOCAL_USER_ID)),
        unreadCount: await countWhere(db, unread),
      };
    },

    /** Sets `readAt` only when it is still null, so marking twice keeps the first read time. */
    async markRead(id) {
      const existing = await db.select({ id: notifications.id }).from(notifications).where(owned(id)).get();
      if (!existing) throw notFound('Notification not found');
      await db
        .update(notifications)
        .set({ readAt: now() })
        .where(and(owned(id), isNull(notifications.readAt)));
      const row = await db.select().from(notifications).where(owned(id)).get();
      if (!row) throw notFound('Notification not found');
      return toDto(row);
    },

    async markAllRead() {
      await db.update(notifications).set({ readAt: now() }).where(unread);
    },
  };
}
