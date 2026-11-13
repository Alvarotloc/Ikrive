import { screen, waitFor, within } from '@testing-library/react';
import type { AsyncRemoteCallback } from 'drizzle-orm/sqlite-proxy';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MODE_KEY, setLocalMode } from '@/lib/app-mode';
import { dataSource } from '@/lib/data-source';
import { httpDataSource } from '@/lib/data-source/http';
import { createMemorySqlite } from '@/test/memory-sqlite';
import { mockApi, mockMediaQuery } from '@/test/render';
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
  await Promise.all([import('@/lib/data-source/local'), import('@/lib/native-sqlite')]);
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

  it('vehicle page hides the sale report and the photo picker', async () => {
    const vehicle = await (await localData()).vehicles.create({ make: 'Seat', model: 'Ibiza' });
    const { user } = await renderApp(`/vehicles/${vehicle.id}`);

    expect(await screen.findByRole('heading', { name: 'Seat Ibiza', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Informe de venta/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Editar' }));

    expect(await screen.findByRole('heading', { name: 'Editar vehículo' })).toBeInTheDocument();
    expect(screen.queryByText('Añadir foto')).not.toBeInTheDocument();
  });

  it('maintenance hides attachments', async () => {
    const local = await localData();
    const vehicle = await local.vehicles.create({ make: 'Seat', model: 'Ibiza' });
    await local.maintenance.create(vehicle.id, { date: '2024-03-01', category: 'other', title: 'Revisión' });
    const { user } = await renderApp(`/vehicles/${vehicle.id}`);

    expect(await screen.findByText('Revisión')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Facturas de «Revisión»' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Añadir mantenimiento' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Título')).toBeInTheDocument();
    expect(within(dialog).queryByText('Facturas')).not.toBeInTheDocument();
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
