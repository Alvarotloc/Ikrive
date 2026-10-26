import {
  AVERAGE_WINDOW_DAYS,
  addDays,
  computeScheduleDue,
  DEFAULT_USER_SETTINGS,
  type OdometerPoint,
  type ScheduleStatus,
} from '@ikrive/shared';
import { Cron } from 'croner';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/client';
import { hourIn, todayIn } from '../lib/dates';
import type { NotificationDispatcher } from '../modules/notification-channels/dispatcher';
import { createNotificationsRepository, type NewNotificationRow } from '../modules/notifications/repository';
import { createSchedulesRepository } from '../modules/schedules/repository';
import { createVehiclesRepository } from '../modules/vehicles/repository';

/** Every hour on the hour: each user is notified in the first run from their reminder hour. */
export const REMINDERS_CRON = '0 * * * *';

interface ReminderOwner {
  timezone: string;
  reminderHour: number;
}

/** True once the owner's local hour has reached their reminder hour (until midnight). */
export function isReminderTime(owner: ReminderOwner, now: Date): boolean {
  return hourIn(owner.timezone, now) >= owner.reminderHour;
}

/**
 * One key per schedule, status and period: running again does not notify twice, becoming overdue
 * or doing the maintenance (new `lastDone*`) does. Editing the intervals does not.
 */
export function reminderDedupeKey(
  scheduleId: string,
  status: Exclude<ScheduleStatus, 'ok'>,
  rule: { lastDoneDate: string; lastDoneOdometer: number | null },
): string {
  return `schedule:${scheduleId}:${status}:${rule.lastDoneDate}:${rule.lastDoneOdometer ?? ''}`;
}

/**
 * Creates an in-app notification for every due soon or overdue schedule of an active vehicle whose
 * owner is past their reminder hour, then sends the new ones (not the deduplicated) through their
 * owners' enabled channels. Callable without the scheduler (tests, admin trigger).
 */
export async function runReminders({
  db,
  now = new Date(),
  dispatcher,
}: {
  db: Db;
  now?: Date;
  dispatcher: NotificationDispatcher;
}): Promise<{ evaluated: number; created: number; failed: number }> {
  const schedules = createSchedulesRepository(db);
  const vehicles = createVehiclesRepository(db);
  const notifications = createNotificationsRepository(db);

  const rules = schedules
    .listForActiveVehicles()
    .map((rule) => ({
      ...rule,
      timezone: rule.timezone ?? DEFAULT_USER_SETTINGS.timezone,
      reminderHour: rule.reminderHour ?? DEFAULT_USER_SETTINGS.reminderHour,
    }))
    .filter((rule) => isReminderTime(rule, now))
    .map((rule) => ({ ...rule, today: todayIn(rule.timezone, now) }));
  if (rules.length === 0) return { evaluated: 0, created: 0, failed: 0 };

  // The earliest «today» keeps every user's 90-day window inside the loaded readings.
  const earliestToday = rules.reduce(
    (min, rule) => (rule.today < min ? rule.today : min),
    rules[0]?.today ?? '',
  );
  const vehicleIds = [...new Set(rules.map((rule) => rule.vehicleId))];
  const readingsByVehicle = new Map<string, OdometerPoint[]>();
  for (const { vehicleId, date, value } of vehicles.listRecentReadingsByVehicles(
    vehicleIds,
    addDays(earliestToday, -AVERAGE_WINDOW_DAYS),
  )) {
    const list = readingsByVehicle.get(vehicleId) ?? [];
    list.push({ date, value });
    readingsByVehicle.set(vehicleId, list);
  }

  const rows: NewNotificationRow[] = [];
  for (const rule of rules) {
    const { status } = computeScheduleDue(rule, readingsByVehicle.get(rule.vehicleId) ?? [], rule.today);
    if (status === 'ok') continue;
    rows.push({
      userId: rule.ownerId,
      vehicleId: rule.vehicleId,
      type: `schedule_${status}`,
      title: rule.title,
      body: rule.vehicleName ?? `${rule.vehicleMake} ${rule.vehicleModel}`,
      link: `/vehicles/${rule.vehicleId}`,
      dedupeKey: reminderDedupeKey(rule.id, status, rule),
      createdAt: now,
    });
  }

  // The in-app notifications are stored before any network I/O: a channel cannot undo them.
  const created = notifications.createMany(rows);
  const { failed } = await dispatcher.dispatch(created);
  return { evaluated: rules.length, created: created.length, failed };
}

/** Schedules `run` every hour, or nothing when disabled. Overlapping runs are skipped. */
export function startRemindersJob({
  enabled,
  run,
  logger,
}: {
  enabled: boolean;
  run: () => Promise<unknown>;
  logger: FastifyBaseLogger;
}): Cron | null {
  if (!enabled) return null;
  // Awaiting `run` lets `protect` skip a run while the previous one is still sending.
  return new Cron(REMINDERS_CRON, { protect: true, catch: (error) => logger.error(error) }, async () => {
    await run();
  });
}
