import { DEFAULT_USER_SETTINGS, type NotificationList } from '@ikrive/shared';
import { useQuery } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { type MockRoutes, mockApi, mockMediaQuery, renderWithProviders } from '@/test/render';
import { AppNavigation } from './app-navigation';

const noNotifications: NotificationList = { items: [], total: 0, unreadCount: 0 };

/** A query that keeps something in the cache, to check that logging out clears it. */
function DashboardPage() {
  useQuery({ queryKey: ['dashboard-probe'], queryFn: () => 'cached' });
  return <h1>Página de inicio</h1>;
}

/** The navigation in an in-memory router with one page per destination, plus `/login`. */
function setup({
  desktop = false,
  path = '/',
  routes = {},
}: {
  desktop?: boolean;
  path?: string;
  routes?: MockRoutes;
} = {}) {
  mockMediaQuery(desktop);
  const fetchMock = mockApi({
    'GET /settings': { body: DEFAULT_USER_SETTINGS },
    'GET /notifications': { body: noNotifications },
    ...routes,
  });
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <AppNavigation />
        <Outlet />
      </>
    ),
  });
  const page = (path: string, title: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <h1>{title}</h1> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/', component: DashboardPage }),
      page('/vehicles', 'Página de vehículos'),
      page('/odometer', 'Página de kilómetros'),
      page('/settings', 'Página de ajustes'),
      page('/login', 'Página de login'),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return { fetchMock, router, ...renderWithProviders(<RouterProvider router={router} />) };
}

const menuButton = () => screen.findByRole('button', { name: 'Abrir menú' });

/** Opens the menu and returns the panel. Radix hides the rest of the page from the accessibility tree meanwhile. */
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await menuButton());
  return screen.findByRole('dialog', { name: 'Menú' });
}

const destinations = ['Inicio', 'Vehículos', 'Kilómetros', 'Ajustes'];

describe('AppNavigation', () => {
  it('shows only the brand, the bell and the menu button below md', async () => {
    setup();

    expect(await menuButton()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('link', { name: 'Ikrive' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^Notificaciones/ })).toBeInTheDocument();
    for (const name of destinations) expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the menu with every destination and highlights the active route', async () => {
    const { user } = setup({ path: '/vehicles' });

    const button = await menuButton();
    const dialog = await openMenu(user);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    for (const name of destinations) {
      const link = within(dialog).getByRole('link', { name });
      expect(link).toHaveTextContent(name);
      expect(link.querySelector('svg')).not.toBeNull();
      if (name === 'Vehículos') expect(link).toHaveAttribute('aria-current', 'page');
      else expect(link).not.toHaveAttribute('aria-current');
    }
    const logout = within(dialog).getByRole('button', { name: 'Cerrar sesión' });
    expect(logout).toHaveTextContent('Cerrar sesión');
    expect(logout.querySelector('svg')).not.toBeNull();
  });

  it('navigates and closes the menu when choosing an option', async () => {
    const { user } = setup();

    const dialog = await openMenu(user);
    await user.click(within(dialog).getByRole('link', { name: 'Ajustes' }));

    expect(await screen.findByRole('heading', { name: 'Página de ajustes' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await menuButton()).toHaveFocus();
    expect(await menuButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the menu with Escape and returns focus to the button', async () => {
    const { user } = setup();

    await openMenu(user);
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await menuButton()).toHaveFocus();
  });

  it('closes the menu when clicking outside', async () => {
    const { user } = setup();

    const dialog = await openMenu(user);
    // Radix sets `pointer-events: none` on `body` while the modal is open; the overlay still gets the click.
    const overlay = document.querySelector('[data-state="open"]:not([role="dialog"]):not(button)');
    expect(overlay).not.toBeNull();
    expect(dialog.contains(overlay)).toBe(false);
    await userEvent.setup({ pointerEventsCheck: 0 }).click(overlay as Element);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await menuButton()).toHaveFocus();
  });

  it('closes the menu when the route changes', async () => {
    const { user, router } = setup();

    await openMenu(user);
    await act(() => router.navigate({ to: '/odometer' }));

    expect(await screen.findByRole('heading', { name: 'Página de kilómetros' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await menuButton()).toHaveFocus();
  });

  it('keeps focus inside the menu while open', async () => {
    const { user } = setup();

    const dialog = await openMenu(user);
    // Close button + four destinations + log out.
    const focusable = 6;
    for (let i = 0; i < focusable * 2; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    for (let i = 0; i < focusable * 2; i++) {
      await user.tab({ shift: true });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('logs out from the menu', async () => {
    const { user, fetchMock, queryClient } = setup({
      routes: { 'POST /auth/sign-out': { body: { success: true } } },
    });
    expect(await screen.findByRole('heading', { name: 'Página de inicio' })).toBeInTheDocument();
    await waitFor(() => expect(queryClient.getQueryData(['dashboard-probe'])).toBe('cached'));

    const dialog = await openMenu(user);
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar sesión' }));

    expect(await screen.findByRole('heading', { name: 'Página de login' })).toBeInTheDocument();
    const signOut = fetchMock.mock.calls.filter(([input, init]) => {
      const request = input instanceof Request ? input : new Request(new URL(input, location.origin), init);
      return request.method === 'POST' && new URL(request.url).pathname === '/api/auth/sign-out';
    });
    expect(signOut).toHaveLength(1);
    expect(queryClient.getQueryData(['dashboard-probe'])).toBeUndefined();
  });

  it('shows the sidebar and no menu button from md up', async () => {
    setup({ desktop: true });

    expect(await screen.findByRole('heading', { name: 'Página de inicio' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir menú' })).not.toBeInTheDocument();
    for (const name of destinations) expect(screen.getByRole('link', { name })).toHaveTextContent(name);
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^Notificaciones/ })).toBeInTheDocument();
  });
});
