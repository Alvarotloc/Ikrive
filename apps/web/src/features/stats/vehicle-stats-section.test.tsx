import { DEFAULT_USER_SETTINGS, type FuelType, type VehicleStats } from '@ikrive/shared';
import { screen, within } from '@testing-library/react';
import { Suspense } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type MockRoutes, mockApi, renderWithProviders } from '@/test/render';
import { VehicleStatsSection } from './vehicle-stats-section';

// Testing Library normalizes the rendered text (the non-breaking space before the symbol becomes a
// plain one), so does `money`.
const money = (value: number, currency = 'EUR', fractionDigits?: { min: number; max: number }) =>
  new Intl.NumberFormat('es', {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits?.min,
    maximumFractionDigits: fractionDigits?.max,
  })
    .format(value)
    .replace(/\s/g, ' ');

const imperial = {
  ...DEFAULT_USER_SETTINGS,
  distanceUnit: 'mi',
  volumeUnit: 'gal',
  currency: 'USD',
} as const;

const withData: VehicleStats = {
  distance: { driven: 12_000, perYear: 14_600, perMonth: 1_217 },
  consumption: { average: 6.54 },
  costPerDistance: { fuel: 0.085, maintenance: 0.0412 },
  spending: {
    purchase: 18_000,
    fuel: 1_020.5,
    maintenance: 494.4,
    total: 19_514.9,
    byCategory: [
      { category: 'tires', total: 400 },
      { category: 'oil_change', total: 94.4 },
    ],
  },
  series: {
    distanceByMonth: [
      { month: '2025-01', distance: 1_100 },
      { month: '2025-02', distance: 1_300 },
    ],
    consumptionBySegment: [
      { startDate: '2025-01-05', endDate: '2025-02-01', distance: 640, quantity: 41.2, consumption: 6.44 },
      { startDate: '2025-02-01', endDate: '2025-03-01', distance: 700, quantity: 46.5, consumption: 6.64 },
    ],
    spendingByMonth: [
      { month: '2025-01', fuel: 60, maintenance: 94.4 },
      { month: '2025-02', fuel: 70, maintenance: 0 },
    ],
  },
};

/** A vehicle with no readings, refuels nor maintenance, only a purchase price. */
const withoutData: VehicleStats = {
  distance: { driven: null, perYear: null, perMonth: null },
  consumption: { average: null },
  costPerDistance: { fuel: null, maintenance: null },
  spending: { purchase: 18_000, fuel: 0, maintenance: 0, total: 18_000, byCategory: [] },
  series: { distanceByMonth: [], consumptionBySegment: [], spendingByMonth: [] },
};

function setup(
  stats: VehicleStats,
  { fuelType = 'gasoline', routes = {} }: { fuelType?: FuelType; routes?: MockRoutes } = {},
) {
  const fetchMock = mockApi({
    'GET /settings': { body: DEFAULT_USER_SETTINGS },
    'GET /vehicles/v1/stats': { body: stats },
    ...routes,
  });
  const rendered = renderWithProviders(
    <Suspense fallback={null}>
      <VehicleStatsSection vehicle={{ id: 'v1', fuelType }} />
    </Suspense>,
  );
  return { fetchMock, ...rendered };
}

/** A key figure card, found by its label. */
const metric = async (label: string) => (await screen.findByText(label)).closest('div') as HTMLElement;

const chartNames = ['Distancia por mes', 'Consumo por tramo', 'Gasto por mes', 'Gasto por categoría'];

beforeEach(() => {
  // jsdom has no layout: every element measures 0×0, so Recharts' ResponsiveContainer would draw
  // nothing. This ResizeObserver reports a chart-sized box instead (the setup unstubs it).
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(
        private readonly callback: (entries: { contentRect: { width: number; height: number } }[]) => void,
      ) {}
      observe() {
        this.callback([{ contentRect: { width: 480, height: 240 } }]);
      }
      unobserve() {}
      disconnect() {}
    },
  );
});

describe('VehicleStatsSection', () => {
  it("shows the key figures in the user's units and currency", async () => {
    const { fetchMock } = setup(withData, { routes: { 'GET /settings': { body: imperial } } });

    expect(await within(await metric('Distancia al año')).findByText('14.600 mi')).toBeInTheDocument();
    expect(await within(await metric('Consumo medio')).findByText('6,54 gal/100 mi')).toBeInTheDocument();
    expect(
      await within(await metric('Combustible por mi')).findByText(
        `${money(0.085, 'USD', { min: 2, max: 3 })}/mi`,
      ),
    ).toBeInTheDocument();
    expect(
      await within(await metric('Mantenimiento por mi')).findByText(
        `${money(0.041, 'USD', { min: 2, max: 3 })}/mi`,
      ),
    ).toBeInTheDocument();

    const total = await metric('Coste total');
    expect(await within(total).findByText(money(19_514.9, 'USD'))).toBeInTheDocument();
    expect(
      within(total).getByText(
        `Compra ${money(18_000, 'USD')} · combustible ${money(1_020.5, 'USD')} · mantenimiento ${money(494.4, 'USD')}`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Estadísticas' })).toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();

    const requested = fetchMock.mock.calls.map(([input]) => new URL(String(input), location.origin).pathname);
    expect(requested).toContain('/api/vehicles/v1/stats');
  });

  it('shows the consumption of an electric vehicle in kWh', async () => {
    setup(withData, { fuelType: 'electric', routes: { 'GET /settings': { body: imperial } } });

    expect(await within(await metric('Consumo medio')).findByText('6,54 kWh/100 mi')).toBeInTheDocument();
  });

  it('explains what is missing for each empty figure', async () => {
    setup(withoutData);

    const perYear = await metric('Distancia al año');
    expect(within(perYear).getByText('—')).toBeInTheDocument();
    expect(
      within(perYear).getByText('Hacen falta lecturas del odómetro separadas al menos 30 días'),
    ).toBeInTheDocument();

    const consumption = await metric('Consumo medio');
    expect(within(consumption).getByText('—')).toBeInTheDocument();
    expect(
      within(consumption).getByText(
        'Hacen falta dos repostajes de depósito lleno sin repostajes olvidados entre ellos',
      ),
    ).toBeInTheDocument();

    for (const label of ['Combustible por km', 'Mantenimiento por km']) {
      const card = await metric(label);
      expect(within(card).getByText('—')).toBeInTheDocument();
      expect(
        within(card).getByText('Hacen falta al menos dos lecturas del odómetro con distancia recorrida'),
      ).toBeInTheDocument();
    }

    const total = await metric('Coste total');
    expect(within(total).getByText(money(18_000))).toBeInTheDocument();
    expect(total).not.toHaveTextContent('—');
  });

  it('leaves the purchase out of the total breakdown when there is no purchase price', async () => {
    setup({ ...withoutData, spending: { ...withoutData.spending, purchase: null, fuel: 50, total: 50 } });

    const total = await metric('Coste total');
    expect(within(total).getByText(money(50))).toBeInTheDocument();
    expect(
      within(total).getByText(`Combustible ${money(50)} · mantenimiento ${money(0)}`),
    ).toBeInTheDocument();
  });

  it('renders the four charts when there is data', async () => {
    setup(withData);

    for (const name of chartNames) {
      const figure = await screen.findByRole('figure', { name });
      expect(figure.querySelector('svg')).not.toBeNull();
      expect(figure).not.toHaveTextContent('Hace falta');
      expect(figure).not.toHaveTextContent('Hacen falta');
    }
    const categories = screen.getByRole('figure', { name: 'Gasto por categoría' });
    expect(within(categories).getByText('Neumáticos')).toBeInTheDocument();
    expect(within(categories).getByText('Aceite')).toBeInTheDocument();
  });

  it('explains what is missing for each empty chart', async () => {
    setup(withoutData);

    const empty = {
      'Distancia por mes': 'Hacen falta al menos dos lecturas del odómetro para ver la distancia por mes.',
      'Consumo por tramo':
        'Hacen falta dos repostajes de depósito lleno sin repostajes olvidados entre ellos para ver el consumo.',
      'Gasto por mes': 'Hace falta un repostaje o un mantenimiento con coste para ver el gasto por mes.',
      'Gasto por categoría': 'Hace falta un mantenimiento con coste para ver el gasto por categoría.',
    };
    for (const [name, text] of Object.entries(empty)) {
      const figure = await screen.findByRole('figure', { name });
      expect(within(figure).getByText(text)).toBeInTheDocument();
      expect(figure.querySelector('svg')).toBeNull();
    }
  });
});
