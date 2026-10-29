import type { CreateFuelLogInput, FuelLog, UpdateFuelLogInput } from '@ikrive/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export const fuelLogsQuery = (vehicleId: string) =>
  queryOptions({
    queryKey: queryKeys.vehicles.fuelLogs(vehicleId),
    queryFn: () => api.get<FuelLog[]>(`/vehicles/${vehicleId}/fuel-logs`),
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
  useFuelLogMutation((log: CreateFuelLogInput) => api.post<FuelLog>(`/vehicles/${vehicleId}/fuel-logs`, log));

export const useUpdateFuelLog = (vehicleId: string) =>
  useFuelLogMutation(({ logId, changes }: { logId: string; changes: UpdateFuelLogInput }) =>
    api.patch<FuelLog>(`/vehicles/${vehicleId}/fuel-logs/${logId}`, changes),
  );

export const useDeleteFuelLog = (vehicleId: string) =>
  useFuelLogMutation((logId: string) => api.delete<void>(`/vehicles/${vehicleId}/fuel-logs/${logId}`));
