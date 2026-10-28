import { DEFAULT_USER_SETTINGS } from '@ikrive/shared';
import { screen, within } from '@testing-library/react';
import { Suspense } from 'react';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { type MockRoutes, mockApi, renderWithProviders } from '@/test/render';
import { CalendarFeedSection } from './calendar-feed-section';

const FEED = '/settings/calendar-feed';
const URL_1 = `http://localhost:3000/api/calendar/${'a'.repeat(80)}.ics`;
const URL_2 = `http://localhost:3000/api/calendar/${'b'.repeat(80)}.ics`;
const createdAt = '2026-10-26T09:00:00.000Z';

function setup(routes: MockRoutes) {
  const fetchMock = mockApi({ 'GET /settings': { body: DEFAULT_USER_SETTINGS }, ...routes });
  const rendered = renderWithProviders(
    <>
      <Toaster />
      <Suspense fallback={null}>
        <CalendarFeedSection />
      </Suspense>
    </>,
  );
  return { fetchMock, ...rendered };
}

const calls = (fetchMock: Mock<typeof fetch>, method: string) =>
  fetchMock.mock.calls.filter(([url, init]) => String(url) === `/api${FEED}` && init?.method === method);

/** POST answers with each URL in turn. */
const enableRoute = (...urls: string[]) => {
  let call = 0;
  return () => ({ body: { enabled: true, createdAt, url: urls[Math.min(call++, urls.length - 1)] } });
};

describe('CalendarFeedSection', () => {
  afterEach(() => {
    toast.dismiss();
  });

  it('explains the feed and offers to enable it', async () => {
    setup({ [`GET ${FEED}`]: { body: { enabled: false, createdAt: null } } });

    expect(await screen.findByText('Calendario')).toBeInTheDocument();
    expect(
      screen.getByText(/Google Calendar necesita que este servidor sea accesible desde internet/),
    ).toHaveTextContent(/Apple Calendar, Thunderbird o ICSx5 funcionan también en red local o por VPN/);
    expect(screen.getByRole('button', { name: 'Activar feed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regenerar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows the URL with a copy button after enabling', async () => {
    const { fetchMock, user } = setup({
      [`GET ${FEED}`]: { body: { enabled: false, createdAt: null } },
      [`POST ${FEED}`]: enableRoute(URL_1),
    });
    // `user-event` installs its own clipboard on `navigator`: spy on it.
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');

    await user.click(await screen.findByRole('button', { name: 'Activar feed' }));

    const field = await screen.findByRole('textbox', { name: 'URL del feed' });
    expect(calls(fetchMock, 'POST')).toHaveLength(1);
    expect(field).toHaveValue(URL_1);
    expect(field).toHaveAttribute('readonly');
    expect(field).toHaveAccessibleDescription(/solo se muestra una vez/);
    expect(screen.getByText(/^Activo desde/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activar feed' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(writeText).toHaveBeenCalledWith(URL_1);
    expect(await screen.findByText('URL copiada')).toBeInTheDocument();
  });

  it('regenerates after confirming', async () => {
    const { fetchMock, user } = setup({
      [`GET ${FEED}`]: { body: { enabled: true, createdAt } },
      [`POST ${FEED}`]: enableRoute(URL_2),
    });

    await user.click(await screen.findByRole('button', { name: 'Regenerar' }));
    let dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('la anterior dejará de funcionar');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(calls(fetchMock, 'POST')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Regenerar' }));
    dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Regenerar' }));

    expect(await screen.findByRole('textbox', { name: 'URL del feed' })).toHaveValue(URL_2);
    expect(calls(fetchMock, 'POST')).toHaveLength(1);
  });

  it('disables after confirming', async () => {
    const { fetchMock, user } = setup({
      [`GET ${FEED}`]: { body: { enabled: true, createdAt } },
      [`DELETE ${FEED}`]: { status: 204 },
    });

    await user.click(await screen.findByRole('button', { name: 'Desactivar' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('La URL dejará de funcionar');
    await user.click(within(dialog).getByRole('button', { name: 'Desactivar' }));

    expect(await screen.findByRole('button', { name: 'Activar feed' })).toBeInTheDocument();
    expect(calls(fetchMock, 'DELETE')).toHaveLength(1);
    expect(screen.queryByText(/^Activo desde/)).not.toBeInTheDocument();
  });
});
