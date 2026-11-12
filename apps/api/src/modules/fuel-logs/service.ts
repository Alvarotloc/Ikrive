import {
  type CreateFuelLog,
  editedFuelPrices,
  type FuelLog,
  fuelReadingChange,
  odometerConflictMessage,
  todayIn,
  type UpdateFuelLog,
  validateOdometerWrite,
} from '@ikrive/shared';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors';
import type { SettingsService } from '../settings/service';
import type { VehiclesRepository } from '../vehicles/repository';
import type { FuelLogRow, FuelLogsRepository } from './repository';

interface FuelLogsServiceDeps {
  repo: FuelLogsRepository;
  vehicles: VehiclesRepository;
  settings: SettingsService;
}

const toDto = (row: FuelLogRow): FuelLog => {
  const { odometerReadingId: _odometerReadingId, createdAt, updatedAt, ...fields } = row;
  return { ...fields, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() };
};

export function createFuelLogsService({ repo, vehicles, settings }: FuelLogsServiceDeps) {
  /** Ownership check: other users' vehicles are reported as missing so their ids are not disclosed. */
  const requireVehicle = (userId: string, vehicleId: string) => {
    if (!vehicles.findOwned(userId, vehicleId)) throw new NotFoundError('Vehicle not found');
  };

  const requireLog = (userId: string, vehicleId: string, logId: string) => {
    requireVehicle(userId, vehicleId);
    const log = repo.find(vehicleId, logId);
    if (!log) throw new NotFoundError('Fuel log not found');
    return log;
  };

  /**
   * Validates the resulting date and odometer before anything is written. The log's own linked
   * reading is left out of the comparison, so moving it does not conflict with its previous value.
   */
  const validate = (
    userId: string,
    vehicleId: string,
    { date, odometer }: { date: string; odometer: number },
    ownReadingId: string | null = null,
  ) => {
    const error = validateOdometerWrite({
      readings: vehicles.listReadings(vehicleId),
      ownReadingId,
      date,
      odometer,
      today: todayIn(settings.get(userId).timezone),
    });
    if (error?.kind === 'future_date') throw new BadRequestError('The fuel log date cannot be in the future');
    if (error?.kind === 'conflict') throw new ConflictError(odometerConflictMessage(error.conflict));
  };

  return {
    list(userId: string, vehicleId: string): FuelLog[] {
      requireVehicle(userId, vehicleId);
      return repo.listByVehicle(vehicleId).map(toDto);
    },

    get(userId: string, vehicleId: string, logId: string): FuelLog {
      return toDto(requireLog(userId, vehicleId, logId));
    },

    create(userId: string, vehicleId: string, input: CreateFuelLog): FuelLog {
      requireVehicle(userId, vehicleId);
      validate(userId, vehicleId, input);
      return toDto(repo.create({ ...input, vehicleId }, { date: input.date, value: input.odometer }));
    },

    update(userId: string, vehicleId: string, logId: string, input: UpdateFuelLog): FuelLog {
      const log = requireLog(userId, vehicleId, logId);
      const date = input.date ?? log.date;
      const odometer = input.odometer ?? log.odometer;
      validate(userId, vehicleId, { date, odometer }, log.odometerReadingId);
      const reading = fuelReadingChange(log, input);
      return toDto(repo.update(log, { ...input, ...editedFuelPrices(log, input) }, reading));
    },

    remove(userId: string, vehicleId: string, logId: string) {
      repo.delete(requireLog(userId, vehicleId, logId));
    },
  };
}

export type FuelLogsService = ReturnType<typeof createFuelLogsService>;
