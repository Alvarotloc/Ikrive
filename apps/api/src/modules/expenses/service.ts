import { type CreateExpense, type Expense, todayIn, type UpdateExpense } from '@ikrive/shared';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import type { SettingsService } from '../settings/service';
import type { VehiclesRepository } from '../vehicles/repository';
import type { ExpenseRow, ExpensesRepository } from './repository';

interface ExpensesServiceDeps {
  repo: ExpensesRepository;
  vehicles: VehiclesRepository;
  settings: SettingsService;
}

const toDto = ({ createdAt, updatedAt, ...fields }: ExpenseRow): Expense => ({
  ...fields,
  createdAt: createdAt.toISOString(),
  updatedAt: updatedAt.toISOString(),
});

export function createExpensesService({ repo, vehicles, settings }: ExpensesServiceDeps) {
  /** Ownership check: other users' vehicles are reported as missing so their ids are not disclosed. */
  const requireVehicle = (userId: string, vehicleId: string) => {
    if (!vehicles.findOwned(userId, vehicleId)) throw new NotFoundError('Vehicle not found');
  };

  const requireExpense = (userId: string, vehicleId: string, expenseId: string) => {
    requireVehicle(userId, vehicleId);
    const expense = repo.find(vehicleId, expenseId);
    if (!expense) throw new NotFoundError('Expense not found');
    return expense;
  };

  /** Rejects a resulting date after the user's today before anything is written. */
  const validateDate = (userId: string, date: string) => {
    if (date > todayIn(settings.get(userId).timezone)) {
      throw new BadRequestError('The expense date cannot be in the future');
    }
  };

  return {
    list(userId: string, vehicleId: string): Expense[] {
      requireVehicle(userId, vehicleId);
      return repo.listByVehicle(vehicleId).map(toDto);
    },

    get(userId: string, vehicleId: string, expenseId: string): Expense {
      return toDto(requireExpense(userId, vehicleId, expenseId));
    },

    create(userId: string, vehicleId: string, input: CreateExpense): Expense {
      requireVehicle(userId, vehicleId);
      validateDate(userId, input.date);
      return toDto(repo.create({ ...input, vehicleId }));
    },

    update(userId: string, vehicleId: string, expenseId: string, input: UpdateExpense): Expense {
      const expense = requireExpense(userId, vehicleId, expenseId);
      validateDate(userId, input.date ?? expense.date);
      return toDto(repo.update(expense.id, input));
    },

    remove(userId: string, vehicleId: string, expenseId: string) {
      repo.delete(requireExpense(userId, vehicleId, expenseId).id);
    },
  };
}

export type ExpensesService = ReturnType<typeof createExpensesService>;
