import { DEFAULT_USER_SETTINGS, type FuelLog, type Vehicle } from '@ikrive/shared';
import { screen, within } from '@testing-library/react';
import { Suspense } from 'react';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, type Mock } from 'vitest';
import i18n from '@/i18n';
import { queryKeys } from '@/lib/query-keys';
import { type MockRoutes, mockApi, renderWithProviders } from '@/test/render';
import { FuelLogsSection } from './fuel-logs-section';

type FuelVehicle = Pick<Vehicle, 'id' | 'status' | 'fuelType' | 'odometer'>;

const car: FuelVehicle = {
  id: 'v1',
  status: 'active',
  fuelType: 'gasoline',
  odometer: { value: 132_480, date: '2025-09-01' },
};

const fuelLog = (overrides: Partial<FuelLog>): FuelLog => ({
  id: 'f1',
  vehicleId: 'v1',
  date: '2025-03-10',
  odometer: 120_000,
  quantity: 40,
  totalPrice: 58.36,
  pricePerUnit: 1.459,
  fullTank: true,
  missedPrevious: false,
  createdAt: '2025-03-10T10:00:00.000Z',
  updatedAt: '2025-03-10T10:00:00.000Z',
  ...overrides,
});

const march = fuelLog({ id: 'march' });
const june = fuelLog({
  id: 'june',
  date: '2025-06-02',
  odometer: 125_300,
  quantity: 35.5,
  totalPrice: 55.1,
  pricePerUnit: 1.552,
  fullTank: false,
});
const september = fuelLog({ id: 'september', date: '2025-09-01', odometer: 132_480, quantity: 42.125 });

// Same formatters as `useFormat` with DEFAULT_USER_SETTINGS (km, EUR) in Spanish. Testing Library
// normalizes the rendered text (the non-breaking space before "€" becomes a plain one), so does `money`.
const money = (value: number) =>
  new Intl.NumberFormat('es', { style: 'currency', currency: 'EUR' }).format(value).replace(/\s/g, ' ');
const date = (iso: string) =>
  new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );

function setup(routes: MockRoutes, vehicle: Partial<FuelVehicle> = {}) {
  const fetchMock = mockApi({ 'GET /settings': { body: DEFAULT_USER_SETTINGS }, ...routes });
  const rendered = renderWithProviders(
    <>
      <Toaster />
      <Suspense fallback={null}>
        <FuelLogsSection vehicle={{ ...car, ...vehicle }} />
      </Suspense>
    </>,
  );
  return { fetchMock, ...rendered };
}

const calls = (fetchMock: Mock<typeof fetch>, method: string, path: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => String(url) === `/api${path}` && (init?.method ?? 'GET') === method,
  );

/** Listed rows, in display order (toasts are list items too: skip them). */
const rows = () => screen.getAllByRole('listitem').filter((item) => !item.hasAttribute('data-sonner-toast'));

describe('FuelLogsSection', () => {
  // Sonner keeps toasts in a module-level store and replays the active ones to every new Toaster.
  afterEach(() => {
    toast.dismiss();
  });

  it("lists the vehicle's fuel logs newest first", async () => {
    setup({ 'GET /vehicles/v1/fuel-logs': { body: [june, march, september] } });

    expect(await screen.findByRole('heading', { name: 'Repostajes' })).toBeInTheDocument();
    expect(rows().map((row) => within(row).getByText(/·/, { selector: 'span' }).textContent)).toEqual([
      expect.stringContaining(date('2025-09-01')),
      expect.stringContaining(date('2025-06-02')),
      expect.stringContaining(date('2025-03-10')),
    ]);
  });

  it('shows date, km, quantity, prices and full tank of each log', async () => {
    setup({ 'GET /vehicles/v1/fuel-logs': { body: [march, june] } });

    const [first, second] = await screen.findAllByRole('listitem');
    expect(first).toHaveTextContent(`${money(55.1)} · 35,5 L`);
    expect(first).toHaveTextContent(`${date('2025-06-02')} · 125.300 km · 1,552 €/L`);
    expect(within(first as HTMLElement).getByText('Parcial')).toBeInTheDocument();
    expect(second).toHaveTextContent(`${money(58.36)} · 40 L`);
    expect(second).toHaveTextContent(`${date('2025-03-10')} · 120.000 km · 1,459 €/L`);
    expect(within(second as HTMLElement).getByText('Lleno')).toBeInTheDocument();
  });

  it('shows quantities in kWh for electric vehicles', async () => {
    setup(
      { 'GET /vehicles/v1/fuel-logs': { body: [fuelLog({ quantity: 52.125, pricePerUnit: 0.39 })] } },
      { fuelType: 'electric' },
    );

    const [row] = await screen.findAllByRole('listitem');
    expect(row).toHaveTextContent('52,125 kWh');
    expect(row).toHaveTextContent('0,39 €/kWh');
  });

  it('shows the empty message when there are no logs', async () => {
    setup({ 'GET /vehicles/v1/fuel-logs': { body: [] } });

    expect(await screen.findByText('Todavía no hay repostajes registrados.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows the add button only for active vehicles', async () => {
    const { unmount } = setup({ 'GET /vehicles/v1/fuel-logs': { body: [] } });
    expect(await screen.findByRole('button', { name: 'Añadir repostaje' })).toBeInTheDocument();
    unmount();

    for (const status of ['sold', 'archived'] as const) {
      const rendered = setup({ 'GET /vehicles/v1/fuel-logs': { body: [march] } }, { status });
      expect(await screen.findByRole('heading', { name: 'Repostajes' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Añadir repostaje' })).not.toBeInTheDocument();
      // Editing and deleting stay available.
      expect(
        screen.getByRole('button', { name: `Editar el repostaje del ${date('2025-03-10')}` }),
      ).toBeEnabled();
      rendered.unmount();
    }
  });

  it('opens the add form when the button is pressed', async () => {
    const { user } = setup({ 'GET /vehicles/v1/fuel-logs': { body: [] } });

    await user.click(await screen.findByRole('button', { name: 'Añadir repostaje' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Añadir repostaje' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Kilometraje (km)')).toHaveValue('132480');
  });

  it('opens the form prefilled when editing a log', async () => {
    const { user } = setup({ 'GET /vehicles/v1/fuel-logs': { body: [march, june] } });

    await user.click(
      await screen.findByRole('button', { name: `Editar el repostaje del ${date('2025-06-02')}` }),
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Editar repostaje' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Kilometraje (km)')).toHaveValue('125300');
    expect(within(dialog).getByLabelText('Cantidad (L)')).toHaveValue('35,5');
    expect(within(dialog).getByLabelText('Precio total (EUR)')).toHaveValue('55,1');
    expect(within(dialog).getByLabelText('Precio por L (EUR)')).toHaveValue('1,552');
    expect(within(dialog).getByLabelText('Depósito lleno')).not.toBeChecked();
  });

  it('deletes a log only after confirming', async () => {
    let logs = [march, june];
    const { user, fetchMock, queryClient } = setup({
      'GET /vehicles/v1/fuel-logs': () => ({ body: logs }),
      'DELETE /vehicles/v1/fuel-logs/june': () => {
        logs = [march];
        return { status: 204 };
      },
    });
    queryClient.setQueryData(queryKeys.vehicles.detail('v1'), { id: 'v1' });
    const deleteLabel = `Eliminar el repostaje del ${date('2025-06-02')}`;

    await user.click(await screen.findByRole('button', { name: deleteLabel }));
    const confirm = screen.getByRole('alertdialog');
    expect(confirm).toHaveTextContent(`¿Eliminar el repostaje del ${date('2025-06-02')}?`);
    await user.click(within(confirm).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(calls(fetchMock, 'DELETE', '/vehicles/v1/fuel-logs/june')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: deleteLabel }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText('Repostaje eliminado')).toBeInTheDocument();
    expect(calls(fetchMock, 'DELETE', '/vehicles/v1/fuel-logs/june')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: deleteLabel })).not.toBeInTheDocument();
    expect(rows()).toHaveLength(1);
    expect(calls(fetchMock, 'GET', '/vehicles/v1/fuel-logs')).toHaveLength(2);
    expect(queryClient.getQueryState(queryKeys.vehicles.detail('v1'))?.isInvalidated).toBe(true);
  });

  it('shows the generic error when deleting fails', async () => {
    const { user } = setup({
      'GET /vehicles/v1/fuel-logs': { body: [march] },
      'DELETE /vehicles/v1/fuel-logs/march': {
        status: 500,
        body: { type: 'about:blank', title: 'Error', status: 500 },
      },
    });

    await user.click(
      await screen.findByRole('button', { name: `Eliminar el repostaje del ${date('2025-03-10')}` }),
    );
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText(i18n.t('common.error'))).toBeInTheDocument();
    expect(rows()).toHaveLength(1);
  });
});
