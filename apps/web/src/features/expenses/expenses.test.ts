import type { Expense } from '@ikrive/shared';
import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import {
  availableExpenseCategories,
  expenseName,
  filterExpenses,
  resolveExpenseFilter,
  sortExpenses,
} from './expenses';

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

const ids = (expenses: Expense[]) => expenses.map((e) => e.id);

describe('expenses list', () => {
  it('sorts by date and creation time, newest first', () => {
    const expenses = [
      expense({ id: 'old', date: '2024-05-01' }),
      expense({ id: 'same-early', date: '2025-06-01', createdAt: '2025-06-01T08:00:00.000Z' }),
      expense({ id: 'same-late', date: '2025-06-01', createdAt: '2025-06-01T18:00:00.000Z' }),
      expense({ id: 'mid', date: '2025-01-15' }),
    ];

    expect(ids(sortExpenses(expenses))).toEqual(['same-late', 'same-early', 'mid', 'old']);
    // The input is left untouched.
    expect(ids(expenses)).toEqual(['old', 'same-early', 'same-late', 'mid']);
  });

  it('lists present categories in canonical order', () => {
    const expenses = [
      expense({ id: 'a', category: 'other' }),
      expense({ id: 'b', category: 'tolls' }),
      expense({ id: 'c', category: 'insurance' }),
      expense({ id: 'd', category: 'tolls' }),
    ];

    expect(availableExpenseCategories(expenses)).toEqual(['insurance', 'tolls', 'other']);
    expect(availableExpenseCategories([])).toEqual([]);
    expect(ids(filterExpenses(expenses, 'tolls'))).toEqual(['b', 'd']);
    expect(ids(filterExpenses(expenses, 'all'))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('falls back to all when the category has no expenses', () => {
    expect(resolveExpenseFilter('tolls', ['insurance', 'tolls'])).toBe('tolls');
    expect(resolveExpenseFilter('fines', ['insurance', 'tolls'])).toBe('all');
    expect(resolveExpenseFilter('all', [])).toBe('all');
  });

  it('names an expense by its title or its category', () => {
    expect(expenseName(expense({ title: 'Seguro a todo riesgo' }), i18n.t)).toBe('Seguro a todo riesgo');
    expect(expenseName(expense({ category: 'insurance' }), i18n.t)).toBe('Seguro');
    expect(expenseName(expense({ category: 'other' }), i18n.t)).toBe('Varios');
  });
});
