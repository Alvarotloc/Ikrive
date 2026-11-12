import { screen } from '@testing-library/react';
import type { AsyncRemoteCallback } from 'drizzle-orm/sqlite-proxy';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { isLocalMode, MODE_KEY, setLocalMode } from '@/lib/app-mode';
import { dataSource } from '@/lib/data-source';
import { httpDataSource } from '@/lib/data-source/http';
import { createMemorySqlite } from '@/test/memory-sqlite';
import { mockApi, mockMediaQuery } from '@/test/render';
import { renderApp } from '@/test/render-app';
import { forgetLocalDataSource } from './local-mode';

/** The device database: an in-memory SQLite per test, kept across «restarts» of the app within a test. */
const device = vi.hoisted(() => ({ callback: null as AsyncRemoteCallback | null, opened: 0 }));
vi.mock('@/lib/native-sqlite', () => ({
  openDeviceDatabase: async () => {
    device.opened += 1;
    if (!device.callback) throw new Error('No device database');
    return device.callback;
  },
}));

// The local mode loads its `DataSource` with `import()` (drizzle, the schema, the bundled migrations and the
// domains). Transformed by Vite on first use, that can take more than the 1 s of a `findBy*` on a loaded
// machine, so it is loaded here, before any test renders, as `renderApp` does with the route chunks.
beforeAll(async () => {
  await Promise.all([import('@/lib/data-source/local'), import('@/lib/native-sqlite')]);
});

const unauthorized = { status: 401, body: { type: 'about:blank', title: 'Unauthorized', status: 401 } };

describe('welcome screen', () => {
  beforeEach(() => {
    device.callback = createMemorySqlite();
    device.opened = 0;
    // The app layout picks its navigation with a media query: desktop.
    mockMediaQuery(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('native app without a server: redirects every route to the welcome screen without calling the API', async () => {
    vi.stubEnv('MODE', 'native');
    for (const path of ['/', '/login', '/register']) {
      // No route: any request would fail the test.
      const fetchMock = mockApi({});
      const { router, unmount } = await renderApp(path);

      expect(await screen.findByRole('heading', { name: 'Cómo quieres usar Ikrive' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/welcome');
      expect(fetchMock).not.toHaveBeenCalled();
      unmount();
    }
  });

  it('shows both modes and leads «Mi servidor» to the server screen', async () => {
    vi.stubEnv('MODE', 'native');
    mockApi({});
    const { user, router } = await renderApp('/welcome');

    await user.click(await screen.findByRole('link', { name: /Mi servidor/ }));

    expect(await screen.findByLabelText('Dirección del servidor')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/server');
  });

  it('choosing «En este teléfono» opens the dashboard in local mode without network', async () => {
    vi.stubEnv('MODE', 'native');
    const fetchMock = mockApi({});
    const { user, router } = await renderApp('/welcome');

    const local = await screen.findByRole('button', { name: /En este teléfono/ });
    expect(local).toBeEnabled();
    expect(local).not.toHaveTextContent('Próximamente');
    await user.click(local);

    expect(await screen.findByRole('heading', { name: 'Hola, Local' })).toBeInTheDocument();
    expect(await screen.findByText('Todavía no has añadido ningún vehículo')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(localStorage.getItem(MODE_KEY)).toBe('local');
    expect(dataSource()).not.toBe(httpDataSource);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('remembers local mode on restart', async () => {
    vi.stubEnv('MODE', 'native');
    const fetchMock = mockApi({});
    setLocalMode(true);
    const first = await renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Hola, Local' })).toBeInTheDocument();
    await dataSource().vehicles.create({ make: 'Seat', model: 'Ibiza' });
    first.unmount();

    // A new run of the app: nothing in memory but the flag and the device database.
    forgetLocalDataSource();
    const { router } = await renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Seat Ibiza' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(device.opened).toBe(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('local mode redirects login and register to the dashboard', async () => {
    vi.stubEnv('MODE', 'native');
    setLocalMode(true);
    for (const path of ['/login', '/register']) {
      const fetchMock = mockApi({});
      const { router, unmount } = await renderApp(path);

      expect(await screen.findByRole('heading', { name: 'Hola, Local' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/');
      expect(fetchMock).not.toHaveBeenCalled();
      unmount();
    }
  });

  it('saving a server turns local mode off', async () => {
    vi.stubEnv('MODE', 'native');
    setLocalMode(true);
    mockApi({
      'GET /health': { body: { status: 'ok', version: '0.1.0' } },
      'GET /me': { status: 401, body: { type: 'about:blank', title: 'Unauthorized', status: 401 } },
    });
    const { user, router } = await renderApp('/server');

    const field = await screen.findByLabelText('Dirección del servidor');
    await user.clear(field);
    await user.type(field, 'https://ikrive.example.com');
    await user.click(screen.getByRole('button', { name: 'Conectar' }));

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(isLocalMode()).toBe(false);
    expect(localStorage.getItem(MODE_KEY)).toBeNull();
    expect(dataSource()).toBe(httpDataSource);
  });

  it('web ignores the local mode flag', async () => {
    setLocalMode(true);
    const fetchMock = mockApi({ 'GET /me': unauthorized });
    const { router } = await renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(fetchMock).toHaveBeenCalled();
    expect(dataSource()).toBe(httpDataSource);
    expect(device.opened).toBe(0);
  });

  it('web: redirects /welcome and /server to the login', async () => {
    for (const path of ['/welcome', '/server']) {
      mockApi({ 'GET /me': unauthorized });
      const { router, unmount } = await renderApp(path);

      expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/login');
      expect(screen.queryByText('Cómo quieres usar Ikrive')).not.toBeInTheDocument();
      unmount();
    }
  });
});
