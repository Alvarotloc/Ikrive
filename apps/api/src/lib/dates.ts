/** Today's calendar date (`YYYY-MM-DD`) in the given IANA time zone. */
export function todayIn(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
