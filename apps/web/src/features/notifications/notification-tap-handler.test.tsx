import type { Me, Notification } from '@ikrive/shared';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { type MockRoutes, mockApi, renderWithProviders } from '@/test/render';
import type { NotificationTapData } from './device-notifications';
import { NotificationTapHandler } from './notification-tap-handler';

/** The plugin side: `onNotificationTap` keeps the listener so the test can tap a notification. */
const native = vi.hoisted(() => {
  const state: { listener: ((extra: unknown) => void) | null } = { listener: null };
  const stop = vi.fn(async () => {
    state.listener = null;
  });
  return {
    state,
    stop,
    onNotificationTap: vi.fn(async (listener: (extra: unknown) => void) => {
      state.listener = listener;
      return stop;
    }),
  };
});
vi.mock('@/lib/native-notifications', () => ({ onNotificationTap: native.onNotificationTap }));

const me: Me = { id: 'u1', name: 'Ana', email: 'ana@example.com', role: 'user' };
const unauthorized = {
  status: 401,
  body: { type: 'about:blank', title: 'Unauthorized', status: 401 },
};
const notFound = {
  status: 404,
  body: { type: 'about:blank', title: 'Not Found', status: 404 },
};

const read: Notification = {
  id: 'n1',
  type: 'schedule_overdue',
  title: 'Cambio de aceite',
  body: 'Seat León',
  link: '/vehicles/v1',
  readAt: '2026-11-12T09:00:00.000Z',
  createdAt: '2026-11-12T08:00:00.000Z',
};

const tapData = (overrides: Partial<NotificationTapData> = {}): NotificationTapData => ({
  userId: 'u1',
  notificationId: 'n1',
  link: '/vehicles/v1',
  ...overrides,
});

/** The handler in a minimal in-memory router that starts on its default screen (`/`). */
function setup(routes: MockRoutes) {
  const fetchMock = mockApi(routes);
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <NotificationTapHandler />
        <Outlet />
      </>
    ),
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <h1>Inicio</h1>,
  });
  const vehicleRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/vehicles/$vehicleId',
    component: function VehiclePage() {
      const { vehicleId } = vehicleRoute.useParams();
      return <h1>Vehículo {vehicleId}</h1>;
    },
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, vehicleRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return { fetchMock, router, ...renderWithProviders(<RouterProvider router={router} />) };
}

/** Taps a phone notification whose `extra` is `extra`, once the handler listens. */
async function tap(extra: unknown) {
  await waitFor(() => expect(native.state.listener).not.toBeNull());
  native.state.listener?.(extra);
}

const calls = (fetchMock: Mock<typeof fetch>, method: string, path: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => String(url) === `/api${path}` && (init?.method ?? 'GET') === method,
  );

afterEach(() => {
  native.state.listener = null;
  native.onNotificationTap.mockClear();
  native.stop.mockClear();
});

describe('NotificationTapHandler', () => {
  it('opens the link of the tapped notification and marks it as read', async () => {
    const { fetchMock, router } = setup({
      'GET /me': { body: me },
      'PATCH /notifications/n1/read': { body: read },
    });
    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument();

    await tap(tapData());

    expect(await screen.findByRole('heading', { name: 'Vehículo v1' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/vehicles/v1');
    expect(calls(fetchMock, 'PATCH', '/notifications/n1/read')).toHaveLength(1);
  });

  it('marks it as read and stays on the default screen without a link', async () => {
    const { fetchMock, router } = setup({
      'GET /me': { body: me },
      'PATCH /notifications/n1/read': { body: { ...read, link: null } },
    });

    // `null`, or a link that is not an internal path of the app.
    await tap(tapData({ link: null }));
    await waitFor(() => expect(calls(fetchMock, 'PATCH', '/notifications/n1/read')).toHaveLength(1));
    await tap({ ...tapData(), link: 'https://evil.example/vehicles/v1' });
    await waitFor(() => expect(calls(fetchMock, 'PATCH', '/notifications/n1/read')).toHaveLength(2));

    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
  });

  it('stays on the default screen when the notification no longer exists', async () => {
    // Deleting a vehicle deletes its notifications: the link would lead to a missing vehicle.
    const { fetchMock, router } = setup({
      'GET /me': { body: me },
      'PATCH /notifications/n1/read': notFound,
    });

    await tap(tapData());

    await waitFor(() => expect(calls(fetchMock, 'PATCH', '/notifications/n1/read')).toHaveLength(1));
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
  });

  it('stays on the default screen when the session expired', async () => {
    const { fetchMock, router } = setup({ 'GET /me': unauthorized });

    await tap(tapData());

    await waitFor(() => expect(calls(fetchMock, 'GET', '/me')).toHaveLength(1));
    expect(calls(fetchMock, 'PATCH', '/notifications/n1/read')).toHaveLength(0);
    expect(router.state.location.pathname).toBe('/');
  });

  it('stays on the default screen when the session expired after loading the user', async () => {
    // `me` is still cached, but the API rejects the session.
    const { fetchMock, router } = setup({
      'GET /me': { body: me },
      'PATCH /notifications/n1/read': unauthorized,
    });

    await tap(tapData());

    await waitFor(() => expect(calls(fetchMock, 'PATCH', '/notifications/n1/read')).toHaveLength(1));
    expect(router.state.location.pathname).toBe('/');
  });

  it('ignores notifications of another account and extras that are not ours', async () => {
    const { fetchMock, router } = setup({ 'GET /me': { body: me } });

    await tap(tapData({ userId: 'u2' }));
    await waitFor(() => expect(calls(fetchMock, 'GET', '/me')).toHaveLength(1));
    await tap(undefined);
    await tap({ id: 1 });

    expect(calls(fetchMock, 'PATCH', '/notifications/n1/read')).toHaveLength(0);
    expect(router.state.location.pathname).toBe('/');
  });

  it('stops listening when unmounted', async () => {
    const { unmount } = setup({ 'GET /me': { body: me } });
    await waitFor(() => expect(native.state.listener).not.toBeNull());

    unmount();

    expect(native.stop).toHaveBeenCalledTimes(1);
  });
});
