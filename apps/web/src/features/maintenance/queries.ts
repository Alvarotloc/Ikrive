import type { CreateMaintenanceRecordInput, UpdateMaintenanceRecordInput } from '@ikrive/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { dataSource } from '@/lib/data-source';
import { queryKeys } from '@/lib/query-keys';

export const maintenanceQuery = (vehicleId: string) =>
  queryOptions({
    queryKey: queryKeys.vehicles.maintenance(vehicleId),
    queryFn: () => dataSource().maintenance.list(vehicleId),
  });

export const maintenanceSpendingQuery = (vehicleId: string) =>
  queryOptions({
    queryKey: queryKeys.vehicles.maintenanceSpending(vehicleId),
    queryFn: () => dataSource().maintenance.spending(vehicleId),
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
    dataSource().maintenance.create(vehicleId, record),
  );

export const useUpdateMaintenance = (vehicleId: string) =>
  useMaintenanceMutation(
    ({ recordId, changes }: { recordId: string; changes: UpdateMaintenanceRecordInput }) =>
      dataSource().maintenance.update(vehicleId, recordId, changes),
  );

export const useDeleteMaintenance = (vehicleId: string) =>
  useMaintenanceMutation((recordId: string) => dataSource().maintenance.remove(vehicleId, recordId));

export const attachmentsQuery = (vehicleId: string, recordId: string) =>
  queryOptions({
    queryKey: queryKeys.vehicles.attachments(vehicleId, recordId),
    queryFn: () => dataSource().attachments.list(vehicleId, recordId),
  });

/** One file per request (the API takes a single `file` part). `recordId` is a variable: on create it comes later. */
export function useUploadAttachment(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recordId, file }: { recordId: string; file: File }) =>
      dataSource().attachments.upload(vehicleId, recordId, file),
    onSuccess: (_, { recordId }) =>
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.attachments(vehicleId, recordId) }),
  });
}

export function useDeleteAttachment(vehicleId: string, recordId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) => dataSource().attachments.remove(vehicleId, recordId, attachmentId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.attachments(vehicleId, recordId) }),
  });
}
