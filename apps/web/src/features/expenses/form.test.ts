import type { Expense } from '@ikrive/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { todayIso } from '@/lib/format';
import { defaultsFrom, type ExpenseFormInput, expenseFormSchema, formErrorFor } from './form';

const input = (overrides: Partial<ExpenseFormInput> = {}): ExpenseFormInput => ({
  date: '2025-03-10',
  category: 'insurance',
  title: '',
  description: '',
  cost: '420',
  ...overrides,
});

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

const costError = (cost: string) =>
  expenseFormSchema.safeParse(input({ cost })).error?.issues.map((issue) => issue.path.join('.'));

describe('expense form', () => {
  it('parses Spanish and English amounts', () => {
    expect(expenseFormSchema.parse(input({ cost: '1.234,56' })).cost).toBe(1234.56);
    expect(expenseFormSchema.parse(input({ cost: '1,234.56' })).cost).toBe(1234.56);
    expect(expenseFormSchema.parse(input({ cost: '12' })).cost).toBe(12);
  });

  it('rejects a blank, zero or malformed cost', () => {
    for (const cost of ['', '  ', '0', '0,00', 'mucho', '-5']) expect(costError(cost)).toEqual(['cost']);
    const blank = expenseFormSchema.safeParse(input({ cost: '' }));
    expect(blank.error?.issues[0]?.message).toBe('Este campo es obligatorio.');
  });

  it('rejects a title or description that is too long', () => {
    const result = expenseFormSchema.safeParse(
      input({ title: 'x'.repeat(121), description: 'x'.repeat(2001) }),
    );
    expect(result.error?.issues.map((issue) => issue.path.join('.')).sort()).toEqual([
      'description',
      'title',
    ]);
    expect(expenseFormSchema.safeParse(input({ title: 'x'.repeat(120) })).success).toBe(true);
  });

  it('turns blank texts into null', () => {
    expect(expenseFormSchema.parse(input({ title: '  ', description: '' }))).toEqual({
      date: '2025-03-10',
      category: 'insurance',
      title: null,
      description: null,
      cost: 420,
    });
  });

  it('defaults to today and insurance', () => {
    expect(defaultsFrom()).toEqual({
      date: todayIso(),
      category: 'insurance',
      title: '',
      description: '',
      cost: '',
    });
    expect(defaultsFrom(expense)).toEqual({
      date: '2025-03-10',
      category: 'tax',
      title: 'Impuesto de circulación',
      description: 'Ayuntamiento',
      cost: '98.5',
    });
    expect(expenseFormSchema.parse(defaultsFrom({ ...expense, title: null }))).toMatchObject({
      title: null,
      cost: 98.5,
    });
  });

  it('maps a 400 without errors to the date field', () => {
    const error = new ApiError({ type: 'about:blank', title: 'Bad Request', status: 400, detail: 'future' });

    expect(formErrorFor(error)).toEqual({ field: 'date', messageKey: 'expenses.errors.future' });
  });

  it('maps any other error to the generic message', () => {
    const validation = new ApiError({
      type: 'about:blank',
      title: 'Validation failed',
      status: 400,
      errors: [{ path: 'cost', message: 'Too small' }],
    });
    const notFound = new ApiError({ type: 'about:blank', title: 'Not Found', status: 404 });

    for (const error of [validation, notFound, new TypeError('Failed to fetch'), undefined]) {
      expect(formErrorFor(error)).toEqual({ field: 'root', messageKey: 'common.error' });
    }
  });
});
