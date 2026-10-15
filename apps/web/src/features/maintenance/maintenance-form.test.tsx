import { DEFAULT_USER_SETTINGS, type MaintenanceRecord } from '@ikrive/shared';
import { screen } from '@testing-library/react';
import { useState } from 'react';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, type Mock } from 'vitest';
import i18n from '@/i18n';
import { queryKeys } from '@/lib/query-keys';
import { type MockRoutes, mockApi, renderWithProviders } from '@/test/render';
import { MaintenanceFormDialog } from './maintenance-form';

const record: MaintenanceRecord = {
  id: 'r1',
  vehicleId: 'v1',
  date: '2025-03-10',
  odometer: 120_000,
  category: 'brakes',
  title: 'Pastillas delanteras',
  description: 'Discos revisados',
  workshop: 'Taller Paco',
  cost: 180.5,
  includeInReport: false,
  createdAt: '2025-03-10T10:00:00.000Z',
  updatedAt: '2025-03-10T10:00:00.000Z',
};

const problem = (status: number, extra: object = {}) => ({
  status,
  body: { type: 'about:blank', title: 'Error', status, ...extra },
});

/** Owns the `open` state like the timeline does, so closing the dialog is observable. */
function Harness({ record }: { record?: MaintenanceRecord }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Toaster />
      <MaintenanceFormDialog vehicleId="v1" record={record} open={open} onOpenChange={setOpen} />
    </>
  );
}

function setup(routes: MockRoutes, options: { record?: MaintenanceRecord } = {}) {
  const fetchMock = mockApi({ 'GET /settings': { body: DEFAULT_USER_SETTINGS }, ...routes });
  return { fetchMock, ...renderWithProviders(<Harness record={options.record} />) };
}

/** Requests sent with `method` to `path` (relative to `/api`), with their parsed JSON body. */
function requests(fetchMock: Mock<typeof fetch>, method: string, path: string) {
  return fetchMock.mock.calls
    .filter(([url, init]) => String(url) === `/api${path}` && init?.method === method)
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : undefined));
}

const label = {
  date: 'Fecha',
  odometer: 'Kilometraje (km)',
  category: 'Categoría',
  title: 'Título',
  workshop: 'Taller',
  cost: 'Coste (EUR)',
  description: 'Descripción',
  includeInReport: 'Incluir en el informe',
};

describe('MaintenanceFormDialog', () => {
  // Sonner keeps toasts in a module-level store and replays the active ones to every new Toaster.
  afterEach(() => {
    toast.dismiss();
  });

  it('creates a record, closes the dialog and shows a toast', async () => {
    const { user, fetchMock } = setup({ 'POST /vehicles/v1/maintenance': { status: 201, body: record } });

    expect(screen.getByRole('heading', { name: 'Añadir mantenimiento' })).toBeInTheDocument();
    await user.clear(screen.getByLabelText(label.date));
    await user.type(screen.getByLabelText(label.date), '2025-03-10');
    await user.type(screen.getByLabelText(label.title), 'Cambio de aceite');
    await user.type(screen.getByLabelText(label.cost), '1.234,56');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Mantenimiento añadido')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requests(fetchMock, 'POST', '/vehicles/v1/maintenance')).toEqual([
      {
        date: '2025-03-10',
        odometer: null,
        category: 'oil_change',
        title: 'Cambio de aceite',
        description: null,
        workshop: null,
        cost: 1234.56,
        includeInReport: true,
      },
    ]);
  });

  it('shows field errors without calling the API when the form is invalid', async () => {
    const { user, fetchMock } = setup({ 'POST /vehicles/v1/maintenance': { status: 201, body: record } });

    await user.type(screen.getByLabelText(label.odometer), 'mucho');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect((await screen.findAllByRole('alert')).map((alert) => alert.textContent)).toEqual([
      'Introduce un número válido.',
      'Este campo es obligatorio.',
    ]);
    expect(screen.getByLabelText(label.title)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(label.odometer)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(label.date)).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(requests(fetchMock, 'POST', '/vehicles/v1/maintenance')).toEqual([]);
  });

  it('prefills the form with the record when editing', () => {
    setup({}, { record });

    expect(screen.getByRole('heading', { name: 'Editar mantenimiento' })).toBeInTheDocument();
    expect(screen.getByLabelText(label.date)).toHaveValue('2025-03-10');
    expect(screen.getByLabelText(label.odometer)).toHaveValue('120000');
    expect(screen.getByLabelText(label.category)).toHaveValue('brakes');
    expect(screen.getByLabelText(label.title)).toHaveValue('Pastillas delanteras');
    expect(screen.getByLabelText(label.workshop)).toHaveValue('Taller Paco');
    expect(screen.getByLabelText(label.cost)).toHaveValue('180.5');
    expect(screen.getByLabelText(label.description)).toHaveValue('Discos revisados');
    expect(screen.getByLabelText(label.includeInReport)).not.toBeChecked();
  });

  it('sends every field with PATCH and a blank odometer as null when editing', async () => {
    const { user, fetchMock } = setup(
      { 'PATCH /vehicles/v1/maintenance/r1': { body: { ...record, odometer: null } } },
      { record },
    );

    await user.clear(screen.getByLabelText(label.odometer));
    await user.selectOptions(screen.getByLabelText(label.category), 'repair');
    await user.click(screen.getByLabelText(label.includeInReport));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Mantenimiento actualizado')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requests(fetchMock, 'PATCH', '/vehicles/v1/maintenance/r1')).toEqual([
      {
        date: '2025-03-10',
        odometer: null,
        category: 'repair',
        title: 'Pastillas delanteras',
        description: 'Discos revisados',
        workshop: 'Taller Paco',
        cost: 180.5,
        includeInReport: true,
      },
    ]);
  });

  it('shows the odometer conflict on the km field and keeps the dialog open on 409', async () => {
    const { user } = setup(
      { 'PATCH /vehicles/v1/maintenance/r1': problem(409, { detail: 'The odometer cannot go backwards' }) },
      { record },
    );

    await user.clear(screen.getByLabelText(label.odometer));
    await user.type(screen.getByLabelText(label.odometer), '10.000');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('maintenance.errors.odometerConflict'));
    expect(screen.getByLabelText(label.odometer)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the future-date error on the date field on a 400 without errors', async () => {
    const { user } = setup({
      'POST /vehicles/v1/maintenance': problem(400, {
        detail: 'The maintenance date cannot be in the future',
      }),
    });

    await user.type(screen.getByLabelText(label.title), 'ITV');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('maintenance.errors.future'));
    expect(screen.getByLabelText(label.date)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the generic error when saving fails for another reason', async () => {
    const { user } = setup({ 'POST /vehicles/v1/maintenance': problem(500) });

    await user.type(screen.getByLabelText(label.title), 'ITV');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('common.error'));
    expect(screen.getByLabelText(label.date)).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText(label.odometer)).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('invalidates the vehicle queries after saving', async () => {
    const fetchMock = mockApi({
      'GET /settings': { body: DEFAULT_USER_SETTINGS },
      'POST /vehicles/v1/maintenance': { status: 201, body: record },
    });
    const rendered = renderWithProviders(<Harness />);
    const { user, queryClient } = rendered;
    queryClient.setQueryData(queryKeys.vehicles.detail('v1'), { id: 'v1' });
    queryClient.setQueryData(queryKeys.vehicles.maintenance('v1'), []);

    await user.type(screen.getByLabelText(label.title), 'ITV');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Mantenimiento añadido')).toBeInTheDocument();
    expect(requests(fetchMock, 'POST', '/vehicles/v1/maintenance')).toHaveLength(1);
    expect(queryClient.getQueryState(queryKeys.vehicles.detail('v1'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(queryKeys.vehicles.maintenance('v1'))?.isInvalidated).toBe(true);
  });
});
