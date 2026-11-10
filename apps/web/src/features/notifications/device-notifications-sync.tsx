import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import {
  loadDeviceNotificationState,
  markPermissionAsked,
  notificationIntId,
  saveDeviceNotificationState,
  selectNewNotifications,
  wasPermissionAsked,
} from './device-notifications';
import { notificationsQuery } from './queries';

/**
 * Native app only (mounted by the authenticated layout): turns each new notification of the tray into an
 * Android notification. It shares the bell's query and polling, so it makes no requests of its own, and
 * renders nothing. The notification permission is asked once per device, on the first launch.
 */
export function DeviceNotificationsSync({ userId }: { userId: string }) {
  const { data } = useQuery(notificationsQuery);
  // StrictMode runs effects twice: never ask for the permission twice in the same mount.
  const permissionChecked = useRef(false);

  useEffect(() => {
    if (permissionChecked.current || wasPermissionAsked()) return;
    permissionChecked.current = true;
    void (async () => {
      const native = await import('@/lib/native-notifications');
      if ((await native.getNotificationPermission()) !== 'prompt') return;
      markPermissionAsked();
      await native.requestNotificationPermission();
    })().catch(() => {
      // The plugin failed: the app keeps working without phone notifications.
    });
  }, []);

  useEffect(() => {
    if (!data) return;
    // Load, select and save in one synchronous step, before showing anything: a refetch, a remount or a
    // restart never shows the same notification twice, with or without the permission.
    const { notify, next } = selectNewNotifications(data.items, loadDeviceNotificationState(userId));
    saveDeviceNotificationState(userId, next);
    if (notify.length === 0) return;
    void (async () => {
      const native = await import('@/lib/native-notifications');
      if ((await native.getNotificationPermission()) !== 'granted') return;
      await native.showNotifications(
        notify.map((item) => ({ id: notificationIntId(item.id), title: item.title, body: item.body ?? '' })),
      );
    })().catch(() => {
      // Showing is best effort: the notifications are still in the bell.
    });
  }, [data, userId]);

  return null;
}
