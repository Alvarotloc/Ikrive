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
