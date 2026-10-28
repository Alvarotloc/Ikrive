import { DEFAULT_USER_SETTINGS, type MaintenanceSchedule, type VehicleStatus } from '@ikrive/shared';
import { screen, within } from '@testing-library/react';
import { Suspense } from 'react';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, type Mock } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { type MockRoutes, mockApi, renderWithProviders } from '@/test/render';
import { SchedulesSection } from './schedules-section';

const schedule = (overrides: Partial<MaintenanceSchedule>): MaintenanceSchedule => ({
  id: 's1',
  vehicleId: 'v1',
  title: 'Cambio de aceite',
  category: 'oil_change',
  intervalMonths: 12,
  intervalDistance: 15_000,
  warnDays: 30,
  warnDistance: 1000,
  lastDoneDate: '2025-03-10',
  lastDoneOdometer: 120_000,
  nextDueDate: '2026-03-10',
  nextDueDateEstimated: false,
  nextDueOdometer: 135_000,
  status: 'ok',
  createdAt: '2025-03-10T10:00:00.000Z',
  updatedAt: '2025-03-10T10:00:00.000Z',
  ...overrides,
});

const oil = schedule({ id: 'oil' });
const tires = schedule({
  id: 'tires',
  title: 'Neumáticos',
  category: 'tires',
  intervalMonths: null,
  intervalDistance: 40_000,
  nextDueDate: '2025-11-01',
  nextDueDateEstimated: true,
  nextDueOdometer: 160_000,
  status: 'due_soon',
});
const inspection = schedule({
  id: 'inspection',
  title: 'ITV',
  category: 'inspection',
  intervalMonths: 24,
  intervalDistance: null,
  nextDueDate: '2025-06-01',
  nextDueOdometer: null,
  status: 'overdue',
});

// Same formatter as `useFormat` in Spanish.
const date = (iso: string) =>
  new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );

function setup(
  routes: MockRoutes,
  { status = 'active', distanceUnit = 'km' }: { status?: VehicleStatus; distanceUnit?: 'km' | 'mi' } = {},
) {
  const fetchMock = mockApi({
    'GET /settings': { body: { ...DEFAULT_USER_SETTINGS, distanceUnit } },
    ...routes,
  });
  const rendered = renderWithProviders(
    <>
      <Toaster />
      <Suspense fallback={null}>
        <SchedulesSection vehicle={{ id: 'v1', status, name: 'Clio', make: 'Renault', model: 'Clio' }} />
      </Suspense>
    </>,
  );
  return { fetchMock, ...rendered };
}

const calls = (fetchMock: Mock<typeof fetch>, method: string, path: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => String(url) === `/api${path}` && (init?.method ?? 'GET') === method,
  );

/** Listed schedules (toasts are list items too: skip them). */
const rows = () => screen.getAllByRole('listitem').filter((item) => !item.hasAttribute('data-sonner-toast'));
const listedTitles = () =>
  rows().map((item) => within(item).getByText((_, element) => element?.tagName === 'STRONG').textContent);
/** Row of the schedule titled `title` (the title is the `<strong>`: a category may read the same). */
const rowOf = (title: string) => screen.getByText(title, { selector: 'strong' }).closest('li') as HTMLElement;
const findRow = async (title: string) =>
  (await screen.findByText(title, { selector: 'strong' })).closest('li') as HTMLElement;

describe('SchedulesSection', () => {
  // Sonner keeps toasts in a module-level store and replays the active ones to every new Toaster.
  afterEach(() => {
    toast.dismiss();
  });

  it('lists the schedules ordered by due status and date', async () => {
    const later = schedule({ id: 'later', title: 'Filtros', nextDueDate: '2027-01-01' });
    const { fetchMock } = setup({ 'GET /vehicles/v1/schedules': { body: [later, oil, tires, inspection] } });

    expect(await screen.findByRole('heading', { name: 'Próximos mantenimientos' })).toBeInTheDocument();
    expect(calls(fetchMock, 'GET', '/vehicles/v1/schedules')).toHaveLength(1);
    expect(listedTitles()).toEqual(['ITV', 'Neumáticos', 'Cambio de aceite', 'Filtros']);
  });

  it('shows the next due date in the locale and the distance in the user unit', async () => {
    setup({ 'GET /vehicles/v1/schedules': { body: [oil, inspection] } }, { distanceUnit: 'mi' });

    const oilRow = await findRow('Cambio de aceite');
    expect(await within(oilRow).findByText(`Vence: ${date('2026-03-10')} · 135.000 mi`)).toBeInTheDocument();
    expect(within(rowOf('ITV')).getByText(`Vence: ${date('2025-06-01')}`)).toBeInTheDocument();
  });

  it('marks an estimated due date', async () => {
    setup({ 'GET /vehicles/v1/schedules': { body: [tires, oil] } });

    const tiresRow = await findRow('Neumáticos');
    expect(
      within(tiresRow).getByText(`Vence: ${date('2025-11-01')} (estimada) · 160.000 km`),
    ).toBeInTheDocument();
    expect(within(rowOf('Cambio de aceite')).queryByText(/estimada/)).not.toBeInTheDocument();
  });

  it('shows the no data text when nothing can be computed', async () => {
    const unknown = schedule({ id: 'unknown', title: 'Batería', nextDueDate: null, nextDueOdometer: null });
    setup({ 'GET /vehicles/v1/schedules': { body: [unknown, oil] } });

    const row = await findRow('Batería');
    expect(within(row).getByText('Sin datos suficientes para calcular el vencimiento')).toBeInTheDocument();
    expect(within(row).queryByText(/Vence/)).not.toBeInTheDocument();
    expect(within(rowOf('Cambio de aceite')).queryByText(/Sin datos/)).not.toBeInTheDocument();
  });

  it('shows a distinct badge for ok, due soon and overdue', async () => {
    setup({ 'GET /vehicles/v1/schedules': { body: [oil, tires, inspection] } });

    const ok = within(await findRow('Cambio de aceite')).getByText('Al día');
    const dueSoon = within(rowOf('Neumáticos')).getByText('Próximo');
    const overdue = within(rowOf('ITV')).getByText('Vencido');
    expect(ok).toHaveClass('bg-accent');
    expect(dueSoon).toHaveClass('bg-warning/15', 'text-warning');
    expect(overdue).toHaveClass('bg-destructive/12', 'text-destructive');
    expect(new Set([ok.className, dueSoon.className, overdue.className]).size).toBe(3);
  });

  it('describes the interval in months and distance', async () => {
    const monthly = schedule({ id: 'monthly', title: 'Revisión', intervalMonths: 1, intervalDistance: null });
    setup({ 'GET /vehicles/v1/schedules': { body: [oil, tires, inspection, monthly] } });

    const oilRow = await findRow('Cambio de aceite');
    expect(within(oilRow).getByText('Cada 12 meses o 15.000 km')).toBeInTheDocument();
    expect(within(oilRow).getByText('Aceite')).toHaveClass('border-dashed');
    expect(within(rowOf('Neumáticos')).getByText('Cada 40.000 km')).toBeInTheDocument();
    expect(within(rowOf('Neumáticos')).getByText('Neumáticos', { selector: 'span' })).toBeInTheDocument();
    expect(within(rowOf('ITV')).getByText('Cada 24 meses')).toBeInTheDocument();
    expect(within(rowOf('Revisión')).getByText('Cada 1 mes')).toBeInTheDocument();
  });

  it('shows the empty message without schedules', async () => {
    setup({ 'GET /vehicles/v1/schedules': { body: [] } });

    expect(
      await screen.findByText(
        'Todavía no hay reglas de mantenimiento. Añade una para saber cuándo toca cada revisión.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows the add button only for active vehicles', async () => {
    const active = setup({ 'GET /vehicles/v1/schedules': { body: [oil] } });

    await active.user.click(await screen.findByRole('button', { name: 'Añadir regla' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Añadir regla');
    expect(screen.getByLabelText('Título')).toHaveValue('');
    active.unmount();

    setup({ 'GET /vehicles/v1/schedules': { body: [oil] } }, { status: 'sold' });

    expect(await screen.findByText('Cambio de aceite')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Añadir regla' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar «Cambio de aceite»' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar «Cambio de aceite»' })).toBeInTheDocument();
  });

  it('opens the form prefilled when editing a schedule', async () => {
    const { user } = setup({ 'GET /vehicles/v1/schedules': { body: [oil, tires] } });

    await user.click(await screen.findByRole('button', { name: 'Editar «Neumáticos»' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Editar regla' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Título')).toHaveValue('Neumáticos');
    expect(within(dialog).getByLabelText('Categoría')).toHaveValue('tires');
    expect(within(dialog).getByLabelText('Cada (meses)')).toHaveValue('');
    expect(within(dialog).getByLabelText('Cada (km)')).toHaveValue('40000');
    expect(within(dialog).getByLabelText('Última vez (fecha)')).toHaveValue('2025-03-10');
  });

  it('reloads the list after creating a schedule', async () => {
    let schedules = [oil];
    const { user, fetchMock } = setup({
      'GET /vehicles/v1/schedules': () => ({ body: schedules }),
      'POST /vehicles/v1/schedules': () => {
        schedules = [oil, tires];
        return { status: 201, body: tires };
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Añadir regla' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Título'), 'Neumáticos');
    await user.type(within(dialog).getByLabelText('Cada (km)'), '40.000');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Regla añadida')).toBeInTheDocument();
    expect(await findRow('Neumáticos')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(listedTitles()).toEqual(['Neumáticos', 'Cambio de aceite']);
    expect(calls(fetchMock, 'POST', '/vehicles/v1/schedules')).toHaveLength(1);
    expect(calls(fetchMock, 'GET', '/vehicles/v1/schedules')).toHaveLength(2);
  });

  it('deletes a schedule only after confirming', async () => {
    let schedules = [oil, tires];
    const { user, fetchMock, queryClient } = setup({
      'GET /vehicles/v1/schedules': () => ({ body: schedules }),
      'DELETE /vehicles/v1/schedules/oil': () => {
        schedules = [tires];
        return { status: 204 };
      },
    });
    queryClient.setQueryData(queryKeys.vehicles.maintenance('v1'), []);

    await user.click(await screen.findByRole('button', { name: 'Eliminar «Cambio de aceite»' }));
    const confirm = screen.getByRole('alertdialog');
    expect(confirm).toHaveTextContent('¿Eliminar «Cambio de aceite»?');
    await user.click(within(confirm).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(calls(fetchMock, 'DELETE', '/vehicles/v1/schedules/oil')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Eliminar «Cambio de aceite»' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText('Regla eliminada')).toBeInTheDocument();
    expect(calls(fetchMock, 'DELETE', '/vehicles/v1/schedules/oil')).toHaveLength(1);
    expect(screen.queryByText('Cambio de aceite')).not.toBeInTheDocument();
    expect(listedTitles()).toEqual(['Neumáticos']);
    expect(calls(fetchMock, 'GET', '/vehicles/v1/schedules')).toHaveLength(2);
    // Linked records lose their schedule: the maintenance timeline is refreshed too.
    expect(queryClient.getQueryState(queryKeys.vehicles.maintenance('v1'))?.isInvalidated).toBe(true);
  });

  it('shows the generic error when deleting fails', async () => {
    const { user, fetchMock } = setup({
      'GET /vehicles/v1/schedules': { body: [oil] },
      'DELETE /vehicles/v1/schedules/oil': {
        status: 500,
        body: { type: 'about:blank', title: 'Internal Server Error', status: 500 },
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Eliminar «Cambio de aceite»' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText('Algo ha ido mal')).toBeInTheDocument();
    expect(calls(fetchMock, 'DELETE', '/vehicles/v1/schedules/oil')).toHaveLength(1);
    expect(screen.getByText('Cambio de aceite')).toBeInTheDocument();
    expect(screen.queryByText('Regla eliminada')).not.toBeInTheDocument();
  });
});
