import {
  type CreateMaintenanceRecord,
  type MaintenanceRecord,
  type MaintenanceSpending,
  maintenanceReadingChange,
  odometerConflictMessage,
  roundMoney,
  scheduleLastDoneUpdate,
  todayIn,
  type UpdateMaintenanceRecord,
  validateOdometerWrite,
} from '@ikrive/shared';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors';
import type { FileStorage } from '../../lib/storage';
import type { AttachmentsRepository } from '../attachments/repository';
import type { SchedulesRepository } from '../schedules/repository';
import type { SettingsService } from '../settings/service';
import type { VehiclesRepository } from '../vehicles/repository';
import type { MaintenanceRecordRow, MaintenanceRepository, ScheduleLastDone } from './repository';

interface MaintenanceServiceDeps {
  repo: MaintenanceRepository;
  vehicles: VehiclesRepository;
  settings: SettingsService;
  attachments: AttachmentsRepository;
  storage: FileStorage;
  schedules: SchedulesRepository;
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
  schedules,
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
    const error = validateOdometerWrite({
      readings: vehicles.listReadings(vehicleId),
      ownReadingId,
      date,
      odometer,
      today: todayIn(settings.get(userId).timezone),
    });
    if (error?.kind === 'future_date') {
      throw new BadRequestError('The maintenance date cannot be in the future');
    }
    if (error?.kind === 'conflict') throw new ConflictError(odometerConflictMessage(error.conflict));
  };

  /**
   * Checks that the record's resulting schedule belongs to the vehicle and returns its new last done
   * values, only when the record is not older than the current ones.
   */
  const scheduleLastDone = (
    vehicleId: string,
    { scheduleId, date, odometer }: { scheduleId: string | null; date: string; odometer: number | null },
  ): ScheduleLastDone | undefined => {
    if (scheduleId == null) return undefined;
    const schedule = schedules.find(vehicleId, scheduleId);
    if (!schedule) throw new BadRequestError('Maintenance schedule not found for this vehicle');
    const lastDone = scheduleLastDoneUpdate(schedule, { date, odometer });
    return lastDone ? { scheduleId, ...lastDone } : undefined;
  };

  return {
    list(userId: string, vehicleId: string): MaintenanceRecord[] {
      requireVehicle(userId, vehicleId);
      return repo.listByVehicle(vehicleId).map(toDto);
    },

    /** Rounded to cents so float sums (10.1 + 20.2) do not leak into the API. */
    spending(userId: string, vehicleId: string): MaintenanceSpending {
      requireVehicle(userId, vehicleId);
      return { total: roundMoney(repo.sumCost(vehicleId)) };
    },

    get(userId: string, vehicleId: string, recordId: string): MaintenanceRecord {
      return toDto(requireRecord(userId, vehicleId, recordId));
    },

    create(userId: string, vehicleId: string, input: CreateMaintenanceRecord): MaintenanceRecord {
      requireVehicle(userId, vehicleId);
      validate(userId, vehicleId, input);
      const lastDone = scheduleLastDone(vehicleId, {
        scheduleId: input.scheduleId ?? null,
        date: input.date,
        odometer: input.odometer ?? null,
      });
      const reading = input.odometer == null ? undefined : { date: input.date, value: input.odometer };
      return toDto(repo.create({ ...input, vehicleId }, reading, lastDone));
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
      const scheduleId = input.scheduleId === undefined ? record.scheduleId : input.scheduleId;
      const lastDone = scheduleLastDone(vehicleId, { scheduleId, date, odometer });
      const reading = maintenanceReadingChange(record, input);
      return toDto(repo.update(record, input, reading, lastDone));
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
