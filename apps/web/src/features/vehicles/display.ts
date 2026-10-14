import type { Vehicle } from '@ikrive/shared';

/** The alias when there is one, otherwise make and model. */
export const vehicleTitle = (vehicle: Pick<Vehicle, 'name' | 'make' | 'model'>) =>
  vehicle.name ?? `${vehicle.make} ${vehicle.model}`;

/** Make, model and version, shown under the alias. */
export const vehicleFullName = (vehicle: Pick<Vehicle, 'make' | 'model' | 'version'>) =>
  [vehicle.make, vehicle.model, vehicle.version].filter(Boolean).join(' ');
