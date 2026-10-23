import type { NotificationChannel } from '@ikrive/shared';
import { screen, within } from '@testing-library/react';
import { Suspense } from 'react';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, type Mock } from 'vitest';
import { type MockRoutes, mockApi, renderWithProviders } from '@/test/render';
import { NotificationChannelsSection } from './channels-section';

const base = {
  enabled: true,
  hasToken: false,
  lastError: null,
  createdAt: '2026-10-23T08:00:00.000Z',
  updatedAt: '2026-10-23T08:00:00.000Z',
} as const;

const ntfy: NotificationChannel = {
  ...base,
  id: 'c1',
  type: 'ntfy',
  hasToken: true,
  config: { serverUrl: 'https://ntfy.sh', topic: 'coche' },
};
const gotify: NotificationChannel = {
  ...base,
  id: 'c2',
  type: 'gotify',
  hasToken: true,
  lastError: 'HTTP 401',
  config: { serverUrl: 'https://gotify.example.com' },
};
const webhook: NotificationChannel = {
  ...base,
  id: 'c3',
  type: 'webhook',
  enabled: false,
  config: { url: 'https://hooks.example.com/ikrive' },
};

function setup(routes: MockRoutes) {
  const fetchMock = mockApi(routes);
  const rendered = renderWithProviders(
    <>
      <Toaster />
      <Suspense fallback={null}>
        <NotificationChannelsSection />
      </Suspense>
    </>,
  );
  return { fetchMock, ...rendered };
}

const calls = (fetchMock: Mock<typeof fetch>, method: string, path: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => String(url) === `/api${path}` && (init?.method ?? 'GET') === method,
  );
const bodyOf = (fetchMock: Mock<typeof fetch>, method: string, path: string) =>
  JSON.parse(String(calls(fetchMock, method, path)[0]?.[1]?.body));

/** Listed channels (toasts are list items too: skip them). */
const rows = () => screen.getAllByRole('listitem').filter((item) => !item.hasAttribute('data-sonner-toast'));
const rowOf = (summary: string) => screen.getByText(summary).closest('li') as HTMLElement;

describe('NotificationChannelsSection', () => {
  // Sonner keeps toasts in a module-level store and replays the active ones to every new Toaster.
  afterEach(() => {
    toast.dismiss();
  });

  it('shows an empty state', async () => {
    setup({ 'GET /notification-channels': { body: [] } });

    expect(await screen.findByRole('heading', { name: 'Canales de notificación' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Todavía no hay canales. Por ahora, los avisos solo aparecen en la campana de la app.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Añadir canal' })).toBeInTheDocument();
  });

  it('lists channels with type, summary and last error', async () => {
    setup({ 'GET /notification-channels': { body: [ntfy, gotify, webhook] } });

    expect(await screen.findByText('ntfy.sh/coche')).toBeInTheDocument();
    expect(rows()).toHaveLength(3);

    const ntfyRow = rowOf('ntfy.sh/coche');
    expect(within(ntfyRow).getByText('ntfy')).toHaveClass('border-dashed');
    expect(within(ntfyRow).getByRole('checkbox', { name: 'Activo (ntfy ntfy.sh/coche)' })).toBeChecked();
    expect(within(ntfyRow).queryByText(/Último error/)).not.toBeInTheDocument();

    const gotifyRow = rowOf('gotify.example.com');
    expect(within(gotifyRow).getByText('Gotify')).toBeInTheDocument();
    expect(within(gotifyRow).getByText('Último error: HTTP 401')).toHaveClass('text-destructive');

    const webhookRow = rowOf('hooks.example.com');
    expect(within(webhookRow).getByText('Webhook')).toBeInTheDocument();
    expect(within(webhookRow).getByRole('checkbox', { name: /^Activo/ })).not.toBeChecked();
    for (const name of ['Probar Webhook hooks.example.com', 'Editar Webhook hooks.example.com']) {
      expect(within(webhookRow).getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('adds a channel and shows it in the list', async () => {
    let channels: NotificationChannel[] = [];
    const { user, fetchMock } = setup({
      'GET /notification-channels': () => ({ body: channels }),
      'POST /notification-channels': () => {
        channels = [ntfy];
        return { status: 201, body: ntfy };
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Añadir canal' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('URL del servidor'), 'https://ntfy.sh');
    await user.type(within(dialog).getByLabelText('Tema'), 'coche');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('ntfy.sh/coche')).toBeInTheDocument();
    expect(rows()).toHaveLength(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(bodyOf(fetchMock, 'POST', '/notification-channels')).toEqual({
      type: 'ntfy',
      enabled: true,
      config: { serverUrl: 'https://ntfy.sh', topic: 'coche' },
    });
    expect(calls(fetchMock, 'GET', '/notification-channels')).toHaveLength(2);
  });

  it('toggles a channel', async () => {
    let channels = [ntfy];
    const { user, fetchMock } = setup({
      'GET /notification-channels': () => ({ body: channels }),
      'PATCH /notification-channels/c1': () => {
        channels = [{ ...ntfy, enabled: false }];
        return { body: channels[0] };
      },
    });

    const checkbox = await screen.findByRole('checkbox', { name: 'Activo (ntfy ntfy.sh/coche)' });
    await user.click(checkbox);

    expect(bodyOf(fetchMock, 'PATCH', '/notification-channels/c1')).toEqual({ type: 'ntfy', enabled: false });
    await expect.poll(() => calls(fetchMock, 'GET', '/notification-channels')).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: 'Activo (ntfy ntfy.sh/coche)' })).not.toBeChecked();
  });

  it('deletes a channel after confirming', async () => {
    let channels = [ntfy, webhook];
    const { user, fetchMock } = setup({
      'GET /notification-channels': () => ({ body: channels }),
      'DELETE /notification-channels/c1': () => {
        channels = [webhook];
        return { status: 204 };
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Eliminar ntfy ntfy.sh/coche' }));
    const confirm = screen.getByRole('alertdialog');
    expect(confirm).toHaveTextContent('¿Eliminar ntfy ntfy.sh/coche?');
    await user.click(within(confirm).getByRole('button', { name: 'Cancelar' }));
    expect(calls(fetchMock, 'DELETE', '/notification-channels/c1')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Eliminar ntfy ntfy.sh/coche' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText('Canal eliminado')).toBeInTheDocument();
    expect(calls(fetchMock, 'DELETE', '/notification-channels/c1')).toHaveLength(1);
    expect(screen.queryByText('ntfy.sh/coche')).not.toBeInTheDocument();
    expect(rows()).toHaveLength(1);
  });

  it('shows the test result', async () => {
    let result = { ok: true, error: null as string | null };
    const { user, fetchMock } = setup({
      'GET /notification-channels': { body: [ntfy] },
      'POST /notification-channels/c1/test': () => ({ body: result }),
    });

    await user.click(await screen.findByRole('button', { name: 'Probar ntfy ntfy.sh/coche' }));
    expect(await screen.findByText('Notificación de prueba enviada')).toBeInTheDocument();
    expect(calls(fetchMock, 'POST', '/notification-channels/c1/test')).toHaveLength(1);

    result = { ok: false, error: 'HTTP 401' };
    await user.click(screen.getByRole('button', { name: 'Probar ntfy ntfy.sh/coche' }));
    expect(await screen.findByText('La prueba ha fallado: HTTP 401')).toBeInTheDocument();
    expect(calls(fetchMock, 'POST', '/notification-channels/c1/test')).toHaveLength(2);
    // The list is reloaded so the stored last error shows up.
    await expect
      .poll(() => calls(fetchMock, 'GET', '/notification-channels').length)
      .toBeGreaterThanOrEqual(2);
  });
});
