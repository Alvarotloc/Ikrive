import { DEFAULT_USER_SETTINGS, type Expense, type Vehicle } from '@ikrive/shared';
import { useQuery } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import { Suspense } from 'react';
import { Toaster, toast } from 'sonner';
import { afterEach, describe, expect, it, type Mock } from 'vitest';
import { statsQuery } from '@/features/stats/queries';
import i18n from '@/i18n';
import { type MockRoutes, mockApi, renderWithProviders } from '@/test/render';
import { ExpensesSection } from './expenses-section';

type ExpenseVehicle = Pick<Vehicle, 'id' | 'status'>;

const car: ExpenseVehicle = { id: 'v1', status: 'active' };

const expense = (overrides: Partial<Expense>): Expense => ({
  id: 'e1',
  vehicleId: 'v1',
  date: '2025-03-10',
  category: 'insurance',
  title: null,
  description: null,
  cost: 420,
  createdAt: '2025-03-10T10:00:00.000Z',
  updatedAt: '2025-03-10T10:00:00.000Z',
  ...overrides,
});

const insurance = expense({ id: 'insurance', title: 'Seguro a todo riesgo', cost: 512.3 });
const tolls = expense({ id: 'tolls', date: '2025-06-02', category: 'tolls', cost: 14.6 });
const other = expense({ id: 'other', date: '2025-09-01', category: 'other', title: 'Lavado', cost: 12 });
// Same day as `tolls`, created later: listed before it.
const parking = expense({
  id: 'parking',
  date: '2025-06-02',
  category: 'parking',
  cost: 3.5,
  createdAt: '2025-06-02T18:00:00.000Z',
});

// Same formatters as `useFormat` with DEFAULT_USER_SETTINGS (km, EUR) in Spanish. Testing Library
// normalizes the rendered text (the non-breaking space before "€" becomes a plain one), so does `money`.
const money = (value: number) =>
  new Intl.NumberFormat('es', { style: 'currency', currency: 'EUR' }).format(value).replace(/\s/g, ' ');
const date = (iso: string) =>
  new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );

/** The statistics of the vehicle page, observed next to the section so their refetch can be counted. */
function StatsObserver() {
  useQuery(statsQuery('v1'));
  return null;
}

function setup(routes: MockRoutes, vehicle: Partial<ExpenseVehicle> = {}, { withStats = false } = {}) {
  const fetchMock = mockApi({ 'GET /settings': { body: DEFAULT_USER_SETTINGS }, ...routes });
  const rendered = renderWithProviders(
    <>
      <Toaster />
      {withStats && <StatsObserver />}
      <Suspense fallback={null}>
        <ExpensesSection vehicle={{ ...car, ...vehicle }} />
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
const names = () => rows().map((row) => row.querySelector('strong')?.textContent);
const chip = (name: string) =>
  within(screen.getByRole('navigation', { name: 'Filtrar por categoría' })).getByRole('button', { name });

describe('ExpensesSection', () => {
  // Sonner keeps toasts in a module-level store and replays the active ones to every new Toaster.
  afterEach(() => {
    toast.dismiss();
  });

  it("lists the vehicle's expenses newest first", async () => {
    setup({ 'GET /vehicles/v1/expenses': { body: [insurance, tolls, other, parking] } });

    expect(await screen.findByRole('heading', { name: 'Otros gastos' })).toBeInTheDocument();
    expect(names()).toEqual(['Lavado', 'Parking', 'Peajes', 'Seguro a todo riesgo']);
  });

  it('shows category, title or category name, date and amount of each expense', async () => {
    setup({ 'GET /vehicles/v1/expenses': { body: [insurance, tolls] } });

    await screen.findByRole('heading', { name: 'Otros gastos' });
    const [first, second] = rows() as [HTMLElement, HTMLElement];
    // Without a title, the category names the expense.
    expect(
      within(first)
        .getAllByText('Peajes')
        .map((element) => element.tagName),
    ).toEqual(['SPAN', 'STRONG']);
    expect(first).toHaveTextContent(`${date('2025-06-02')} · ${money(14.6)}`);
    expect(within(second).getByText('Seguro')).toBeInTheDocument();
    expect(within(second).getByText('Seguro a todo riesgo', { selector: 'strong' })).toBeInTheDocument();
    expect(second).toHaveTextContent(`${date('2025-03-10')} · ${money(512.3)}`);
  });

  it('shows the empty message without filter when there are no expenses', async () => {
    setup({ 'GET /vehicles/v1/expenses': { body: [] } });

    expect(await screen.findByText('Todavía no hay gastos registrados.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('offers only the present categories and filters the list', async () => {
    const { user } = setup({ 'GET /vehicles/v1/expenses': { body: [other, tolls, insurance, parking] } });

    const nav = await screen.findByRole('navigation', { name: 'Filtrar por categoría' });
    expect(
      within(nav)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Todas', 'Seguro', 'Peajes', 'Parking', 'Varios']);
    expect(chip('Todas')).toHaveAttribute('aria-pressed', 'true');

    await user.click(chip('Peajes'));

    expect(chip('Peajes')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Todas')).toHaveAttribute('aria-pressed', 'false');
    expect(names()).toEqual(['Peajes']);

    await user.click(chip('Todas'));
    expect(names()).toHaveLength(4);
  });

  it('falls back to all when the filtered category loses its last expense', async () => {
    let expenses = [insurance, tolls];
    const { user } = setup({
      'GET /vehicles/v1/expenses': () => ({ body: expenses }),
      'DELETE /vehicles/v1/expenses/tolls': () => {
        expenses = [insurance];
        return { status: 204 };
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Peajes' }));
    expect(names()).toEqual(['Peajes']);

    await user.click(screen.getByRole('button', { name: `Eliminar «Peajes» del ${date('2025-06-02')}` }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText('Seguro a todo riesgo')).toBeInTheDocument();
    expect(chip('Todas')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Peajes' })).not.toBeInTheDocument();
    expect(names()).toEqual(['Seguro a todo riesgo']);
  });

  it('shows the add button only for active vehicles', async () => {
    const { user, unmount } = setup({ 'GET /vehicles/v1/expenses': { body: [] } });
    await user.click(await screen.findByRole('button', { name: 'Añadir gasto' }));
    expect(
      within(screen.getByRole('dialog')).getByRole('heading', { name: 'Añadir gasto' }),
    ).toBeInTheDocument();
    unmount();

    for (const status of ['sold', 'archived'] as const) {
      const rendered = setup({ 'GET /vehicles/v1/expenses': { body: [insurance] } }, { status });
      expect(await screen.findByRole('heading', { name: 'Otros gastos' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Añadir gasto' })).not.toBeInTheDocument();
      // Editing and deleting stay available.
      const name = `«Seguro a todo riesgo» del ${date('2025-03-10')}`;
      expect(screen.getByRole('button', { name: `Editar ${name}` })).toBeEnabled();
      expect(screen.getByRole('button', { name: `Eliminar ${name}` })).toBeEnabled();
      rendered.unmount();
    }
  });

  it('opens the form prefilled when editing an expense', async () => {
    const { user } = setup({ 'GET /vehicles/v1/expenses': { body: [insurance, tolls] } });

    await user.click(
      await screen.findByRole('button', { name: `Editar «Peajes» del ${date('2025-06-02')}` }),
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Editar gasto' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Fecha')).toHaveValue('2025-06-02');
    expect(within(dialog).getByLabelText('Categoría')).toHaveValue('tolls');
    expect(within(dialog).getByLabelText('Título')).toHaveValue('');
    expect(await within(dialog).findByLabelText('Importe (EUR)')).toHaveValue('14.6');
  });

  it('deletes an expense only after confirming', async () => {
    let expenses = [insurance, tolls];
    const { user, fetchMock } = setup({
      'GET /vehicles/v1/expenses': () => ({ body: expenses }),
      'DELETE /vehicles/v1/expenses/tolls': () => {
        expenses = [insurance];
        return { status: 204 };
      },
    });
    const deleteLabel = `Eliminar «Peajes» del ${date('2025-06-02')}`;

    await user.click(await screen.findByRole('button', { name: deleteLabel }));
    const confirm = screen.getByRole('alertdialog');
    expect(confirm).toHaveTextContent(`¿Eliminar «Peajes» del ${date('2025-06-02')}?`);
    await user.click(within(confirm).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(calls(fetchMock, 'DELETE', '/vehicles/v1/expenses/tolls')).toHaveLength(0);
    expect(rows()).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: deleteLabel }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText('Gasto eliminado')).toBeInTheDocument();
    expect(calls(fetchMock, 'DELETE', '/vehicles/v1/expenses/tolls')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: deleteLabel })).not.toBeInTheDocument();
    expect(rows()).toHaveLength(1);
  });

  it('shows the generic error when deleting fails', async () => {
    const { user } = setup({
      'GET /vehicles/v1/expenses': { body: [insurance] },
      'DELETE /vehicles/v1/expenses/insurance': {
        status: 500,
        body: { type: 'about:blank', title: 'Error', status: 500 },
      },
    });

    await user.click(
      await screen.findByRole('button', {
        name: `Eliminar «Seguro a todo riesgo» del ${date('2025-03-10')}`,
      }),
    );
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText(i18n.t('common.error'))).toBeInTheDocument();
    expect(names()).toEqual(['Seguro a todo riesgo']);
  });

  it('refreshes the list and the stats after saving', async () => {
    let expenses = [insurance];
    const { user, fetchMock } = setup(
      {
        'GET /vehicles/v1/expenses': () => ({ body: expenses }),
        'GET /vehicles/v1/stats': { body: {} },
        'POST /vehicles/v1/expenses': () => {
          expenses = [insurance, tolls];
          return { status: 201, body: tolls };
        },
      },
      {},
      { withStats: true },
    );

    await user.click(await screen.findByRole('button', { name: 'Añadir gasto' }));
    await user.selectOptions(screen.getByLabelText('Categoría'), 'tolls');
    await user.type(await screen.findByLabelText('Importe (EUR)'), '14,60');
    expect(calls(fetchMock, 'GET', '/vehicles/v1/expenses')).toHaveLength(1);
    expect(calls(fetchMock, 'GET', '/vehicles/v1/stats')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Gasto añadido')).toBeInTheDocument();
    expect(await screen.findByText('Peajes', { selector: 'strong' })).toBeInTheDocument();
    expect(calls(fetchMock, 'GET', '/vehicles/v1/expenses')).toHaveLength(2);
    await waitFor(() => expect(calls(fetchMock, 'GET', '/vehicles/v1/stats')).toHaveLength(2));
  });
});
