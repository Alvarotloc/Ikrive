import { DEFAULT_USER_SETTINGS, type Me, type UserSettings } from '@ikrive/shared';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { type MockRoutes, mockApi, mockMediaQuery } from '@/test/render';
import { renderApp } from '@/test/render-app';

const me: Me = { id: 'u1', name: 'Ana', email: 'ana@example.com', role: 'user' };

/** Renders the whole app at `path` with a signed-in user and the given API routes. */
function renderSignedIn(path: string, routes: MockRoutes) {
  mockMediaQuery(true);
  mockApi({
    'GET /me': { body: me },
    'GET /vehicles': { body: [] },
    'GET /notifications': { body: { items: [], total: 0, unreadCount: 0 } },
    'GET /notification-channels': { body: [] },
    'GET /settings/calendar-feed': { body: { enabled: false, createdAt: null } },
    ...routes,
  });
  return renderApp(path);
}

describe('user locale', () => {
  afterEach(async () => {
    await i18n.changeLanguage('es');
    localStorage.clear();
  });

  it('shows the authenticated app in the locale saved in the settings', async () => {
    expect(i18n.language).toBe('es');
    const settings: UserSettings = { ...DEFAULT_USER_SETTINGS, locale: 'en' };
    await renderSignedIn('/', { 'GET /settings': { body: settings } });

    expect(await screen.findByRole('heading', { name: 'Hi, Ana' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vehicles' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(i18n.language).toBe('en');
    expect(localStorage.getItem('ikrive.locale')).toBe('en');
  });

  it('keeps the active language when it already matches the settings', async () => {
    await renderSignedIn('/', { 'GET /settings': { body: DEFAULT_USER_SETTINGS } });

    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument();
    expect(i18n.language).toBe('es');
  });

  it('switches and remembers the language saved in Settings', async () => {
    const { user } = await renderSignedIn('/settings', {
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
