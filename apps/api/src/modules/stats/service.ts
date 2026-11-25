import { computeVehicleStats, type VehicleStats } from '@ikrive/shared';
import { NotFoundError } from '../../lib/errors';
import type { ExpensesRepository } from '../expenses/repository';
import type { FuelLogsRepository } from '../fuel-logs/repository';
import type { MaintenanceRepository } from '../maintenance/repository';
import type { VehiclesRepository } from '../vehicles/repository';

interface StatsServiceDeps {
  vehicles: VehiclesRepository;
  fuelLogs: FuelLogsRepository;
  maintenance: MaintenanceRepository;
  expenses: ExpensesRepository;
}

export function createStatsService({ vehicles, fuelLogs, maintenance, expenses }: StatsServiceDeps) {
  return {
    /** Statistics of an owned vehicle; other users' vehicles are reported as missing. */
    forVehicle(userId: string, vehicleId: string): VehicleStats {
      const vehicle = vehicles.findOwned(userId, vehicleId);
      if (!vehicle) throw new NotFoundError('Vehicle not found');
      return computeVehicleStats({
        purchasePrice: vehicle.purchasePrice,
        readings: vehicles.listReadings(vehicleId).map(({ date, value }) => ({ date, value })),
        // The repository lists newest first; reversed, same-day refuels keep their creation order.
        fuelLogs: fuelLogs
          .listByVehicle(vehicleId)
          .reverse()
          .map(({ date, odometer, quantity, totalPrice, fullTank, missedPrevious }) => ({
            date,
            odometer,
            quantity,
            totalPrice,
            fullTank,
            missedPrevious,
          })),
        maintenance: maintenance
          .listByVehicle(vehicleId)
          .map(({ date, category, cost }) => ({ date, category, cost })),
        expenses: expenses
          .listByVehicle(vehicleId)
          .map(({ date, category, cost }) => ({ date, category, cost })),
      });
    },
  };
}

export type StatsService = ReturnType<typeof createStatsService>;
