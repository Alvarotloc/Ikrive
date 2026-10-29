import { describe, expect, it } from 'vitest';
import {
  averageConsumption,
  computeVehicleStats,
  consumptionSegments,
  costPerDistance,
  distanceByMonth,
  distanceDriven,
  type StatsFuelLog,
  type StatsMaintenanceRecord,
  spendingByCategory,
  spendingByMonth,
} from './stats';

const refuel = (
  date: string,
  odometer: number,
  quantity: number,
  options: Partial<StatsFuelLog> = {},
): StatsFuelLog => ({
  date,
  odometer,
  quantity,
  totalPrice: 50,
  fullTank: true,
  missedPrevious: false,
  ...options,
});

const maintenance = (
  date: string,
  category: StatsMaintenanceRecord['category'],
  cost: number | null,
): StatsMaintenanceRecord => ({ date, category, cost });

describe('distance', () => {
  it('computes the distance driven', () => {
    expect(distanceDriven([])).toBeNull();
    expect(distanceDriven([{ date: '2025-01-01', value: 10_000 }])).toBeNull();
    expect(
      distanceDriven([
        { date: '2025-06-01', value: 14_000 },
        { date: '2025-01-01', value: 10_000 },
        { date: '2025-06-01', value: 14_500 },
        { date: '2025-03-01', value: 12_000 },
      ]),
    ).toBe(4_500);
  });

  it('spreads the distance by month', () => {
    expect(
      distanceByMonth([
        { date: '2025-03-01', value: 15_900 },
        { date: '2025-01-01', value: 10_000 },
      ]),
    ).toEqual([
      { month: '2025-01', distance: 3_100 },
      { month: '2025-02', distance: 2_800 },
      { month: '2025-03', distance: 0 },
    ]);

    const midMonth = [
      { date: '2024-11-17', value: 1_000 },
      { date: '2025-02-20', value: 2_513 },
      { date: '2025-02-25', value: 2_600 },
      { date: '2025-05-10', value: 7_777 },
    ];
    const series = distanceByMonth(midMonth);
    expect(series.map((point) => point.month)).toEqual([
      '2024-11',
      '2024-12',
      '2025-01',
      '2025-02',
      '2025-03',
      '2025-04',
      '2025-05',
    ]);
    expect(series.every((point) => Number.isInteger(point.distance) && point.distance >= 0)).toBe(true);
    expect(series.reduce((total, point) => total + point.distance, 0)).toBe(distanceDriven(midMonth));
  });

  it('returns no monthly distance without two readings', () => {
    expect(distanceByMonth([])).toEqual([]);
    expect(distanceByMonth([{ date: '2025-01-01', value: 10_000 }])).toEqual([]);
  });
});

describe('consumption', () => {
  it('computes consumption between full tanks', () => {
    const logs = [
      refuel('2025-02-10', 10_800, 25),
      refuel('2025-01-05', 9_700, 15, { fullTank: false }),
      refuel('2025-01-10', 10_000, 40),
      refuel('2025-01-25', 10_300, 20, { fullTank: false }),
    ];
    expect(consumptionSegments(logs)).toEqual([
      { startDate: '2025-01-10', endDate: '2025-02-10', distance: 800, quantity: 45, consumption: 5.63 },
    ]);
    expect(averageConsumption(logs)).toBe(5.63);
  });

  it('skips segments with a missed refuel', () => {
    const logs = [
      refuel('2025-01-10', 10_000, 40),
      refuel('2025-01-20', 10_300, 20, { fullTank: false, missedPrevious: true }),
      refuel('2025-02-10', 10_800, 25),
      refuel('2025-03-10', 11_400, 30, { missedPrevious: true }),
      refuel('2025-04-10', 12_000, 36),
    ];
    expect(consumptionSegments(logs)).toEqual([
      { startDate: '2025-03-10', endDate: '2025-04-10', distance: 600, quantity: 36, consumption: 6 },
    ]);
    expect(averageConsumption(logs)).toBe(6);
  });

  it('skips segments without distance', () => {
    const logs = [
      refuel('2025-01-10', 10_000, 40),
      refuel('2025-01-10', 10_000, 2),
      refuel('2025-02-10', 10_500, 30),
    ];
    expect(consumptionSegments(logs)).toEqual([
      { startDate: '2025-01-10', endDate: '2025-02-10', distance: 500, quantity: 30, consumption: 6 },
    ]);
    expect(
      averageConsumption([refuel('2025-01-10', 10_000, 40), refuel('2025-01-11', 10_000, 2)]),
    ).toBeNull();
  });

  it('weights the average consumption by distance', () => {
    const logs = [
      refuel('2025-01-01', 10_000, 40),
      refuel('2025-01-02', 10_100, 10),
      refuel('2025-02-01', 11_000, 45),
    ];
    expect(consumptionSegments(logs).map((segment) => segment.consumption)).toEqual([10, 5]);
    expect(averageConsumption(logs)).toBe(5.5);
  });

  it('returns null consumption without two full tanks', () => {
    expect(averageConsumption([])).toBeNull();
    const oneFull = [
      refuel('2025-01-01', 10_000, 40),
      refuel('2025-01-10', 10_300, 20, { fullTank: false }),
      refuel('2025-01-20', 10_600, 20, { fullTank: false }),
    ];
    expect(averageConsumption(oneFull)).toBeNull();
    expect(consumptionSegments(oneFull)).toEqual([]);
  });
});

describe('costs', () => {
  it('computes the cost per distance', () => {
    const stats = computeVehicleStats({
      purchasePrice: null,
      readings: [
        { date: '2025-01-01', value: 10_000 },
        { date: '2025-07-01', value: 13_000 },
      ],
      fuelLogs: [
        refuel('2025-02-01', 10_500, 40, { totalPrice: 60.1 }),
        refuel('2025-03-01', 11_000, 30, { totalPrice: 45.2 }),
      ],
      maintenance: [maintenance('2025-04-01', 'oil_change', 120), maintenance('2025-05-01', 'tires', null)],
    });
    expect(stats.costPerDistance).toEqual({ fuel: 0.035, maintenance: 0.04 });
    expect(costPerDistance(100, 3_000)).toBe(0.033);
  });

  it('returns null cost per distance without distance', () => {
    expect(costPerDistance(100, null)).toBeNull();
    expect(costPerDistance(100, 0)).toBeNull();
    const base = { purchasePrice: null, fuelLogs: [refuel('2025-01-01', 10_000, 40)], maintenance: [] };
    expect(computeVehicleStats({ ...base, readings: [] }).costPerDistance).toEqual({
      fuel: null,
      maintenance: null,
    });
    const stopped = [
      { date: '2025-01-01', value: 10_000 },
      { date: '2025-03-01', value: 10_000 },
    ];
    expect(computeVehicleStats({ ...base, readings: stopped }).costPerDistance).toEqual({
      fuel: null,
      maintenance: null,
    });
  });

  it('computes the total cost of ownership', () => {
    const input = {
      readings: [],
      fuelLogs: [
        refuel('2025-01-01', 10_000, 40, { totalPrice: 0.1 }),
        refuel('2025-02-01', 10_500, 30, { totalPrice: 0.2 }),
      ],
      maintenance: [maintenance('2025-03-01', 'repair', 10.1), maintenance('2025-04-01', 'brakes', 20.2)],
    };
    expect(computeVehicleStats({ ...input, purchasePrice: 15_000 }).spending).toMatchObject({
      purchase: 15_000,
      fuel: 0.3,
      maintenance: 30.3,
      total: 15_030.6,
    });
    expect(computeVehicleStats({ ...input, purchasePrice: null }).spending).toMatchObject({
      purchase: null,
      fuel: 0.3,
      maintenance: 30.3,
      total: 30.6,
    });
  });

  it('groups maintenance spending by category', () => {
    expect(
      spendingByCategory([
        maintenance('2025-01-01', 'oil_change', 10.1),
        maintenance('2025-02-01', 'tires', 400),
        maintenance('2025-03-01', 'oil_change', 20.2),
        maintenance('2025-04-01', 'repair', null),
        maintenance('2025-05-01', 'inspection', 0),
      ]),
    ).toEqual([
      { category: 'tires', total: 400 },
      { category: 'oil_change', total: 30.3 },
      { category: 'inspection', total: 0 },
    ]);
  });

  it('spreads spending by month', () => {
    expect(spendingByMonth([], [maintenance('2025-01-01', 'repair', null)])).toEqual([]);
    expect(
      spendingByMonth(
        [
          refuel('2025-03-20', 11_000, 30, { totalPrice: 0.2 }),
          refuel('2024-12-05', 10_000, 40, { totalPrice: 60 }),
          refuel('2025-03-02', 10_500, 30, { totalPrice: 0.1 }),
        ],
        [
          maintenance('2025-01-15', 'oil_change', 89.9),
          maintenance('2025-03-10', 'tires', 300),
          maintenance('2025-06-10', 'repair', null),
        ],
      ),
    ).toEqual([
      { month: '2024-12', fuel: 60, maintenance: 0 },
      { month: '2025-01', fuel: 0, maintenance: 89.9 },
      { month: '2025-02', fuel: 0, maintenance: 0 },
      { month: '2025-03', fuel: 0.3, maintenance: 300 },
    ]);
  });
});

/** Every number in a value, at any depth. */
function numbersIn(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbersIn);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(numbersIn);
  return [];
}

describe('computeVehicleStats', () => {
  it('never returns NaN or Infinity with zero quantities or prices', () => {
    // Rows as the API stores them, `pricePerUnit` included (0 after rounding in `resolveFuelPrices`).
    const rows = [
      { ...refuel('2025-01-01', 10_000, 0, { totalPrice: 0 }), pricePerUnit: 0 },
      { ...refuel('2025-01-01', 10_000, 0, { totalPrice: 0 }), pricePerUnit: 0 },
      { ...refuel('2025-02-01', 10_400, 0, { totalPrice: 0.01 }), pricePerUnit: 0 },
      { ...refuel('2025-03-01', 10_800, 30, { totalPrice: 0 }), pricePerUnit: 0 },
    ];
    const stats = computeVehicleStats({
      purchasePrice: 0,
      readings: [
        { date: '2025-01-01', value: 10_000 },
        { date: '2025-01-01', value: 10_000 },
      ],
      fuelLogs: rows,
      maintenance: [maintenance('2025-01-01', 'other', 0)],
    });
    const numbers = numbersIn(stats);
    expect(numbers.length).toBeGreaterThan(0);
    expect(numbers.every(Number.isFinite)).toBe(true);
    expect(stats.distance).toEqual({ driven: 0, perYear: null, perMonth: null });
    expect(stats.costPerDistance).toEqual({ fuel: null, maintenance: null });
    expect(stats.consumption.average).toBe(3.75);
    expect(stats.series.consumptionBySegment).toEqual([
      { startDate: '2025-01-01', endDate: '2025-02-01', distance: 400, quantity: 0, consumption: 0 },
      { startDate: '2025-02-01', endDate: '2025-03-01', distance: 400, quantity: 30, consumption: 7.5 },
    ]);
  });
});
