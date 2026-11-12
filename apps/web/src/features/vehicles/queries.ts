import type { CreateOdometerReading, CreateVehicleInput, UpdateVehicleInput, Vehicle } from '@ikrive/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { dataSource, type VehicleListStatus } from '@/lib/data-source';
import { queryKeys } from '@/lib/query-keys';

export type { VehicleListStatus };

export const vehiclesQuery = (status: VehicleListStatus = 'active') =>
  queryOptions({
    queryKey: queryKeys.vehicles.list(status),
    queryFn: () => dataSource().vehicles.list(status),
  });

export const vehicleQuery = (id: string) =>
  queryOptions({
    queryKey: queryKeys.vehicles.detail(id),
    queryFn: () => dataSource().vehicles.get(id),
  });

export const odometerQuery = (vehicleId: string) =>
  queryOptions({
    queryKey: queryKeys.vehicles.odometer(vehicleId),
    queryFn: () => dataSource().odometer.list(vehicleId),
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
  useVehicleMutation((payload: CreateVehicleInput) => dataSource().vehicles.create(payload));

export const useUpdateVehicle = (id: string) =>
  useVehicleMutation((changes: UpdateVehicleInput) => dataSource().vehicles.update(id, changes));

export const useUploadVehiclePhoto = (id: string) =>
  useVehicleMutation((file: File) => dataSource().vehicles.setPhoto(id, file));

export const useRemoveVehiclePhoto = (id: string) =>
  useVehicleMutation(() => dataSource().vehicles.removePhoto(id));

export function useDeleteVehicle(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => dataSource().vehicles.remove(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: queryKeys.vehicles.detail(id) });
      return queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    },
  });
}

export function useAddOdometerReading(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reading: CreateOdometerReading) => dataSource().odometer.add(vehicleId, reading),
    // The vehicle (current mileage) and every list showing it depend on the readings.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all }),
  });
}

export function useDeleteOdometerReading(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (readingId: string) => dataSource().odometer.remove(vehicleId, readingId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all }),
  });
}
