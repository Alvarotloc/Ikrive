import { DEFAULT_USER_SETTINGS, type MaintenanceRecord, type VehicleStatus } from '@ikrive/shared';
import { screen, within } from '@testing-library/react';
import { Suspense } from 'react';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, type Mock } from 'vitest';
import { type MockRoutes, mockApi, renderWithProviders } from '@/test/render';
import { MaintenanceSection } from './maintenance-timeline';

const record = (overrides: Partial<MaintenanceRecord>): MaintenanceRecord => ({
  id: 'r1',
  vehicleId: 'v1',
  date: '2025-03-10',
  odometer: null,
  category: 'oil_change',
  title: 'Cambio de aceite',
  description: null,
  workshop: null,
  cost: null,
  includeInReport: true,
  createdAt: '2025-03-10T10:00:00.000Z',
  updatedAt: '2025-03-10T10:00:00.000Z',
  ...overrides,
});

const oil = record({
  id: 'oil',
  date: '2025-09-01',
  title: 'Cambio de aceite',
  odometer: 120_000,
  workshop: 'Taller Paco',
  cost: 89.9,
});
const brakes = record({ id: 'brakes', date: '2025-02-01', category: 'brakes', title: 'Pastillas' });
const tires = record({
  id: 'tires',
  date: '2024-06-01',
  category: 'tires',
  title: 'Neumáticos nuevos',
  cost: 400,
});

// Same formatters as `useFormat` with DEFAULT_USER_SETTINGS (km, EUR) in Spanish. Testing Library
// normalizes the rendered text (the non-breaking space before "€" becomes a plain one), so does `money`.
const money = (value: number) =>
  new Intl.NumberFormat('es', { style: 'currency', currency: 'EUR' }).format(value).replace(/\s/g, ' ');
const date = (iso: string) =>
  new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );

function setup(routes: MockRoutes, { status = 'active' }: { status?: VehicleStatus } = {}) {
  const fetchMock = mockApi({ 'GET /settings': { body: DEFAULT_USER_SETTINGS }, ...routes });
  const rendered = renderWithProviders(
    <>
      <Toaster />
      <Suspense fallback={null}>
        <MaintenanceSection vehicle={{ id: 'v1', status }} />
      </Suspense>
    </>,
  );
  return { fetchMock, ...rendered };
}

const calls = (fetchMock: Mock<typeof fetch>, method: string, path: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => String(url) === `/api${path}` && (init?.method ?? 'GET') === method,
  );

/** Titles of the listed records, in display order (toasts are list items too: skip them). */
const listedTitles = () =>
  screen
    .getAllByRole('listitem')
    .filter((item) => !item.hasAttribute('data-sonner-toast'))
    .map((item) => within(item).getByText((_, element) => element?.tagName === 'STRONG').textContent);

const chip = (name: string) =>
  within(screen.getByRole('navigation', { name: 'Filtrar por categoría' })).getByRole('button', { name });

describe('MaintenanceSection', () => {
  // Sonner keeps toasts in a module-level store and replays the active ones to every new Toaster.
  afterEach(() => {
    toast.dismiss();
  });

  it("loads the vehicle's records and lists them newest first grouped by year", async () => {
    const { fetchMock } = setup({ 'GET /vehicles/v1/maintenance': { body: [tires, brakes, oil] } });

    expect(await screen.findByRole('heading', { name: 'Mantenimientos' })).toBeInTheDocument();
    expect(calls(fetchMock, 'GET', '/vehicles/v1/maintenance')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['2025', '2024']);
    expect(listedTitles()).toEqual(['Cambio de aceite', 'Pastillas', 'Neumáticos nuevos']);
    const yearGroup = (year: string) =>
      screen.getByRole('heading', { name: year }).closest('section') as HTMLElement;
    expect(within(yearGroup('2025')).getAllByRole('listitem')).toHaveLength(2);
    expect(within(yearGroup('2024')).getByText('Neumáticos nuevos')).toBeInTheDocument();
  });

  it('shows each category with the stamp badge and the record details', async () => {
    setup({ 'GET /vehicles/v1/maintenance': { body: [oil, brakes] } });

    const oilRow = (await screen.findByText('Cambio de aceite')).closest('li') as HTMLElement;
    const oilBadge = within(oilRow).getByText('Aceite');
    expect(oilBadge).toHaveClass('border-dashed');
    expect(
      within(oilRow).getByText(`${date('2025-09-01')} · 120.000 km · Taller Paco · ${money(89.9)}`),
    ).toBeInTheDocument();

    const brakesRow = screen.getByText('Pastillas').closest('li') as HTMLElement;
    expect(within(brakesRow).getByText('Frenos')).toHaveClass('border-dashed');
    expect(within(brakesRow).getByText(date('2025-02-01'))).toBeInTheDocument();
  });

  it('offers only the present categories and filters the timeline', async () => {
    const { user } = setup({ 'GET /vehicles/v1/maintenance': { body: [oil, brakes, tires] } });

    await screen.findByText('Cambio de aceite');
    const nav = screen.getByRole('navigation', { name: 'Filtrar por categoría' });
    expect(
      within(nav)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Todas', 'Aceite', 'Neumáticos', 'Frenos']);
    expect(chip('Todas')).toHaveAttribute('aria-pressed', 'true');

    await user.click(chip('Frenos'));

    expect(chip('Frenos')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Todas')).toHaveAttribute('aria-pressed', 'false');
    expect(listedTitles()).toEqual(['Pastillas']);
  });

  it('falls back to all when the filtered category loses its last record', async () => {
    let records = [oil, brakes];
    const { user } = setup({
      'GET /vehicles/v1/maintenance': () => ({ body: records }),
      'DELETE /vehicles/v1/maintenance/brakes': () => {
        records = [oil];
        return { status: 204 };
      },
    });

    await screen.findByText('Pastillas');
    await user.click(chip('Frenos'));
    expect(listedTitles()).toEqual(['Pastillas']);

    await user.click(screen.getByRole('button', { name: 'Eliminar «Pastillas»' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText('Cambio de aceite')).toBeInTheDocument();
    expect(chip('Todas')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Frenos' })).not.toBeInTheDocument();
    expect(listedTitles()).toEqual(['Cambio de aceite']);
  });

  it('shows the empty message without filter when there are no records', async () => {
    setup({ 'GET /vehicles/v1/maintenance': { body: [] } });

    expect(await screen.findByText('Todavía no hay mantenimientos registrados.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  it('shows the add button only for active vehicles', async () => {
    const active = setup({ 'GET /vehicles/v1/maintenance': { body: [oil] } });

    await active.user.click(await screen.findByRole('button', { name: 'Añadir mantenimiento' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Añadir mantenimiento');
    expect(screen.getByLabelText('Título')).toHaveValue('');
    active.unmount();

    setup({ 'GET /vehicles/v1/maintenance': { body: [oil] } }, { status: 'sold' });

    expect(await screen.findByText('Cambio de aceite')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Añadir mantenimiento' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar «Cambio de aceite»' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar «Cambio de aceite»' })).toBeInTheDocument();
  });

  it('opens the form prefilled when editing a record', async () => {
    const { user } = setup({ 'GET /vehicles/v1/maintenance': { body: [oil, brakes] } });

    await user.click(await screen.findByRole('button', { name: 'Editar «Cambio de aceite»' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Editar mantenimiento' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Título')).toHaveValue('Cambio de aceite');
    expect(within(dialog).getByLabelText('Fecha')).toHaveValue('2025-09-01');
    expect(within(dialog).getByLabelText('Kilometraje (km)')).toHaveValue('120000');
    expect(within(dialog).getByLabelText('Taller')).toHaveValue('Taller Paco');
  });

  it('deletes a record only after confirming', async () => {
    let records = [oil, brakes];
    const { user, fetchMock } = setup({
      'GET /vehicles/v1/maintenance': () => ({ body: records }),
      'DELETE /vehicles/v1/maintenance/oil': () => {
        records = [brakes];
        return { status: 204 };
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Eliminar «Cambio de aceite»' }));
    const confirm = screen.getByRole('alertdialog');
    expect(confirm).toHaveTextContent('¿Eliminar «Cambio de aceite»?');
    await user.click(within(confirm).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(calls(fetchMock, 'DELETE', '/vehicles/v1/maintenance/oil')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Eliminar «Cambio de aceite»' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText('Mantenimiento eliminado')).toBeInTheDocument();
    expect(calls(fetchMock, 'DELETE', '/vehicles/v1/maintenance/oil')).toHaveLength(1);
    expect(screen.queryByText('Cambio de aceite')).not.toBeInTheDocument();
    expect(listedTitles()).toEqual(['Pastillas']);
    expect(calls(fetchMock, 'GET', '/vehicles/v1/maintenance')).toHaveLength(2);
  });

  it('opens the attachments dialog of a record', async () => {
    const { user, fetchMock } = setup({
      'GET /vehicles/v1/maintenance': { body: [oil, brakes] },
      'GET /vehicles/v1/maintenance/brakes/attachments': { body: [] },
    });

    await user.click(await screen.findByRole('button', { name: 'Facturas de «Pastillas»' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Facturas' })).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Pastillas');
    expect(
      await within(dialog).findByText('Este mantenimiento todavía no tiene facturas.'),
    ).toBeInTheDocument();
    expect(calls(fetchMock, 'GET', '/vehicles/v1/maintenance/brakes/attachments')).toHaveLength(1);
    expect(calls(fetchMock, 'GET', '/vehicles/v1/maintenance/oil/attachments')).toHaveLength(0);
  });

  it('shows the generic error when deleting fails', async () => {
    const { user, fetchMock } = setup({
      'GET /vehicles/v1/maintenance': { body: [oil] },
      'DELETE /vehicles/v1/maintenance/oil': {
        status: 500,
        body: { type: 'about:blank', title: 'Internal Server Error', status: 500 },
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Eliminar «Cambio de aceite»' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText('Algo ha ido mal')).toBeInTheDocument();
    expect(calls(fetchMock, 'DELETE', '/vehicles/v1/maintenance/oil')).toHaveLength(1);
    expect(screen.getByText('Cambio de aceite')).toBeInTheDocument();
    expect(screen.queryByText('Mantenimiento eliminado')).not.toBeInTheDocument();
  });
});
