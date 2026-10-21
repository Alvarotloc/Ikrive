import type {
  CreateMaintenanceScheduleInput,
  MaintenanceSchedule,
  UpdateMaintenanceScheduleInput,
} from '@ikrive/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export const schedulesQuery = (vehicleId: string) =>
  queryOptions({
    queryKey: queryKeys.vehicles.schedules(vehicleId),
    queryFn: () => api.get<MaintenanceSchedule[]>(`/vehicles/${vehicleId}/schedules`),
  });

/** Creating or editing a schedule only changes the schedules of the vehicle. */
function useScheduleMutation<TVariables, TResult>(
  vehicleId: string,
  mutationFn: (variables: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.schedules(vehicleId) }),
  });
}

export const useCreateSchedule = (vehicleId: string) =>
  useScheduleMutation(vehicleId, (schedule: CreateMaintenanceScheduleInput) =>
    api.post<MaintenanceSchedule>(`/vehicles/${vehicleId}/schedules`, schedule),
  );

export const useUpdateSchedule = (vehicleId: string) =>
  useScheduleMutation(
    vehicleId,
    ({ scheduleId, changes }: { scheduleId: string; changes: UpdateMaintenanceScheduleInput }) =>
      api.patch<MaintenanceSchedule>(`/vehicles/${vehicleId}/schedules/${scheduleId}`, changes),
  );

/** Deleting unlinks its maintenance records (`scheduleId: null`): refresh the whole vehicle. */
export function useDeleteSchedule(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scheduleId: string) => api.delete<void>(`/vehicles/${vehicleId}/schedules/${scheduleId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.detail(vehicleId) }),
  });
}
