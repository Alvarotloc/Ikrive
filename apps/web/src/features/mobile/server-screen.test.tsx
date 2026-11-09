import type { Me } from '@ikrive/shared';
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { getServerUrl } from '@/lib/server';
import { createTestQueryClient, type MockResponse, mockApi, setServerMode } from '@/test/render';
import { renderApp } from '@/test/render-app';

const health: MockResponse = { body: { status: 'ok', version: '0.1.0' } };
const unauthorized: MockResponse = {
  status: 401,
  body: { type: 'about:blank', title: 'Unauthorized', status: 401 },
};
const me: Me = { id: 'u1', name: 'Ana', email: 'ana@example.com', role: 'user' };

type User = Awaited<ReturnType<typeof renderApp>>['user'];

async function typeServer(user: User, value: string) {
  const field = await screen.findByLabelText('Dirección del servidor');
  await user.clear(field);
  await user.type(field, value);
  return field;
}

const connect = () => screen.getByRole('button', { name: 'Conectar' });

describe('server screen', () => {
  beforeEach(() => {
    vi.stubEnv('MODE', 'native');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows the field error for an invalid URL', async () => {
    const fetchMock = mockApi({});
    const { user } = await renderApp('/server');

    const field = await typeServer(user, 'not a url');
    await user.click(connect());

    expect(await screen.findByText(/Escribe una dirección web válida/)).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getServerUrl()).toBeNull();
  });

  it('shows «no responde» mentioning TRUSTED_ORIGINS when the server does not answer', async () => {
    setServerMode('https://old.example.com', 'tok');
    mockApi({
      'GET /health': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const { user } = await renderApp('/server');

    await typeServer(user, 'ikrive.example.com');
    await user.click(connect());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('El servidor no responde');
    expect(alert).toHaveTextContent('TRUSTED_ORIGINS');
    expect(getServerUrl()).toBe('https://old.example.com');
  });

  it('shows «no es Ikrive» when /api/health is not Ikrive', async () => {
    setServerMode('https://old.example.com', 'tok');
    mockApi({ 'GET /health': { body: { hello: 'world' } } });
    const { user } = await renderApp('/server');

    await typeServer(user, 'https://router.lan');
    await user.click(connect());

    expect(await screen.findByRole('alert')).toHaveTextContent('no es un servidor de Ikrive');
    expect(getServerUrl()).toBe('https://old.example.com');
  });

  it('disables the button while checking', async () => {
    let release: (response: MockResponse) => void = () => {};
    mockApi({
      'GET /health': () => new Promise((resolve) => (release = resolve)),
      'GET /me': unauthorized,
    });
    const { user } = await renderApp('/server');

    await typeServer(user, 'https://ikrive.example.com');
    await user.click(connect());

    expect(await screen.findByRole('button', { name: 'Comprobando…' })).toBeDisabled();

    release(health);
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('saves the server and shows its login', async () => {
    const fetchMock = mockApi({ 'GET /health': health, 'GET /me': unauthorized });
    const { user, router } = await renderApp('/server');

    await typeServer(user, 'https://ikrive.example.com/');
    await user.click(connect());

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(getServerUrl()).toBe('https://ikrive.example.com');
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls).toContain('https://ikrive.example.com/api/me');
  });

  it('clears the query cache when the server changes', async () => {
    setServerMode('https://old.example.com', 'tok');
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.me, me);
    queryClient.setQueryData(
      ['api-file', 'https://old.example.com', '/api/vehicles/v1/photo?v=1'],
      new Blob(),
    );
    const fetchMock = mockApi({ 'GET /health': health, 'GET /me': unauthorized });
    const { user } = await renderApp('/server', { queryClient });

    await typeServer(user, 'https://ikrive.example.com');
    await user.click(connect());

    // With the old `me` still cached, the login would redirect to the dashboard of the previous server.
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain(
      'https://ikrive.example.com/api/me',
    );
    expect(queryClient.getQueryData(queryKeys.me)).toBeNull();
    expect(queryClient.getQueryCache().findAll({ queryKey: ['api-file'] })).toEqual([]);
  });

  it('warns that an http server is not encrypted without blocking the connection', async () => {
    mockApi({ 'GET /health': health, 'GET /me': unauthorized });
    const { user } = await renderApp('/server');
    const insecure = /Conexión sin cifrar/;

    await typeServer(user, 'https://ikrive.example.com');
    expect(screen.queryByText(insecure)).not.toBeInTheDocument();

    // Without a scheme it is completed with https://.
    await typeServer(user, '192.168.1.10:3000');
    expect(screen.queryByText(insecure)).not.toBeInTheDocument();

    await typeServer(user, 'http://192.168.1.10:3000');
    expect(screen.getByText(insecure)).toHaveTextContent('Usa HTTPS o una VPN');
    expect(connect()).toBeEnabled();

    await user.click(connect());
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(getServerUrl()).toBe('http://192.168.1.10:3000');
  });
});
