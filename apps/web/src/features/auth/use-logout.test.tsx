import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getSessionToken } from '@/lib/server';
import { type MockResponse, mockApi, renderWithProviders, setServerMode } from '@/test/render';
import { useLogout } from './use-logout';

function LogoutButton() {
  const logout = useLogout();
  return (
    <button type="button" onClick={() => void logout()}>
      Salir
    </button>
  );
}

/** A «Salir» button on `/` of an in-memory router with a `/login` page, in server mode with a token. */
function setup(signOut: MockResponse) {
  setServerMode('https://ikrive.example.com', 'secret-token');
  const fetchMock = mockApi({ 'POST /auth/sign-out': signOut });
  const rootRoute = createRootRoute();
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/', component: LogoutButton }),
      createRoute({ getParentRoute: () => rootRoute, path: '/login', component: () => <p>Login</p> }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return { fetchMock, ...renderWithProviders(<RouterProvider router={router} />) };
}

describe('useLogout', () => {
  it('clears the stored token on logout', async () => {
    const { user, fetchMock } = setup({ body: { success: true } });

    await user.click(await screen.findByRole('button', { name: 'Salir' }));

    expect(await screen.findByText('Login')).toBeInTheDocument();
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    const request = new Request(String(input), init);
    expect(request.url).toBe('https://ikrive.example.com/api/auth/sign-out');
    expect(request.headers.get('authorization')).toBe('Bearer secret-token');
    expect(getSessionToken()).toBeNull();
  });

  it('clears the stored token even if sign-out fails', async () => {
    const { user, fetchMock } = setup({
      status: 500,
      body: { type: 'about:blank', title: 'Error', status: 500 },
    });

    await user.click(await screen.findByRole('button', { name: 'Salir' }));

    expect(await screen.findByText('Login')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getSessionToken()).toBeNull();
  });
});
