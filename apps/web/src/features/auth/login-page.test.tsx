import { DEFAULT_USER_SETTINGS, type Me, type Notification, type Vehicle } from '@ikrive/shared';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { notificationIntId } from '@/features/notifications/device-notifications';
import { notificationsQuery } from '@/features/notifications/queries';
import { vehiclesQuery } from '@/features/vehicles/queries';
import {
  createTestQueryClient,
  type MockResponse,
  mockApi,
  mockMediaQuery,
  setServerMode,
} from '@/test/render';
import { renderApp } from '@/test/render-app';
import { meQuery } from './queries';

/** The native side of the phone notifications: only `DeviceNotificationsSync` and `NotificationTapHandler` load it. */
const native = vi.hoisted(() => ({
  getNotificationPermission: vi.fn(),
  requestNotificationPermission: vi.fn(),
  showNotifications: vi.fn(),
  onNotificationTap: vi.fn(async () => async () => {}),
}));
vi.mock('@/lib/native-notifications', () => native);

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

describe('switching accounts without logging out', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    native.getNotificationPermission.mockReset();
    native.showNotifications.mockReset();
  });

  const unauthorized: MockResponse = {
    status: 401,
    body: { type: 'about:blank', title: 'Unauthorized', status: 401 },
  };
  const berta: Me = { id: 'u2', name: 'Berta', email: 'berta@example.com', role: 'user' };
  const notification = (id: string, createdAt: string): Notification => ({
    id,
    type: 'schedule_overdue',
    title: `Aviso ${id}`,
    body: null,
    link: null,
    readAt: null,
    createdAt,
  });
  const anaNotification = notification('ana-n1', '2026-11-10T09:00:00.000Z');
  const bertaNotification = notification('berta-n1', '2026-11-10T08:00:00.000Z');
  const anaVehicle: Vehicle = {
    id: 'ana-v1',
    name: 'Coche de Ana',
    make: 'Toyota',
    model: 'Corolla',
    version: null,
    year: 2021,
    plate: '4821 LKP',
    vin: null,
    type: 'car',
    fuelType: 'hybrid',
    purchaseDate: null,
    purchasePrice: null,
    purchaseOdometer: null,
    notes: null,
    soldAt: null,
    archivedAt: null,
    status: 'active',
    photoUrl: null,
    odometer: { value: 50_040, date: '2026-11-01' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('native app: signing in as another account never uses the cache of the previous one', async () => {
    vi.stubEnv('MODE', 'native');
    mockMediaQuery(true);
    setServerMode('https://ikrive.example.com');
    native.getNotificationPermission.mockResolvedValue('granted');
    native.showNotifications.mockResolvedValue(undefined);
    localStorage.setItem('ikrive.notificationPermissionAsked', '2026-11-01T08:00:00.000Z');
    // Berta already used this device: anything newer than her cut-off becomes a phone notification.
    localStorage.setItem(
      'ikrive.deviceNotifications.u2',
      JSON.stringify({ since: '2026-11-09T08:00:00.000Z', seen: [] }),
    );
    // Ana's session expired without useLogout: her data is still cached within its gcTime.
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(meQuery.queryKey, null);
    queryClient.setQueryData(notificationsQuery.queryKey, {
      items: [anaNotification],
      total: 1,
      unreadCount: 1,
    });
    queryClient.setQueryData(vehiclesQuery('active').queryKey, [anaVehicle]);
    let signedIn = false;
    mockApi({
      'GET /me': () => (signedIn ? { body: berta } : unauthorized),
      'POST /auth/sign-in/email': () => {
        signedIn = true;
        return { body: {} };
      },
      'GET /settings': { body: DEFAULT_USER_SETTINGS },
      'GET /notifications': { body: { items: [bertaNotification], total: 1, unreadCount: 1 } },
      'GET /vehicles': { body: [] },
    });
    const { user } = await renderApp('/login', { queryClient });

    await user.type(await screen.findByLabelText('Email'), berta.email);
    await user.type(screen.getByLabelText('Contraseña'), 'secret-password');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByRole('heading', { name: 'Hola, Berta' })).toBeInTheDocument();
    expect(screen.queryByText('Coche de Ana')).not.toBeInTheDocument();
    await waitFor(() => expect(native.showNotifications).toHaveBeenCalled());
    expect(native.showNotifications).toHaveBeenCalledTimes(1);
    expect(native.showNotifications).toHaveBeenCalledWith([
      {
        id: notificationIntId(bertaNotification.id),
        title: 'Aviso berta-n1',
        body: '',
        extra: { userId: berta.id, notificationId: bertaNotification.id, link: bertaNotification.link },
      },
    ]);
    // Berta's cut-off is her own page, not Ana's.
    expect(JSON.parse(localStorage.getItem('ikrive.deviceNotifications.u2') ?? 'null')).toEqual({
      since: bertaNotification.createdAt,
      seen: [bertaNotification.id],
    });
  });
});
