import { type DataImportSummary, DEFAULT_USER_SETTINGS, type Problem } from '@ikrive/shared';
import { screen, within } from '@testing-library/react';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, type Mock } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { createTestQueryClient, type MockRoutes, mockApi, renderWithProviders } from '@/test/render';
import { DataPortabilitySection } from './data-section';

const IMPORT = '/me/import';

const summary: DataImportSummary = {
  vehicles: 2,
  odometerReadings: 31,
  maintenanceSchedules: 4,
  maintenanceRecords: 12,
  fuelLogs: 57,
  attachments: 9,
  photos: 1,
  notificationChannels: 3,
  skipped: { notificationChannels: 0 },
};

const zip = () =>
  new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'ikrive-export-2026-11-01.zip', {
    type: 'application/zip',
  });

function setup(routes: MockRoutes = {}) {
  const fetchMock = mockApi({ 'GET /settings': { body: DEFAULT_USER_SETTINGS }, ...routes });
  const queryClient = createTestQueryClient();
  // Seeded queries under both trees: an import must mark them stale.
  queryClient.setQueryData(queryKeys.vehicles.list('active'), []);
  queryClient.setQueryData(queryKeys.notificationChannels.all, []);
  const rendered = renderWithProviders(
    <>
      <Toaster />
      <DataPortabilitySection />
    </>,
    { queryClient },
  );
  return { fetchMock, ...rendered };
}

const importCalls = (fetchMock: Mock<typeof fetch>) =>
  fetchMock.mock.calls.filter(([url, init]) => String(url) === `/api${IMPORT}` && init?.method === 'POST');

const invalidated = (queryClient: ReturnType<typeof createTestQueryClient>) => ({
  vehicles: queryClient.getQueryState(queryKeys.vehicles.list('active'))?.isInvalidated,
  channels: queryClient.getQueryState(queryKeys.notificationChannels.all)?.isInvalidated,
});

/** Chooses the zip and confirms the import dialog. */
async function chooseAndConfirm(user: ReturnType<typeof setup>['user']) {
  await user.upload(screen.getByLabelText('Fichero de export de Ikrive (.zip)'), zip());
  const dialog = await screen.findByRole('alertdialog');
  await user.click(within(dialog).getByRole('button', { name: 'Importar' }));
}

describe('DataPortabilitySection', () => {
  afterEach(() => {
    toast.dismiss();
  });

  it('links to the export download', () => {
    setup();

    expect(screen.getByRole('heading', { name: 'Tus datos' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Descargar mis datos' });
    expect(link).toHaveAttribute('href', '/api/me/export');
    expect(link).toHaveAttribute('download');
  });

  it('accepts a single zip file', () => {
    setup();

    const input = screen.getByLabelText('Fichero de export de Ikrive (.zip)');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', '.zip,application/zip');
    expect(input).not.toHaveAttribute('multiple');
    expect(screen.getByRole('button', { name: 'Importar datos' })).toBeEnabled();
  });

  it('asks for confirmation and sends nothing when cancelled', async () => {
    const { fetchMock, user } = setup({ [`POST ${IMPORT}`]: { status: 201, body: summary } });

    await user.upload(screen.getByLabelText('Fichero de export de Ikrive (.zip)'), zip());

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('ikrive-export-2026-11-01.zip');
    expect(dialog).toHaveTextContent('se añadirán a tu cuenta: no se borra ni se modifica nada');
    expect(dialog).toHaveTextContent(
      'La moneda y las unidades del export deben coincidir con las de tus ajustes',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(importCalls(fetchMock)).toHaveLength(0);
  });

  it('imports the zip and shows the summary', async () => {
    let release: () => void = () => {};
    const { fetchMock, user } = setup({
      [`POST ${IMPORT}`]: async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { status: 201, body: summary };
      },
    });

    await chooseAndConfirm(user);

    const busy = await screen.findByRole('button', { name: 'Importando…' });
    expect(busy).toBeDisabled();
    const calls = importCalls(fetchMock);
    expect(calls).toHaveLength(1);
    // FormData lets `fetch` set the multipart content type with its boundary.
    const body = calls[0]?.[1]?.body;
    expect(body).toBeInstanceOf(FormData);
    expect(calls[0]?.[1]?.headers).toBeUndefined();
    expect((body as FormData).get('file')).toHaveProperty('name', 'ikrive-export-2026-11-01.zip');

    release();

    expect(await screen.findByText('Datos importados')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar datos' })).toBeEnabled();
    const list = screen.getByRole('heading', { name: 'Último import' }).parentElement as HTMLElement;
    const counters: Array<[string, string]> = [
      ['Vehículos', '2'],
      ['Lecturas de odómetro', '31'],
      ['Programaciones', '4'],
      ['Mantenimientos', '12'],
      ['Repostajes', '57'],
      ['Adjuntos', '9'],
      ['Fotos', '1'],
      ['Canales de notificación', '3'],
    ];
    for (const [label, value] of counters) {
      expect(within(list).getByText(label).nextElementSibling).toHaveTextContent(value);
    }
    expect(within(list).queryByRole('status')).not.toBeInTheDocument();
  });

  it('warns about skipped notification channels', async () => {
    const { user } = setup({
      [`POST ${IMPORT}`]: { status: 201, body: { ...summary, skipped: { notificationChannels: 2 } } },
    });

    await chooseAndConfirm(user);

    const notice = await screen.findByText(/canales de notificación no se han importado/);
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveTextContent(
      '2 canales de notificación no se han importado porque necesitan un token',
    );
    expect(notice).toHaveTextContent('vuelve a crearlos');
  });

  it('invalidates the vehicle and channel queries after importing', async () => {
    const { user, queryClient } = setup({ [`POST ${IMPORT}`]: { status: 201, body: summary } });
    expect(invalidated(queryClient)).toEqual({ vehicles: false, channels: false });

    await chooseAndConfirm(user);

    expect(await screen.findByText('Datos importados')).toBeInTheDocument();
    expect(invalidated(queryClient)).toEqual({ vehicles: true, channels: true });
  });

  it('shows a rejected import in a toast', async () => {
    const problem: Problem = {
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail: 'The export currency (USD) does not match your settings (EUR)',
    };
    const { fetchMock, user, queryClient } = setup({ [`POST ${IMPORT}`]: { status: 409, body: problem } });

    await chooseAndConfirm(user);

    expect(
      await screen.findByText('La moneda o las unidades del export no coinciden con tus ajustes'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('The export currency (USD) does not match your settings (EUR)'),
    ).toBeInTheDocument();
    expect(importCalls(fetchMock)).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Último import' })).not.toBeInTheDocument();
    expect(screen.queryByText('Datos importados')).not.toBeInTheDocument();
    expect(invalidated(queryClient)).toEqual({ vehicles: false, channels: false });
  });
});
