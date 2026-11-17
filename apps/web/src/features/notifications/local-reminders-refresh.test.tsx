import { DEFAULT_USER_SETTINGS, type Me, type NotificationList } from '@ikrive/shared';
import { useQuery } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, mockMediaQuery, renderWithProviders, setServerMode } from '@/test/render';
import { renderApp } from '@/test/render-app';
import { LocalRemindersRefresh } from './local-reminders-refresh';
import { notificationsQuery } from './queries';

/**
 * The plugin side: `onAppResume` keeps the listener so the test can bring the app back. `gate`, when set,
 * holds the subscription until it settles. `loaded` turns true the first time the module is imported (then
 * it stays in the module cache: the web and server mode test goes first).
 */
const native = vi.hoisted(() => {
  const state = {
    listener: null as (() => void) | null,
    loaded: false,
    gate: null as Promise<void> | null,
  };
  const stop = vi.fn(async () => {
    state.listener = null;
  });
  return {
    state,
    stop,
    onAppResume: vi.fn(async (listener: () => void) => {
      if (state.gate) await state.gate;
      state.listener = listener;
      return stop;
    }),
  };
});
vi.mock('@/lib/native-app-state', () => {
  native.state.loaded = true;
  return { onAppResume: native.onAppResume };
});

/** The phone notifications of the server mode's layouts. */
vi.mock('@/lib/native-notifications', () => ({
  getNotificationPermission: vi.fn(async () => 'denied'),
  requestNotificationPermission: vi.fn(),
  showNotifications: vi.fn(),
  onNotificationTap: vi.fn(async () => async () => {}),
}));

const me: Me = { id: 'u1', name: 'Ana', email: 'ana@example.com', role: 'user' };
const emptyList: NotificationList = { items: [], total: 0, unreadCount: 0 };

/** What the bell reads: the notifications list. */
function Bell() {
  const { data } = useQuery(notificationsQuery);
  return <p>{data ? `${data.unreadCount} sin leer` : 'Cargando'}</p>;
}

/** The handler next to the bell, with `GET /notifications` counting its requests. */
function setup() {
  let requests = 0;
  mockApi({
    'GET /notifications': () => {
      requests++;
      return { body: { ...emptyList, unreadCount: requests } };
    },
  });
  const rendered = renderWithProviders(
    <>
      <LocalRemindersRefresh />
      <Bell />
    </>,
  );
  return { ...rendered, requests: () => requests };
}

afterEach(() => {
  vi.unstubAllEnvs();
  native.state.listener = null;
  native.state.gate = null;
  native.onAppResume.mockClear();
  native.stop.mockClear();
});

describe('LocalRemindersRefresh', () => {
  // First: once a test imports the module, it stays in the module cache.
  it('server mode and web never listen for resume', async () => {
    mockMediaQuery(true);
    mockApi({
      'GET /me': { body: me },
      'GET /notifications': { body: emptyList },
      'GET /notification-channels': { body: [] },
      'GET /settings/calendar-feed': { body: { enabled: false, createdAt: null } },
      'GET /settings': { body: DEFAULT_USER_SETTINGS },
    });

    const web = await renderApp('/settings');
    expect(await screen.findByRole('heading', { name: 'Tus datos' })).toBeInTheDocument();
    web.unmount();

    vi.stubEnv('MODE', 'native');
    setServerMode('https://ikrive.example.com', 'secret-token');
    localStorage.setItem('ikrive.notificationPermissionAsked', '2026-11-09T08:00:00.000Z');
    await renderApp('/settings');
    expect(await screen.findByRole('heading', { name: 'Notificaciones del teléfono' })).toBeInTheDocument();

    expect(native.state.loaded).toBe(false);
    expect(native.onAppResume).not.toHaveBeenCalled();
  });

  it('invalidates the notifications on resume', async () => {
    const { requests } = setup();
    expect(await screen.findByText('1 sin leer')).toBeInTheDocument();
    await waitFor(() => expect(native.state.listener).not.toBeNull());

    act(() => native.state.listener?.());

    expect(await screen.findByText('2 sin leer')).toBeInTheDocument();
    expect(requests()).toBe(2);
    expect(native.state.loaded).toBe(true);
  });

  it('removes the listener on unmount', async () => {
    const { unmount } = setup();
    await waitFor(() => expect(native.state.listener).not.toBeNull());

    unmount();

    expect(native.stop).toHaveBeenCalledTimes(1);
    expect(native.state.listener).toBeNull();
  });

  it('removes the listener when unmounted before subscribing', async () => {
    let subscribe: () => void = () => {};
    native.state.gate = new Promise((resolve) => {
      subscribe = resolve;
    });
    const { unmount } = setup();
    await waitFor(() => expect(native.onAppResume).toHaveBeenCalledTimes(1));

    unmount();
    expect(native.stop).not.toHaveBeenCalled();
    subscribe();

    await waitFor(() => expect(native.stop).toHaveBeenCalledTimes(1));
    expect(native.state.listener).toBeNull();
  });
});
