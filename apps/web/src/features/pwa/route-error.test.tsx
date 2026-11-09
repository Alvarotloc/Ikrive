import { DEFAULT_USER_SETTINGS, type Me } from '@ikrive/shared';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type MockResponse, mockApi, mockMediaQuery, setServerMode } from '@/test/render';
import { renderApp } from '@/test/render-app';

const me: Me = { id: 'u1', name: 'Ana', email: 'ana@example.com', role: 'user' };

/** `fetch` rejects without an HTTP response, as it does when the server cannot be reached. */
const networkFailure = (): MockResponse => {
  throw new TypeError('Failed to fetch');
};

describe('route error screen', () => {
  it('shows the offline screen when the session cannot be fetched', async () => {
    mockApi({ 'GET /me': networkFailure });

    await renderApp('/');

    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se puede contactar con el servidor. Comprueba tu conexión.',
    );
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('shows the offline screen on the login page without network', async () => {
    mockApi({ 'GET /me': networkFailure });

    await renderApp('/login');

    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('retries the route when clicking Reintentar', async () => {
    mockMediaQuery(true);
    let online = false;
    mockApi({
      'GET /me': () => (online ? { body: me } : networkFailure()),
      'GET /settings': { body: DEFAULT_USER_SETTINGS },
      'GET /notifications': { body: { items: [], total: 0, unreadCount: 0 } },
      'GET /vehicles': { body: [] },
    });
    const { user } = await renderApp('/');
    await screen.findByRole('alert');

    online = true;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument();
    expect(screen.queryByText('Sin conexión')).not.toBeInTheDocument();
  });

  it('shows the generic error when the API fails with a non-network error', async () => {
    mockApi({
      'GET /me': { status: 500, body: { type: 'about:blank', title: 'Internal Server Error', status: 500 } },
    });

    await renderApp('/');

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo ha ido mal');
    expect(screen.queryByText('Sin conexión')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  describe('change server', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('native app: offers to change the server on a network error', async () => {
      vi.stubEnv('MODE', 'native');
      setServerMode('https://ikrive.example.com', 'tok');
      mockApi({ 'GET /me': networkFailure });
      const { user, router } = await renderApp('/');

      expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
      await user.click(screen.getByRole('link', { name: 'Cambiar servidor' }));

      expect(await screen.findByLabelText('Dirección del servidor')).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/server');
    });

    it('web: offers only retry', async () => {
      mockApi({ 'GET /me': networkFailure });

      await renderApp('/');

      expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Cambiar servidor' })).not.toBeInTheDocument();
    });
  });
});
