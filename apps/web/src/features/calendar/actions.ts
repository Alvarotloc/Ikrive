/**
 * «Add to calendar» side effects: the event itself is built in `@ikrive/shared`. The web downloads an
 * `.ics`; the native app opens the phone calendar instead (`lib/native-calendar.ts`, loaded only there).
 */
import type { CalendarEvent } from '@ikrive/shared';
import { downloadBlob } from '@/lib/download';

/** Downloads `text` as an iCalendar file named `filename` (the share sheet in the native app). */
export function downloadIcs(filename: string, text: string): Promise<void> {
  return downloadBlob(filename, new Blob([text], { type: 'text/calendar;charset=utf-8' }));
}

/** Native app only: opens the phone calendar's «new event» screen with `event`. Rejects if it fails. */
export async function addToDeviceCalendar(event: CalendarEvent): Promise<void> {
  const { createDeviceEvent } = await import('@/lib/native-calendar');
  return createDeviceEvent(event);
}
