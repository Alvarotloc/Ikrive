import type {
  CreateOdometerReading,
  CreateVehicleInput,
  OdometerReading,
  UpdateVehicleInput,
  Vehicle,
  VehicleListQuery,
} from '@ikrive/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export type VehicleListStatus = NonNullable<VehicleListQuery['status']>;

export const vehiclesQuery = (status: VehicleListStatus = 'active') =>
  queryOptions({
    queryKey: queryKeys.vehicles.list(status),
    queryFn: () => api.get<Vehicle[]>(`/vehicles?status=${status}`),
  });

export const vehicleQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.vehicles.detail(id),
    queryFn: () => api.get<Vehicle>(`/vehicles/${id}`),
  });

export const odometerQuery = (vehicleId: string) =>
  queryOptions({
    queryKey: queryKeys.vehicles.odometer(vehicleId),
    queryFn: () => api.get<OdometerReading[]>(`/vehicles/${vehicleId}/odometer`),
  });

function useVehicleMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<Vehicle>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (vehicle) => {
      queryClient.setQueryData(queryKeys.vehicles.detail(vehicle.id), vehicle);
      await queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    },
  });
}

export const useCreateVehicle = () =>
  useVehicleMutation((payload: CreateVehicleInput) => api.post<Vehicle>('/vehicles', payload));

export const useUpdateVehicle = (id: string) =>
  useVehicleMutation((changes: UpdateVehicleInput) => api.patch<Vehicle>(`/vehicles/${id}`, changes));

export const useUploadVehiclePhoto = (id: string) =>
  useVehicleMutation((file: File) => {
    const body = new FormData();
    body.append('file', file);
    return api.put<Vehicle>(`/vehicles/${id}/photo`, body);
  });

export const useRemoveVehiclePhoto = (id: string) =>
  useVehicleMutation(() => api.delete<Vehicle>(`/vehicles/${id}/photo`));

export function useDeleteVehicle(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>(`/vehicles/${id}`),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.vehicles.detail(id) });
      return queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    },
  });
}

export function useAddOdometerReading(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reading: CreateOdometerReading) =>
      api.post<OdometerReading>(`/vehicles/${vehicleId}/odometer`, reading),
    // The vehicle (current mileage) and every list showing it depend on the readings.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all }),
  });
}

export function useDeleteOdometerReading(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (readingId: string) => api.delete<void>(`/vehicles/${vehicleId}/odometer/${readingId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all }),
  });
}
