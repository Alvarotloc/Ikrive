import {
  AVERAGE_WINDOW_DAYS,
  addDays,
  DEFAULT_USER_SETTINGS,
  documentReminderNotification,
  isReminderTime,
  type OdometerPoint,
  reminderDedupeKey,
  scheduleReminderNotification,
  todayIn,
} from '@ikrive/shared';
import { Cron } from 'croner';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/client';
import { createDocumentsRepository } from '../modules/documents/repository';
import type { NotificationDispatcher } from '../modules/notification-channels/dispatcher';
import { createNotificationsRepository, type NewNotificationRow } from '../modules/notifications/repository';
import { createSchedulesRepository } from '../modules/schedules/repository';
import { createVehiclesRepository } from '../modules/vehicles/repository';

/** Every hour on the hour: each user is notified in the first run from their reminder hour. */
export const REMINDERS_CRON = '0 * * * *';

// Moved to `@ikrive/shared`; re-exported for the job's callers.
export { isReminderTime, reminderDedupeKey };

/** The owner's settings (or the defaults) and «today» of a job row, when it is past the reminder hour. */
function atReminderTime<T extends { timezone: string | null; reminderHour: number | null }>(
  rows: readonly T[],
  now: Date,
) {
  return rows
    .map((row) => ({
      ...row,
      timezone: row.timezone ?? DEFAULT_USER_SETTINGS.timezone,
      reminderHour: row.reminderHour ?? DEFAULT_USER_SETTINGS.reminderHour,
    }))
    .filter((row) => isReminderTime(row, now))
    .map((row) => ({ ...row, today: todayIn(row.timezone, now) }));
}

/**
 * Creates an in-app notification for every due soon or overdue schedule and every expiring or
 * expired document of an active vehicle whose owner is past their reminder hour, then sends the new
 * ones (not the deduplicated) through their owners' enabled channels. `evaluated` counts the
 * schedules and the dated documents. Callable without the scheduler (tests, admin trigger).
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
  const documentsRepo = createDocumentsRepository(db);
  const notifications = createNotificationsRepository(db);

  const rules = atReminderTime(schedules.listForActiveVehicles(), now);
  const documents = atReminderTime(documentsRepo.listForActiveVehicles(), now);
  if (rules.length === 0 && documents.length === 0) return { evaluated: 0, created: 0, failed: 0 };

  // The earliest «today» keeps every user's 90-day window inside the loaded readings.
  const readingsByVehicle = new Map<string, OdometerPoint[]>();
  const [firstRule] = rules;
  if (firstRule) {
    const earliestToday = rules.reduce((min, rule) => (rule.today < min ? rule.today : min), firstRule.today);
    const vehicleIds = [...new Set(rules.map((rule) => rule.vehicleId))];
    for (const { vehicleId, date, value } of vehicles.listRecentReadingsByVehicles(
      vehicleIds,
      addDays(earliestToday, -AVERAGE_WINDOW_DAYS),
    )) {
      const list = readingsByVehicle.get(vehicleId) ?? [];
      list.push({ date, value });
      readingsByVehicle.set(vehicleId, list);
    }
  }

  const rows: NewNotificationRow[] = [];
  for (const rule of rules) {
    const draft = scheduleReminderNotification(
      rule,
      { id: rule.vehicleId, name: rule.vehicleName, make: rule.vehicleMake, model: rule.vehicleModel },
      readingsByVehicle.get(rule.vehicleId) ?? [],
      rule.today,
    );
    if (draft) rows.push({ ...draft, userId: rule.ownerId, createdAt: now });
  }
  for (const document of documents) {
    const draft = documentReminderNotification(
      document,
      {
        id: document.vehicleId,
        name: document.vehicleName,
        make: document.vehicleMake,
        model: document.vehicleModel,
      },
      document.today,
    );
    if (draft) rows.push({ ...draft, userId: document.ownerId, createdAt: now });
  }

  // The in-app notifications are stored before any network I/O: a channel cannot undo them.
  const created = notifications.createMany(rows);
  const { failed } = await dispatcher.dispatch(created);
  return { evaluated: rules.length + documents.length, created: created.length, failed };
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
