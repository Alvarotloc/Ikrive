import {
  type DataImportSummary,
  DEFAULT_USER_SETTINGS,
  DUPLICATE_IMPORT_PROBLEM_TYPE,
  type Problem,
} from '@ikrive/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import {
  createTestQueryClient,
  type MockRoutes,
  mockApi,
  mockObjectUrls,
  renderWithProviders,
  setServerMode,
} from '@/test/render';
import { DataPortabilitySection } from './data-section';

/** The native side of the file seam: only `download.ts` loads it, and only in the native app. */
const nativeFiles = vi.hoisted(() => ({ saveFile: vi.fn(), openFile: vi.fn() }));
vi.mock('@/lib/native-files', () => nativeFiles);

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
  matchingVehicles: [],
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

  it('shows a repeated import in a toast', async () => {
    const problem: Problem = {
      type: DUPLICATE_IMPORT_PROBLEM_TYPE,
      title: 'Conflict',
      status: 409,
      detail: 'This export was already imported into your account on 2026-11-01T10:00:00.000Z',
    };
    const { user, queryClient } = setup({ [`POST ${IMPORT}`]: { status: 409, body: problem } });

    await chooseAndConfirm(user);

    expect(await screen.findByText('Este export ya se importó en tu cuenta')).toBeInTheDocument();
    expect(
      screen.getByText('This export was already imported into your account on 2026-11-01T10:00:00.000Z'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('La moneda o las unidades del export no coinciden con tus ajustes'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Último import' })).not.toBeInTheDocument();
    expect(invalidated(queryClient)).toEqual({ vehicles: false, channels: false });
  });

  it('warns about vehicles matching existing ones', async () => {
    const ref = (id: string, name: string | null, make: string, model: string) => ({ id, name, make, model });
    const { user } = setup({
      [`POST ${IMPORT}`]: {
        status: 201,
        body: {
          ...summary,
          matchingVehicles: [
            {
              imported: ref('i1', null, 'Seat', 'Ibiza'),
              existing: ref('e1', 'El rojo', 'Seat', 'Ibiza'),
              matchedBy: ['plate'],
            },
            {
              imported: ref('i2', 'Furgo', 'Renault', 'Kangoo'),
              existing: ref('e2', null, 'Renault', 'Trafic'),
              matchedBy: ['vin'],
            },
            {
              imported: ref('i3', null, 'Ford', 'Focus'),
              existing: ref('e3', null, 'Ford', 'Fiesta'),
              matchedBy: ['plate', 'vin'],
            },
          ],
        } satisfies DataImportSummary,
      },
    });

    await chooseAndConfirm(user);

    const title = await screen.findByText('Revisa estos vehículos: puede que ya los tuvieras');
    const notice = title.closest('[role="status"]') as HTMLElement;
    expect(notice).toBeInTheDocument();
    expect(
      within(notice)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Seat Ibiza coincide con El rojo por matrícula',
      'Furgo coincide con Renault Trafic por VIN',
      'Ford Focus coincide con Ford Fiesta por matrícula y VIN',
    ]);
  });

  it('shows no matching vehicles notice without matches', async () => {
    const { user } = setup({ [`POST ${IMPORT}`]: { status: 201, body: summary } });

    await chooseAndConfirm(user);

    expect(await screen.findByText('Datos importados')).toBeInTheDocument();
    expect(screen.queryByText('Revisa estos vehículos: puede que ya los tuvieras')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('server mode: downloads the export with the token', async () => {
    setServerMode('https://ikrive.example.com', 'secret-token');
    mockObjectUrls();
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });
    const { user, fetchMock } = setup({
      'GET /me/export': {
        body: new Blob([new Uint8Array([0x50, 0x4b])], { type: 'application/zip' }),
        headers: { 'content-disposition': 'attachment; filename="ikrive-export-2026-11-09.zip"' },
      },
    });

    await user.click(screen.getByRole('button', { name: 'Descargar mis datos' }));

    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(clicked[0]).toHaveAttribute('download', 'ikrive-export-2026-11-09.zip');
    expect(clicked[0]).toHaveAttribute('href', 'blob:1');
    const request = fetchMock.mock.calls
      .map(([input, init]) => new Request(String(input), init))
      .find((r) => r.url.endsWith('/me/export'));
    expect(request?.url).toBe('https://ikrive.example.com/api/me/export');
    expect(request?.headers.get('authorization')).toBe('Bearer secret-token');
    expect(screen.queryByRole('link', { name: 'Descargar mis datos' })).not.toBeInTheDocument();
  });

  it('server mode: shows an error toast when the export fails', async () => {
    setServerMode('https://ikrive.example.com', 'secret-token');
    const { user } = setup({
      'GET /me/export': { status: 500, body: { type: 'about:blank', title: 'Error', status: 500 } },
    });

    await user.click(screen.getByRole('button', { name: 'Descargar mis datos' }));

    expect(await screen.findByText('No se ha podido abrir el archivo')).toBeInTheDocument();
  });

  it('shows the export in progress', async () => {
    setServerMode('https://ikrive.example.com', 'secret-token');
    mockObjectUrls();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    let respond: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      respond = resolve;
    });
    const { user } = setup({
      'GET /me/export': async () => {
        await held;
        return {
          body: new Blob([new Uint8Array([0x50, 0x4b])], { type: 'application/zip' }),
          headers: { 'content-disposition': 'attachment; filename="ikrive-export-2026-11-09.zip"' },
        };
      },
    });

    await user.click(screen.getByRole('button', { name: 'Descargar mis datos' }));

    const pending = await screen.findByRole('button', { name: 'Preparando…' });
    expect(pending).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Descargar mis datos' })).not.toBeInTheDocument();

    respond();

    expect(await screen.findByRole('button', { name: 'Descargar mis datos' })).toBeEnabled();
  });

  describe('in the native app', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      nativeFiles.saveFile.mockReset();
    });

    const exportRoute: MockRoutes = {
      'GET /me/export': {
        body: new Blob([new Uint8Array([0x50, 0x4b])], { type: 'application/zip' }),
        headers: { 'content-disposition': 'attachment; filename="ikrive-export-2026-11-09.zip"' },
      },
    };

    it('native: saves the export zip with its name', async () => {
      vi.stubEnv('MODE', 'native');
      setServerMode('https://ikrive.example.com', 'secret-token');
      nativeFiles.saveFile.mockResolvedValue(undefined);
      const clicked: HTMLAnchorElement[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this);
      });
      const { user } = setup(exportRoute);

      await user.click(screen.getByRole('button', { name: 'Descargar mis datos' }));

      await waitFor(() => expect(nativeFiles.saveFile).toHaveBeenCalledTimes(1));
      const [name, blob] = nativeFiles.saveFile.mock.calls[0] ?? [];
      expect(name).toBe('ikrive-export-2026-11-09.zip');
      expect(blob.type).toBe('application/zip');
      expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([0x50, 0x4b]));
      expect(clicked).toHaveLength(0);
      expect(screen.queryByText('No se ha podido abrir el archivo')).not.toBeInTheDocument();
    });

    it('native: shows an error toast when saving the export fails', async () => {
      vi.stubEnv('MODE', 'native');
      setServerMode('https://ikrive.example.com', 'secret-token');
      nativeFiles.saveFile.mockRejectedValue(new Error('No space left'));
      const { user } = setup(exportRoute);

      await user.click(screen.getByRole('button', { name: 'Descargar mis datos' }));

      expect(await screen.findByText('No se ha podido abrir el archivo')).toBeInTheDocument();
      expect(nativeFiles.saveFile).toHaveBeenCalledTimes(1);
    });
  });
});
