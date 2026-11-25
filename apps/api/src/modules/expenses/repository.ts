import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { expenses } from '../../db/schema';

export type ExpenseRow = typeof expenses.$inferSelect;
export type NewExpenseRow = typeof expenses.$inferInsert;

export function createExpensesRepository(db: Db) {
  return {
    /** Newest first; on the same day, the last one created first. */
    listByVehicle(vehicleId: string) {
      return db
        .select()
        .from(expenses)
        .where(eq(expenses.vehicleId, vehicleId))
        .orderBy(desc(expenses.date), desc(expenses.createdAt))
        .all();
    },
    find(vehicleId: string, id: string) {
      return db
        .select()
        .from(expenses)
        .where(and(eq(expenses.id, id), eq(expenses.vehicleId, vehicleId)))
        .get();
    },
    create(values: NewExpenseRow) {
      return db.insert(expenses).values(values).returning().get();
    },
    update(id: string, changes: Partial<Omit<NewExpenseRow, 'id' | 'vehicleId'>>) {
      return db.update(expenses).set(changes).where(eq(expenses.id, id)).returning().get();
    },
    delete(id: string) {
      db.delete(expenses).where(eq(expenses.id, id)).run();
    },
  };
}

export type ExpensesRepository = ReturnType<typeof createExpensesRepository>;
