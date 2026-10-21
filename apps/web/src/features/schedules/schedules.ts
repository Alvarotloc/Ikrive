import type { MaintenanceSchedule, ScheduleStatus } from '@ikrive/shared';

const STATUS_ORDER: Record<ScheduleStatus, number> = { overdue: 0, due_soon: 1, ok: 2 };

/** Ascending, with `null` after every value. */
function compareNullable<T extends string | number>(a: T | null, b: T | null) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/**
 * Schedules in due order: overdue, then due soon, then ok; within a status by next due date and then
 * next due odometer (unknown last), and finally by title.
 */
export function sortSchedules(schedules: readonly MaintenanceSchedule[]): MaintenanceSchedule[] {
  return [...schedules].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      compareNullable(a.nextDueDate, b.nextDueDate) ||
      compareNullable(a.nextDueOdometer, b.nextDueOdometer) ||
      a.title.localeCompare(b.title),
  );
}
