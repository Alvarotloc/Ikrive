import { DEFAULT_USER_SETTINGS, type MaintenanceSchedule } from '@ikrive/shared';
import { screen } from '@testing-library/react';
import { useState } from 'react';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, type Mock } from 'vitest';
import { type MockRoutes, mockApi, renderWithProviders } from '@/test/render';
import { ScheduleFormDialog } from './schedule-form';

const schedule: MaintenanceSchedule = {
  id: 's1',
  vehicleId: 'v1',
  title: 'Neumáticos',
  category: 'tires',
  intervalMonths: 48,
  intervalDistance: 40_000,
  warnDays: 15,
  warnDistance: 2000,
  lastDoneDate: '2025-03-10',
  lastDoneOdometer: 120_000,
  nextDueDate: '2029-03-10',
  nextDueDateEstimated: false,
  nextDueOdometer: 160_000,
  status: 'ok',
  createdAt: '2025-03-10T10:00:00.000Z',
  updatedAt: '2025-03-10T10:00:00.000Z',
};

/** Owns the `open` state like the section does, so closing the dialog is observable. */
function Harness({ schedule }: { schedule?: MaintenanceSchedule }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Toaster />
      <ScheduleFormDialog vehicleId="v1" schedule={schedule} open={open} onOpenChange={setOpen} />
    </>
  );
}

function setup(
  routes: MockRoutes,
  { schedule, distanceUnit = 'km' }: { schedule?: MaintenanceSchedule; distanceUnit?: 'km' | 'mi' } = {},
) {
  const fetchMock = mockApi({
    'GET /settings': { body: { ...DEFAULT_USER_SETTINGS, distanceUnit } },
    ...routes,
  });
  return { fetchMock, ...renderWithProviders(<Harness schedule={schedule} />) };
}

/** Bodies of the requests sent with `method` to `path` (relative to `/api`). */
const requests = (fetchMock: Mock<typeof fetch>, method: string, path: string) =>
  fetchMock.mock.calls
    .filter(([url, init]) => String(url) === `/api${path}` && init?.method === method)
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : undefined));

const label = {
  title: 'Título',
  category: 'Categoría',
  intervalMonths: 'Cada (meses)',
  intervalDistance: 'Cada (km)',
  warnDays: 'Avisar con (días de antelación)',
  warnDistance: 'Avisar con (km de antelación)',
  lastDoneDate: 'Última vez (fecha)',
  lastDoneOdometer: 'Última vez (km)',
};

describe('ScheduleFormDialog', () => {
  // Sonner keeps toasts in a module-level store and replays the active ones to every new Toaster.
  afterEach(() => {
    toast.dismiss();
  });

  it('creates a schedule, closes the dialog and shows a toast', async () => {
    const { user, fetchMock } = setup({ 'POST /vehicles/v1/schedules': { status: 201, body: schedule } });

    expect(screen.getByRole('heading', { name: 'Añadir regla' })).toBeInTheDocument();
    expect(screen.getByLabelText(label.lastDoneDate)).toHaveAccessibleDescription(
      'Si lo dejas vacío, se cuenta desde la compra del vehículo.',
    );
    await user.type(screen.getByLabelText(label.title), 'Cambio de aceite');
    await user.type(screen.getByLabelText(label.intervalMonths), '12');
    await user.type(screen.getByLabelText(label.intervalDistance), '15.000');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Regla añadida')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requests(fetchMock, 'POST', '/vehicles/v1/schedules')).toEqual([
      {
        title: 'Cambio de aceite',
        category: 'oil_change',
        intervalMonths: 12,
        intervalDistance: 15_000,
        warnDays: 30,
        warnDistance: 1000,
      },
    ]);
  });

  it('shows field errors without calling the API', async () => {
    const { user, fetchMock } = setup({ 'POST /vehicles/v1/schedules': { status: 201, body: schedule } });

    await user.type(screen.getByLabelText(label.intervalMonths), 'doce');
    await user.clear(screen.getByLabelText(label.warnDays));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect((await screen.findAllByRole('alert')).map((alert) => alert.textContent)).toEqual([
      'Este campo es obligatorio.',
      'Introduce un número válido.',
      'Este campo es obligatorio.',
    ]);
    expect(screen.getByLabelText(label.title)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(label.intervalMonths)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(label.warnDays)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(label.intervalDistance)).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(requests(fetchMock, 'POST', '/vehicles/v1/schedules')).toEqual([]);
  });

  it('requires an interval in months or distance', async () => {
    const { user, fetchMock } = setup({ 'POST /vehicles/v1/schedules': { status: 201, body: schedule } });

    await user.type(screen.getByLabelText(label.title), 'ITV');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Indica un intervalo en meses o en km');
    expect(screen.getByLabelText(label.intervalMonths)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(label.intervalMonths)).toHaveAccessibleName(label.intervalMonths);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(requests(fetchMock, 'POST', '/vehicles/v1/schedules')).toEqual([]);
  });

  it('labels the distance fields with the user unit', async () => {
    const { user } = setup({}, { distanceUnit: 'mi' });

    expect(await screen.findByLabelText('Cada (mi)')).toBeInTheDocument();
    expect(screen.getByLabelText('Avisar con (mi de antelación)')).toBeInTheDocument();
    expect(screen.getByLabelText('Última vez (mi)')).toBeInTheDocument();
    expect(screen.queryByLabelText(label.intervalDistance)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(label.title), 'ITV');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Indica un intervalo en meses o en mi');
  });

  it('sends every field with PATCH when editing', async () => {
    const { user, fetchMock } = setup(
      { 'PATCH /vehicles/v1/schedules/s1': { body: { ...schedule, intervalMonths: null } } },
      { schedule },
    );

    expect(screen.getByRole('heading', { name: 'Editar regla' })).toBeInTheDocument();
    expect(screen.getByLabelText(label.title)).toHaveValue('Neumáticos');
    expect(screen.getByLabelText(label.category)).toHaveValue('tires');
    expect(screen.getByLabelText(label.intervalMonths)).toHaveValue('48');
    expect(screen.getByLabelText(label.lastDoneDate)).toHaveValue('2025-03-10');
    expect(
      screen.queryByText('Si lo dejas vacío, se cuenta desde la compra del vehículo.'),
    ).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText(label.intervalMonths));
    await user.clear(screen.getByLabelText(label.lastDoneOdometer));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Regla actualizada')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requests(fetchMock, 'PATCH', '/vehicles/v1/schedules/s1')).toEqual([
      {
        title: 'Neumáticos',
        category: 'tires',
        intervalMonths: null,
        intervalDistance: 40_000,
        warnDays: 15,
        warnDistance: 2000,
        lastDoneDate: '2025-03-10',
        lastDoneOdometer: null,
      },
    ]);
  });

  it('keeps the dialog open with the generic error when saving fails', async () => {
    const { user, fetchMock } = setup({
      'POST /vehicles/v1/schedules': {
        status: 500,
        body: { type: 'about:blank', title: 'Internal Server Error', status: 500 },
      },
    });

    await user.type(screen.getByLabelText(label.title), 'ITV');
    await user.type(screen.getByLabelText(label.intervalMonths), '24');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo ha ido mal');
    expect(requests(fetchMock, 'POST', '/vehicles/v1/schedules')).toHaveLength(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(label.title)).toHaveValue('ITV');
    expect(screen.queryByText('Regla añadida')).not.toBeInTheDocument();
  });
});
