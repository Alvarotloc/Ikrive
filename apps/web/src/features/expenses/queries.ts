import type { CreateExpenseInput, UpdateExpenseInput } from '@ikrive/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { dataSource } from '@/lib/data-source';
import { queryKeys } from '@/lib/query-keys';

export const expensesQuery = (vehicleId: string) =>
  queryOptions({
    queryKey: queryKeys.vehicles.expenses(vehicleId),
    queryFn: () => dataSource().expenses.list(vehicleId),
  });

/**
 * An expense touches neither the odometer nor the schedules: refreshing the vehicle's subtree (its
 * expenses and statistics) is enough.
 */
function useExpenseMutation<TVariables, TResult>(
  vehicleId: string,
  mutationFn: (variables: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.detail(vehicleId) }),
  });
}

export const useCreateExpense = (vehicleId: string) =>
  useExpenseMutation(vehicleId, (expense: CreateExpenseInput) =>
    dataSource().expenses.create(vehicleId, expense),
  );

export const useUpdateExpense = (vehicleId: string) =>
  useExpenseMutation(
    vehicleId,
    ({ expenseId, changes }: { expenseId: string; changes: UpdateExpenseInput }) =>
      dataSource().expenses.update(vehicleId, expenseId, changes),
  );

export const useDeleteExpense = (vehicleId: string) =>
  useExpenseMutation(vehicleId, (expenseId: string) => dataSource().expenses.remove(vehicleId, expenseId));
