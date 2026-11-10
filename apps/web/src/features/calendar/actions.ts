/**
 * Browser side of «Add to calendar»: the event itself is built in `@ikrive/shared`, so a native
 * app (Capacitor) can replace this file with the device calendar without touching the rest.
 */
import { downloadBlob } from '@/lib/download';

/** Downloads `text` as an iCalendar file named `filename` (the share sheet in the native app). */
export function downloadIcs(filename: string, text: string): Promise<void> {
  return downloadBlob(filename, new Blob([text], { type: 'text/calendar;charset=utf-8' }));
}
