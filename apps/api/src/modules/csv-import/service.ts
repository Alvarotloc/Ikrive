import { type CsvImportRequest, type CsvImportSummary, fuelQuantityUnit, todayIn } from '@ikrive/shared';
import {
  csvImportProblemErrors,
  csvImportSummary,
  decodeCsv,
  parseCsvImport,
  planCsvImport,
} from '@ikrive/shared/csv-import';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import type { FuelLogsRepository } from '../fuel-logs/repository';
import type { MaintenanceRepository } from '../maintenance/repository';
import type { SettingsService } from '../settings/service';
import type { VehiclesRepository } from '../vehicles/repository';
import type { CsvImportRepository } from './repository';

interface CsvImportServiceDeps {
  repo: CsvImportRepository;
  vehicles: VehiclesRepository;
  fuelLogs: FuelLogsRepository;
  maintenance: MaintenanceRepository;
  settings: SettingsService;
}

export function createCsvImportService({
  repo,
  vehicles,
  fuelLogs,
  maintenance,
  settings,
}: CsvImportServiceDeps) {
  return {
    /**
     * Imports a CSV into one of the user's vehicles: rows already stored or repeated in the file are
     * counted as duplicates, rows with a future date or a contradicting odometer are reported per row,
     * and the rest are written in one transaction (nothing with `dryRun`). Synchronous after the upload
     * is read, so no other request runs between reading the vehicle's data and writing.
     */
    import(
      userId: string,
      vehicleId: string,
      bytes: Uint8Array,
      options: CsvImportRequest,
    ): CsvImportSummary {
      const vehicle = vehicles.findOwned(userId, vehicleId);
      if (!vehicle) throw new NotFoundError('Vehicle not found');
      const { distanceUnit, volumeUnit, timezone } = settings.get(userId);

      const { text, replaced } = decodeCsv(bytes);
      const { dryRun, ...parserOptions } = options;
      const result = parseCsvImport(text, {
        ...parserOptions,
        target: { distance: distanceUnit, quantity: fuelQuantityUnit(vehicle.fuelType, volumeUnit) },
      });
      if (result.status !== 'parsed') {
        throw new BadRequestError('The CSV cannot be imported', csvImportProblemErrors(result));
      }

      const plan = planCsvImport(
        result.rows,
        {
          readings: vehicles.listReadings(vehicleId),
          fuelLogs: fuelLogs.listByVehicle(vehicleId),
          maintenance: maintenance.listByVehicle(vehicleId),
        },
        todayIn(timezone),
      );
      if (!dryRun) repo.apply(vehicleId, plan.accepted);
      return csvImportSummary(result, plan, { dryRun, encodingReplaced: replaced });
    },
  };
}

export type CsvImportService = ReturnType<typeof createCsvImportService>;
