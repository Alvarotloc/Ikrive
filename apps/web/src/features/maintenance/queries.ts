import type {
  CreateMaintenanceRecordInput,
  MaintenanceRecord,
  UpdateMaintenanceRecordInput,
} from '@ikrive/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export const maintenanceQuery = (vehicleId: string) =>
  queryOptions({
    queryKey: queryKeys.vehicles.maintenance(vehicleId),
    queryFn: () => api.get<MaintenanceRecord[]>(`/vehicles/${vehicleId}/maintenance`),
  });

/** Records create, move or delete their linked odometer reading: refresh the whole vehicle tree. */
function useMaintenanceMutation<TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all }),
  });
}

export const useCreateMaintenance = (vehicleId: string) =>
  useMaintenanceMutation((record: CreateMaintenanceRecordInput) =>
    api.post<MaintenanceRecord>(`/vehicles/${vehicleId}/maintenance`, record),
  );

export const useUpdateMaintenance = (vehicleId: string) =>
  useMaintenanceMutation(
    ({ recordId, changes }: { recordId: string; changes: UpdateMaintenanceRecordInput }) =>
      api.patch<MaintenanceRecord>(`/vehicles/${vehicleId}/maintenance/${recordId}`, changes),
  );

export const useDeleteMaintenance = (vehicleId: string) =>
  useMaintenanceMutation((recordId: string) =>
    api.delete<void>(`/vehicles/${vehicleId}/maintenance/${recordId}`),
  );
