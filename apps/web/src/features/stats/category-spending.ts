import type { VehicleStats } from '@ikrive/shared';
import type { TFunction } from 'i18next';

/** A bar of «Spending per category»: a maintenance or an expense category, with its amount in its own series. */
export interface CategorySpendingRow {
  /** `maintenance:<category>` or `expense:<category>`: both have an `other`. */
  key: string;
  name: string;
  maintenance: number | null;
  expenses: number | null;
}

/**
 * Maintenance and expense categories together, highest total first. On a tie the order is stable, so
 * maintenance goes first. The other series is `null`, so the tooltip leaves it out.
 */
export function categorySpendingRows(
  spending: VehicleStats['spending'],
  t: TFunction,
): CategorySpendingRow[] {
  const rows: (CategorySpendingRow & { total: number })[] = [
    ...spending.byCategory.map(({ category, total }) => ({
      key: `maintenance:${category}`,
      name: t(`maintenance.categories.${category}`),
      maintenance: total,
      expenses: null,
      total,
    })),
    ...spending.expensesByCategory.map(({ category, total }) => ({
      key: `expense:${category}`,
      name: t(`expenses.categories.${category}`),
      maintenance: null,
      expenses: total,
      total,
    })),
  ];
  return rows.sort((a, b) => b.total - a.total).map(({ total: _total, ...row }) => row);
}
