import {
  type CreateFuelLog,
  type FuelLog,
  findOdometerConflict,
  resolveFuelPrices,
  type UpdateFuelLog,
} from '@ikrive/shared';
import { todayIn } from '../../lib/dates';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors';
import type { SettingsService } from '../settings/service';
import type { VehiclesRepository } from '../vehicles/repository';
import type { FuelLogRow, FuelLogsRepository, ReadingChange } from './repository';

interface FuelLogsServiceDeps {
  repo: FuelLogsRepository;
  vehicles: VehiclesRepository;
  settings: SettingsService;
}

const toDto = (row: FuelLogRow): FuelLog => {
  const { odometerReadingId: _odometerReadingId, createdAt, updatedAt, ...fields } = row;
  return { ...fields, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() };
};

/**
 * Prices of an edited log. Both sent: kept as they are. One sent: the other one is recomputed from
 * the resulting quantity. Only the quantity sent: the total is kept and the price per unit recomputed.
 * Neither: the stored prices are left untouched.
 */
const editedPrices = (log: FuelLogRow, { quantity, totalPrice, pricePerUnit }: UpdateFuelLog) => {
  if (totalPrice !== undefined && pricePerUnit !== undefined) return { totalPrice, pricePerUnit };
  const resulting = quantity ?? log.quantity;
  if (totalPrice !== undefined) return resolveFuelPrices({ quantity: resulting, totalPrice });
  if (pricePerUnit !== undefined) return resolveFuelPrices({ quantity: resulting, pricePerUnit });
  if (quantity !== undefined) return resolveFuelPrices({ quantity: resulting, totalPrice: log.totalPrice });
  return {};
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
    if (date > todayIn(settings.get(userId).timezone)) {
      throw new BadRequestError('The fuel log date cannot be in the future');
    }
    const others = vehicles.listReadings(vehicleId).filter((reading) => reading.id !== ownReadingId);
    const conflict = findOdometerConflict(others, { date, value: odometer });
    if (conflict) {
      throw new ConflictError(
        `The odometer cannot go backwards: there is a reading of ${conflict.value} on ${conflict.date}`,
      );
    }
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

      // A log that somehow lost its reading gets it back on its next date or odometer change.
      const reading: ReadingChange =
        date !== log.date || odometer !== log.odometer
          ? { kind: 'upsert', date, value: odometer }
          : { kind: 'keep' };
      return toDto(repo.update(log, { ...input, ...editedPrices(log, input) }, reading));
    },

    remove(userId: string, vehicleId: string, logId: string) {
      repo.delete(requireLog(userId, vehicleId, logId));
    },
  };
}

export type FuelLogsService = ReturnType<typeof createFuelLogsService>;
