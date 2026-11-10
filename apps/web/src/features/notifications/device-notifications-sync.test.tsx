import type { Notification, NotificationList } from '@ikrive/shared';
import { useQuery } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { mockApi, renderWithProviders } from '@/test/render';
import { notificationIntId } from './device-notifications';
import { DeviceNotificationsSync } from './device-notifications-sync';
import { notificationsQuery } from './queries';

/** The native side: only the sync component loads it, and only in the native app. */
const native = vi.hoisted(() => ({
  getNotificationPermission: vi.fn(),
  requestNotificationPermission: vi.fn(),
  showNotifications: vi.fn(),
}));
vi.mock('@/lib/native-notifications', () => native);

const notification = (
  id: string,
  createdAt: string,
  overrides: Partial<Notification> = {},
): Notification => ({
  id,
  type: 'schedule_overdue',
  title: `Mantenimiento vencido ${id}`,
  body: 'Cambio de aceite · Renault Clio',
  link: '/vehicles/v1',
  readAt: null,
  createdAt,
  ...overrides,
});

const old = notification('old', '2026-11-09T08:00:00.000Z');
const fresh = notification('fresh', '2026-11-10T08:00:00.000Z');
const fresher = notification('fresher', '2026-11-10T09:00:00.000Z', { body: null });

/** What the bell shows: the same query, so the tray is not affected by the phone notifications. */
function Tray() {
  const { data } = useQuery(notificationsQuery);
  return (
    <ul aria-label="Bandeja">
      {data?.items.map((item) => (
        <li key={item.id}>{item.title}</li>
      ))}
    </ul>
  );
}

/** `GET /notifications` answers whatever `page.items` holds at request time. */
function setup(items: Notification[]) {
  const page = { items };
  const fetchMock = mockApi({
    'GET /notifications': () => ({
      body: {
        items: page.items,
        total: page.items.length,
        unreadCount: page.items.length,
      } satisfies NotificationList,
    }),
  });
  const rendered = renderWithProviders(
    <>
      <Toaster />
      <DeviceNotificationsSync userId="u1" />
      <Tray />
    </>,
  );
  const refetch = async (next: Notification[]) => {
    page.items = next;
    await rendered.queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list });
  };
  return { ...rendered, fetchMock, refetch };
}

const storedState = () => JSON.parse(localStorage.getItem('ikrive.deviceNotifications.u1') ?? 'null');

/** A previous launch already processed `items` on this device. */
const seed = (items: Notification[]) =>
  localStorage.setItem(
    'ikrive.deviceNotifications.u1',
    JSON.stringify({
      since: items.reduce((max, item) => (item.createdAt > max ? item.createdAt : max), ''),
      seen: items.map((item) => item.id),
    }),
  );

afterEach(() => {
  toast.dismiss();
  native.getNotificationPermission.mockReset();
  native.requestNotificationPermission.mockReset();
  native.showNotifications.mockReset();
});

describe('DeviceNotificationsSync', () => {
  it('asks for the permission once on first launch', async () => {
    native.getNotificationPermission.mockResolvedValue('prompt');
    native.requestNotificationPermission.mockResolvedValue('granted');
    const { refetch } = setup([]);

    await waitFor(() => expect(native.requestNotificationPermission).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem('ikrive.notificationPermissionAsked')).not.toBeNull();

    await refetch([fresh]);
    expect(native.requestNotificationPermission).toHaveBeenCalledTimes(1);
  });

  it('does not ask again on later launches', async () => {
    localStorage.setItem('ikrive.notificationPermissionAsked', '2026-11-09T08:00:00.000Z');
    native.getNotificationPermission.mockResolvedValue('prompt');
    const first = setup([]);
    await waitFor(() => expect(storedState()).not.toBeNull());
    first.unmount();

    // Already decided (e.g. granted from Android settings): nothing to ask either.
    localStorage.removeItem('ikrive.notificationPermissionAsked');
    native.getNotificationPermission.mockResolvedValue('granted');
    setup([]);
    await waitFor(() => expect(native.getNotificationPermission).toHaveBeenCalled());

    expect(native.requestNotificationPermission).not.toHaveBeenCalled();
  });

  it('shows one notification per new notification after a refetch', async () => {
    native.getNotificationPermission.mockResolvedValue('granted');
    native.showNotifications.mockResolvedValue(undefined);
    seed([old]);
    const { refetch } = setup([old]);
    await screen.findByText('Mantenimiento vencido old');

    await refetch([fresher, fresh, old]);

    await waitFor(() => expect(native.showNotifications).toHaveBeenCalledTimes(1));
    expect(native.showNotifications).toHaveBeenCalledWith([
      { id: notificationIntId('fresher'), title: 'Mantenimiento vencido fresher', body: '' },
      {
        id: notificationIntId('fresh'),
        title: 'Mantenimiento vencido fresh',
        body: 'Cambio de aceite · Renault Clio',
      },
    ]);
    expect(storedState()).toEqual({ since: fresher.createdAt, seen: ['fresher', 'fresh', 'old'] });

    // Another poll, and a remount (e.g. a restart): nothing is shown again.
    await refetch([fresher, fresh, old]);
    const again = setup([fresher, fresh, old]);
    await waitFor(() => expect(again.fetchMock).toHaveBeenCalled());
    await screen.findAllByText('Mantenimiento vencido fresher');
    expect(native.showNotifications).toHaveBeenCalledTimes(1);
  });

  it('does not notify the history on first launch', async () => {
    native.getNotificationPermission.mockResolvedValue('granted');
    setup([fresh, old]);

    await waitFor(() => expect(storedState()).toEqual({ since: fresh.createdAt, seen: ['fresh', 'old'] }));
    expect(native.showNotifications).not.toHaveBeenCalled();
  });

  it('does not show notifications without permission', async () => {
    native.getNotificationPermission.mockResolvedValue('denied');
    seed([old]);
    const { refetch } = setup([old]);
    await screen.findByText('Mantenimiento vencido old');

    await refetch([fresh, old]);

    // Processed anyway: granting the permission later does not replay them (they stay in the bell).
    await waitFor(() => expect(storedState()).toEqual({ since: fresh.createdAt, seen: ['fresh', 'old'] }));
    await waitFor(() => expect(native.getNotificationPermission).toHaveBeenCalledTimes(2));
    expect(native.showNotifications).not.toHaveBeenCalled();
    expect(await screen.findByText('Mantenimiento vencido fresh')).toBeInTheDocument();
  });

  it('ignores errors when showing fails', async () => {
    localStorage.setItem('ikrive.notificationPermissionAsked', '2026-11-09T08:00:00.000Z');
    native.getNotificationPermission.mockResolvedValue('granted');
    native.showNotifications.mockRejectedValue(new Error('Notifications disabled'));
    seed([old]);
    const { refetch } = setup([old]);
    await screen.findByText('Mantenimiento vencido old');

    await refetch([fresh, old]);

    await waitFor(() => expect(native.showNotifications).toHaveBeenCalledTimes(1));
    // The tray still shows them, and no toast.
    expect(await screen.findByText('Mantenimiento vencido fresh')).toBeInTheDocument();
    expect(screen.getByText('Mantenimiento vencido old')).toBeInTheDocument();
    expect(document.querySelector('[data-sonner-toast]')).toBeNull();
    // Not retried on the next poll: it was stored as seen before showing.
    await refetch([fresh, old]);
    expect(native.showNotifications).toHaveBeenCalledTimes(1);
  });
});
