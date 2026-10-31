import { DEFAULT_USER_SETTINGS, type Me, type UserSettings } from '@ikrive/shared';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { routeTree } from '@/routeTree.gen';
import { createTestQueryClient, mockApi, mockMediaQuery, renderWithProviders } from '@/test/render';

const me: Me = { id: 'u1', name: 'Ana', email: 'ana@example.com', role: 'user' };

/** The whole app on the settings page, with a signed-in user. */
function renderSettings() {
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
  const queryClient = createTestQueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ['/settings'] }),
  });
  const rendered = renderWithProviders(<RouterProvider router={router} />, { queryClient });
  return { ...rendered, saved: () => saved };
}

describe('settings page', () => {
  it('saves the reminder hour', async () => {
    const { user, saved } = renderSettings();

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
    const { user, saved } = renderSettings();

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
    const { user, saved } = renderSettings();

    const select = await screen.findByLabelText('Día del recordatorio de kilometraje');
    await user.selectOptions(select, 'Miércoles');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    // Earlier tests' toasts may still be on screen: wait for the request instead.
    await waitFor(() => expect(saved()).toMatchObject({ odometerReminderWeekday: 3 }));
  });
  it('explains the reminder hour', async () => {
    const { user } = renderSettings();

    await user.click(
      await screen.findByRole('button', { name: 'Más información sobre la hora de los recordatorios' }),
    );

    const popover = await screen.findByRole('dialog');
    expect(popover).toHaveTextContent('La app revisa los recordatorios cada hora en punto.');
    expect(popover).toHaveTextContent('Si el servidor estaba apagado a esa hora');
  });

  it('explains the odometer reminder day', async () => {
    const { user } = renderSettings();

    await user.click(
      await screen.findByRole('button', { name: 'Más información sobre el recordatorio de kilometraje' }),
    );

    const popover = await screen.findByRole('dialog');
    expect(popover).toHaveTextContent('7 días o más sin lectura de kilómetros');
    expect(popover).toHaveTextContent('«No avisar»');
  });
});
