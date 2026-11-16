import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MODE_KEY } from '@/lib/app-mode';
import { mockApi, renderWithProviders } from '@/test/render';
import { renderApp } from '@/test/render-app';
import { BackButtonHandler } from './back-button-handler';

/**
 * The plugin side: `onBackButton` keeps the listener so the test can press back. `loaded` turns true the
 * first time the module is imported (then it stays in the module cache: the web test goes first).
 */
const native = vi.hoisted(() => {
  const state: { listener: (() => void) | null; loaded: boolean } = { listener: null, loaded: false };
  const stop = vi.fn(async () => {
    state.listener = null;
  });
  return {
    state,
    stop,
    minimizeApp: vi.fn(async () => {}),
    onBackButton: vi.fn(async (listener: () => void) => {
      state.listener = listener;
      return stop;
    }),
  };
});
vi.mock('@/lib/native-back-button', () => {
  native.state.loaded = true;
  return { onBackButton: native.onBackButton, minimizeApp: native.minimizeApp };
});

/** A screen with a dialog, a menu and a dialog that refuses Escape (a form that is saving). */
function VehiclePage() {
  return (
    <>
      <h1>Vehículo</h1>
      <Dialog>
        <DialogTrigger asChild>
          <Button>Abrir diálogo</Button>
        </DialogTrigger>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Repostaje</DialogTitle>
        </DialogContent>
      </Dialog>
      <Dialog>
        <DialogTrigger asChild>
          <Button>Abrir guardando</Button>
        </DialogTrigger>
        <DialogContent aria-describedby={undefined} onEscapeKeyDown={(event) => event.preventDefault()}>
          <DialogTitle>Guardando</DialogTitle>
        </DialogContent>
      </Dialog>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>Abrir menú</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Editar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/** The handler in a minimal in-memory router whose history holds `entries` (the last one is current). */
function setup(entries: string[]) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <BackButtonHandler />
        <Outlet />
      </>
    ),
  });
  const page = (path: string, title: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <h1>{title}</h1> });
  const vehicleRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/vehicles/$vehicleId',
    component: VehiclePage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      page('/', 'Panel'),
      page('/welcome', 'Bienvenida'),
      page('/login', 'Iniciar sesión'),
      page('/vehicles', 'Vehículos'),
      vehicleRoute,
    ]),
    history: createMemoryHistory({ initialEntries: entries, initialIndex: entries.length - 1 }),
  });
  return { router, ...renderWithProviders(<RouterProvider router={router} />) };
}

/** Presses the Android back button, once the handler listens. */
async function pressBack() {
  await waitFor(() => expect(native.state.listener).not.toBeNull());
  act(() => native.state.listener?.());
}

afterEach(() => {
  vi.unstubAllEnvs();
  native.state.listener = null;
  native.onBackButton.mockClear();
  native.minimizeApp.mockClear();
  native.stop.mockClear();
});

describe('BackButtonHandler', () => {
  // First: once a native test imports the module, it stays in the module cache.
  it('web: never loads the native back button module', async () => {
    mockApi({
      'GET /me': { status: 401, body: { type: 'about:blank', title: 'Unauthorized', status: 401 } },
    });
    await renderApp('/login');

    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(native.state.loaded).toBe(false);
    expect(native.onBackButton).not.toHaveBeenCalled();
  });

  it('closes an open dialog without changing the route', async () => {
    const { router, user } = setup(['/', '/vehicles/v1']);
    await user.click(await screen.findByRole('button', { name: 'Abrir diálogo' }));
    expect(await screen.findByRole('dialog', { name: 'Repostaje' })).toBeInTheDocument();

    await pressBack();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe('/vehicles/v1');
    expect(native.minimizeApp).not.toHaveBeenCalled();
    expect(native.state.loaded).toBe(true);
  });

  it('closes an open menu without changing the route', async () => {
    const { router, user } = setup(['/', '/vehicles/v1']);
    await user.click(await screen.findByRole('button', { name: 'Abrir menú' }));
    expect(await screen.findByRole('menu')).toBeInTheDocument();

    await pressBack();

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe('/vehicles/v1');
    expect(native.minimizeApp).not.toHaveBeenCalled();
  });

  it('keeps the route and the app when the dialog refuses to close', async () => {
    const { router, user } = setup(['/', '/vehicles/v1']);
    await user.click(await screen.findByRole('button', { name: 'Abrir guardando' }));
    expect(await screen.findByRole('dialog', { name: 'Guardando' })).toBeInTheDocument();

    await pressBack();
    await pressBack();

    expect(screen.getByRole('dialog', { name: 'Guardando' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/vehicles/v1');
    expect(native.minimizeApp).not.toHaveBeenCalled();
  });

  it('goes back to the previous screen', async () => {
    const { router } = setup(['/', '/vehicles', '/vehicles/v1']);
    expect(await screen.findByRole('heading', { name: 'Vehículo' })).toBeInTheDocument();

    await pressBack();
    expect(await screen.findByRole('heading', { name: 'Vehículos' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/vehicles');

    await pressBack();
    expect(await screen.findByRole('heading', { name: 'Panel' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(native.minimizeApp).not.toHaveBeenCalled();
  });

  it('minimizes on the dashboard', async () => {
    const { router } = setup(['/vehicles', '/']);
    expect(await screen.findByRole('heading', { name: 'Panel' })).toBeInTheDocument();

    await pressBack();

    expect(native.minimizeApp).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { name: 'Panel' })).toBeInTheDocument();
  });

  it('minimizes on the welcome screen', async () => {
    const { router } = setup(['/welcome']);
    expect(await screen.findByRole('heading', { name: 'Bienvenida' })).toBeInTheDocument();

    await pressBack();

    expect(native.minimizeApp).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe('/welcome');
  });

  it('minimizes on the login screen even with history', async () => {
    const { router } = setup(['/vehicles', '/login']);
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(router.history.canGoBack()).toBe(true);

    await pressBack();

    expect(native.minimizeApp).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('minimizes without history outside the root screens', async () => {
    const { router } = setup(['/vehicles/v1']);
    expect(await screen.findByRole('heading', { name: 'Vehículo' })).toBeInTheDocument();

    await pressBack();

    expect(native.minimizeApp).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe('/vehicles/v1');
  });

  it('behaves the same in local mode', async () => {
    vi.stubEnv('MODE', 'native');
    localStorage.setItem(MODE_KEY, 'local');
    const { router, user } = setup(['/', '/vehicles/v1']);
    await user.click(await screen.findByRole('button', { name: 'Abrir diálogo' }));
    expect(await screen.findByRole('dialog', { name: 'Repostaje' })).toBeInTheDocument();

    await pressBack();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe('/vehicles/v1');

    await pressBack();
    expect(await screen.findByRole('heading', { name: 'Panel' })).toBeInTheDocument();
    expect(native.minimizeApp).not.toHaveBeenCalled();

    await pressBack();
    expect(native.minimizeApp).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe('/');
  });

  it('removes the listener on unmount', async () => {
    const { unmount } = setup(['/']);
    await waitFor(() => expect(native.state.listener).not.toBeNull());

    unmount();

    expect(native.stop).toHaveBeenCalledTimes(1);
  });

  it('removes the listener when unmounted before subscribing', async () => {
    let subscribe: (() => void) | undefined;
    native.onBackButton.mockImplementationOnce(
      (listener) =>
        new Promise((resolve) => {
          subscribe = () => {
            native.state.listener = listener;
            resolve(native.stop);
          };
        }),
    );
    const { unmount } = setup(['/']);
    await waitFor(() => expect(subscribe).toBeDefined());

    unmount();
    expect(native.stop).not.toHaveBeenCalled();
    subscribe?.();

    await waitFor(() => expect(native.stop).toHaveBeenCalledTimes(1));
    expect(native.state.listener).toBeNull();
  });
});
