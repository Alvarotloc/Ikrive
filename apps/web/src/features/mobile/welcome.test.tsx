import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '@/test/render';
import { renderApp } from '@/test/render-app';

const unauthorized = { status: 401, body: { type: 'about:blank', title: 'Unauthorized', status: 401 } };

describe('welcome screen', () => {
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

  it('shows «En este teléfono» disabled as coming soon', async () => {
    vi.stubEnv('MODE', 'native');
    mockApi({});
    await renderApp('/welcome');

    const local = await screen.findByRole('button', { name: /En este teléfono/ });
    expect(local).toBeDisabled();
    expect(local).toHaveAttribute('aria-disabled', 'true');
    expect(local).toHaveTextContent('Próximamente');
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
