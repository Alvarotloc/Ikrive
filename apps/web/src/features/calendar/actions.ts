/**
 * Browser side of «Add to calendar»: the event itself is built in `@ikrive/shared`, so a native
 * app (Capacitor) can replace this file with the device calendar without touching the rest.
 */

/** Downloads `text` as an iCalendar file named `filename`. */
export function downloadIcs(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked on the next tick: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
