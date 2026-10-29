import { DEFAULT_USER_SETTINGS, type FuelLog, type UserSettings, type Vehicle } from '@ikrive/shared';
import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, type Mock } from 'vitest';
import i18n from '@/i18n';
import { todayIso } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import { type MockRoutes, mockApi, renderWithProviders } from '@/test/render';
import { FuelLogFormDialog } from './fuel-log-form';

type FuelVehicle = Pick<Vehicle, 'id' | 'fuelType' | 'odometer'>;

const car: FuelVehicle = { id: 'v1', fuelType: 'gasoline', odometer: { value: 132_480, date: '2025-03-01' } };

const log: FuelLog = {
  id: 'f1',
  vehicleId: 'v1',
  date: '2025-03-10',
  odometer: 120_000,
  quantity: 40,
  totalPrice: 58.4,
  pricePerUnit: 1.459,
  fullTank: false,
  missedPrevious: true,
  createdAt: '2025-03-10T10:00:00.000Z',
  updatedAt: '2025-03-10T10:00:00.000Z',
};

// Same formatter as `useFormat` in Spanish.
const date = (iso: string) =>
  new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );

const problem = (status: number, extra: object = {}) => ({
  status,
  body: { type: 'about:blank', title: 'Error', status, ...extra },
});

const label = {
  odometer: 'Kilometraje (km)',
  quantity: 'Cantidad (L)',
  totalPrice: 'Precio total (EUR)',
  pricePerUnit: 'Precio por L (EUR)',
  fullTank: 'Depósito lleno',
  missedPrevious: 'Me salté un repostaje anterior',
  date: 'Fecha',
};
const twoOfThree = 'Rellena al menos dos de: cantidad, precio total y precio por unidad.';
const recomputeHint = 'Vacía un campo para recalcularlo con los otros dos.';

/** Owns the `open` state like the section does, so closing the dialog is observable. */
function Harness({ vehicle, log }: { vehicle: FuelVehicle; log?: FuelLog }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Toaster />
      <FuelLogFormDialog vehicle={vehicle} log={log} open={open} onOpenChange={setOpen} />
    </>
  );
}

function setup(
  routes: MockRoutes = {},
  options: { vehicle?: FuelVehicle; log?: FuelLog; settings?: UserSettings } = {},
) {
  const fetchMock = mockApi({
    'GET /settings': { body: options.settings ?? DEFAULT_USER_SETTINGS },
    ...routes,
  });
  return {
    fetchMock,
    ...renderWithProviders(<Harness vehicle={options.vehicle ?? car} log={options.log} />),
  };
}

/** Requests sent with `method` to `path` (relative to `/api`), with their parsed JSON body. */
function requests(fetchMock: Mock<typeof fetch>, method: string, path: string) {
  return fetchMock.mock.calls
    .filter(([url, init]) => String(url) === `/api${path}` && init?.method === method)
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : undefined));
}

const valueInput = (name: 'quantity' | 'totalPrice' | 'pricePerUnit') => screen.getByLabelText(label[name]);

describe('FuelLogFormDialog', () => {
  // Sonner keeps toasts in a module-level store and replays the active ones to every new Toaster.
  afterEach(() => {
    toast.dismiss();
  });

  it('opens with today, full tank and the last odometer proposed', () => {
    setup();

    expect(screen.getByRole('heading', { name: 'Añadir repostaje' })).toBeInTheDocument();
    expect(screen.getByLabelText(label.odometer)).toHaveValue('132480');
    expect(screen.getByLabelText(label.odometer)).toHaveAccessibleDescription(
      `Última lectura: 132.480 km el ${date('2025-03-01')}`,
    );
    expect(screen.getByLabelText(label.date)).toHaveValue(todayIso());
    expect(screen.getByLabelText(label.fullTank)).toBeChecked();
    expect(screen.getByLabelText(label.missedPrevious)).not.toBeChecked();
    expect(screen.queryByText(recomputeHint)).not.toBeInTheDocument();
  });

  it('leaves the odometer empty when the vehicle has no readings', () => {
    setup({}, { vehicle: { ...car, odometer: null } });

    expect(screen.getByLabelText(label.odometer)).toHaveValue('');
    expect(screen.queryByText(/Última lectura/)).not.toBeInTheDocument();
  });

  it('computes the third value from any two', async () => {
    const cases = [
      { typed: { quantity: '40,125', totalPrice: '58,54' }, computed: 'pricePerUnit', value: '1,459' },
      { typed: { quantity: '40,125', pricePerUnit: '1,459' }, computed: 'totalPrice', value: '58,54' },
      { typed: { totalPrice: '58,54', pricePerUnit: '1,459' }, computed: 'quantity', value: '40,123' },
    ] as const;
    for (const { typed, computed, value } of cases) {
      const { user, unmount } = setup();
      for (const [name, text] of Object.entries(typed)) {
        await user.type(valueInput(name as keyof typeof typed), text);
      }

      expect(valueInput(computed)).toHaveValue(value);
      expect(valueInput(computed)).toHaveAccessibleDescription('Calculado');
      expect(screen.getAllByText('Calculado')).toHaveLength(1);
      unmount();
    }
  });

  it('recomputes the computed value when a source changes', async () => {
    const { user } = setup();

    await user.type(valueInput('quantity'), '40');
    await user.type(valueInput('totalPrice'), '58,36');
    expect(valueInput('pricePerUnit')).toHaveValue('1,459');

    await user.type(valueInput('quantity'), '0');
    expect(valueInput('pricePerUnit')).toHaveValue('0,146');

    // A source cleared: the computed value can no longer be derived.
    await user.clear(valueInput('totalPrice'));
    expect(valueInput('pricePerUnit')).toHaveValue('');
    expect(screen.queryByText('Calculado')).not.toBeInTheDocument();
  });

  it('keeps a value the user types over the computed one', async () => {
    const { user } = setup();

    await user.type(valueInput('quantity'), '40');
    await user.type(valueInput('totalPrice'), '58,36');
    await user.type(valueInput('pricePerUnit'), '9');
    expect(valueInput('pricePerUnit')).toHaveValue('1,4599');
    expect(screen.queryByText('Calculado')).not.toBeInTheDocument();

    await user.type(valueInput('quantity'), '0');
    expect(valueInput('pricePerUnit')).toHaveValue('1,4599');
  });

  it('does not refill the computed value when the user clears it', async () => {
    const { user } = setup();

    await user.type(valueInput('quantity'), '40');
    await user.type(valueInput('totalPrice'), '58,36');
    expect(valueInput('pricePerUnit')).toHaveValue('1,459');

    await user.type(valueInput('pricePerUnit'), '{Backspace}'.repeat(5));
    expect(valueInput('pricePerUnit')).toHaveValue('');
    expect(screen.queryByText('Calculado')).not.toBeInTheDocument();
  });

  it('computes again after the user changes a source', async () => {
    const { user } = setup();

    await user.type(valueInput('quantity'), '40');
    await user.type(valueInput('totalPrice'), '58,36');
    await user.type(valueInput('pricePerUnit'), '{Backspace}'.repeat(5));
    expect(valueInput('pricePerUnit')).toHaveValue('');

    await user.type(valueInput('quantity'), '0');
    expect(valueInput('pricePerUnit')).toHaveValue('0,146');
    expect(valueInput('pricePerUnit')).toHaveAccessibleDescription('Calculado');
  });

  it('asks for two of the three values without calling the API', async () => {
    const { user, fetchMock } = setup({ 'POST /vehicles/v1/fuel-logs': { status: 201, body: log } });

    await user.type(valueInput('quantity'), '40');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect((await screen.findAllByRole('alert')).map((alert) => alert.textContent)).toEqual([
      twoOfThree,
      twoOfThree,
    ]);
    expect(valueInput('totalPrice')).toHaveAttribute('aria-invalid', 'true');
    expect(valueInput('pricePerUnit')).toHaveAttribute('aria-invalid', 'true');
    expect(valueInput('quantity')).toHaveAttribute('aria-invalid', 'false');
    expect(requests(fetchMock, 'POST', '/vehicles/v1/fuel-logs')).toEqual([]);
  });

  it('shows field errors without calling the API when values are invalid', async () => {
    const { user, fetchMock } = setup({ 'POST /vehicles/v1/fuel-logs': { status: 201, body: log } });

    await user.clear(screen.getByLabelText(label.odometer));
    await user.type(screen.getByLabelText(label.odometer), 'abc');
    await user.type(valueInput('quantity'), '0');
    await user.type(valueInput('totalPrice'), '50');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect((await screen.findAllByRole('alert')).map((alert) => alert.textContent)).toEqual([
      'Introduce un número válido.',
      'El valor no es válido.',
    ]);
    expect(screen.getByLabelText(label.odometer)).toHaveAttribute('aria-invalid', 'true');
    expect(valueInput('quantity')).toHaveAttribute('aria-invalid', 'true');
    expect(requests(fetchMock, 'POST', '/vehicles/v1/fuel-logs')).toEqual([]);
  });

  it('rejects several separators and too many decimals without calling the API', async () => {
    const { user, fetchMock } = setup({ 'POST /vehicles/v1/fuel-logs': { status: 201, body: log } });

    await user.type(valueInput('quantity'), '40,1255');
    await user.type(valueInput('totalPrice'), '1.234,56');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect((await screen.findAllByRole('alert')).map((alert) => alert.textContent)).toEqual([
      'Como mucho 3 decimales.',
      'Introduce un número válido.',
    ]);
    expect(valueInput('quantity')).toHaveAttribute('aria-invalid', 'true');
    expect(valueInput('totalPrice')).toHaveAttribute('aria-invalid', 'true');
    // Nothing reinterpreted or rounded: the typed text stays as it is.
    expect(valueInput('quantity')).toHaveValue('40,1255');
    expect(valueInput('totalPrice')).toHaveValue('1.234,56');
    expect(valueInput('pricePerUnit')).toHaveValue('');
    expect(requests(fetchMock, 'POST', '/vehicles/v1/fuel-logs')).toEqual([]);
  });

  it('labels quantity in kWh for electric vehicles and in the volume unit otherwise', async () => {
    const { unmount } = setup({}, { vehicle: { ...car, fuelType: 'electric' } });
    expect(screen.getByLabelText('Cantidad (kWh)')).toBeInTheDocument();
    expect(screen.getByLabelText('Precio por kWh (EUR)')).toBeInTheDocument();
    unmount();

    setup(
      {},
      { settings: { ...DEFAULT_USER_SETTINGS, volumeUnit: 'gal', currency: 'USD', distanceUnit: 'mi' } },
    );
    expect(await screen.findByLabelText('Cantidad (gal)')).toBeInTheDocument();
    expect(screen.getByLabelText('Precio por gal (USD)')).toBeInTheDocument();
    expect(screen.getByLabelText('Precio total (USD)')).toBeInTheDocument();
    expect(screen.getByLabelText('Kilometraje (mi)')).toBeInTheDocument();
  });

  it('uses mobile keyboards', () => {
    setup();

    expect(screen.getByLabelText(label.odometer)).toHaveAttribute('inputmode', 'numeric');
    for (const name of ['quantity', 'totalPrice', 'pricePerUnit'] as const) {
      expect(valueInput(name)).toHaveAttribute('inputmode', 'decimal');
    }
  });

  it('creates a log, closes the dialog and shows a toast', async () => {
    const { user, fetchMock } = setup({ 'POST /vehicles/v1/fuel-logs': { status: 201, body: log } });

    await user.type(valueInput('quantity'), '1.459');
    await user.type(valueInput('totalPrice'), '58,36');
    await user.click(screen.getByLabelText(label.fullTank));
    await user.click(screen.getByLabelText(label.missedPrevious));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Repostaje añadido')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requests(fetchMock, 'POST', '/vehicles/v1/fuel-logs')).toEqual([
      {
        date: todayIso(),
        odometer: 132_480,
        quantity: 1.459,
        totalPrice: 58.36,
        pricePerUnit: 40,
        fullTank: false,
        missedPrevious: true,
      },
    ]);
  });

  it('prefills the form and sends every field with PATCH when editing', async () => {
    const { user, fetchMock } = setup(
      { 'PATCH /vehicles/v1/fuel-logs/f1': { body: { ...log, odometer: 121_000 } } },
      { log },
    );

    expect(screen.getByRole('heading', { name: 'Editar repostaje' })).toBeInTheDocument();
    expect(screen.getByLabelText(label.odometer)).toHaveValue('120000');
    expect(valueInput('quantity')).toHaveValue('40');
    expect(valueInput('totalPrice')).toHaveValue('58,4');
    expect(valueInput('pricePerUnit')).toHaveValue('1,459');
    expect(screen.getByLabelText(label.fullTank)).not.toBeChecked();
    expect(screen.getByLabelText(label.missedPrevious)).toBeChecked();
    expect(screen.getByLabelText(label.date)).toHaveValue('2025-03-10');
    expect(screen.queryByText(/Última lectura/)).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText(label.odometer));
    await user.type(screen.getByLabelText(label.odometer), '121.000');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Repostaje actualizado')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requests(fetchMock, 'PATCH', '/vehicles/v1/fuel-logs/f1')).toEqual([
      {
        date: '2025-03-10',
        odometer: 121_000,
        quantity: 40,
        totalPrice: 58.4,
        pricePerUnit: 1.459,
        fullTank: false,
        missedPrevious: true,
      },
    ]);
  });

  it('shows the recompute hint only when editing', () => {
    const { unmount } = setup();
    expect(screen.queryByText(recomputeHint)).not.toBeInTheDocument();
    unmount();

    setup({}, { log });
    expect(screen.getByText(recomputeHint)).toBeInTheDocument();
    for (const name of ['quantity', 'totalPrice', 'pricePerUnit'] as const) {
      expect(valueInput(name)).toHaveAccessibleDescription(recomputeHint);
    }
  });

  it('recomputes a value the user clears when editing', async () => {
    const { user } = setup({}, { log });

    // No automatic recalculation while the three values come from the ticket.
    await user.type(valueInput('quantity'), '0');
    expect(valueInput('quantity')).toHaveValue('400');
    expect(valueInput('pricePerUnit')).toHaveValue('1,459');

    await user.clear(valueInput('pricePerUnit'));
    expect(valueInput('pricePerUnit')).toHaveValue('0,146');
    expect(valueInput('pricePerUnit')).toHaveAccessibleDescription(`Calculado ${recomputeHint}`);
  });

  it('shows the odometer conflict on the km field and keeps the dialog open on 409', async () => {
    const { user } = setup(
      { 'PATCH /vehicles/v1/fuel-logs/f1': problem(409, { detail: 'The odometer cannot go backwards' }) },
      { log },
    );

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('fuel.errors.odometerConflict'));
    expect(screen.getByLabelText(label.odometer)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the future-date error on the date field on a 400 without errors', async () => {
    const { user } = setup({
      'POST /vehicles/v1/fuel-logs': problem(400, { detail: 'The refuel date cannot be in the future' }),
    });

    await user.type(valueInput('quantity'), '40');
    await user.type(valueInput('totalPrice'), '58,36');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('fuel.errors.future'));
    expect(screen.getByLabelText(label.date)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the generic error when saving fails for another reason', async () => {
    const { user } = setup({ 'POST /vehicles/v1/fuel-logs': problem(500) });

    await user.type(valueInput('quantity'), '40');
    await user.type(valueInput('totalPrice'), '58,36');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('common.error'));
    expect(screen.getByLabelText(label.date)).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText(label.odometer)).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('invalidates the vehicle queries after saving', async () => {
    const { user, queryClient, fetchMock } = setup({
      'POST /vehicles/v1/fuel-logs': { status: 201, body: log },
    });
    queryClient.setQueryData(queryKeys.vehicles.detail('v1'), { id: 'v1' });
    queryClient.setQueryData(queryKeys.vehicles.odometer('v1'), []);
    queryClient.setQueryData(queryKeys.vehicles.fuelLogs('v1'), []);

    await user.type(valueInput('quantity'), '40');
    await user.type(valueInput('totalPrice'), '58,36');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(requests(fetchMock, 'POST', '/vehicles/v1/fuel-logs')).toHaveLength(1));
    expect(await screen.findByText('Repostaje añadido')).toBeInTheDocument();
    expect(queryClient.getQueryState(queryKeys.vehicles.detail('v1'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(queryKeys.vehicles.odometer('v1'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(queryKeys.vehicles.fuelLogs('v1'))?.isInvalidated).toBe(true);
  });
});
