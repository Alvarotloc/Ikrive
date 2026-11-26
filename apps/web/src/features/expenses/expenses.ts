import { EXPENSE_CATEGORIES, type Expense, type ExpenseCategory } from '@ikrive/shared';
import type { TFunction } from 'i18next';

export type ExpenseCategoryFilter = ExpenseCategory | 'all';

/** Newest first: by date and, on the same day, by creation time. */
export function sortExpenses(expenses: Expense[]): Expense[] {
  return [...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

/** Categories present in the expenses, in the canonical `EXPENSE_CATEGORIES` order. */
export function availableExpenseCategories(expenses: Expense[]): ExpenseCategory[] {
  const present = new Set(expenses.map((expense) => expense.category));
  return EXPENSE_CATEGORIES.filter((category) => present.has(category));
}

/** Falls back to `all` when the selected category no longer has expenses. */
export function resolveExpenseFilter(
  selected: ExpenseCategoryFilter,
  available: ExpenseCategory[],
): ExpenseCategoryFilter {
  return selected === 'all' || available.includes(selected) ? selected : 'all';
}

export function filterExpenses(expenses: Expense[], filter: ExpenseCategoryFilter): Expense[] {
  return filter === 'all' ? expenses : expenses.filter((expense) => expense.category === filter);
}

/** The expense's title or, when it has none, the name of its category. */
export function expenseName(expense: Pick<Expense, 'title' | 'category'>, t: TFunction): string {
  return expense.title ?? t(`expenses.categories.${expense.category}`);
}
