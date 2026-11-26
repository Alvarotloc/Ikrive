import { createExpenseSchema, type Expense } from '@ikrive/shared';
import { z } from 'zod';
import { parseDecimal } from '@/features/vehicles/numbers';
import { ApiError } from '@/lib/api-client';
import { todayIso } from '@/lib/format';

const shape = createExpenseSchema.shape;

/** The shared create schema, with the amount typed as text ("1.234,56"; blank → null → required). */
export const expenseFormSchema = z.object({
  date: shape.date,
  category: shape.category,
  title: shape.title,
  description: shape.description,
  cost: z.string().transform(parseDecimal).pipe(shape.cost),
});

export type ExpenseFormInput = z.input<typeof expenseFormSchema>;
export type ExpenseFormValues = z.output<typeof expenseFormSchema>;

const toText = (value: number | string | null | undefined) => (value == null ? '' : String(value));

/** Form values for editing `expense`, or the defaults of a new one (today, insurance, blank texts). */
export function defaultsFrom(expense?: Expense): ExpenseFormInput {
  return {
    date: expense?.date ?? todayIso(),
    category: expense?.category ?? 'insurance',
    title: toText(expense?.title),
    description: toText(expense?.description),
    cost: toText(expense?.cost),
  };
}

export type ExpenseFormError = { field: 'date' | 'root'; messageKey: string };

/**
 * Where to show an error returned by the API when saving.
 * The API has no machine-readable codes: a 400 without validation `errors` is the future-date rule.
 */
export function formErrorFor(error: unknown): ExpenseFormError {
  if (error instanceof ApiError) {
    const { status, errors } = error.problem;
    if (status === 400 && !errors) return { field: 'date', messageKey: 'expenses.errors.future' };
  }
  return { field: 'root', messageKey: 'common.error' };
}
