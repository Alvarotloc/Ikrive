import type { CreateFuelLogInput, UpdateFuelLogInput } from '@ikrive/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { dataSource } from '@/lib/data-source';
import { queryKeys } from '@/lib/query-keys';

export const fuelLogsQuery = (vehicleId: string) =>
  queryOptions({
    queryKey: queryKeys.vehicles.fuelLogs(vehicleId),
    queryFn: () => dataSource().fuelLogs.list(vehicleId),
  });

/** Refuels create, move or delete their linked odometer reading: refresh the whole vehicle tree. */
function useFuelLogMutation<TVariables, TResult>(mutationFn: (variables: TVariables) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all }),
  });
}

export const useCreateFuelLog = (vehicleId: string) =>
  useFuelLogMutation((log: CreateFuelLogInput) => dataSource().fuelLogs.create(vehicleId, log));

export const useUpdateFuelLog = (vehicleId: string) =>
  useFuelLogMutation(({ logId, changes }: { logId: string; changes: UpdateFuelLogInput }) =>
    dataSource().fuelLogs.update(vehicleId, logId, changes),
  );

export const useDeleteFuelLog = (vehicleId: string) =>
  useFuelLogMutation((logId: string) => dataSource().fuelLogs.remove(vehicleId, logId));
