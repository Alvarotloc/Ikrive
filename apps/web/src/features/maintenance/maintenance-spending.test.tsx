import { DEFAULT_USER_SETTINGS, type MaintenanceRecord } from '@ikrive/shared';
import { screen, within } from '@testing-library/react';
import { Suspense } from 'react';
import { describe, expect, it } from 'vitest';
import { type MockRoutes, mockApi, renderWithProviders } from '@/test/render';
import { MaintenanceSpendingMetric } from './maintenance-spending';
import { MaintenanceSection } from './maintenance-timeline';

// Testing Library normalizes the rendered text (the non-breaking space before the symbol becomes a
// plain one), so does `money`.
const money = (value: number, currency = 'EUR') =>
  new Intl.NumberFormat('es', { style: 'currency', currency }).format(value).replace(/\s/g, ' ');

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

function setup(routes: MockRoutes, { withSection = false } = {}) {
  const fetchMock = mockApi({ 'GET /settings': { body: DEFAULT_USER_SETTINGS }, ...routes });
  const rendered = renderWithProviders(
    <Suspense fallback={null}>
      <MaintenanceSpendingMetric vehicleId="v1" />
      {withSection && <MaintenanceSection vehicle={{ id: 'v1', status: 'active' }} />}
    </Suspense>,
  );
  return { fetchMock, ...rendered };
}

/** The metric card, found by its label. */
const metric = async () => (await screen.findByText('Gasto en mantenimiento')).closest('div') as HTMLElement;

describe('MaintenanceSpendingMetric', () => {
  it("shows the spending in the user's currency", async () => {
    setup({
      'GET /settings': { body: { ...DEFAULT_USER_SETTINGS, currency: 'USD' } },
      'GET /vehicles/v1/maintenance/spending': { body: { total: 1234.5 } },
    });

    const card = await metric();
    expect(await within(card).findByText(money(1234.5, 'USD'))).toBeInTheDocument();
    expect(card).not.toHaveTextContent('€');
  });

  it('shows zero as an amount', async () => {
    setup({ 'GET /vehicles/v1/maintenance/spending': { body: { total: 0 } } });

    const card = await metric();
    expect(within(card).getByText('0,00 €')).toBeInTheDocument();
    expect(card).not.toHaveTextContent('—');
  });

  it('refreshes the spending after deleting a record', async () => {
    const oil = record({ id: 'oil', title: 'Cambio de aceite', cost: 89.9 });
    const tires = record({
      id: 'tires',
      date: '2024-06-01',
      category: 'tires',
      title: 'Neumáticos',
      cost: 400,
    });
    let records = [oil, tires];
    const { user } = setup(
      {
        'GET /vehicles/v1/maintenance': () => ({ body: records }),
        'GET /vehicles/v1/maintenance/spending': () => ({
          body: { total: records.reduce((sum, r) => sum + (r.cost ?? 0), 0) },
        }),
        'DELETE /vehicles/v1/maintenance/tires': () => {
          records = [oil];
          return { status: 204 };
        },
      },
      { withSection: true },
    );

    const card = await metric();
    expect(within(card).getByText(money(489.9))).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Eliminar «Neumáticos»' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }));

    expect(await within(card).findByText(money(89.9))).toBeInTheDocument();
    expect(within(card).queryByText(money(489.9))).not.toBeInTheDocument();
  });
});
