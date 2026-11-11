/**
 * Local notifications in the native app (the SPA inside the Android APK). Loaded only through `import()`
 * when `isNativeApp()` (`DeviceNotificationsSync`, `DeviceNotificationsSection`): the web never requests
 * this module nor the plugin.
 *
 * Notifications are shown at once and inexact: nothing is scheduled for later, so `schedule()` never opens
 * the «Alarms & reminders» screen and the app does not need `SCHEDULE_EXACT_ALARM` (removed in the manifest).
 */

import type { PermissionState } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/** `POST_NOTIFICATIONS` (Android 13+; granted below that). `prompt-with-rationale` counts as `prompt`. */
export type DevicePermission = 'granted' | 'denied' | 'prompt';

const toDevicePermission = (state: PermissionState): DevicePermission =>
  state === 'granted' || state === 'denied' ? state : 'prompt';

export async function getNotificationPermission(): Promise<DevicePermission> {
  const { display } = await LocalNotifications.checkPermissions();
  return toDevicePermission(display);
}

/** Shows the system dialog (if Android still allows it) and returns the resulting state. */
export async function requestNotificationPermission(): Promise<DevicePermission> {
  const { display } = await LocalNotifications.requestPermissions();
  return toDevicePermission(display);
}

/** Shows one notification per item right away. Rejects if the plugin fails. */
export async function showNotifications(items: { id: number; title: string; body: string }[]): Promise<void> {
  if (items.length === 0) return;
  await LocalNotifications.schedule({
    notifications: items.map((item) => ({ ...item, isExactNotification: false })),
  });
}
