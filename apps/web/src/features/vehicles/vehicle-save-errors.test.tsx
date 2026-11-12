import { DEFAULT_USER_SETTINGS, type Me } from '@ikrive/shared';
import { screen, waitFor } from '@testing-library/react';
import type { AsyncRemoteCallback } from 'drizzle-orm/sqlite-proxy';
import { toast } from 'sonner';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setLocalMode } from '@/lib/app-mode';
import { dataSource } from '@/lib/data-source';
import { createMemorySqlite } from '@/test/memory-sqlite';
import { mockApi, mockMediaQuery } from '@/test/render';
import { renderApp } from '@/test/render-app';

/** The device database of the local mode: in memory, with inserts into `vehicles` failing as the plugin did. */
const device = vi.hoisted(() => ({ callback: null as AsyncRemoteCallback | null }));
vi.mock('@/lib/native-sqlite', () => ({
  openDeviceDatabase: async () => {
    if (!device.callback) throw new Error('No device database');
    return device.callback;
  },
}));

// Loaded before any test renders: see `features/mobile/welcome.test.tsx`.
beforeAll(async () => {
  await Promise.all([import('@/lib/data-source/local'), import('@/lib/native-sqlite')]);
});

const me: Me = { id: 'u1', name: 'Ana', email: 'ana@example.com', role: 'user' };
const serverError = {
  status: 500,
  body: { type: 'about:blank', title: 'Internal Server Error', status: 500 },
};

type User = Awaited<ReturnType<typeof renderApp>>['user'];

async function fillAndSubmit(user: User) {
  await user.type(await screen.findByLabelText('Marca'), 'Seat');
  await user.type(screen.getByLabelText('Modelo'), 'Ibiza');
  await user.click(screen.getByRole('button', { name: 'Añadir vehículo' }));
}

describe('saving a vehicle fails', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    // Toasts live in sonner's module state: the next test must not see this one's.
    toast.dismiss();
  });

  it('shows an error and stays on the form when the API fails', async () => {
    mockMediaQuery(true);
    const fetchMock = mockApi({
      'GET /me': { body: me },
      'GET /settings': { body: DEFAULT_USER_SETTINGS },
      'GET /notifications': { body: { items: [], total: 0, unreadCount: 0 } },
      'POST /vehicles': serverError,
    });
    const { user, router } = await renderApp('/vehicles/new');

    await fillAndSubmit(user);

    expect(await screen.findByText('Algo ha ido mal')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/vehicles/new');
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/vehicles'))).toBe(true);
  });

  it('shows an error and stays on the form when the phone database fails', async () => {
    vi.stubEnv('MODE', 'native');
    mockMediaQuery(true);
    const fetchMock = mockApi({});
    const memory = createMemorySqlite();
    device.callback = async (sql, params, method) => {
      if (/^insert into "vehicles"/i.test(sql)) throw new Error('disk I/O error');
      return memory(sql, params, method);
    };
    setLocalMode(true);
    const { user, router } = await renderApp('/vehicles/new');

    await fillAndSubmit(user);

    expect(await screen.findByText('Algo ha ido mal')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/vehicles/new');
    await waitFor(async () => expect(await dataSource().vehicles.list('all')).toEqual([]));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows an error when saving the settings fails', async () => {
    mockMediaQuery(true);
    mockApi({
      'GET /me': { body: me },
      'GET /settings': { body: DEFAULT_USER_SETTINGS },
      'GET /notifications': { body: { items: [], total: 0, unreadCount: 0 } },
      'GET /notification-channels': { body: [] },
      'GET /settings/calendar-feed': { body: { enabled: false, createdAt: null } },
      'PATCH /settings': serverError,
    });
    const { user } = await renderApp('/settings');

    await user.click(await screen.findByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Algo ha ido mal')).toBeInTheDocument();
    expect(screen.queryByText('Ajustes guardados')).not.toBeInTheDocument();
  });
});
