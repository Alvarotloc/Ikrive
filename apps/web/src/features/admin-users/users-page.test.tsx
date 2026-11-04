import { type AdminUser, DEFAULT_USER_SETTINGS, type Me } from '@ikrive/shared';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { screen, waitFor, within } from '@testing-library/react';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, type Mock } from 'vitest';
import { type MockResponse, type MockRoutes, mockApi, renderWithProviders } from '@/test/render';
import { AdminUsersPage } from './users-page';

const adminUser = (overrides: Partial<AdminUser> = {}): AdminUser => ({
  id: 'u1',
  name: 'Ana Admin',
  email: 'ana@example.com',
  role: 'admin',
  status: 'active',
  disabledAt: null,
  createdAt: '2025-03-10T10:00:00.000Z',
  vehicleCount: 1,
  isSelf: false,
  locks: { demote: null, disable: null, delete: null },
  ...overrides,
});

/** The signed-in admin: their own row locks disabling and deleting. */
const self = adminUser({ isSelf: true, locks: { demote: null, disable: 'self', delete: 'self' } });
const bruno = adminUser({
  id: 'u2',
  name: 'Bruno',
  email: 'bruno@example.com',
  role: 'user',
  createdAt: '2025-06-02T08:30:00.000Z',
  vehicleCount: 2,
});
const problem = (status: number, title: string) => ({ type: 'about:blank', title, status });

const date = (iso: string) =>
  new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso));

/** The page in a minimal in-memory router with `/admin/users` and `/`. */
function setup(routes: MockRoutes, users: AdminUser[] = [self, bruno]) {
  const fetchMock = mockApi({
    'GET /settings': { body: DEFAULT_USER_SETTINGS },
    'GET /admin/users': { body: users },
    ...routes,
  });
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Toaster />
        <Outlet />
      </>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => <h1>Página de inicio</h1> }),
      createRoute({ getParentRoute: () => rootRoute, path: '/admin/users', component: AdminUsersPage }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/admin/users'] }),
  });
  return { fetchMock, router, ...renderWithProviders(<RouterProvider router={router} />) };
}

const calls = (fetchMock: Mock<typeof fetch>, method: string, path: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => String(url) === `/api${path}` && (init?.method ?? 'GET') === method,
  );

/** Listed rows, in display order (toasts are list items too: skip them). */
const rows = () => screen.getAllByRole('listitem').filter((item) => !item.hasAttribute('data-sonner-toast'));
const row = async (name: string) => {
  await screen.findByText(name);
  const found = rows().find((item) => within(item).queryByText(name));
  if (!found) throw new Error(`No row for ${name}`);
  return found;
};

describe('AdminUsersPage', () => {
  // Sonner keeps toasts in a module-level store and replays the active ones to every new Toaster.
  afterEach(() => {
    toast.dismiss();
  });

  it('lists the users with role, status, sign-up date and vehicles', async () => {
    const disabled = { ...bruno, status: 'disabled' as const, disabledAt: '2025-07-01T00:00:00.000Z' };
    setup({}, [self, disabled]);

    expect(await screen.findByRole('heading', { name: 'Usuarios' })).toBeInTheDocument();
    const first = await row('Ana Admin');
    const second = await row('Bruno');
    expect(rows()).toEqual([first, second]);
    expect(first).toHaveTextContent('Ana Admin');
    expect(first).toHaveTextContent('ana@example.com');
    expect(within(first).getByText('Administrador', { selector: 'span' })).toBeInTheDocument();
    expect(within(first).getByText('Activa')).toBeInTheDocument();
    expect(first).toHaveTextContent(`Alta: ${date('2025-03-10T00:00:00Z')}`);
    expect(first).toHaveTextContent('1 vehículo');
    expect(second).toHaveTextContent('Bruno');
    expect(second).toHaveTextContent('bruno@example.com');
    expect(within(second).getByText('Usuario', { selector: 'span' })).toBeInTheDocument();
    expect(within(second).getByText('Desactivada')).toBeInTheDocument();
    expect(second).toHaveTextContent(`Alta: ${date('2025-06-02T00:00:00Z')}`);
    expect(second).toHaveTextContent('2 vehículos');
    expect(within(second).getByRole('button', { name: 'Reactivar' })).toBeEnabled();
  });

  it('shows the loading text and then the users', async () => {
    let respond: (response: MockResponse) => void = () => {};
    setup({ 'GET /admin/users': () => new Promise<MockResponse>((resolve) => (respond = resolve)) });

    expect(await screen.findByText('Cargando…')).toBeInTheDocument();
    expect(screen.queryByText('Ana Admin')).not.toBeInTheDocument();

    respond({ body: [self, bruno] });

    expect(await screen.findByText('Ana Admin')).toBeInTheDocument();
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument();
  });

  it('shows an error when the list fails', async () => {
    setup({ 'GET /admin/users': { status: 500, body: problem(500, 'Internal Server Error') } });

    expect(await screen.findByRole('alert')).toHaveTextContent('No se han podido cargar los usuarios.');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it("changes a user's role", async () => {
    let sent: unknown;
    const { user, fetchMock } = setup({
      'PUT /admin/users/u2/role': async (request) => {
        sent = await request.json();
        return { body: { ...bruno, role: 'admin' } };
      },
    });

    await user.selectOptions(await screen.findByLabelText('Rol de Bruno'), 'Administrador');

    expect(await screen.findByText('Rol actualizado')).toBeInTheDocument();
    expect(sent).toEqual({ role: 'admin' });
    await waitFor(() => expect(calls(fetchMock, 'GET', '/admin/users')).toHaveLength(2));
  });

  it('asks for confirmation before demoting yourself and keeps the role when cancelled', async () => {
    const { user, fetchMock } = setup({});

    const select = await screen.findByLabelText('Rol de Ana Admin');
    await user.selectOptions(select, 'Usuario');

    const dialog = await screen.findByRole('alertdialog', { name: '¿Quitarte el rol de administrador?' });
    expect(dialog).toHaveTextContent('Perderás el acceso de administrador al instante');
    expect(dialog).toHaveTextContent('solo otro administrador podrá devolvértelo');
    expect(calls(fetchMock, 'PUT', '/admin/users/u1/role')).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Rol de Ana Admin')).toHaveValue('admin');
    expect(calls(fetchMock, 'PUT', '/admin/users/u1/role')).toHaveLength(0);
  });

  it('refreshes the session and leaves after demoting yourself', async () => {
    const demoted: Me = { id: 'u1', name: 'Ana Admin', email: 'ana@example.com', role: 'user' };
    let sent: unknown;
    const { user, fetchMock, router, queryClient } = setup({
      'PUT /admin/users/u1/role': async (request) => {
        sent = await request.json();
        return { body: { ...self, role: 'user' } };
      },
      'GET /me': { body: demoted },
    });

    await user.selectOptions(await screen.findByLabelText('Rol de Ana Admin'), 'Usuario');
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Quitarme el rol' }));

    expect(await screen.findByRole('heading', { name: 'Página de inicio' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(sent).toEqual({ role: 'user' });
    expect(calls(fetchMock, 'GET', '/me')).toHaveLength(1);
    expect(queryClient.getQueryData(['me'])).toEqual(demoted);
  });

  it('demotes another admin without confirmation', async () => {
    const carla = adminUser({ id: 'u3', name: 'Carla', email: 'carla@example.com' });
    let sent: unknown;
    const { user } = setup(
      {
        'PUT /admin/users/u3/role': async (request) => {
          sent = await request.json();
          return { body: { ...carla, role: 'user' } };
        },
      },
      [self, carla],
    );

    await user.selectOptions(await screen.findByLabelText('Rol de Carla'), 'Usuario');

    expect(await screen.findByText('Rol actualizado')).toBeInTheDocument();
    expect(sent).toEqual({ role: 'user' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('disables an active user', async () => {
    const { user, fetchMock } = setup({
      'POST /admin/users/u2/disable': { body: { ...bruno, status: 'disabled' } },
    });

    await user.click(within(await row('Bruno')).getByRole('button', { name: 'Desactivar' }));

    expect(await screen.findByText('Cuenta desactivada')).toBeInTheDocument();
    expect(calls(fetchMock, 'POST', '/admin/users/u2/disable')).toHaveLength(1);
    await waitFor(() => expect(calls(fetchMock, 'GET', '/admin/users')).toHaveLength(2));
  });

  it('re-enables a disabled user', async () => {
    const disabled = { ...bruno, status: 'disabled' as const, disabledAt: '2025-07-01T00:00:00.000Z' };
    const { user, fetchMock } = setup({ 'POST /admin/users/u2/enable': { body: bruno } }, [self, disabled]);

    await user.click(within(await row('Bruno')).getByRole('button', { name: 'Reactivar' }));

    expect(await screen.findByText('Cuenta reactivada')).toBeInTheDocument();
    expect(calls(fetchMock, 'POST', '/admin/users/u2/enable')).toHaveLength(1);
    await waitFor(() => expect(calls(fetchMock, 'GET', '/admin/users')).toHaveLength(2));
  });

  it('asks for confirmation before deleting and sends nothing when cancelled', async () => {
    const { user, fetchMock } = setup({});

    await user.click(within(await row('Bruno')).getByRole('button', { name: 'Eliminar' }));

    const dialog = await screen.findByRole('alertdialog', { name: '¿Eliminar a Bruno?' });
    expect(dialog).toHaveTextContent('bruno@example.com');
    expect(dialog).toHaveTextContent('vehículos, mantenimientos, repostajes y adjuntos');
    expect(dialog).toHaveTextContent('no se puede deshacer');
    expect(calls(fetchMock, 'DELETE', '/admin/users/u2')).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(calls(fetchMock, 'DELETE', '/admin/users/u2')).toHaveLength(0);
  });

  it('deletes a user after confirming', async () => {
    const { user, fetchMock } = setup({ 'DELETE /admin/users/u2': { status: 204 } });

    await user.click(within(await row('Bruno')).getByRole('button', { name: 'Eliminar' }));
    const dialog = await screen.findByRole('alertdialog', { name: '¿Eliminar a Bruno?' });
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText('Usuario eliminado')).toBeInTheDocument();
    expect(calls(fetchMock, 'DELETE', '/admin/users/u2')).toHaveLength(1);
    await waitFor(() => expect(calls(fetchMock, 'GET', '/admin/users')).toHaveLength(2));
  });

  it('disables the actions locked for yourself', async () => {
    setup({});

    const own = await row('Ana Admin');
    const reason = 'No puedes desactivar ni eliminar tu propia cuenta.';
    const disable = within(own).getByRole('button', { name: 'Desactivar' });
    const remove = within(own).getByRole('button', { name: 'Eliminar' });
    expect(disable).toBeDisabled();
    expect(disable).toHaveAccessibleDescription(reason);
    expect(remove).toBeDisabled();
    expect(remove).toHaveAccessibleDescription(reason);
    expect(within(own).getAllByText(reason)).toHaveLength(1);
    expect(within(own).getByLabelText('Rol de Ana Admin')).toBeEnabled();
    // Bruno's row has no locks.
    expect(within(await row('Bruno')).getByRole('button', { name: 'Eliminar' })).toBeEnabled();
  });

  it('disables demoting the last admin', async () => {
    setup({}, [{ ...self, locks: { demote: 'last_admin', disable: 'self', delete: 'self' } }, bruno]);

    const select = await screen.findByLabelText('Rol de Ana Admin');
    expect(select).toBeDisabled();
    expect(select).toHaveAccessibleDescription('Debe quedar al menos un administrador activo.');
    expect(screen.getByLabelText('Rol de Bruno')).toBeEnabled();
  });

  it('shows a conflict and refreshes the list when an action returns 409', async () => {
    const { user, fetchMock } = setup({
      'POST /admin/users/u2/disable': { status: 409, body: problem(409, 'Conflict') },
    });

    await user.click(within(await row('Bruno')).getByRole('button', { name: 'Desactivar' }));

    expect(
      await screen.findByText('Esa acción ya no está permitida; se ha actualizado la lista.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(calls(fetchMock, 'GET', '/admin/users')).toHaveLength(2));
  });

  it('shows the generic error when an action fails', async () => {
    const { user } = setup({
      'POST /admin/users/u2/disable': { status: 500, body: problem(500, 'Internal Server Error') },
    });

    await user.click(within(await row('Bruno')).getByRole('button', { name: 'Desactivar' }));

    expect(await screen.findByText('Algo ha ido mal')).toBeInTheDocument();
  });
});
