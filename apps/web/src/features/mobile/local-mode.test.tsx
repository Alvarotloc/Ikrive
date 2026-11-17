import { DEFAULT_USER_SETTINGS, dataExportSchema, todayIn } from '@ikrive/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import type { AsyncRemoteCallback } from 'drizzle-orm/sqlite-proxy';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MODE_KEY, setLocalMode } from '@/lib/app-mode';
import { dataSource, setDataSource } from '@/lib/data-source';
import { httpDataSource } from '@/lib/data-source/http';
import type { MemoryFileStore } from '@/test/memory-file-store';
import { createMemorySqlite } from '@/test/memory-sqlite';
import { mockApi, mockMediaQuery, mockObjectUrls } from '@/test/render';
import { renderApp } from '@/test/render-app';
import { activateLocalDataSource, forgetLocalDataSource } from './local-mode';

/**
 * The device database: an in-memory SQLite per test. `gate`, when set, holds the opening until it settles
 * (an activation still in flight).
 */
const device = vi.hoisted(() => ({
  callback: null as AsyncRemoteCallback | null,
  gate: null as Promise<void> | null,
}));
vi.mock('@/lib/native-sqlite', () => ({
  openDeviceDatabase: async () => {
    if (device.gate) await device.gate;
    if (!device.callback) throw new Error('No device database');
    return device.callback;
  },
}));

/** The device file store: in memory, a new one each time the local `DataSource` is opened. */
const storage = vi.hoisted(() => ({ store: null as MemoryFileStore | null }));
vi.mock('@/lib/native-storage', async () => {
  const { createMemoryFileStore } = await import('@/test/memory-file-store');
  return {
    createDeviceFileStore: () => {
      storage.store = createMemoryFileStore();
      return storage.store;
    },
  };
});
/** The canvas of the WebView, which jsdom does not have. */
vi.mock('@/lib/data-source/local/canvas-images', async () => {
  const { fakeImages } = await import('@/test/fake-images');
  return { createCanvasImages: () => fakeImages() };
});

/** The phone notifications: `onNotificationTap` keeps the listener so the test can tap one. */
const native = vi.hoisted(() => {
  const tap = { listener: null as ((extra: unknown) => void) | null };
  return {
    tap,
    getNotificationPermission: vi.fn(),
    requestNotificationPermission: vi.fn(),
    showNotifications: vi.fn(),
    onNotificationTap: vi.fn(async (listener: (extra: unknown) => void) => {
      tap.listener = listener;
      return async () => {
        tap.listener = null;
      };
    }),
  };
});
vi.mock('@/lib/native-notifications', () => ({
  getNotificationPermission: native.getNotificationPermission,
  requestNotificationPermission: native.requestNotificationPermission,
  showNotifications: native.showNotifications,
  onNotificationTap: native.onNotificationTap,
}));

/** The app's lifecycle: `onAppResume` keeps the listener so the test can bring the app back. */
const appState = vi.hoisted(() => ({ resume: null as (() => void) | null }));
vi.mock('@/lib/native-app-state', () => ({
  onAppResume: async (listener: () => void) => {
    appState.resume = listener;
    return async () => {
      appState.resume = null;
    };
  },
}));

/**
 * The sale report PDF chunk: the Node kit (fonts as data URLs instead of asset URLs). `gate`, when set,
 * holds the generation until it settles; `fail` makes it reject.
 *
 * Under jsdom, react-pdf's layout engine (yoga) loads its WebAssembly with `fetch('data:…')`, as in the
 * WebView. `mockApi` would reject it as an unmocked request, so data URLs are answered here while rendering.
 */
const reportPdf = vi.hoisted(() => ({ gate: null as Promise<void> | null, fail: false }));
vi.mock('@/lib/data-source/local/sale-report-pdf', async () => {
  const { nodeSaleReportPdf } = await import('@/test/node-sale-report-pdf');
  const dataUrlResponse = (url: string) => {
    const [header = '', base64 = ''] = url.split(',');
    const type = header.slice('data:'.length).split(';')[0] ?? '';
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    return new Response(bytes, { headers: { 'content-type': type } });
  };
  return {
    fonts: nodeSaleReportPdf.fonts,
    generateSaleReportPdf: async (...args: Parameters<typeof nodeSaleReportPdf.generateSaleReportPdf>) => {
      if (reportPdf.gate) await reportPdf.gate;
      if (reportPdf.fail) throw new Error('Render failed');
      const apiFetch = globalThis.fetch;
      vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        return url.startsWith('data:') ? Promise.resolve(dataUrlResponse(url)) : apiFetch(input, init);
      });
      try {
        return await nodeSaleReportPdf.generateSaleReportPdf(...args);
      } finally {
        vi.stubGlobal('fetch', apiFetch);
      }
    },
  };
});

/** The share sheet of `downloadBlob` in the native app. */
const nativeFiles = vi.hoisted(() => ({ saveFile: vi.fn(), openFile: vi.fn() }));
vi.mock('@/lib/native-files', () => nativeFiles);

// The local mode loads its `DataSource` with `import()` (drizzle, the schema, the bundled migrations and the
// domains). Transformed by Vite on first use, that can take more than the 1 s of a `findBy*` on a loaded
// machine, so it is loaded here, before any test renders, as `renderApp` does with the route chunks.
beforeAll(async () => {
  await Promise.all([
    import('@/lib/data-source/local'),
    import('@/lib/native-sqlite'),
    import('@/lib/native-storage'),
    import('@/lib/data-source/local/canvas-images'),
  ]);
  // After the others, not alongside them: imported concurrently with the local `DataSource`, its mock
  // would not be the module that `localSaleReport` loads with `import()`.
  await import('@/lib/data-source/local/sale-report-pdf');
});

/** The local `DataSource`, to add data before rendering. */
async function localData() {
  await activateLocalDataSource();
  return dataSource();
}

/**
 * A vehicle with an overdue schedule per title (due a year after 2024-01-01), and reminders from midnight,
 * so listing the inbox stores one reminder per schedule whatever the time of the test.
 */
async function seedOverdue(titles: string[] = ['Cambio de aceite']) {
  const local = await localData();
  await local.settings.update({ reminderHour: 0 });
  const vehicle = await local.vehicles.create({ make: 'Seat', model: 'Ibiza' });
  for (const title of titles) {
    await local.schedules.create(vehicle.id, {
      title,
      category: 'oil_change',
      intervalMonths: 12,
      lastDoneDate: '2024-01-01',
    });
  }
  return { local, vehicle };
}

/** The bell's button, by its unread count. */
const bell = (unread: number) => screen.findByRole('button', { name: `Notificaciones, ${unread} sin leer` });

describe('local mode', () => {
  let fetchMock: ReturnType<typeof mockApi>;

  beforeEach(() => {
    vi.stubEnv('MODE', 'native');
    device.callback = createMemorySqlite();
    device.gate = null;
    storage.store = null;
    setLocalMode(true);
    // Desktop layout: the sidebar with the bell and the exit button.
    mockMediaQuery(true);
    // No route: any request would fail the test.
    fetchMock = mockApi({});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    nativeFiles.saveFile.mockReset();
    reportPdf.gate = null;
    reportPdf.fail = false;
    native.getNotificationPermission.mockReset();
    native.requestNotificationPermission.mockReset();
    native.showNotifications.mockReset();
    native.tap.listener = null;
    appState.resume = null;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaving local mode goes to welcome and keeps the data', async () => {
    await (await localData()).vehicles.create({ make: 'Seat', model: 'Ibiza' });
    const { user, router } = await renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Seat Ibiza' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cambiar de modo' }));

    expect(await screen.findByRole('heading', { name: 'Cómo quieres usar Ikrive' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/welcome');
    expect(localStorage.getItem(MODE_KEY)).toBeNull();
    expect(dataSource()).toBe(httpDataSource);

    await user.click(screen.getByRole('button', { name: /En este teléfono/ }));

    expect(await screen.findByRole('heading', { name: 'Seat Ibiza' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('shows the bell with the local reminders on start', async () => {
    await seedOverdue();
    const { user } = await renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Hola, Local' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cambiar de modo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ajustes' })).toBeInTheDocument();

    await user.click(await bell(1));

    const panel = await screen.findByRole('dialog', { name: 'Notificaciones' });
    expect(within(panel).getByText('Mantenimiento vencido')).toBeInTheDocument();
    expect(within(panel).getByText('Cambio de aceite')).toBeInTheDocument();
    expect(within(panel).getByText('Seat Ibiza')).toBeInTheDocument();
  });

  it('the bell marks one and all as read in local mode', async () => {
    const { local, vehicle } = await seedOverdue(['Cambio de aceite', 'Filtro de aire', 'Frenos']);
    const { user, router } = await renderApp('/');

    await user.click(await bell(3));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Notificaciones' })).getByText('Filtro de aire'),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe(`/vehicles/${vehicle.id}`));
    const readTitles = async () =>
      (await local.notifications.list()).items
        .filter((item) => item.readAt !== null)
        .map((item) => item.title);
    await waitFor(async () => expect(await readTitles()).toEqual(['Filtro de aire']));

    await user.click(await bell(2));
    await user.click(await screen.findByRole('button', { name: 'Marcar todas como leídas' }));

    expect(await bell(0)).toBeInTheDocument();
    expect((await readTitles()).sort()).toEqual(['Cambio de aceite', 'Filtro de aire', 'Frenos']);
  });

  it('generates reminders when the app comes back to the foreground', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 07:00 in Madrid, before the reminder hour (09:00).
    vi.setSystemTime(new Date('2026-11-16T06:00:00.000Z'));
    const { local } = await seedOverdue();
    await local.settings.update({ reminderHour: 9 });
    await renderApp('/');
    expect(await bell(0)).toBeInTheDocument();
    await waitFor(() => expect(appState.resume).not.toBeNull());

    // Back to the app at 10:00 in Madrid.
    vi.setSystemTime(new Date('2026-11-16T09:00:00.000Z'));
    act(() => appState.resume?.());

    expect(await bell(1)).toBeInTheDocument();
  });

  it('shows new local reminders as phone notifications', async () => {
    localStorage.setItem('ikrive.notificationPermissionAsked', '2026-11-09T08:00:00.000Z');
    native.getNotificationPermission.mockResolvedValue('granted');
    native.showNotifications.mockResolvedValue(undefined);
    const { local, vehicle } = await seedOverdue();

    // First run on this device: what is already pending is history, not shown.
    const first = await renderApp('/');
    expect(await bell(1)).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem('ikrive.deviceNotifications.local')).not.toBeNull());
    first.unmount();
    expect(native.showNotifications).not.toHaveBeenCalled();

    await local.schedules.create(vehicle.id, {
      title: 'Filtro de aire',
      category: 'other',
      intervalMonths: 12,
      lastDoneDate: '2024-01-01',
    });
    await renderApp('/');

    await waitFor(() => expect(native.showNotifications).toHaveBeenCalledTimes(1));
    const [shown] = native.showNotifications.mock.calls[0] ?? [];
    const { items } = await local.notifications.list();
    const added = items.find((item) => item.title === 'Filtro de aire');
    expect(shown).toEqual([
      {
        id: expect.any(Number),
        title: 'Filtro de aire',
        body: 'Seat Ibiza',
        extra: { userId: 'local', notificationId: added?.id, link: `/vehicles/${vehicle.id}` },
      },
    ]);
  });

  it('tapping a phone notification marks it as read and opens its link', async () => {
    const { local, vehicle } = await seedOverdue();
    const [notification] = (await local.notifications.list()).items;
    if (!notification) throw new Error('No local reminder');
    // A new app run started by the tap: the root listens before `/_app` installs the local `DataSource`
    // (here, on a screen outside `/_app`).
    forgetLocalDataSource();
    setDataSource(httpDataSource);
    const { router } = await renderApp('/welcome');
    expect(await screen.findByRole('heading', { name: 'Cómo quieres usar Ikrive' })).toBeInTheDocument();
    expect(dataSource()).toBe(httpDataSource);

    await waitFor(() => expect(native.tap.listener).not.toBeNull());
    native.tap.listener?.({ userId: 'local', notificationId: notification.id, link: notification.link });

    await waitFor(() => expect(router.state.location.pathname).toBe(`/vehicles/${vehicle.id}`));
    expect(await screen.findByRole('heading', { name: 'Seat Ibiza', level: 1 })).toBeInTheDocument();
    await waitFor(async () =>
      expect((await local.notifications.list()).items[0]?.readAt).toEqual(expect.any(String)),
    );
  });

  it('settings show device notifications and hide channels and calendar feed', async () => {
    native.getNotificationPermission.mockResolvedValue('granted');
    await renderApp('/settings');

    expect(await screen.findByText('Preferencias')).toBeInTheDocument();
    expect(screen.getByText('Apariencia')).toBeInTheDocument();
    expect(await screen.findByText('Notificaciones del teléfono')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Los avisos nuevos salen como notificaciones de Android al abrir la app o volver a ella.',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText(/^Activadas/)).toBeInTheDocument();
    for (const title of ['Canales de notificación', 'Calendario']) {
      expect(screen.queryByText(title)).not.toBeInTheDocument();
    }
  });

  it('settings show the data card with export only', async () => {
    await renderApp('/settings');

    expect(await screen.findByText('Tus datos')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Descarga una copia de todo lo que guardas en este teléfono para llevarla a un servidor de Ikrive.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar mis datos' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: 'Descargar mis datos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Importar datos' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fichero de export de Ikrive (.zip)')).not.toBeInTheDocument();
  });

  it('exports the local data through the share sheet', async () => {
    nativeFiles.saveFile.mockResolvedValue(undefined);
    const vehicle = await (await localData()).vehicles.create({ make: 'Seat', model: 'Ibiza' });
    const { user } = await renderApp('/settings');

    await user.click(await screen.findByRole('button', { name: 'Descargar mis datos' }));

    await waitFor(() => expect(nativeFiles.saveFile).toHaveBeenCalledTimes(1));
    const [name, blob] = nativeFiles.saveFile.mock.calls[0] ?? [];
    expect(name).toBe(`ikrive-export-${todayIn(DEFAULT_USER_SETTINGS.timezone)}.zip`);
    expect(blob.type).toBe('application/zip');
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const document = dataExportSchema.parse(JSON.parse(strFromU8(entries['data.json'] ?? new Uint8Array())));
    expect(document.vehicles.map((v) => v.id)).toEqual([vehicle.id]);
    expect(screen.queryByText('No se ha podido generar el export')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Descargar mis datos' })).toBeEnabled();
  });

  it('shows a toast when the local export fails', async () => {
    const local = await localData();
    const vehicle = await local.vehicles.create({ make: 'Seat', model: 'Ibiza' });
    const record = await local.maintenance.create(vehicle.id, {
      date: '2024-03-01',
      category: 'other',
      title: 'Revisión',
    });
    await local.attachments.upload(
      vehicle.id,
      record.id,
      new File(['%PDF-1.7 factura'], 'factura.pdf', { type: 'application/pdf' }),
    );
    storage.store?.failOn.add('read');
    const { user } = await renderApp('/settings');

    await user.click(await screen.findByRole('button', { name: 'Descargar mis datos' }));

    expect(await screen.findByText('No se ha podido generar el export')).toBeInTheDocument();
    expect(nativeFiles.saveFile).not.toHaveBeenCalled();
  });

  it('settings show reminder preferences and save them', async () => {
    await (await localData()).settings.update({ odometerReminderWeekday: 3, reminderHour: 20 });
    const { user } = await renderApp('/settings');

    const weekday = await screen.findByLabelText('Día del recordatorio de kilometraje');
    const hour = screen.getByLabelText('Hora de los recordatorios');
    expect(weekday).toHaveValue('3');
    expect(hour).toHaveValue('20');

    await user.click(
      screen.getByRole('button', { name: 'Más información sobre la hora de los recordatorios' }),
    );
    expect(
      await screen.findByText(/La app revisa los recordatorios al abrirla, al volver a ella y cada minuto/),
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.selectOptions(weekday, '5');
    await user.selectOptions(hour, '7');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(async () =>
      expect(await dataSource().settings.get()).toMatchObject({
        odometerReminderWeekday: 5,
        reminderHour: 7,
      }),
    );
  });

  it('vehicle page shows the photo picker and the sale report', async () => {
    mockObjectUrls();
    const vehicle = await (await localData()).vehicles.create({ make: 'Seat', model: 'Ibiza' });
    const { user } = await renderApp(`/vehicles/${vehicle.id}`);

    expect(await screen.findByRole('heading', { name: 'Seat Ibiza', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Informe de venta' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Editar' }));

    expect(await screen.findByRole('heading', { name: 'Editar vehículo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Añadir foto' })).toBeInTheDocument();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('No photo input');
    const jpeg = new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00])], 'IMG_0001.jpg', {
      type: 'image/jpeg',
    });
    await user.upload(input, jpeg);

    expect(await screen.findByRole('button', { name: 'Cambiar foto' })).toBeInTheDocument();
    expect(storage.store?.keys()).toEqual([expect.stringMatching(/^vehicles\/.+\.webp$/)]);

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByRole('heading', { name: 'Seat Ibiza', level: 1 })).toBeInTheDocument();
    // The photo is read from the device and shown as a `blob:` URL, never by its `local://` URL.
    await waitFor(() => expect(document.querySelector('img[src^="blob:"]')).not.toBeNull());
    expect(document.querySelector('img[src^="local:"]')).toBeNull();
  });

  it('sale report dialog hides the public links', async () => {
    const local = await localData();
    const vehicle = await local.vehicles.create({ make: 'Seat', model: 'Ibiza', plate: '1234BCD' });
    const listShares = vi.spyOn(local.reportShares, 'list');
    const { user } = await renderApp(`/vehicles/${vehicle.id}`);

    await user.click(await screen.findByRole('button', { name: 'Informe de venta' }));

    const dialog = await screen.findByRole('dialog', { name: 'Informe de venta' });
    expect(within(dialog).getByRole('checkbox', { name: 'Ocultar matrícula' })).toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: /Incluir facturas/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Descargar' })).toBeEnabled();
    expect(within(dialog).queryByText('Compartir con un enlace')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Crear enlace' })).not.toBeInTheDocument();
    expect(listShares).not.toHaveBeenCalled();
  });

  it('downloads the sale report pdf through the share sheet', async () => {
    nativeFiles.saveFile.mockResolvedValue(undefined);
    let release = () => {};
    reportPdf.gate = new Promise((resolve) => {
      release = resolve;
    });
    const vehicle = await (await localData()).vehicles.create({ make: 'Seat', model: 'Ibiza' });
    const { user } = await renderApp(`/vehicles/${vehicle.id}`);
    await user.click(await screen.findByRole('button', { name: 'Informe de venta' }));
    const dialog = await screen.findByRole('dialog', { name: 'Informe de venta' });

    await user.click(within(dialog).getByRole('button', { name: 'Descargar' }));

    expect(await within(dialog).findByRole('button', { name: 'Generando…' })).toBeDisabled();
    expect(nativeFiles.saveFile).not.toHaveBeenCalled();

    await act(async () => release());

    await waitFor(() => expect(nativeFiles.saveFile).toHaveBeenCalledTimes(1));
    const [name, blob] = nativeFiles.saveFile.mock.calls[0] ?? [];
    expect(name).toBe(`ikrive-seat-ibiza-${todayIn(DEFAULT_USER_SETTINGS.timezone)}.pdf`);
    expect(blob.type).toBe('application/pdf');
    expect(new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0, 5))).toBe('%PDF-');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      screen.queryByText('No se ha podido generar el informe', { exact: false }),
    ).not.toBeInTheDocument();
  });

  it('shows a toast when the local sale report fails', async () => {
    reportPdf.fail = true;
    const vehicle = await (await localData()).vehicles.create({ make: 'Seat', model: 'Ibiza' });
    const { user } = await renderApp(`/vehicles/${vehicle.id}`);
    await user.click(await screen.findByRole('button', { name: 'Informe de venta' }));
    const dialog = await screen.findByRole('dialog', { name: 'Informe de venta' });

    await user.click(within(dialog).getByRole('button', { name: 'Descargar' }));

    expect(
      await screen.findByText('No se ha podido generar el informe. Inténtalo de nuevo en unos segundos.'),
    ).toBeInTheDocument();
    expect(nativeFiles.saveFile).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Informe de venta' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Descargar' })).toBeEnabled();
  });

  it('maintenance shows attachments', async () => {
    mockObjectUrls();
    const local = await localData();
    const vehicle = await local.vehicles.create({ make: 'Seat', model: 'Ibiza' });
    await local.maintenance.create(vehicle.id, { date: '2024-03-01', category: 'other', title: 'Revisión' });
    const { user } = await renderApp(`/vehicles/${vehicle.id}`);

    expect(await screen.findByText('Revisión')).toBeInTheDocument();

    // The form of a new record lets the user pick invoices.
    await user.click(screen.getByRole('button', { name: 'Añadir mantenimiento' }));
    const form = await screen.findByRole('dialog');
    expect(within(form).getByText('Facturas')).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Facturas de «Revisión»' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText('Este mantenimiento todavía no tiene facturas.'),
    ).toBeInTheDocument();

    await user.upload(
      within(dialog).getByLabelText('Elegir facturas'),
      new File(['%PDF-1.7 factura'], 'factura.pdf', { type: 'application/pdf' }),
    );

    expect(await within(dialog).findByText('factura.pdf')).toBeInTheDocument();
    expect(storage.store?.keys()).toEqual([expect.stringMatching(/^attachments\/.+\.pdf$/)]);

    await user.click(within(dialog).getByRole('button', { name: 'Eliminar «factura.pdf»' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText('Este mantenimiento todavía no tiene facturas.')).toBeInTheDocument();
    expect(storage.store?.keys()).toEqual([]);
  });

  it('an activation forgotten while opening never installs its DataSource', async () => {
    let open: () => void = () => {};
    device.gate = new Promise((resolve) => {
      open = resolve;
    });
    const stale = activateLocalDataSource();

    // A new app run (or the next test) starts before the old opening finishes.
    forgetLocalDataSource();
    open();
    await stale;

    expect(dataSource()).toBe(httpDataSource);

    // The next activation opens its own database and does install it.
    await activateLocalDataSource();
    expect(dataSource()).not.toBe(httpDataSource);
  });
});
