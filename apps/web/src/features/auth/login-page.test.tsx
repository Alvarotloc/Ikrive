import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type MockResponse, mockApi, setServerMode } from '@/test/render';
import { renderApp } from '@/test/render-app';

/** The whole app on `/login` with no session; `signIn` answers the sign-in request. */
function renderLogin(signIn: MockResponse) {
  mockApi({
    'GET /me': { status: 401, body: { type: 'about:blank', title: 'Unauthorized', status: 401 } },
    'POST /auth/sign-in/email': signIn,
  });
  return renderApp('/login');
}

async function submitLogin(user: Awaited<ReturnType<typeof renderLogin>>['user']) {
  await user.type(await screen.findByLabelText('Email'), 'ana@example.com');
  await user.type(screen.getByLabelText('Contraseña'), 'secret-password');
  await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
}

describe('login page', () => {
  it('shows a disabled account message when sign-in returns 403', async () => {
    const { user } = await renderLogin({ status: 403, body: { message: 'This account is disabled' } });

    await submitLogin(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta cuenta está desactivada. Contacta con el administrador de la instancia.',
    );
    expect(screen.queryByText('Email o contraseña incorrectos')).not.toBeInTheDocument();
  });

  it('shows invalid credentials when sign-in returns 401', async () => {
    const { user } = await renderLogin({
      status: 401,
      body: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
    });

    await submitLogin(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos');
  });

  describe('server link', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('native app: shows the saved server and a link to change it', async () => {
      vi.stubEnv('MODE', 'native');
      setServerMode('https://ikrive.example.com');
      const { user, router } = await renderLogin({ status: 200, body: {} });

      expect(await screen.findByText('Servidor: ikrive.example.com')).toBeInTheDocument();
      await user.click(screen.getByRole('link', { name: 'Cambiar servidor' }));

      expect(await screen.findByLabelText('Dirección del servidor')).toHaveValue(
        'https://ikrive.example.com',
      );
      expect(router.state.location.pathname).toBe('/server');
    });

    it('web: shows no server link', async () => {
      await renderLogin({ status: 200, body: {} });

      expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
      expect(screen.queryByText(/Servidor:/)).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Cambiar servidor' })).not.toBeInTheDocument();
    });
  });
});
