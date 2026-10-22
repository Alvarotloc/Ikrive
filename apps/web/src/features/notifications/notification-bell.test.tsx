import { DEFAULT_USER_SETTINGS, type Notification, type NotificationList } from '@ikrive/shared';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, type Mock } from 'vitest';
import { type MockRoutes, mockApi, renderWithProviders } from '@/test/render';
import { NotificationBell } from './notification-bell';

const notification = (overrides: Partial<Notification>): Notification => ({
  id: 'n1',
  type: 'schedule_overdue',
  title: 'Cambio de aceite',
  body: 'Seat León',
  link: '/vehicles/v1',
  readAt: null,
  createdAt: '2026-10-22T08:00:00.000Z',
  ...overrides,
});

const overdue = notification({});
const dueSoon = notification({
  id: 'n2',
  type: 'schedule_due_soon',
  title: 'ITV',
  body: 'Honda Civic',
  link: '/vehicles/v2',
  readAt: '2026-10-21T09:00:00.000Z',
  createdAt: '2026-10-21T08:00:00.000Z',
});

const page = (items: Notification[], unreadCount = items.filter((n) => n.readAt === null).length) =>
  ({ items, total: items.length, unreadCount }) satisfies NotificationList;

// Same formatter as `useFormat().dateTime` in Spanish and the default time zone.
const dateTime = (iso: string) =>
  new Intl.DateTimeFormat('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Madrid',
  }).format(new Date(iso));

/** The bell in a minimal in-memory router with a vehicle page to navigate to. */
function setup(routes: MockRoutes) {
  const fetchMock = mockApi({ 'GET /settings': { body: DEFAULT_USER_SETTINGS }, ...routes });
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <NotificationBell />
        <Outlet />
      </>
    ),
  });
  const vehicleRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/vehicles/$vehicleId',
    component: function VehiclePage() {
      const { vehicleId } = vehicleRoute.useParams();
      return <h1>Vehículo {vehicleId}</h1>;
    },
  });
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => null });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, vehicleRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return { fetchMock, router, ...renderWithProviders(<RouterProvider router={router} />) };
}

const calls = (fetchMock: Mock<typeof fetch>, method: string, path: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => String(url) === `/api${path}` && (init?.method ?? 'GET') === method,
  );

const bell = (count: number) => screen.findByRole('button', { name: `Notificaciones, ${count} sin leer` });

describe('NotificationBell', () => {
  it('shows the unread count on the bell', async () => {
    const many = Array.from({ length: 12 }, (_, i) => notification({ id: `n${i}` }));
    setup({ 'GET /notifications': { body: page(many) } });

    const button = await bell(12);
    expect(within(button).getByText('9+')).toBeInTheDocument();
  });

  it('shows a small count as is and no counter without unread notifications', async () => {
    const first = setup({ 'GET /notifications': { body: page([overdue, dueSoon]) } });
    expect(within(await bell(1)).getByText('1')).toBeInTheDocument();
    first.unmount();

    setup({ 'GET /notifications': { body: page([dueSoon]) } });
    expect((await bell(0)).textContent).toBe('');
  });

  it('lists notifications in the panel', async () => {
    const { user } = setup({ 'GET /notifications': { body: page([overdue, dueSoon]) } });

    await user.click(await bell(1));
    const panel = await screen.findByRole('dialog', { name: 'Notificaciones' });
    const [first, second] = within(panel).getAllByRole('listitem') as [HTMLElement, HTMLElement];

    expect(within(first).getByText('Mantenimiento vencido')).toBeInTheDocument();
    expect(within(first).getByText('Cambio de aceite')).toHaveClass('font-semibold');
    expect(within(first).getByText('Seat León')).toBeInTheDocument();
    expect(within(first).getByText(dateTime(overdue.createdAt))).toBeInTheDocument();

    expect(within(second).getByText('Mantenimiento próximo')).toBeInTheDocument();
    expect(within(second).getByText('ITV')).not.toHaveClass('font-semibold');
    expect(within(second).getByText('Honda Civic')).toBeInTheDocument();
    expect(within(second).getByText(dateTime(dueSoon.createdAt))).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    const { user } = setup({ 'GET /notifications': { body: page([]) } });

    await user.click(await bell(0));
    expect(await screen.findByText('No tienes notificaciones.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marcar todas como leídas' })).not.toBeInTheDocument();
  });

  it('shows an error alert when the request fails', async () => {
    const { user } = setup({
      'GET /notifications': { status: 500, body: { type: 'about:blank', title: 'Error', status: 500 } },
    });

    // The header keeps working: the bell is there, without a counter.
    await user.click(await bell(0));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se han podido cargar las notificaciones.');
  });

  it('marks a notification as read and navigates to its link', async () => {
    const { user, fetchMock, router } = setup({
      'GET /notifications': { body: page([overdue, dueSoon]) },
      'PATCH /notifications/n1/read': { body: { ...overdue, readAt: '2026-10-22T09:00:00.000Z' } },
    });

    await user.click(await bell(1));
    await user.click(await screen.findByRole('button', { name: /Cambio de aceite/ }));

    expect(await screen.findByRole('heading', { name: 'Vehículo v1' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/vehicles/v1');
    expect(calls(fetchMock, 'PATCH', '/notifications/n1/read')).toHaveLength(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // An already read notification only navigates.
    await user.click(await bell(1));
    await user.click(await screen.findByRole('button', { name: /ITV/ }));
    expect(await screen.findByRole('heading', { name: 'Vehículo v2' })).toBeInTheDocument();
    expect(calls(fetchMock, 'PATCH', '/notifications/n2/read')).toHaveLength(0);
  });

  it('marks all as read', async () => {
    let list = page([overdue, notification({ id: 'n3', title: 'Frenos' })]);
    const { user, fetchMock } = setup({
      'GET /notifications': () => ({ body: list }),
      'POST /notifications/read-all': () => {
        list = page(list.items.map((n) => ({ ...n, readAt: '2026-10-22T09:00:00.000Z' })));
        return { status: 204 };
      },
    });

    await user.click(await bell(2));
    await user.click(await screen.findByRole('button', { name: 'Marcar todas como leídas' }));

    expect(await bell(0)).toBeInTheDocument();
    expect(calls(fetchMock, 'POST', '/notifications/read-all')).toHaveLength(1);
    expect((await bell(0)).textContent).toBe('');
    expect(screen.queryByRole('button', { name: 'Marcar todas como leídas' })).not.toBeInTheDocument();
  });
});
