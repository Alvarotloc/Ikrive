import { screen, waitFor, within } from '@testing-library/react';
import type { AsyncRemoteCallback } from 'drizzle-orm/sqlite-proxy';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MODE_KEY, setLocalMode } from '@/lib/app-mode';
import { dataSource } from '@/lib/data-source';
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

/** The phone notifications: never touched in local mode. */
const native = vi.hoisted(() => ({
  getNotificationPermission: vi.fn(),
  requestNotificationPermission: vi.fn(),
  showNotifications: vi.fn(),
}));
vi.mock('@/lib/native-notifications', () => native);

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
});

/** The local `DataSource`, to add data before rendering. */
async function localData() {
  await activateLocalDataSource();
  return dataSource();
}

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
    vi.unstubAllEnvs();
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

  it('hides the bell and users and shows switch mode', async () => {
    await renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Hola, Local' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cambiar de modo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Notificaciones/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ajustes' })).toBeInTheDocument();
  });

  it('settings hide channels, calendar feed, device notifications and data', async () => {
    await renderApp('/settings');

    expect(await screen.findByText('Preferencias')).toBeInTheDocument();
    expect(screen.getByText('Apariencia')).toBeInTheDocument();
    for (const title of [
      'Canales de notificación',
      'Calendario',
      'Notificaciones del teléfono',
      'Tus datos',
    ]) {
      expect(screen.queryByText(title)).not.toBeInTheDocument();
    }
  });

  it('settings hide reminder preferences', async () => {
    await (await localData()).settings.update({ odometerReminderWeekday: 3, reminderHour: 20 });
    const { user } = await renderApp('/settings');

    const currency = await screen.findByLabelText('Moneda');
    expect(screen.queryByLabelText('Día del recordatorio de kilometraje')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Hora de los recordatorios')).not.toBeInTheDocument();
    await user.clear(currency);
    await user.type(currency, 'USD');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(async () => expect((await dataSource().settings.get()).currency).toBe('USD'));
    expect(await dataSource().settings.get()).toMatchObject({ odometerReminderWeekday: 3, reminderHour: 20 });
  });

  it('vehicle page shows the photo picker and hides the sale report', async () => {
    mockObjectUrls();
    const vehicle = await (await localData()).vehicles.create({ make: 'Seat', model: 'Ibiza' });
    const { user } = await renderApp(`/vehicles/${vehicle.id}`);

    expect(await screen.findByRole('heading', { name: 'Seat Ibiza', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Informe de venta/ })).not.toBeInTheDocument();

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

  it('does not sync device notifications', async () => {
    await renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Hola, Local' })).toBeInTheDocument();
    expect(native.getNotificationPermission).not.toHaveBeenCalled();
    expect(native.showNotifications).not.toHaveBeenCalled();
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
