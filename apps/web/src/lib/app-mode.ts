import { isNativeApp } from './platform';

/**
 * How the native app keeps its data, stored on the device: `local` = «En este teléfono» (SQLite on the
 * device, no account nor server). Without it the app uses a server (`lib/server.ts`). The web ignores it.
 */
export const MODE_KEY = 'ikrive.mode';

/** Whether the app runs in local mode: only the native app with the stored flag. */
export const isLocalMode = (): boolean => isNativeApp() && localStorage.getItem(MODE_KEY) === 'local';

/** Stores (`true`) or removes (`false`) the local mode flag. */
export function setLocalMode(on: boolean): void {
  if (on) localStorage.setItem(MODE_KEY, 'local');
  else localStorage.removeItem(MODE_KEY);
}
