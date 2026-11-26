import type { VehicleStats } from '@ikrive/shared';
import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { categorySpendingRows } from './category-spending';

const spending = (overrides: Partial<VehicleStats['spending']> = {}): VehicleStats['spending'] => ({
  purchase: null,
  fuel: 0,
  maintenance: 0,
  expenses: 0,
  total: 0,
  byCategory: [],
  expensesByCategory: [],
  ...overrides,
});

describe('categorySpendingRows', () => {
  it('merges maintenance and expense categories by total, highest first', () => {
    const rows = categorySpendingRows(
      spending({
        byCategory: [
          { category: 'tires', total: 480 },
          { category: 'oil_change', total: 120 },
        ],
        expensesByCategory: [
          { category: 'insurance', total: 512.3 },
          { category: 'tolls', total: 120 },
          { category: 'parking', total: 3.5 },
        ],
      }),
      i18n.t,
    );

    // On a tie (120) maintenance goes first.
    expect(rows.map((row) => row.name)).toEqual(['Seguro', 'Neumáticos', 'Aceite', 'Peajes', 'Parking']);
    expect(rows[0]).toEqual({ key: 'expense:insurance', name: 'Seguro', maintenance: null, expenses: 512.3 });
    expect(rows[1]).toEqual({
      key: 'maintenance:tires',
      name: 'Neumáticos',
      maintenance: 480,
      expenses: null,
    });
  });

  it('keys and labels each row in its own namespace', () => {
    const rows = categorySpendingRows(
      spending({
        byCategory: [{ category: 'other', total: 50 }],
        expensesByCategory: [{ category: 'other', total: 40 }],
      }),
      i18n.t,
    );

    expect(rows).toEqual([
      { key: 'maintenance:other', name: 'Otros', maintenance: 50, expenses: null },
      { key: 'expense:other', name: 'Varios', maintenance: null, expenses: 40 },
    ]);
  });

  it('returns no rows without spending', () => {
    expect(categorySpendingRows(spending(), i18n.t)).toEqual([]);
  });
});
