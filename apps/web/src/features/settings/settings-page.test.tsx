import { DEFAULT_USER_SETTINGS, type Me, type UserSettings } from '@ikrive/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, mockMediaQuery, setServerMode } from '@/test/render';
import { renderApp } from '@/test/render-app';

/**
 * The phone notifications: only the root and app layouts and the settings card load it, and only in the
 * native app.
 * `loaded` turns true the first time it is imported (then it stays in the module cache: web tests go first).
 */
const native = vi.hoisted(() => ({
  loaded: false,
  getNotificationPermission: vi.fn(),
  requestNotificationPermission: vi.fn(),
  showNotifications: vi.fn(),
  onNotificationTap: vi.fn(async () => async () => {}),
}));
vi.mock('@/lib/native-notifications', () => {
  native.loaded = true;
  return {
    getNotificationPermission: native.getNotificationPermission,
    requestNotificationPermission: native.requestNotificationPermission,
    showNotifications: native.showNotifications,
    onNotificationTap: native.onNotificationTap,
  };
});

const me: Me = { id: 'u1', name: 'Ana', email: 'ana@example.com', role: 'user' };

/** The whole app on the settings page, with a signed-in user. */
async function renderSettings() {
  mockMediaQuery(true);
  let saved: Partial<UserSettings> | undefined;
  mockApi({
    'GET /me': { body: me },
    'GET /notifications': { body: { items: [], total: 0, unreadCount: 0 } },
    'GET /notification-channels': { body: [] },
    'GET /settings/calendar-feed': { body: { enabled: false, createdAt: null } },
    'GET /settings': { body: DEFAULT_USER_SETTINGS },
    'PATCH /settings': async (request) => {
      saved = (await request.json()) as Partial<UserSettings>;
      return { body: { ...DEFAULT_USER_SETTINGS, ...saved } };
    },
  });
  const rendered = await renderApp('/settings');
  return { ...rendered, saved: () => saved };
}

describe('settings page', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    native.getNotificationPermission.mockReset();
  });

  it('saves the reminder hour', async () => {
    const { user, saved } = await renderSettings();

    const select = await screen.findByLabelText('Hora de los recordatorios');
    const options = within(select).getAllByRole('option');
    expect(options).toHaveLength(24);
    expect(options[0]).toHaveTextContent('00:00');
    expect(options[23]).toHaveTextContent('23:00');
    expect(select).toHaveValue('8');
    expect(within(select).getByRole('option', { name: '08:00' })).toHaveProperty('selected', true);
    expect(select).toHaveAccessibleDescription('Te avisaremos a partir de esta hora en tu zona horaria.');

    await user.selectOptions(select, '20:00');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Ajustes guardados')).toBeInTheDocument();
    expect(saved()).toMatchObject({ reminderHour: 20 });
  });

  it('saves no odometer reminder day', async () => {
    const { user, saved } = await renderSettings();

    const select = await screen.findByLabelText('Día del recordatorio de kilometraje');
    const options = within(select).getAllByRole('option');
    expect(options).toHaveLength(8);
    expect(options[0]).toHaveTextContent('No avisar');
    expect(select).toHaveValue('0');

    await user.selectOptions(select, 'No avisar');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    // Earlier tests' toasts may still be on screen: wait for the request instead.
    await waitFor(() => expect(saved()).toMatchObject({ odometerReminderWeekday: null }));
  });

  it('saves an odometer reminder day as a number', async () => {
    const { user, saved } = await renderSettings();

    const select = await screen.findByLabelText('Día del recordatorio de kilometraje');
    await user.selectOptions(select, 'Miércoles');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    // Earlier tests' toasts may still be on screen: wait for the request instead.
    await waitFor(() => expect(saved()).toMatchObject({ odometerReminderWeekday: 3 }));
  });
  it('explains the reminder hour', async () => {
    const { user } = await renderSettings();

    await user.click(
      await screen.findByRole('button', { name: 'Más información sobre la hora de los recordatorios' }),
    );

    const popover = await screen.findByRole('dialog');
    expect(popover).toHaveTextContent('La app revisa los recordatorios cada hora en punto.');
    expect(popover).toHaveTextContent('Si el servidor estaba apagado a esa hora');
  });

  it('explains the odometer reminder day', async () => {
    const { user } = await renderSettings();

    await user.click(
      await screen.findByRole('button', { name: 'Más información sobre el recordatorio de kilometraje' }),
    );

    const popover = await screen.findByRole('dialog');
    expect(popover).toHaveTextContent('7 días o más sin lectura de kilómetros');
    expect(popover).toHaveTextContent('«No avisar»');
  });

  it('shows the data section', async () => {
    await renderSettings();

    expect(await screen.findByRole('heading', { name: 'Tus datos' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Descargar mis datos' });
    expect(link).toHaveAttribute('href', '/api/me/export');
    expect(link).toHaveAttribute('download');
    expect(screen.getByRole('button', { name: 'Importar datos' })).toBeInTheDocument();
  });

  it('links to the CSV import', async () => {
    const { user, router } = await renderSettings();

    expect(await screen.findByRole('heading', { name: 'Importar desde otra app' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Importar un CSV' });
    expect(link).toHaveAttribute('href', '/import');

    // The import page loads every vehicle: archived and sold ones too.
    const statuses: (string | null)[] = [];
    mockApi({
      'GET /me': { body: me },
      'GET /notifications': { body: { items: [], total: 0, unreadCount: 0 } },
      'GET /settings': { body: DEFAULT_USER_SETTINGS },
      'GET /vehicles': (request) => {
        statuses.push(new URL(request.url).searchParams.get('status'));
        return { body: [] };
      },
    });
    await user.click(link);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Importar desde otra app' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/import');
    expect(screen.getByText('Para importar un CSV necesitas al menos un vehículo.')).toBeInTheDocument();
    expect(statuses).toEqual(['all']);
  });

  it('web: hides the phone notifications card and never loads the native module', async () => {
    await renderSettings();

    expect(await screen.findByRole('heading', { name: 'Tus datos' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Notificaciones del teléfono' })).not.toBeInTheDocument();
    expect(native.loaded).toBe(false);
  });

  it('native: shows the phone notifications card', async () => {
    vi.stubEnv('MODE', 'native');
    setServerMode('https://ikrive.example.com', 'secret-token');
    // Already asked on an earlier launch: the layout does not ask again.
    localStorage.setItem('ikrive.notificationPermissionAsked', '2026-11-09T08:00:00.000Z');
    native.getNotificationPermission.mockResolvedValue('granted');
    await renderSettings();

    expect(await screen.findByRole('heading', { name: 'Notificaciones del teléfono' })).toBeInTheDocument();
    expect(await screen.findByText(/^Activadas/)).toBeInTheDocument();
    expect(native.loaded).toBe(true);
    expect(native.requestNotificationPermission).not.toHaveBeenCalled();
  });
});
