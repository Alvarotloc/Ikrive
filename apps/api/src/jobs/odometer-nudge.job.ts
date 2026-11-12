import {
  isOdometerNudgeTime,
  ODOMETER_NUDGE_DAYS,
  odometerNudgeDedupeKey,
  odometerNudgeNotification,
  todayIn,
} from '@ikrive/shared';
import { Cron } from 'croner';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/client';
import type { NotificationDispatcher } from '../modules/notification-channels/dispatcher';
import { createNotificationsRepository, type NewNotificationRow } from '../modules/notifications/repository';
import { createVehiclesRepository } from '../modules/vehicles/repository';

/** Every hour on the hour: each user is nudged in the first run of their day from their reminder hour. */
export const ODOMETER_NUDGE_CRON = '0 * * * *';

// Moved to `@ikrive/shared`; re-exported for the job's callers.
export { ODOMETER_NUDGE_DAYS, odometerNudgeDedupeKey };

type NudgeVehicle = ReturnType<
  ReturnType<typeof createVehiclesRepository>['listActiveForOdometerNudge']
>[number];

/**
 * On each user's reminder weekday (in their time zone) and from their reminder hour, creates one
 * in-app notification listing their active vehicles without an odometer reading in the last
 * `ODOMETER_NUDGE_DAYS` days, then sends the new ones (not the deduplicated) through their enabled
 * channels. Callable without the scheduler (tests, admin trigger).
 */
export async function runOdometerNudge({
  db,
  now = new Date(),
  dispatcher,
}: {
  db: Db;
  now?: Date;
  dispatcher: NotificationDispatcher;
}): Promise<{ evaluated: number; created: number; failed: number }> {
  const vehicles = createVehiclesRepository(db);
  const notifications = createNotificationsRepository(db);

  // The rows of one user share their settings.
  const byOwner = new Map<string, NudgeVehicle[]>();
  for (const vehicle of vehicles.listActiveForOdometerNudge()) {
    const list = byOwner.get(vehicle.ownerId) ?? [];
    list.push(vehicle);
    byOwner.set(vehicle.ownerId, list);
  }

  let evaluated = 0;
  const rows: NewNotificationRow[] = [];
  for (const [ownerId, owned] of byOwner) {
    const [first] = owned;
    if (!first) continue;
    if (!isOdometerNudgeTime(first, now)) continue;
    evaluated++;

    const today = todayIn(first.timezone, now);
    const draft = odometerNudgeNotification({
      userId: ownerId,
      today,
      timezone: first.timezone,
      vehicles: owned,
    });
    if (draft) rows.push({ ...draft, userId: ownerId, createdAt: now });
  }

  // The in-app notifications are stored before any network I/O: a channel cannot undo them.
  const created = notifications.createMany(rows);
  const { failed } = await dispatcher.dispatch(created);
  return { evaluated, created: created.length, failed };
}

/** Schedules `run` every hour, or nothing when disabled. Overlapping runs are skipped. */
export function startOdometerNudgeJob({
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
  return new Cron(ODOMETER_NUDGE_CRON, { protect: true, catch: (error) => logger.error(error) }, async () => {
    await run();
  });
}
