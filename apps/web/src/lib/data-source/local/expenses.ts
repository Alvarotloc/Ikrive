import { expenses } from '@ikrive/db/schema';
import { createExpenseSchema, type Expense, updateExpenseSchema } from '@ikrive/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { DataSource } from '../types';
import type { LocalDb } from './database';
import { badRequest, notFound, parseInput } from './problems';
import { localToday } from './settings';
import { requireVehicle } from './vehicles';

export type ExpenseRow = typeof expenses.$inferSelect;

const toDto = ({ createdAt, updatedAt, ...fields }: ExpenseRow): Expense => ({
  ...fields,
  createdAt: createdAt.toISOString(),
  updatedAt: updatedAt.toISOString(),
});

/** Newest first; on the same day, the last one created first. */
export function listExpenses(db: LocalDb, vehicleId: string): Promise<ExpenseRow[]> {
  return db
    .select()
    .from(expenses)
    .where(eq(expenses.vehicleId, vehicleId))
    .orderBy(desc(expenses.date), desc(expenses.createdAt))
    .all();
}

async function requireExpense(db: LocalDb, vehicleId: string, expenseId: string) {
  await requireVehicle(db, vehicleId);
  const expense = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.vehicleId, vehicleId)))
    .get();
  if (!expense) throw notFound('Expense not found');
  return expense;
}

/** Rejects a resulting date after today before anything is written. */
async function validateDate(db: LocalDb, date: string) {
  if (date > (await localToday(db))) throw badRequest('The expense date cannot be in the future');
}

/** `expenses` of the local `DataSource`: the same rules and problems as the API's service. */
export function localExpenses(db: LocalDb): DataSource['expenses'] {
  return {
    async list(vehicleId) {
      await requireVehicle(db, vehicleId);
      return (await listExpenses(db, vehicleId)).map(toDto);
    },

    async create(vehicleId, input) {
      const expense = parseInput(createExpenseSchema, input);
      await requireVehicle(db, vehicleId);
      await validateDate(db, expense.date);
      return toDto(
        await db
          .insert(expenses)
          .values({ ...expense, vehicleId })
          .returning()
          .get(),
      );
    },

    async update(vehicleId, expenseId, input) {
      const changes = parseInput(updateExpenseSchema, input);
      const expense = await requireExpense(db, vehicleId, expenseId);
      await validateDate(db, changes.date ?? expense.date);
      return toDto(
        await db.update(expenses).set(changes).where(eq(expenses.id, expense.id)).returning().get(),
      );
    },

    async remove(vehicleId, expenseId) {
      const expense = await requireExpense(db, vehicleId, expenseId);
      await db.delete(expenses).where(eq(expenses.id, expense.id));
    },
  };
}
