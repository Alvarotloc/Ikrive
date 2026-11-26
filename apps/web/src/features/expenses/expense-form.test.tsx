import { DEFAULT_USER_SETTINGS, type Expense } from '@ikrive/shared';
import { screen } from '@testing-library/react';
import { useState } from 'react';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, type Mock } from 'vitest';
import i18n from '@/i18n';
import { todayIso } from '@/lib/format';
import { type MockRoutes, mockApi, renderWithProviders } from '@/test/render';
import { ExpenseFormDialog } from './expense-form';

const expense: Expense = {
  id: 'e1',
  vehicleId: 'v1',
  date: '2025-03-10',
  category: 'tax',
  title: 'Impuesto de circulación',
  description: 'Ayuntamiento',
  cost: 98.5,
  createdAt: '2025-03-10T10:00:00.000Z',
  updatedAt: '2025-03-10T10:00:00.000Z',
};

const problem = (status: number, extra: object = {}) => ({
  status,
  body: { type: 'about:blank', title: 'Error', status, ...extra },
});

/** Owns the `open` state like the section does, so closing the dialog is observable. */
function Harness({ expense }: { expense?: Expense }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Toaster />
      <ExpenseFormDialog vehicleId="v1" expense={expense} open={open} onOpenChange={setOpen} />
    </>
  );
}

function setup(routes: MockRoutes, options: { expense?: Expense } = {}) {
  const fetchMock = mockApi({ 'GET /settings': { body: DEFAULT_USER_SETTINGS }, ...routes });
  return { fetchMock, ...renderWithProviders(<Harness expense={options.expense} />) };
}

/** Requests sent with `method` to `path` (relative to `/api`), with their parsed JSON body. */
const requests = (fetchMock: Mock<typeof fetch>, method: string, path: string) =>
  fetchMock.mock.calls
    .filter(([url, init]) => String(url) === `/api${path}` && init?.method === method)
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : undefined));

const label = {
  date: 'Fecha',
  category: 'Categoría',
  title: 'Título',
  cost: 'Importe (EUR)',
  description: 'Descripción',
};

describe('ExpenseFormDialog', () => {
  // Sonner keeps toasts in a module-level store and replays the active ones to every new Toaster.
  afterEach(() => {
    toast.dismiss();
  });

  it('opens with today, insurance and empty fields', async () => {
    setup({});

    expect(screen.getByRole('heading', { name: 'Añadir gasto' })).toBeInTheDocument();
    expect(screen.getByLabelText(label.date)).toHaveValue(todayIso());
    expect(screen.getByLabelText(label.date)).toHaveAttribute('max', todayIso());
    expect(screen.getByLabelText(label.category)).toHaveValue('insurance');
    expect(screen.getByLabelText(label.title)).toHaveValue('');
    expect(screen.getByLabelText(label.description)).toHaveValue('');
    // The currency comes from the settings.
    expect(await screen.findByLabelText(label.cost)).toHaveValue('');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Seguro',
      'Impuestos',
      'Peajes',
      'Parking',
      'Multas',
      'Varios',
    ]);
  });

  it('creates an expense, closes the dialog and shows a toast', async () => {
    const { user, fetchMock } = setup({ 'POST /vehicles/v1/expenses': { status: 201, body: expense } });

    await user.clear(screen.getByLabelText(label.date));
    await user.type(screen.getByLabelText(label.date), '2025-03-10');
    await user.selectOptions(screen.getByLabelText(label.category), 'tolls');
    await user.type(screen.getByLabelText(label.title), 'Peaje AP-7');
    await user.type(await screen.findByLabelText(label.cost), '1.234,56');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Gasto añadido')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requests(fetchMock, 'POST', '/vehicles/v1/expenses')).toEqual([
      { date: '2025-03-10', category: 'tolls', title: 'Peaje AP-7', description: null, cost: 1234.56 },
    ]);
  });

  it('shows field errors without calling the API when the form is invalid', async () => {
    const { user, fetchMock } = setup({ 'POST /vehicles/v1/expenses': { status: 201, body: expense } });
    const cost = await screen.findByLabelText(label.cost);

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Este campo es obligatorio.');
    expect(cost).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(label.date)).toHaveAttribute('aria-invalid', 'false');

    await user.type(cost, '0');
    await user.type(screen.getByLabelText(label.title), 'x'.repeat(121));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect((await screen.findAllByRole('alert')).map((alert) => alert.textContent)).toEqual([
      i18n.t('validation.invalid'),
      'No puede superar los 120 caracteres.',
    ]);
    expect(cost).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(label.title)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(requests(fetchMock, 'POST', '/vehicles/v1/expenses')).toEqual([]);
  });

  it('prefills the form and sends every field with PATCH when editing', async () => {
    const { user, fetchMock } = setup(
      { 'PATCH /vehicles/v1/expenses/e1': { body: { ...expense, title: null } } },
      { expense },
    );

    expect(screen.getByRole('heading', { name: 'Editar gasto' })).toBeInTheDocument();
    expect(screen.getByLabelText(label.date)).toHaveValue('2025-03-10');
    expect(screen.getByLabelText(label.category)).toHaveValue('tax');
    expect(screen.getByLabelText(label.title)).toHaveValue('Impuesto de circulación');
    expect(screen.getByLabelText(label.description)).toHaveValue('Ayuntamiento');
    expect(await screen.findByLabelText(label.cost)).toHaveValue('98.5');

    await user.clear(screen.getByLabelText(label.title));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Gasto actualizado')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requests(fetchMock, 'PATCH', '/vehicles/v1/expenses/e1')).toEqual([
      { date: '2025-03-10', category: 'tax', title: null, description: 'Ayuntamiento', cost: 98.5 },
    ]);
  });

  it('shows the future-date error on the date field on a 400 without errors', async () => {
    const { user } = setup({
      'POST /vehicles/v1/expenses': problem(400, { detail: 'The expense date cannot be in the future' }),
    });

    await user.type(await screen.findByLabelText(label.cost), '50');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La fecha no puede ser futura.');
    expect(screen.getByLabelText(label.date)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the generic error when saving fails for another reason', async () => {
    const { user } = setup({ 'PATCH /vehicles/v1/expenses/e1': problem(500) }, { expense });

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('common.error'));
    expect(screen.getByLabelText(label.date)).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
