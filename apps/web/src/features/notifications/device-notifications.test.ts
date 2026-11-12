// @vitest-environment jsdom
// The state lives in `localStorage`, which Node does not have: unlike the rest of the pure-logic tests.
import type { Notification } from '@ikrive/shared';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type DeviceNotificationState,
  loadDeviceNotificationState,
  markPermissionAsked,
  notificationIntId,
  notificationTapData,
  parseNotificationTapData,
  saveDeviceNotificationState,
  selectNewNotifications,
  wasPermissionAsked,
} from './device-notifications';

const notification = (
  id: string,
  createdAt: string,
  overrides: Partial<Notification> = {},
): Notification => ({
  id,
  type: 'schedule_due_soon',
  title: `Aviso ${id}`,
  body: 'Cambio de aceite · Renault Clio',
  link: '/vehicles/v1',
  readAt: null,
  createdAt,
  ...overrides,
});

const ids = (items: Notification[]) => items.map((item) => item.id);

afterEach(() => localStorage.clear());

describe('device notifications', () => {
  it('first run stores the current page as seen without notifying', () => {
    const page = [
      notification('b', '2026-11-10T09:00:00.000Z'),
      notification('a', '2026-11-09T09:00:00.000Z'),
    ];

    expect(selectNewNotifications(page, null)).toEqual({
      notify: [],
      next: { since: '2026-11-10T09:00:00.000Z', seen: ['b', 'a'] },
    });
    // An empty tray: no cut-off yet, so the first notification afterwards is shown.
    const empty = selectNewNotifications([], null);
    expect(empty).toEqual({ notify: [], next: { since: null, seen: [] } });
    const first = selectNewNotifications([notification('a', '2026-11-09T09:00:00.000Z')], empty.next);
    expect(ids(first.notify)).toEqual(['a']);
  });

  it('notifies only unread, unseen notifications not older than the cut-off', () => {
    const state: DeviceNotificationState = { since: '2026-11-10T09:00:00.000Z', seen: ['seen'] };
    const page = [
      notification('new', '2026-11-10T10:00:00.000Z'),
      notification('read', '2026-11-10T10:00:00.000Z', { readAt: '2026-11-10T10:05:00.000Z' }),
      notification('seen', '2026-11-10T09:00:00.000Z'),
      notification('old', '2026-11-10T08:00:00.000Z'),
    ];

    const { notify, next } = selectNewNotifications(page, state);

    expect(ids(notify)).toEqual(['new']);
    // Read ones (e.g. on another device) count as seen too.
    expect(next).toEqual({ since: '2026-11-10T10:00:00.000Z', seen: ['new', 'read', 'seen', 'old'] });
  });

  it('does not notify the same notification twice across refetches', () => {
    const first = selectNewNotifications([notification('a', '2026-11-09T09:00:00.000Z')], null);
    const page = [
      notification('b', '2026-11-10T09:00:00.000Z'),
      notification('a', '2026-11-09T09:00:00.000Z'),
    ];

    const second = selectNewNotifications(page, first.next);
    const third = selectNewNotifications(page, second.next);

    expect(ids(second.notify)).toEqual(['b']);
    expect(third.notify).toEqual([]);
    expect(third.next).toEqual(second.next);
  });

  it('ignores older notifications that slide into the first page', () => {
    // A full page of 20; the 21st, older, was never seen on this device.
    const page = Array.from({ length: 20 }, (_, i) =>
      notification(`n${i}`, `2026-11-10T${String(20 - i).padStart(2, '0')}:00:00.000Z`),
    );
    const { next } = selectNewNotifications(page, null);
    // Deleting a vehicle removes the newest ones: the older one moves up into the page.
    const slid = [...page.slice(5), notification('older', '2026-11-01T09:00:00.000Z')];

    const { notify, next: after } = selectNewNotifications(slid, next);

    expect(notify).toEqual([]);
    // The cut-off never goes back, and the seen list stays bounded by the page.
    expect(after.since).toBe('2026-11-10T20:00:00.000Z');
    expect(after.seen).toHaveLength(16);
  });

  it('notifies a notification tied with the cut-off only once', () => {
    const at = '2026-11-10T09:00:00.000Z';
    const first = selectNewNotifications([notification('a', at)], null);
    // Same millisecond as the cut-off (one job run creates several rows at once).
    const page = [notification('b', at), notification('a', at)];

    const second = selectNewNotifications(page, first.next);
    const third = selectNewNotifications(page, second.next);

    expect(ids(second.notify)).toEqual(['b']);
    expect(third.notify).toEqual([]);
  });

  it('maps a UUID to the same positive int32 id', () => {
    const uuid = '0b9e3c1e-4c1f-4f7a-9d7e-2a6b1c3d4e5f';
    const id = notificationIntId(uuid);

    expect(notificationIntId(uuid)).toBe(id);
    expect(Number.isInteger(id)).toBe(true);
    expect(id).toBeGreaterThanOrEqual(1);
    expect(id).toBeLessThanOrEqual(2 ** 31 - 1);
    expect(notificationIntId('0b9e3c1e-4c1f-4f7a-9d7e-2a6b1c3d4e60')).not.toBe(id);
    for (let i = 0; i < 1000; i++) {
      const value = notificationIntId(crypto.randomUUID());
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(2 ** 31 - 1);
    }
  });

  it('stores the state per user', () => {
    expect(loadDeviceNotificationState('u1')).toBeNull();

    saveDeviceNotificationState('u1', { since: '2026-11-10T09:00:00.000Z', seen: ['a'] });
    saveDeviceNotificationState('u2', { since: null, seen: [] });

    expect(JSON.parse(localStorage.getItem('ikrive.deviceNotifications.u1') ?? '')).toEqual({
      since: '2026-11-10T09:00:00.000Z',
      seen: ['a'],
    });
    expect(loadDeviceNotificationState('u1')).toEqual({ since: '2026-11-10T09:00:00.000Z', seen: ['a'] });
    expect(loadDeviceNotificationState('u2')).toEqual({ since: null, seen: [] });
    expect(loadDeviceNotificationState('u3')).toBeNull();
    // A corrupt value is a first run again (notifies nothing), not a crash.
    localStorage.setItem('ikrive.deviceNotifications.u1', '{"seen":"a"}');
    expect(loadDeviceNotificationState('u1')).toBeNull();

    expect(wasPermissionAsked()).toBe(false);
    markPermissionAsked();
    expect(wasPermissionAsked()).toBe(true);
    expect(localStorage.getItem('ikrive.notificationPermissionAsked')).not.toBeNull();
  });

  it('round-trips the tap data of a notification', () => {
    const item = notification('a', '2026-11-10T09:00:00.000Z');
    const data = notificationTapData('u1', item);

    expect(data).toEqual({ userId: 'u1', notificationId: 'a', link: '/vehicles/v1' });
    // Through the plugin and back (it is stored as JSON by Android).
    expect(parseNotificationTapData(JSON.parse(JSON.stringify(data)))).toEqual(data);
    expect(parseNotificationTapData(notificationTapData('u1', { ...item, link: null }))).toEqual({
      userId: 'u1',
      notificationId: 'a',
      link: null,
    });
  });

  it('rejects tap data that is not ours and links that are not internal paths', () => {
    for (const extra of [undefined, null, 'a', {}, { userId: 'u1' }, { userId: 1, notificationId: 'a' }]) {
      expect(parseNotificationTapData(extra)).toBeNull();
    }
    for (const link of ['https://evil.example', '//evil.example/x', 'vehicles/v1', 42, undefined]) {
      expect(parseNotificationTapData({ userId: 'u1', notificationId: 'a', link })).toEqual({
        userId: 'u1',
        notificationId: 'a',
        link: null,
      });
    }
  });
});
