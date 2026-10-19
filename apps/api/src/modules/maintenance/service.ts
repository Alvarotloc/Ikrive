import {
  type CreateMaintenanceRecord,
  findOdometerConflict,
  type MaintenanceRecord,
  type MaintenanceSpending,
  type UpdateMaintenanceRecord,
} from '@ikrive/shared';
import { todayIn } from '../../lib/dates';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors';
import type { FileStorage } from '../../lib/storage';
import type { AttachmentsRepository } from '../attachments/repository';
import type { SettingsService } from '../settings/service';
import type { VehiclesRepository } from '../vehicles/repository';
import type { MaintenanceRecordRow, MaintenanceRepository, ReadingChange } from './repository';

interface MaintenanceServiceDeps {
  repo: MaintenanceRepository;
  vehicles: VehiclesRepository;
  settings: SettingsService;
  attachments: AttachmentsRepository;
  storage: FileStorage;
}

const toDto = (row: MaintenanceRecordRow): MaintenanceRecord => {
  const { odometerReadingId: _odometerReadingId, createdAt, updatedAt, ...fields } = row;
  return { ...fields, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() };
};

export function createMaintenanceService({
  repo,
  vehicles,
  settings,
  attachments,
  storage,
}: MaintenanceServiceDeps) {
  /** Ownership check: other users' vehicles are reported as missing so their ids are not disclosed. */
  const requireVehicle = (userId: string, vehicleId: string) => {
    if (!vehicles.findOwned(userId, vehicleId)) throw new NotFoundError('Vehicle not found');
  };

  const requireRecord = (userId: string, vehicleId: string, recordId: string) => {
    requireVehicle(userId, vehicleId);
    const record = repo.find(vehicleId, recordId);
    if (!record) throw new NotFoundError('Maintenance record not found');
    return record;
  };

  /**
   * Validates the resulting date and odometer before anything is written. The record's own linked
   * reading is left out of the comparison, so moving it does not conflict with its previous value.
   */
  const validate = (
    userId: string,
    vehicleId: string,
    { date, odometer }: { date: string; odometer?: number | null },
    ownReadingId: string | null = null,
  ) => {
    if (date > todayIn(settings.get(userId).timezone)) {
      throw new BadRequestError('The maintenance date cannot be in the future');
    }
    if (odometer == null) return;
    const others = vehicles.listReadings(vehicleId).filter((reading) => reading.id !== ownReadingId);
    const conflict = findOdometerConflict(others, { date, value: odometer });
    if (conflict) {
      throw new ConflictError(
        `The odometer cannot go backwards: there is a reading of ${conflict.value} on ${conflict.date}`,
      );
    }
  };

  return {
    list(userId: string, vehicleId: string): MaintenanceRecord[] {
      requireVehicle(userId, vehicleId);
      return repo.listByVehicle(vehicleId).map(toDto);
    },

    /** Rounded to cents so float sums (10.1 + 20.2) do not leak into the API. */
    spending(userId: string, vehicleId: string): MaintenanceSpending {
      requireVehicle(userId, vehicleId);
      return { total: Math.round(repo.sumCost(vehicleId) * 100) / 100 };
    },

    get(userId: string, vehicleId: string, recordId: string): MaintenanceRecord {
      return toDto(requireRecord(userId, vehicleId, recordId));
    },

    create(userId: string, vehicleId: string, input: CreateMaintenanceRecord): MaintenanceRecord {
      requireVehicle(userId, vehicleId);
      validate(userId, vehicleId, input);
      const reading = input.odometer == null ? undefined : { date: input.date, value: input.odometer };
      return toDto(repo.create({ ...input, vehicleId }, reading));
    },

    update(
      userId: string,
      vehicleId: string,
      recordId: string,
      input: UpdateMaintenanceRecord,
    ): MaintenanceRecord {
      const record = requireRecord(userId, vehicleId, recordId);
      const date = input.date ?? record.date;
      const odometer = input.odometer === undefined ? record.odometer : input.odometer;
      validate(userId, vehicleId, { date, odometer }, record.odometerReadingId);

      let reading: ReadingChange = { kind: 'keep' };
      if (input.odometer === null) {
        reading = { kind: 'remove' };
      } else if (odometer != null && (date !== record.date || odometer !== record.odometer)) {
        reading = { kind: 'upsert', date, value: odometer };
      }
      return toDto(repo.update(record, input, reading));
    },

    /** Deletes the record and its attachments: rows in the same transaction, files afterwards. */
    async remove(userId: string, vehicleId: string, recordId: string) {
      const record = requireRecord(userId, vehicleId, recordId);
      const files = attachments.listByEntity('maintenance', record.id).map((row) => row.storageKey);
      repo.delete(record);
      for (const key of files) await storage.remove(key);
    },
  };
}

export type MaintenanceService = ReturnType<typeof createMaintenanceService>;
