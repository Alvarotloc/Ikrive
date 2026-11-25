import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CSV_IMPORT_MAX_BYTES,
  type CsvImportRequestInput,
  type CsvImportSummary,
  DEFAULT_USER_SETTINGS,
  type Problem,
  type UserSettings,
  type Vehicle,
} from '@ikrive/shared';
import { parseCsvImport } from '@ikrive/shared/csv-import';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { setLocalMode } from '@/lib/app-mode';
import { setDataSource } from '@/lib/data-source';
import { createLocalDataSource, openLocalDatabase } from '@/lib/data-source/local';
import { queryKeys } from '@/lib/query-keys';
import { fakeImages } from '@/test/fake-images';
import { createMemoryFileStore } from '@/test/memory-file-store';
import { createMemorySqlite } from '@/test/memory-sqlite';
import { createTestQueryClient, type MockResponse, mockApi, renderWithProviders } from '@/test/render';
import { CsvImportWizard } from './csv-import-wizard';

// Spied (still the real parser) so the size limit can assert it is never reached.
vi.mock('@ikrive/shared/csv-import', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ikrive/shared/csv-import')>();
  return { ...actual, parseCsvImport: vi.fn(actual.parseCsvImport) };
});

const vehicle = (id: string, make: string, model: string): Vehicle => ({
  id,
  name: null,
  make,
  model,
  version: null,
  year: 2021,
  plate: null,
  vin: null,
  type: 'car',
  fuelType: 'gasoline',
  purchaseDate: null,
  purchasePrice: null,
  purchaseOdometer: null,
  notes: null,
  soldAt: null,
  archivedAt: null,
  status: 'active',
  photoUrl: null,
  odometer: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});
const ibiza = vehicle('v1', 'Seat', 'Ibiza');
const corolla = vehicle('v2', 'Toyota', 'Corolla');

const summary = (changes: Partial<CsvImportSummary> = {}): CsvImportSummary => ({
  dryRun: true,
  format: 'lubelogger',
  created: { odometer: 2, fuel: 0, maintenance: 0 },
  duplicates: 0,
  rejected: [],
  errors: [],
  skipped: [],
  droppedFuelFields: { notes: false, station: false },
  encodingReplaced: false,
  ...changes,
});

const problem = (status: number): Problem => ({ type: 'about:blank', title: 'Error', status });

const fixture = (name: string) =>
  new File(
    [
      new Uint8Array(
        // jsdom serves `import.meta.url` over http: resolve the fixture from this file's directory.
        readFileSync(
          join(import.meta.dirname, '../../../../../packages/shared/src/csv-import/fixtures', name),
        ),
      ),
    ],
    name,
    { type: 'text/csv' },
  );
const csvFile = (content: string, name = 'import.csv') => new File([content], name, { type: 'text/csv' });
/** A LubeLogger odometer export whose dates read the same as day/month and month/day. */
const ambiguousDates = () => csvFile('Date,Odometer\n03/04/2025,1000\n05/06/2025,1200\n', 'lubelogger.csv');
const odometerFile = () => csvFile('Date,Odometer\n2025-03-01,1000\n2025-04-01,1200\n', 'lubelogger.csv');
/** No known app writes these headers: a generic CSV, with an empty last header. */
const genericFile = () =>
  csvFile(
    'Fecha,Kilómetros,Litros,Importe,Comentario,\n2026-01-05,1000,40.5,60.75,x,\n2026-02-05,1500,38,57,y,\n',
    'mi-app.csv',
  );

type Respond = MockResponse | ((options: CsvImportRequestInput) => MockResponse | Promise<MockResponse>);

interface Post {
  vehicleId: string;
  options: CsvImportRequestInput;
  file: File;
}

interface SetupOptions {
  vehicles?: Vehicle[];
  settings?: UserSettings;
  /** Answer of the dry run. */
  preview?: Respond;
  /** Answer of the import. */
  commit?: Respond;
}

/**
 * The wizard on `/` of an in-memory router (with the routes its links point to), its settings already
 * cached. Every `POST /vehicles/:id/csv-import` is recorded with its options and file.
 */
async function setup({
  vehicles = [ibiza],
  settings = DEFAULT_USER_SETTINGS,
  preview = { body: summary() },
  commit = { body: summary({ dryRun: false }) },
}: SetupOptions = {}) {
  const posts: Post[] = [];
  const route = (vehicleId: string) => async () => {
    // `mockApi` rebuilds a `Request` whose multipart body jsdom cannot parse: read the `fetch` call.
    const body = fetchMock.mock.calls.at(-1)?.[1]?.body as FormData;
    const options = JSON.parse(String(body.get('options'))) as CsvImportRequestInput;
    posts.push({ vehicleId, options, file: body.get('file') as File });
    const respond = options.dryRun ? preview : commit;
    return typeof respond === 'function' ? respond(options) : respond;
  };
  const fetchMock: Mock<typeof fetch> = mockApi(
    Object.fromEntries(vehicles.map((v) => [`POST /vehicles/${v.id}/csv-import`, route(v.id)])),
  );
  const queryClient = createTestQueryClient();
  // The route loader has the settings cached; they never go stale here, so nothing refetches them.
  queryClient.setQueryDefaults(queryKeys.settings, { staleTime: Infinity });
  queryClient.setQueryData(queryKeys.settings, settings);
  const rootRoute = createRootRoute();
  const leaf = (path: string) => createRoute({ getParentRoute: () => rootRoute, path });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => <CsvImportWizard vehicles={vehicles} settings={settings} />,
      }),
      leaf('/vehicles/new'),
      leaf('/vehicles/$vehicleId'),
      leaf('/settings'),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  const rendered = renderWithProviders(<RouterProvider router={router} />, { queryClient });
  await screen.findByText(
    vehicles.length > 0 ? 'Vehículo y fichero' : 'Para importar un CSV necesitas al menos un vehículo.',
  );
  return { ...rendered, posts, fetchMock };
}

type User = Awaited<ReturnType<typeof setup>>['user'];

const upload = async (user: User, file: File) =>
  user.upload(await screen.findByLabelText('Fichero CSV'), file);
const importButton = () => screen.getByRole('button', { name: /^(Importar|Importando…)$/ });

/** The value shown under each counter label of `container`. */
const counter = (container: HTMLElement, label: string) =>
  within(container).getByText(label).nextElementSibling?.textContent;

async function previewCard() {
  const title = await screen.findByRole('heading', { name: 'Vista previa' });
  await screen.findByText('Válidas');
  return title.closest('.rounded-xl') as HTMLElement;
}

describe('CsvImportWizard', () => {
  beforeEach(() => {
    vi.mocked(parseCsvImport).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('input', () => {
    it('lets the user pick a vehicle and a CSV file', async () => {
      const { user, posts } = await setup({ vehicles: [ibiza, corolla] });

      const select = screen.getByLabelText('Vehículo');
      expect(select).toHaveValue('v1');
      expect(
        within(select)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['Seat Ibiza', 'Toyota Corolla']);
      const input = screen.getByLabelText('Fichero CSV');
      expect(input).toHaveAttribute('type', 'file');
      expect(input).toHaveAttribute('accept', '.csv,text/csv');

      await user.selectOptions(select, 'Toyota Corolla');
      const file = odometerFile();
      await upload(user, file);

      await previewCard();
      expect(posts).toHaveLength(1);
      expect(posts[0]?.vehicleId).toBe('v2');
      expect(posts[0]?.file).toBe(file);
    });

    it('asks to add a vehicle when there are none', async () => {
      await setup({ vehicles: [] });

      expect(
        await screen.findByText('Para importar un CSV necesitas al menos un vehículo.'),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Añadir vehículo' })).toHaveAttribute('href', '/vehicles/new');
      expect(screen.queryByLabelText('Fichero CSV')).not.toBeInTheDocument();
    });

    it('rejects a file over the size limit without reading it', async () => {
      const arrayBuffer = vi.spyOn(Blob.prototype, 'arrayBuffer');
      const text = vi.spyOn(Blob.prototype, 'text');
      const { user, fetchMock } = await setup();
      const big = new File([new Uint8Array(CSV_IMPORT_MAX_BYTES + 1)], 'big.csv', { type: 'text/csv' });

      await upload(user, big);

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'El fichero supera el tamaño máximo de 5 MB',
      );
      expect(arrayBuffer).not.toHaveBeenCalled();
      expect(text).not.toHaveBeenCalled();
      expect(parseCsvImport).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.queryByRole('heading', { name: 'Formato' })).not.toBeInTheDocument();
    });
  });

  describe('detection', () => {
    it('shows the detected format and its preview', async () => {
      const { user, posts } = await setup({
        preview: {
          body: summary({
            format: 'fuelio',
            created: { odometer: 0, fuel: 4, maintenance: 0 },
            duplicates: 1,
            errors: [{ row: 9, code: 'invalid_number', field: 'quantity' }],
            rejected: [{ row: 12, kind: 'fuel', reason: 'future_date', conflict: null }],
            skipped: [{ row: 17, reason: 'not_maintenance', label: 'Seguro' }],
          }),
        },
      });

      await upload(user, fixture('fuelio.csv'));

      expect(await screen.findByText('Formato detectado: Fuelio')).toBeInTheDocument();
      const card = await previewCard();
      expect(counter(card, 'Válidas')).toBe('4');
      expect(counter(card, 'Duplicadas')).toBe('1');
      expect(counter(card, 'Con error')).toBe('2');
      expect(counter(card, 'Omitidas')).toBe('1');
      expect(posts.map((post) => post.options)).toEqual([{ dryRun: true }]);
      expect(importButton()).toBeEnabled();
    });

    it('asks only for the missing options of a detected file', async () => {
      const { user, posts } = await setup();

      await upload(user, ambiguousDates());

      expect(await screen.findByText('Formato detectado: LubeLogger')).toBeInTheDocument();
      const dateFormat = screen.getByLabelText('Formato de fecha');
      expect(dateFormat).toHaveValue('');
      expect(screen.queryByLabelText('Separador decimal')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Tipo de registro')).not.toBeInTheDocument();
      expect(importButton()).toBeDisabled();
      expect(posts).toHaveLength(0);

      await user.selectOptions(dateFormat, 'Día/mes/año (31/01/2026)');

      await previewCard();
      expect(posts.map((post) => post.options)).toEqual([{ dryRun: true, dateFormat: 'dmy' }]);
      // The chosen option stays on screen, to change it.
      expect(screen.getByLabelText('Formato de fecha')).toHaveValue('dmy');
      expect(vi.mocked(parseCsvImport).mock.calls.at(-1)?.[1]).toMatchObject({ dateFormat: 'dmy' });
    });

    it('explains a unit mismatch without asking for a preview', async () => {
      const { user, posts } = await setup({ settings: { ...DEFAULT_USER_SETTINGS, distanceUnit: 'mi' } });

      await upload(user, fixture('fuelio.csv'));

      expect(await screen.findByText('Formato detectado: Fuelio')).toBeInTheDocument();
      expect(
        screen.getByText(
          /Las unidades del fichero \(Kilómetros\) no coinciden con las de este vehículo \(Millas, L\)/,
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Ir a Ajustes' })).toHaveAttribute('href', '/settings');
      expect(importButton()).toBeDisabled();
      expect(screen.queryByText('Calculando la vista previa…')).not.toBeInTheDocument();
      expect(posts).toHaveLength(0);
    });
  });

  describe('mapping', () => {
    it('maps the columns of a generic CSV', async () => {
      const { user } = await setup();

      await upload(user, genericFile());

      expect(await screen.findByText(/se importará como CSV genérico/)).toBeInTheDocument();
      const kind = screen.getByLabelText('Tipo de registro');
      expect(kind).toHaveValue('');
      expect(screen.getByLabelText('Formato de fecha')).toHaveValue('');
      expect(screen.getByLabelText('Separador decimal')).toHaveValue('');
      expect(screen.queryByLabelText('Fecha *')).not.toBeInTheDocument();

      await user.selectOptions(kind, 'Repostajes');

      const labels = [
        'Fecha *',
        'Kilometraje *',
        'Cantidad *',
        'Precio total *',
        'Precio por unidad *',
        'Depósito lleno',
        'Repostaje anterior saltado',
      ];
      for (const label of labels) expect(screen.getByLabelText(label)).toHaveValue('');
      expect(
        within(screen.getByLabelText('Fecha *'))
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['No importar', 'Fecha', 'Kilómetros', 'Litros', 'Importe', 'Comentario', 'Columna 6']);
      expect(screen.queryByLabelText('Título *')).not.toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText('Fecha *'), 'Fecha');
      await user.selectOptions(kind, 'Mantenimientos');

      // Another kind, other fields, and the columns start over.
      expect(screen.getByLabelText('Título *')).toHaveValue('');
      expect(screen.getByLabelText('Fecha *')).toHaveValue('');
      expect(screen.getByLabelText('Taller')).toBeInTheDocument();
      expect(screen.queryByLabelText('Cantidad *')).not.toBeInTheDocument();
    });

    it('keeps import disabled until the required columns are mapped', async () => {
      const { user, posts } = await setup({
        preview: { body: summary({ format: 'generic', created: { odometer: 0, fuel: 2, maintenance: 0 } }) },
      });
      await upload(user, genericFile());
      await screen.findByText(/se importará como CSV genérico/);

      const steps: [string, string][] = [
        ['Tipo de registro', 'Repostajes'],
        ['Fecha *', 'Fecha'],
        ['Kilometraje *', 'Kilómetros'],
        ['Cantidad *', 'Litros'],
        ['Precio total *', 'Importe'],
        ['Formato de fecha', 'Año-mes-día (2026-01-31)'],
      ];
      for (const [label, option] of steps) {
        expect(importButton()).toBeDisabled();
        await user.selectOptions(screen.getByLabelText(label), option);
      }
      expect(importButton()).toBeDisabled();
      expect(posts).toHaveLength(0);

      await user.selectOptions(screen.getByLabelText('Separador decimal'), 'Punto (1234.56)');

      await previewCard();
      await waitFor(() => expect(importButton()).toBeEnabled());
      expect(posts.map((post) => post.options)).toEqual([
        {
          dryRun: true,
          mapping: {
            kind: 'fuel',
            columns: { date: 0, odometer: 1, quantity: 2, totalPrice: 3 },
            dateFormat: 'ymd',
            decimalSeparator: '.',
          },
        },
      ]);
    });
  });

  describe('preview', () => {
    it('warns that fuel notes and station are not imported', async () => {
      const cases: [CsvImportSummary['droppedFuelFields'], string | null][] = [
        [
          { notes: true, station: false },
          'Las notas de los repostajes no se importan: Ikrive no las guarda.',
        ],
        [
          { notes: false, station: true },
          'La gasolinera de los repostajes no se importa: Ikrive no la guarda.',
        ],
        [
          { notes: true, station: true },
          'Las notas y la gasolinera de los repostajes no se importan: Ikrive no las guarda.',
        ],
        [{ notes: false, station: false }, null],
      ];
      for (const [droppedFuelFields, warning] of cases) {
        const { user, unmount } = await setup({ preview: { body: summary({ droppedFuelFields }) } });
        await upload(user, odometerFile());
        await previewCard();

        for (const text of [
          'Las notas de los repostajes no se importan: Ikrive no las guarda.',
          'La gasolinera de los repostajes no se importa: Ikrive no la guarda.',
          'Las notas y la gasolinera de los repostajes no se importan: Ikrive no las guarda.',
        ]) {
          if (text === warning) expect(screen.getByText(text)).toBeInTheDocument();
          else expect(screen.queryByText(text)).not.toBeInTheDocument();
        }
        unmount();
      }
    });

    it('warns about a file that may not be UTF-8', async () => {
      const { user } = await setup({ preview: { body: summary({ encodingReplaced: true }) } });

      await upload(user, odometerFile());
      await previewCard();

      expect(screen.getByText(/Puede que el fichero no esté en UTF-8/)).toBeInTheDocument();
    });

    it('lists the rows with errors, rejections and skips', async () => {
      const { user, unmount } = await setup({
        preview: {
          body: summary({
            errors: [{ row: 2, code: 'invalid_number', field: 'quantity' }],
            rejected: [
              {
                row: 3,
                kind: 'odometer',
                reason: 'odometer_conflict',
                conflict: { date: '2025-02-01', value: 31000 },
              },
              { row: 5, kind: 'fuel', reason: 'future_date', conflict: null },
            ],
            skipped: [{ row: 4, reason: 'template', label: 'ITV' }],
          }),
        },
      });
      await upload(user, odometerFile());
      await previewCard();

      await user.click(screen.getByText('Ver filas (4)'));

      const items = screen.getAllByRole('listitem').map((item) => item.textContent);
      expect(items).toHaveLength(4);
      expect(items[0]).toBe('Fila 2: número no válido (Cantidad)');
      expect(items[1]).toMatch(
        /^Fila 3: el kilometraje no encaja con la lectura del 1 feb 2025 \(31\.000 km\)$/,
      );
      expect(items[2]).toBe('Fila 4: es una plantilla (ITV)');
      expect(items[3]).toBe('Fila 5: la fecha es futura');
      unmount();

      const many = await setup({
        preview: {
          body: summary({
            errors: Array.from({ length: 55 }, (_, i) => ({
              row: i + 2,
              code: 'malformed_row' as const,
              field: null,
            })),
          }),
        },
      });
      await upload(many.user, odometerFile());
      await previewCard();
      await many.user.click(screen.getByText('Ver filas (55)'));

      const listed = screen.getAllByRole('listitem');
      expect(listed).toHaveLength(51);
      expect(listed[0]).toHaveTextContent('Fila 2: fila mal formada');
      expect(listed[49]).toHaveTextContent('Fila 51: fila mal formada');
      expect(listed[50]).toHaveTextContent('y 5 más');
    });

    it('keeps import disabled while the preview loads or fails', async () => {
      let release: (response: MockResponse) => void = () => {};
      const { user } = await setup({
        preview: () =>
          new Promise<MockResponse>((resolve) => {
            release = resolve;
          }),
      });

      await upload(user, odometerFile());

      expect(await screen.findByText('Calculando la vista previa…')).toBeInTheDocument();
      expect(importButton()).toBeDisabled();

      release({ status: 400, body: problem(400) });

      expect(await screen.findByRole('alert')).toHaveTextContent(/No se puede importar este CSV/);
      expect(importButton()).toBeDisabled();
      expect(screen.queryByText('Válidas')).not.toBeInTheDocument();
    });

    it('disables import when the preview has no valid rows', async () => {
      const { user, posts } = await setup({
        preview: { body: summary({ created: { odometer: 0, fuel: 0, maintenance: 0 }, duplicates: 2 }) },
      });

      await upload(user, odometerFile());
      const card = await previewCard();

      expect(counter(card, 'Válidas')).toBe('0');
      expect(screen.getByText('No hay nada que importar: ninguna fila es válida.')).toBeInTheDocument();
      expect(importButton()).toBeDisabled();
      await user.click(importButton());
      expect(posts.every((post) => post.options.dryRun === true)).toBe(true);
    });
  });

  describe('import', () => {
    it('imports the file and shows the summary', async () => {
      const { user, posts, queryClient } = await setup({
        preview: { body: summary() },
        commit: {
          body: summary({
            dryRun: false,
            created: { odometer: 2, fuel: 5, maintenance: 1 },
            duplicates: 2,
            skipped: [{ row: 9, reason: 'income', label: null }],
            errors: [{ row: 4, code: 'invalid_date', field: 'date' }],
            rejected: [{ row: 7, kind: 'fuel', reason: 'future_date', conflict: null }],
          }),
        },
      });
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      const file = ambiguousDates();
      await upload(user, file);
      await user.selectOptions(await screen.findByLabelText('Formato de fecha'), 'Día/mes/año (31/01/2026)');
      await previewCard();
      await waitFor(() => expect(importButton()).toBeEnabled());

      await user.click(importButton());

      const title = await screen.findByRole('heading', { name: 'Importación terminada' });
      const card = title.closest('.rounded-xl') as HTMLElement;
      expect(counter(card, 'Lecturas de kilometraje')).toBe('2');
      expect(counter(card, 'Repostajes')).toBe('5');
      expect(counter(card, 'Mantenimientos')).toBe('1');
      expect(counter(card, 'Omitidos')).toBe('3');
      expect(counter(card, 'Errores')).toBe('2');
      expect(within(card).getByText('Ver filas (3)')).toBeInTheDocument();
      expect(within(card).getByRole('link', { name: 'Ver el vehículo' })).toHaveAttribute(
        'href',
        '/vehicles/v1',
      );
      // The summary replaces the format and preview steps.
      expect(screen.queryByRole('heading', { name: 'Vista previa' })).not.toBeInTheDocument();

      expect(posts).toHaveLength(2);
      expect(posts[0]?.options).toEqual({ dryRun: true, dateFormat: 'dmy' });
      expect(posts[1]?.options).toEqual({ dateFormat: 'dmy' });
      expect(posts[1]?.vehicleId).toBe('v1');
      expect(posts[1]?.file).toBe(file);
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.vehicles.all });

      await user.click(within(card).getByRole('button', { name: 'Importar otro fichero' }));

      expect(screen.queryByRole('heading', { name: 'Importación terminada' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Formato' })).not.toBeInTheDocument();
      expect(screen.getByLabelText('Fichero CSV')).toHaveValue('');
    });

    it('disables the controls while importing', async () => {
      let release: (response: MockResponse) => void = () => {};
      const { user } = await setup({
        vehicles: [ibiza, corolla],
        commit: () =>
          new Promise<MockResponse>((resolve) => {
            release = resolve;
          }),
      });
      await upload(user, ambiguousDates());
      await user.selectOptions(await screen.findByLabelText('Formato de fecha'), 'Día/mes/año (31/01/2026)');
      await previewCard();
      await waitFor(() => expect(importButton()).toBeEnabled());

      await user.click(importButton());

      const busy = await screen.findByRole('button', { name: 'Importando…' });
      expect(busy).toBeDisabled();
      expect(screen.getByLabelText('Vehículo')).toBeDisabled();
      expect(screen.getByLabelText('Fichero CSV')).toBeDisabled();
      expect(screen.getByLabelText('Formato de fecha')).toBeDisabled();

      release({ body: summary({ dryRun: false }) });

      expect(await screen.findByRole('heading', { name: 'Importación terminada' })).toBeInTheDocument();
      expect(screen.getByLabelText('Vehículo')).toBeEnabled();
    });

    it('shows why an import failed', async () => {
      const cases: [number, string][] = [
        [413, 'El fichero supera el tamaño máximo permitido.'],
        [404, 'No se ha encontrado el vehículo.'],
      ];
      for (const [status, message] of cases) {
        const { user, unmount } = await setup({ commit: { status, body: problem(status) } });
        await upload(user, odometerFile());
        await previewCard();
        await waitFor(() => expect(importButton()).toBeEnabled());

        await user.click(importButton());

        expect(await screen.findByRole('alert')).toHaveTextContent(message);
        expect(screen.queryByRole('heading', { name: 'Importación terminada' })).not.toBeInTheDocument();
        unmount();
      }
    });
  });

  it('local mode: previews and imports into the device database', async () => {
    vi.stubEnv('MODE', 'native');
    setLocalMode(true);
    const local = createLocalDataSource(await openLocalDatabase(createMemorySqlite()), {
      files: createMemoryFileStore(),
      images: fakeImages(),
    });
    setDataSource(local);
    const car = await local.vehicles.create({ make: 'Seat', model: 'Ibiza' });
    const settings = await local.settings.get();
    const fetchMock = mockApi({});
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.settings, settings);
    const rootRoute = createRootRoute();
    const router = createRouter({
      routeTree: rootRoute.addChildren([
        createRoute({
          getParentRoute: () => rootRoute,
          path: '/',
          component: () => <CsvImportWizard vehicles={[car]} settings={settings} />,
        }),
        createRoute({ getParentRoute: () => rootRoute, path: '/vehicles/$vehicleId' }),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });
    const { user } = renderWithProviders(<RouterProvider router={router} />, { queryClient });

    await upload(user, fixture('lubelogger-fuel.csv'));

    expect(await screen.findByText('Formato detectado: LubeLogger')).toBeInTheDocument();
    const card = await previewCard();
    expect(counter(card, 'Válidas')).toBe('2');
    expect(counter(card, 'Duplicadas')).toBe('0');
    expect(counter(card, 'Con error')).toBe('0');
    expect(
      screen.getByText('Las notas de los repostajes no se importan: Ikrive no las guarda.'),
    ).toBeInTheDocument();
    expect(await local.fuelLogs.list(car.id)).toHaveLength(0);

    await waitFor(() => expect(importButton()).toBeEnabled());
    await user.click(importButton());

    const title = await screen.findByRole('heading', { name: 'Importación terminada' });
    expect(counter(title.closest('.rounded-xl') as HTMLElement, 'Repostajes')).toBe('2');
    expect(await local.fuelLogs.list(car.id)).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
