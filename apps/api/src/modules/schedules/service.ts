import {
  type CreateMaintenanceSchedule,
  computeScheduleDue,
  latestOdometerReading,
  type MaintenanceSchedule,
  type OdometerPoint,
  type UpdateMaintenanceSchedule,
} from '@ikrive/shared';
import { todayIn } from '../../lib/dates';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import type { SettingsService } from '../settings/service';
import type { VehiclesRepository } from '../vehicles/repository';
import type { MaintenanceScheduleRow, SchedulesRepository } from './repository';

interface SchedulesServiceDeps {
  repo: SchedulesRepository;
  vehicles: VehiclesRepository;
  settings: SettingsService;
}

/** Stored fields plus the next due date, odometer and status, computed for today. */
const toDto = (
  row: MaintenanceScheduleRow,
  readings: readonly OdometerPoint[],
  today: string,
): MaintenanceSchedule => {
  const { createdAt, updatedAt, ...fields } = row;
  return {
    ...fields,
    ...computeScheduleDue(row, readings, today),
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
};

export function createSchedulesService({ repo, vehicles, settings }: SchedulesServiceDeps) {
  /** Ownership check: other users' vehicles are reported as missing so their ids are not disclosed. */
  const requireVehicle = (userId: string, vehicleId: string) => {
    const vehicle = vehicles.findOwned(userId, vehicleId);
    if (!vehicle) throw new NotFoundError('Vehicle not found');
    return vehicle;
  };

  const requireSchedule = (userId: string, vehicleId: string, scheduleId: string) => {
    requireVehicle(userId, vehicleId);
    const schedule = repo.find(vehicleId, scheduleId);
    if (!schedule) throw new NotFoundError('Maintenance schedule not found');
    return schedule;
  };

  /** Today in the user's time zone and the vehicle's readings, loaded once per request. */
  const context = (userId: string, vehicleId: string) => ({
    today: todayIn(settings.get(userId).timezone),
    readings: vehicles.listReadings(vehicleId),
  });

  return {
    list(userId: string, vehicleId: string): MaintenanceSchedule[] {
      requireVehicle(userId, vehicleId);
      const { today, readings } = context(userId, vehicleId);
      return repo.listByVehicle(vehicleId).map((row) => toDto(row, readings, today));
    },

    get(userId: string, vehicleId: string, scheduleId: string): MaintenanceSchedule {
      const schedule = requireSchedule(userId, vehicleId, scheduleId);
      const { today, readings } = context(userId, vehicleId);
      return toDto(schedule, readings, today);
    },

    /**
     * Without a last done date or odometer, each one starts at the vehicle purchase or, when the
     * vehicle has none, at today and the latest reading.
     */
    create(userId: string, vehicleId: string, input: CreateMaintenanceSchedule): MaintenanceSchedule {
      const vehicle = requireVehicle(userId, vehicleId);
      const { today, readings } = context(userId, vehicleId);
      const { lastDoneDate, lastDoneOdometer, ...fields } = input;
      const row = repo.create({
        ...fields,
        vehicleId,
        lastDoneDate: lastDoneDate ?? vehicle.purchaseDate ?? today,
        lastDoneOdometer:
          lastDoneOdometer !== undefined
            ? lastDoneOdometer
            : (vehicle.purchaseOdometer ?? latestOdometerReading(readings)?.value ?? null),
      });
      return toDto(row, readings, today);
    },

    update(
      userId: string,
      vehicleId: string,
      scheduleId: string,
      input: UpdateMaintenanceSchedule,
    ): MaintenanceSchedule {
      const schedule = requireSchedule(userId, vehicleId, scheduleId);
      const intervalMonths =
        input.intervalMonths === undefined ? schedule.intervalMonths : input.intervalMonths;
      const intervalDistance =
        input.intervalDistance === undefined ? schedule.intervalDistance : input.intervalDistance;
      if (intervalMonths == null && intervalDistance == null) {
        throw new BadRequestError('A schedule needs an interval in months or distance');
      }
      const { today, readings } = context(userId, vehicleId);
      return toDto(repo.update(schedule.id, input), readings, today);
    },

    remove(userId: string, vehicleId: string, scheduleId: string) {
      const schedule = requireSchedule(userId, vehicleId, scheduleId);
      repo.delete(schedule.id);
    },
  };
}

export type SchedulesService = ReturnType<typeof createSchedulesService>;
