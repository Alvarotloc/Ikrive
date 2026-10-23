import type { NotificationChannel } from '@ikrive/shared';
import { screen, within } from '@testing-library/react';
import { useState } from 'react';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, type Mock } from 'vitest';
import { type MockRoutes, mockApi, renderWithProviders } from '@/test/render';
import { ChannelFormDialog } from './channel-form';

const gotify: NotificationChannel = {
  id: 'c1',
  type: 'gotify',
  enabled: true,
  hasToken: true,
  lastError: null,
  config: { serverUrl: 'https://gotify.example.com' },
  createdAt: '2026-10-23T08:00:00.000Z',
  updatedAt: '2026-10-23T08:00:00.000Z',
};

/** Owns the `open` state like the section does, so closing the dialog is observable. */
function Harness({ channel }: { channel?: NotificationChannel }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Toaster />
      <ChannelFormDialog channel={channel} open={open} onOpenChange={setOpen} />
    </>
  );
}

function setup(routes: MockRoutes, channel?: NotificationChannel) {
  const fetchMock = mockApi(routes);
  return { fetchMock, ...renderWithProviders(<Harness channel={channel} />) };
}

/** Bodies of the requests sent with `method` to `path` (relative to `/api`). */
const requests = (fetchMock: Mock<typeof fetch>, method: string, path: string) =>
  fetchMock.mock.calls
    .filter(([url, init]) => String(url) === `/api${path}` && init?.method === method)
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : undefined));

describe('ChannelFormDialog', () => {
  afterEach(() => {
    toast.dismiss();
  });

  it('creates a gotify channel', async () => {
    const { user, fetchMock } = setup({
      'POST /notification-channels': { status: 201, body: gotify },
    });

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Añadir canal' })).toBeInTheDocument();
    // ntfy by default: server, topic and an optional token.
    expect(within(dialog).getByLabelText('Tema')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Token (opcional)')).toBeInTheDocument();

    await user.selectOptions(within(dialog).getByLabelText('Tipo'), 'gotify');
    expect(within(dialog).queryByLabelText('Tema')).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('URL del servidor'), 'https://gotify.example.com');
    const token = within(dialog).getByLabelText('Token');
    expect(token).toHaveAttribute('type', 'password');
    await user.type(token, 'AbC.123');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Canal añadido')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requests(fetchMock, 'POST', '/notification-channels')).toEqual([
      {
        type: 'gotify',
        enabled: true,
        config: { serverUrl: 'https://gotify.example.com', token: 'AbC.123' },
      },
    ]);
  });

  it('edits a channel without sending the token', async () => {
    const { user, fetchMock } = setup(
      {
        'PATCH /notification-channels/c1': {
          body: { ...gotify, config: { serverUrl: 'https://push.example.com' } },
        },
      },
      gotify,
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Editar canal' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Tipo')).toBeDisabled();
    expect(within(dialog).getByLabelText('Tipo')).toHaveValue('gotify');
    const token = within(dialog).getByLabelText('Token (opcional)');
    expect(token).toHaveValue('');
    expect(token).toHaveAccessibleDescription('Hay un token guardado. Déjalo vacío para conservarlo.');

    const serverUrl = within(dialog).getByLabelText('URL del servidor');
    expect(serverUrl).toHaveValue('https://gotify.example.com');
    await user.clear(serverUrl);
    await user.type(serverUrl, 'https://push.example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Canal actualizado')).toBeInTheDocument();
    expect(requests(fetchMock, 'PATCH', '/notification-channels/c1')).toEqual([
      { type: 'gotify', config: { serverUrl: 'https://push.example.com' } },
    ]);
  });

  it('shows field errors without sending', async () => {
    const { user, fetchMock } = setup({});

    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Tipo'), 'webhook');
    await user.type(within(dialog).getByLabelText('URL'), 'ftp://example.com/hook');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    const url = within(dialog).getByLabelText('URL');
    expect(url).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('El valor no es válido.');
    expect(within(dialog).getByLabelText('Token (opcional)')).toHaveAttribute('aria-invalid', 'false');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a url with credentials without sending', async () => {
    const { user, fetchMock } = setup({});

    const dialog = screen.getByRole('dialog');
    await user.type(
      within(dialog).getByLabelText('URL del servidor'),
      'https://ada:secreto@ntfy.example.com',
    );
    await user.type(within(dialog).getByLabelText('Tema'), 'coche');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(within(dialog).getByLabelText('URL del servidor')).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'No pongas usuario ni contraseña en la URL: usa el campo token.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the API error and stays open', async () => {
    const { user, fetchMock } = setup({
      'POST /notification-channels': {
        status: 400,
        body: { type: 'about:blank', title: 'Validation failed', status: 400 },
      },
    });

    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('URL del servidor'), 'https://ntfy.sh');
    await user.type(within(dialog).getByLabelText('Tema'), 'coche');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Algo ha ido mal');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(requests(fetchMock, 'POST', '/notification-channels')).toHaveLength(1);
  });
});
