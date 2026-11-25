import { computeVehicleStats } from '@ikrive/shared';
import type { DataSource } from '../types';
import type { LocalDb } from './database';
import { listExpenses } from './expenses';
import { listFuelLogs } from './fuel-logs';
import { listMaintenanceRecords } from './maintenance';
import { listReadings, requireVehicle } from './vehicles';

/** `stats` of the local `DataSource`: `computeVehicleStats` with the same inputs as the API's. */
export function localStats(db: LocalDb): DataSource['stats'] {
  return {
    async get(vehicleId) {
      const vehicle = await requireVehicle(db, vehicleId);
      const readings = await listReadings(db, vehicleId);
      const fuelLogs = await listFuelLogs(db, vehicleId);
      const maintenance = await listMaintenanceRecords(db, vehicleId);
      const expenses = await listExpenses(db, vehicleId);
      return computeVehicleStats({
        purchasePrice: vehicle.purchasePrice,
        readings: readings.map(({ date, value }) => ({ date, value })),
        // Listed newest first; reversed, same-day refuels keep their creation order.
        fuelLogs: fuelLogs
          .reverse()
          .map(({ date, odometer, quantity, totalPrice, fullTank, missedPrevious }) => ({
            date,
            odometer,
            quantity,
            totalPrice,
            fullTank,
            missedPrevious,
          })),
        maintenance: maintenance.map(({ date, category, cost }) => ({ date, category, cost })),
        expenses: expenses.map(({ date, category, cost }) => ({ date, category, cost })),
      });
    },
  };
}
