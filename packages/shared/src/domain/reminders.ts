import type { NotificationType, ScheduleStatus } from '../enums';
import { hourIn, isoWeekOf, todayIn, weekdayOf } from './dates';
import type { OdometerPoint } from './odometer';
import { addDays, computeScheduleDue, type ScheduleRule } from './schedules';

/**
 * In-app notification about to be stored. Whoever stores it adds the `userId` and the `createdAt`;
 * the `dedupeKey` keeps the same reminder from being stored twice.
 */
export interface NotificationDraft {
  vehicleId: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string;
  dedupeKey: string;
}

/** Display name of a vehicle: its name, or make and model when it has none. */
export const vehicleName = (vehicle: { name: string | null; make: string; model: string }) =>
  vehicle.name ?? `${vehicle.make} ${vehicle.model}`;

/** True once the owner's local hour has reached their reminder hour (until midnight). */
export function isReminderTime(owner: { timezone: string; reminderHour: number }, now: Date): boolean {
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
 * Reminder of a due soon or overdue schedule for `today`, with the vehicle's name (or make and model)
 * as body and a link to the vehicle; null when the schedule is ok.
 */
export function scheduleReminderNotification(
  schedule: ScheduleRule & { id: string; title: string },
  vehicle: { id: string; name: string | null; make: string; model: string },
  readings: readonly OdometerPoint[],
  today: string,
): NotificationDraft | null {
  const { status } = computeScheduleDue(schedule, readings, today);
  if (status === 'ok') return null;
  return {
    vehicleId: vehicle.id,
    type: `schedule_${status}`,
    title: schedule.title,
    body: vehicleName(vehicle),
    link: `/vehicles/${vehicle.id}`,
    dedupeKey: reminderDedupeKey(schedule.id, status, schedule),
  };
}

/** A vehicle is nudged when its reference date is this many days old or more. */
export const ODOMETER_NUDGE_DAYS = 7;

/** One key per user and ISO week: changing the reminder day within the week does not nudge twice. */
export function odometerNudgeDedupeKey(userId: string, today: string): string {
  return `odometer_nudge:${userId}:${isoWeekOf(today)}`;
}

/**
 * True on the owner's odometer reminder weekday (in their time zone) from their reminder hour;
 * never without a weekday.
 */
export function isOdometerNudgeTime(
  owner: { timezone: string; reminderHour: number; weekday: number | null },
  now: Date,
): boolean {
  const today = todayIn(owner.timezone, now);
  return weekdayOf(today) === owner.weekday && hourIn(owner.timezone, now) >= owner.reminderHour;
}

/**
 * One notification listing the vehicles without an odometer reading in the last `ODOMETER_NUDGE_DAYS`
 * days. A vehicle without readings counts from the day it was created, in the user's time zone.
 * Null when no vehicle is pending.
 */
export function odometerNudgeNotification({
  userId,
  today,
  timezone,
  vehicles,
}: {
  userId: string;
  today: string;
  timezone: string;
  vehicles: readonly {
    name: string | null;
    make: string;
    model: string;
    lastReadingDate: string | null;
    createdAt: Date;
  }[];
}): NotificationDraft | null {
  const threshold = addDays(today, -ODOMETER_NUDGE_DAYS);
  const pending = vehicles.filter(
    (vehicle) => (vehicle.lastReadingDate ?? todayIn(timezone, vehicle.createdAt)) <= threshold,
  );
  if (pending.length === 0) return null;
  return {
    vehicleId: null,
    type: 'odometer_nudge',
    title: pending.map(vehicleName).join(', '),
    body: null,
    link: '/odometer',
    dedupeKey: odometerNudgeDedupeKey(userId, today),
  };
}
