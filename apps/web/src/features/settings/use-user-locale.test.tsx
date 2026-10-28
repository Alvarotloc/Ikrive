import { DEFAULT_USER_SETTINGS, type Me, type UserSettings } from '@ikrive/shared';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { routeTree } from '@/routeTree.gen';
import { createTestQueryClient, type MockRoutes, mockApi, renderWithProviders } from '@/test/render';

const me: Me = { id: 'u1', name: 'Ana', email: 'ana@example.com', role: 'user' };

/** Renders the whole app at `path` with a signed-in user and the given API routes. */
function renderApp(path: string, routes: MockRoutes) {
  mockApi({
    'GET /me': { body: me },
    'GET /vehicles': { body: [] },
    'GET /notifications': { body: { items: [], total: 0, unreadCount: 0 } },
    'GET /notification-channels': { body: [] },
    'GET /settings/calendar-feed': { body: { enabled: false, createdAt: null } },
    ...routes,
  });
  const queryClient = createTestQueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return renderWithProviders(<RouterProvider router={router} />, { queryClient });
}

describe('user locale', () => {
  afterEach(async () => {
    await i18n.changeLanguage('es');
    localStorage.clear();
  });

  it('shows the authenticated app in the locale saved in the settings', async () => {
    expect(i18n.language).toBe('es');
    const settings: UserSettings = { ...DEFAULT_USER_SETTINGS, locale: 'en' };
    renderApp('/', { 'GET /settings': { body: settings } });

    expect(await screen.findByRole('heading', { name: 'Hi, Ana' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vehicles' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(i18n.language).toBe('en');
    expect(localStorage.getItem('ikrive.locale')).toBe('en');
  });

  it('keeps the active language when it already matches the settings', async () => {
    renderApp('/', { 'GET /settings': { body: DEFAULT_USER_SETTINGS } });

    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument();
    expect(i18n.language).toBe('es');
  });

  it('switches and remembers the language saved in Settings', async () => {
    const { user } = renderApp('/settings', {
      'GET /settings': { body: DEFAULT_USER_SETTINGS },
      'PATCH /settings': { body: { ...DEFAULT_USER_SETTINGS, locale: 'en' } },
    });

    await user.selectOptions(await screen.findByLabelText('Idioma'), 'en');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Settings saved')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(localStorage.getItem('ikrive.locale')).toBe('en');
  });
});
