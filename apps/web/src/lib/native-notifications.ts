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
import type { NotificationTapData } from '@/features/notifications/device-notifications';

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

/** A notification to show; `extra` comes back when it is tapped (`onNotificationTap`). */
export interface DeviceNotification {
  id: number;
  title: string;
  body: string;
  extra: NotificationTapData;
}

/** Shows one notification per item right away. Rejects if the plugin fails. */
export async function showNotifications(items: DeviceNotification[]): Promise<void> {
  if (items.length === 0) return;
  await LocalNotifications.schedule({
    notifications: items.map((item) => ({ ...item, isExactNotification: false })),
  });
}

/**
 * Calls `listener` with the `extra` of every notification the user taps, and resolves to the function that
 * stops listening. A tap that started the app is kept by the plugin until the first listener is added, so
 * it is delivered too. `extra` is `unknown`: it may come from a notification of an older version.
 */
export async function onNotificationTap(listener: (extra: unknown) => void): Promise<() => Promise<void>> {
  const handle = await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    if (action.actionId === 'tap') listener(action.notification.extra);
  });
  return () => handle.remove();
}
