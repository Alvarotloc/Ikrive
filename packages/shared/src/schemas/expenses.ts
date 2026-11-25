import { z } from 'zod';
import { EXPENSE_CATEGORIES } from '../enums';
import { moneySchema, optionalText } from './common';
import { isoDateSchema } from './vehicles';

const expenseFieldsSchema = z.object({
  date: isoDateSchema,
  category: z.enum(EXPENSE_CATEGORIES),
  title: optionalText(120),
  description: optionalText(2000),
  /** Decimal amount in the user's currency; an expense always costs something. */
  cost: moneySchema.positive(),
});

export const createExpenseSchema = expenseFieldsSchema;
export type CreateExpense = z.infer<typeof createExpenseSchema>;
export type CreateExpenseInput = z.input<typeof createExpenseSchema>;

export const updateExpenseSchema = expenseFieldsSchema.partial();
export type UpdateExpense = z.infer<typeof updateExpenseSchema>;
export type UpdateExpenseInput = z.input<typeof updateExpenseSchema>;

export const expenseSchema = z.object({
  id: z.string(),
  vehicleId: z.string(),
  date: isoDateSchema,
  category: z.enum(EXPENSE_CATEGORIES),
  title: z.string().nullable(),
  description: z.string().nullable(),
  cost: z.number(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Expense = z.infer<typeof expenseSchema>;

export const expenseParamsSchema = z.object({ id: z.string().min(1), expenseId: z.string().min(1) });
