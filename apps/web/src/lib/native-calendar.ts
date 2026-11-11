/**
 * Phone calendar in the native app (the SPA inside the Android APK). Loaded only by
 * `features/calendar/actions.ts` through `import()` when `isNativeApp()`: the web never requests this
 * module nor the plugin.
 *
 * `createEventWithPrompt` opens the system «new event» screen (`Intent.ACTION_INSERT`) with the event
 * filled in; the user picks the account and saves. No calendar permissions. The plugin resolves the same
 * way whether the user saves or cancels.
 */

import { CapacitorCalendar } from '@ebarooni/capacitor-calendar';
import type { CalendarEvent } from '@ikrive/shared';

/** Local midnight of a `YYYY-MM-DD` date, in milliseconds. */
function localMidnight(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1).getTime();
}

/**
 * Options of the system «new event» screen: all day, starting and ending at the local midnight of
 * `event.date`. Google Calendar treats the intent's `END_TIME` as inclusive for all-day events, so the next
 * midnight (the exclusive end of `toICalendar`) would show the event on two days. Android edit screens read
 * all-day times in the local zone, so the UTC midnight would land on the previous day in UTC− zones.
 */
export function calendarPromptOptions(event: CalendarEvent): {
  title: string;
  description: string;
  isAllDay: true;
  startDate: number;
  endDate: number;
} {
  const startDate = localMidnight(event.date);
  return {
    title: event.title,
    description: event.description,
    isAllDay: true,
    startDate,
    endDate: startDate,
  };
}

/** Opens the system «new event» screen with `event`; rejects if the plugin fails (e.g. no calendar app). */
export async function createDeviceEvent(event: CalendarEvent): Promise<void> {
  await CapacitorCalendar.createEventWithPrompt(calendarPromptOptions(event));
}
