import type { ScheduleStatus } from '../enums';
import { latestOdometerReading, type OdometerPoint } from './odometer';

/** Days back from today whose readings feed the daily distance average. */
export const AVERAGE_WINDOW_DAYS = 90;
/** Minimum days between the first and the last reading of the window to trust the average. */
export const MIN_AVERAGE_SPAN_DAYS = 30;

const DAY_MS = 86_400_000;

const toIsoDate = (time: number) => new Date(time).toISOString().slice(0, 10);

/** Adds days to a `YYYY-MM-DD` date (negative values go back). UTC arithmetic, so DST does not matter. */
export function addDays(date: string, days: number): string {
  return toIsoDate(Date.parse(date) + days * DAY_MS);
}

/**
 * Adds months to a `YYYY-MM-DD` date. When the day does not exist in the target month it is clamped
 * to the last day of that month (31 Jan + 1 month = 28/29 Feb).
 */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return toIsoDate(target.getTime());
}

/**
 * Average distance per day of the readings dated in the last 90 days (today included). Returns null
 * with fewer than two readings, when they span less than 30 days or when the average is not positive.
 */
export function averageDailyDistance(readings: readonly OdometerPoint[], today: string): number | null {
  const since = addDays(today, -AVERAGE_WINDOW_DAYS);
  const window = readings
    .filter((reading) => reading.date >= since && reading.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.value - b.value);
  if (window.length < 2) return null;
  const first = window[0] as OdometerPoint;
  const last = window[window.length - 1] as OdometerPoint;
  const days = (Date.parse(last.date) - Date.parse(first.date)) / DAY_MS;
  if (days < MIN_AVERAGE_SPAN_DAYS) return null;
  const average = (last.value - first.value) / days;
  return average > 0 ? average : null;
}

/** What `computeScheduleDue` needs from a maintenance schedule. */
export interface ScheduleRule {
  intervalMonths: number | null;
  intervalDistance: number | null;
  warnDays: number;
  warnDistance: number;
  lastDoneDate: string;
  lastDoneOdometer: number | null;
}

export interface ScheduleDue {
  /** Earliest of the date by months and the date estimated from the daily distance, or null. */
  nextDueDate: string | null;
  /** True when `nextDueDate` comes from the distance estimate rather than from the months. */
  nextDueDateEstimated: boolean;
  nextDueOdometer: number | null;
  status: ScheduleStatus;
}

/**
 * Next due date and odometer of a schedule (whichever comes first) and its status. The status only
 * uses the date by months and the latest reading: the estimated date is informative.
 */
export function computeScheduleDue(
  rule: ScheduleRule,
  readings: readonly OdometerPoint[],
  today: string,
): ScheduleDue {
  const latest = latestOdometerReading(readings);
  const dateByMonths = rule.intervalMonths == null ? null : addMonths(rule.lastDoneDate, rule.intervalMonths);
  const nextDueOdometer =
    rule.intervalDistance == null || rule.lastDoneOdometer == null
      ? null
      : rule.lastDoneOdometer + rule.intervalDistance;

  const average = averageDailyDistance(readings, today);
  const estimatedDate =
    nextDueOdometer == null || average == null || !latest
      ? null
      : addDays(latest.date, Math.ceil(Math.max(0, nextDueOdometer - latest.value) / average));

  const nextDueDateEstimated =
    estimatedDate !== null && (dateByMonths === null || estimatedDate < dateByMonths);
  const nextDueDate = nextDueDateEstimated ? estimatedDate : dateByMonths;

  const distanceReached = (margin: number) =>
    nextDueOdometer != null && latest != null && latest.value >= nextDueOdometer - margin;
  let status: ScheduleStatus = 'ok';
  if ((dateByMonths && today >= dateByMonths) || distanceReached(0)) {
    status = 'overdue';
  } else if (
    (dateByMonths && today >= addDays(dateByMonths, -rule.warnDays)) ||
    distanceReached(rule.warnDistance)
  ) {
    status = 'due_soon';
  }

  return { nextDueDate, nextDueDateEstimated, nextDueOdometer, status };
}

/**
 * New last done values of the schedule a maintenance record fulfils: the record's date and odometer,
 * or null when the record is older than the schedule's last done date (an older one does not move it).
 */
export function scheduleLastDoneUpdate(
  schedule: { lastDoneDate: string },
  record: { date: string; odometer: number | null },
): { date: string; odometer: number | null } | null {
  return record.date >= schedule.lastDoneDate ? { date: record.date, odometer: record.odometer } : null;
}

/**
 * Last done values of a new schedule. Without a last done date or odometer, each one starts at the
 * vehicle purchase or, when the vehicle has none, at today and the latest reading. A `null` odometer
 * in the input is kept.
 */
export function scheduleDefaults(
  input: { lastDoneDate?: string; lastDoneOdometer?: number | null },
  vehicle: { purchaseDate: string | null; purchaseOdometer: number | null },
  readings: readonly OdometerPoint[],
  today: string,
): { lastDoneDate: string; lastDoneOdometer: number | null } {
  return {
    lastDoneDate: input.lastDoneDate ?? vehicle.purchaseDate ?? today,
    lastDoneOdometer:
      input.lastDoneOdometer !== undefined
        ? input.lastDoneOdometer
        : (vehicle.purchaseOdometer ?? latestOdometerReading(readings)?.value ?? null),
  };
}

/** Whether an edited schedule still has an interval in months or distance. */
export function hasIntervalAfterUpdate(
  schedule: { intervalMonths: number | null; intervalDistance: number | null },
  input: { intervalMonths?: number | null; intervalDistance?: number | null },
): boolean {
  const intervalMonths = input.intervalMonths === undefined ? schedule.intervalMonths : input.intervalMonths;
  const intervalDistance =
    input.intervalDistance === undefined ? schedule.intervalDistance : input.intervalDistance;
  return intervalMonths != null || intervalDistance != null;
}
