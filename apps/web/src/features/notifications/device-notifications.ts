/**
 * Which notifications of the tray become Android notifications in the native app, without repeats.
 * Pure logic plus `localStorage`: no Capacitor plugin here (that is `lib/native-notifications.ts`).
 */
import type { Notification } from '@ikrive/shared';

/** What this device has already processed for one user. */
export interface DeviceNotificationState {
  /** `createdAt` cut-off: anything older is never notified. `null` = no cut-off yet (empty first page). */
  since: string | null;
  /** Ids of the last processed page (≤ 20): covers notifications tied on `since` to the millisecond. */
  seen: string[];
}

const stateKey = (userId: string) => `ikrive.deviceNotifications.${userId}`;
const PERMISSION_ASKED_KEY = 'ikrive.notificationPermissionAsked';

/** Latest `createdAt` of `items` and `since` (ISO timestamps compare as strings). */
function latest(items: Notification[], since: string | null): string | null {
  return items.reduce<string | null>(
    (max, item) => (max === null || item.createdAt > max ? item.createdAt : max),
    since,
  );
}

/**
 * Splits a page of notifications into the ones to show now and the state to store. First run (`state`
 * is `null`): the page is history, nothing is shown. Later: unread, not seen and not older than `since`.
 * Read notifications (e.g. on another device) are marked as seen without showing them.
 */
export function selectNewNotifications(
  items: Notification[],
  state: DeviceNotificationState | null,
): { notify: Notification[]; next: DeviceNotificationState } {
  const next = { since: latest(items, state?.since ?? null), seen: items.map((item) => item.id) };
  if (state === null) return { notify: [], next };
  const { since, seen } = state;
  const notify = items.filter(
    (item) => item.readAt === null && !seen.includes(item.id) && (since === null || item.createdAt >= since),
  );
  return { notify, next };
}

/** Android notification id of a UUID: FNV-1a (32 bits), kept positive and non-zero (1 … 2³¹−1). */
export function notificationIntId(uuid: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < uuid.length; i++) {
    hash ^= uuid.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash & 0x7fffffff || 1;
}

function isState(value: unknown): value is DeviceNotificationState {
  if (value === null || typeof value !== 'object') return false;
  const { since, seen } = value as Record<string, unknown>;
  return (
    (since === null || typeof since === 'string') &&
    Array.isArray(seen) &&
    seen.every((id) => typeof id === 'string')
  );
}

/** Stored state of `userId` on this device; `null` if there is none, it is corrupt or storage fails. */
export function loadDeviceNotificationState(userId: string): DeviceNotificationState | null {
  try {
    const raw = localStorage.getItem(stateKey(userId));
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return isState(value) ? value : null;
  } catch {
    // Storage unavailable: a perpetual first run, which never notifies twice.
    return null;
  }
}

export function saveDeviceNotificationState(userId: string, state: DeviceNotificationState): void {
  try {
    localStorage.setItem(stateKey(userId), JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode): the next load is a first run again, which notifies nothing.
  }
}

/** Whether this device already asked for the notification permission once (it is asked only once). */
export function wasPermissionAsked(): boolean {
  try {
    return localStorage.getItem(PERMISSION_ASKED_KEY) !== null;
  } catch {
    return false;
  }
}

export function markPermissionAsked(): void {
  try {
    localStorage.setItem(PERMISSION_ASKED_KEY, new Date().toISOString());
  } catch {
    // Storage unavailable: the permission may be asked again on the next launch.
  }
}

/**
 * What a phone notification carries (the plugin's `extra`) so that tapping it opens its notification: the
 * user it was shown to, the notification and its internal link.
 */
export interface NotificationTapData {
  userId: string;
  notificationId: string;
  link: string | null;
}

export const notificationTapData = (userId: string, notification: Notification): NotificationTapData => ({
  userId,
  notificationId: notification.id,
  link: notification.link,
});

/** An internal path of the app (`/vehicles/…`): never a protocol-relative (`//host`) or absolute URL. */
const isInternalLink = (link: string) => link.startsWith('/') && !link.startsWith('//');

/**
 * The `extra` of a tapped notification, or `null` if it is not one of ours (e.g. shown by an older version
 * of the app). A link that is not an internal path becomes `null`: the app stays on its default screen.
 */
export function parseNotificationTapData(extra: unknown): NotificationTapData | null {
  if (extra === null || typeof extra !== 'object') return null;
  const { userId, notificationId, link } = extra as Record<string, unknown>;
  if (typeof userId !== 'string' || typeof notificationId !== 'string') return null;
  return {
    userId,
    notificationId,
    link: typeof link === 'string' && isInternalLink(link) ? link : null,
  };
}
