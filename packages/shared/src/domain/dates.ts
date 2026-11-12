/** Today's calendar date (`YYYY-MM-DD`) in the given IANA time zone. */
export function todayIn(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Local hour (0-23) of `now` in the given IANA time zone; UTC when the zone is invalid. */
export function hourIn(timeZone: string, now = new Date()): number {
  try {
    const hour = new Intl.DateTimeFormat('en-GB', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(
      now,
    );
    return Number(hour);
  } catch {
    return now.getUTCHours();
  }
}

const DAY_MS = 86_400_000;

/** Day of the week (0 = Sunday ... 6 = Saturday) of a `YYYY-MM-DD` date. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

/** ISO 8601 week (Monday to Sunday) of a `YYYY-MM-DD` date, as `YYYY-Www` (e.g. `2026-W43`). */
export function isoWeekOf(date: string): string {
  const day = new Date(`${date}T00:00:00.000Z`);
  // The Thursday of the same week decides the ISO year.
  const thursday = new Date(day.getTime() + (3 - ((day.getUTCDay() + 6) % 7)) * DAY_MS);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / (7 * DAY_MS)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}
