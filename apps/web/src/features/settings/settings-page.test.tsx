import { DEFAULT_USER_SETTINGS, type Me, type UserSettings } from '@ikrive/shared';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { routeTree } from '@/routeTree.gen';
import { createTestQueryClient, mockApi, renderWithProviders } from '@/test/render';

const me: Me = { id: 'u1', name: 'Ana', email: 'ana@example.com', role: 'user' };

/** The whole app on the settings page, with a signed-in user. */
function renderSettings() {
  let saved: Partial<UserSettings> | undefined;
  mockApi({
    'GET /me': { body: me },
    'GET /notifications': { body: { items: [], total: 0, unreadCount: 0 } },
    'GET /notification-channels': { body: [] },
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
});
