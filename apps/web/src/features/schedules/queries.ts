import type { CreateMaintenanceScheduleInput, UpdateMaintenanceScheduleInput } from '@ikrive/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { dataSource } from '@/lib/data-source';
import { queryKeys } from '@/lib/query-keys';

export const schedulesQuery = (vehicleId: string) =>
  queryOptions({
    queryKey: queryKeys.vehicles.schedules(vehicleId),
    queryFn: () => dataSource().schedules.list(vehicleId),
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
    dataSource().schedules.create(vehicleId, schedule),
  );

export const useUpdateSchedule = (vehicleId: string) =>
  useScheduleMutation(
    vehicleId,
    ({ scheduleId, changes }: { scheduleId: string; changes: UpdateMaintenanceScheduleInput }) =>
      dataSource().schedules.update(vehicleId, scheduleId, changes),
  );

/** Deleting unlinks its maintenance records (`scheduleId: null`): refresh the whole vehicle. */
export function useDeleteSchedule(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scheduleId: string) => dataSource().schedules.remove(vehicleId, scheduleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.detail(vehicleId) }),
  });
}
