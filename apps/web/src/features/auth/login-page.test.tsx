import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { routeTree } from '@/routeTree.gen';
import { createTestQueryClient, type MockResponse, mockApi, renderWithProviders } from '@/test/render';
// The login page is code-split: imported lazily, `authClient` would keep the first test's `fetch` mock.
// Importing it here makes it see the deferred `fetch` of `src/test/setup.ts`, like every other module.
import '@/lib/auth-client';

/** The whole app on `/login` with no session; `signIn` answers the sign-in request. */
function renderLogin(signIn: MockResponse) {
  mockApi({
    'GET /me': { status: 401, body: { type: 'about:blank', title: 'Unauthorized', status: 401 } },
    'POST /auth/sign-in/email': signIn,
  });
  const queryClient = createTestQueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ['/login'] }),
  });
  return renderWithProviders(<RouterProvider router={router} />, { queryClient });
}

async function submitLogin(user: ReturnType<typeof renderLogin>['user']) {
  await user.type(await screen.findByLabelText('Email'), 'ana@example.com');
  await user.type(screen.getByLabelText('Contraseña'), 'secret-password');
  await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
}

describe('login page', () => {
  it('shows a disabled account message when sign-in returns 403', async () => {
    const { user } = renderLogin({ status: 403, body: { message: 'This account is disabled' } });

    await submitLogin(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta cuenta está desactivada. Contacta con el administrador de la instancia.',
    );
    expect(screen.queryByText('Email o contraseña incorrectos')).not.toBeInTheDocument();
  });

  it('shows invalid credentials when sign-in returns 401', async () => {
    const { user } = renderLogin({
      status: 401,
      body: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
    });

    await submitLogin(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos');
  });
});
