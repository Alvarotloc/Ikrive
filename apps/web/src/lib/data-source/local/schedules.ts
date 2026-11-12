import { maintenanceSchedules } from '@ikrive/db/schema';
import {
  computeScheduleDue,
  createMaintenanceScheduleSchema,
  hasIntervalAfterUpdate,
  type MaintenanceSchedule,
  type OdometerPoint,
  scheduleDefaults,
  updateMaintenanceScheduleSchema,
} from '@ikrive/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { DataSource } from '../types';
import type { LocalDb } from './database';
import { badRequest, notFound, parseInput } from './problems';
import { localToday } from './settings';
import { listReadings, requireVehicle } from './vehicles';

type MaintenanceScheduleRow = typeof maintenanceSchedules.$inferSelect;

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

async function requireSchedule(db: LocalDb, vehicleId: string, scheduleId: string) {
  await requireVehicle(db, vehicleId);
  const schedule = await db
    .select()
    .from(maintenanceSchedules)
    .where(and(eq(maintenanceSchedules.id, scheduleId), eq(maintenanceSchedules.vehicleId, vehicleId)))
    .get();
  if (!schedule) throw notFound('Maintenance schedule not found');
  return schedule;
}

/** Today and the vehicle's readings, loaded once per operation. */
const context = async (db: LocalDb, vehicleId: string) => ({
  today: await localToday(db),
  readings: await listReadings(db, vehicleId),
});

/** `schedules` of the local `DataSource`. */
export function localSchedules(db: LocalDb): DataSource['schedules'] {
  return {
    async list(vehicleId) {
      await requireVehicle(db, vehicleId);
      const { today, readings } = await context(db, vehicleId);
      // Oldest first; `rowid` breaks ties between schedules created in the same millisecond.
      const rows = await db
        .select()
        .from(maintenanceSchedules)
        .where(eq(maintenanceSchedules.vehicleId, vehicleId))
        .orderBy(asc(maintenanceSchedules.createdAt), asc(sql`rowid`))
        .all();
      return rows.map((row) => toDto(row, readings, today));
    },

    /**
     * Without a last done date or odometer, each one starts at the vehicle purchase or, when the vehicle
     * has none, at today and the latest reading.
     */
    async create(vehicleId, input) {
      const { lastDoneDate, lastDoneOdometer, ...fields } = parseInput(
        createMaintenanceScheduleSchema,
        input,
      );
      const vehicle = await requireVehicle(db, vehicleId);
      const { today, readings } = await context(db, vehicleId);
      const row = await db
        .insert(maintenanceSchedules)
        .values({
          ...fields,
          vehicleId,
          ...scheduleDefaults({ lastDoneDate, lastDoneOdometer }, vehicle, readings, today),
        })
        .returning()
        .get();
      return toDto(row, readings, today);
    },

    async update(vehicleId, scheduleId, input) {
      const changes = parseInput(updateMaintenanceScheduleSchema, input);
      const schedule = await requireSchedule(db, vehicleId, scheduleId);
      if (!hasIntervalAfterUpdate(schedule, changes)) {
        throw badRequest('A schedule needs an interval in months or distance');
      }
      const { today, readings } = await context(db, vehicleId);
      const row = await db
        .update(maintenanceSchedules)
        .set(changes)
        .where(eq(maintenanceSchedules.id, schedule.id))
        .returning()
        .get();
      return toDto(row, readings, today);
    },

    /** Its maintenance records are kept and unlinked by the `ON DELETE SET NULL` foreign key. */
    async remove(vehicleId, scheduleId) {
      const schedule = await requireSchedule(db, vehicleId, scheduleId);
      await db.delete(maintenanceSchedules).where(eq(maintenanceSchedules.id, schedule.id));
    },
  };
}
