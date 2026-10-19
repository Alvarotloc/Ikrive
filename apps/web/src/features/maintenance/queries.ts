import type {
  Attachment,
  CreateMaintenanceRecordInput,
  MaintenanceRecord,
  MaintenanceSpending,
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

export const maintenanceSpendingQuery = (vehicleId: string) =>
  queryOptions({
    queryKey: queryKeys.vehicles.maintenanceSpending(vehicleId),
    queryFn: () => api.get<MaintenanceSpending>(`/vehicles/${vehicleId}/maintenance/spending`),
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

const attachmentsPath = (vehicleId: string, recordId: string) =>
  `/vehicles/${vehicleId}/maintenance/${recordId}/attachments`;

export const attachmentsQuery = (vehicleId: string, recordId: string) =>
  queryOptions({
    queryKey: queryKeys.vehicles.attachments(vehicleId, recordId),
    queryFn: () => api.get<Attachment[]>(attachmentsPath(vehicleId, recordId)),
  });

/** One file per request (the API takes a single `file` part). `recordId` is a variable: on create it comes later. */
export function useUploadAttachment(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recordId, file }: { recordId: string; file: File }) => {
      const body = new FormData();
      body.append('file', file);
      return api.post<Attachment>(attachmentsPath(vehicleId, recordId), body);
    },
    onSuccess: (_, { recordId }) =>
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.attachments(vehicleId, recordId) }),
  });
}

export function useDeleteAttachment(vehicleId: string, recordId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) =>
      api.delete<void>(`${attachmentsPath(vehicleId, recordId)}/${attachmentId}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.attachments(vehicleId, recordId) }),
  });
}
