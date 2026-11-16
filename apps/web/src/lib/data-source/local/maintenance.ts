import { maintenanceRecords, maintenanceSchedules, odometerReadings } from '@ikrive/db/schema';
import {
  createMaintenanceRecordSchema,
  type MaintenanceRecord,
  maintenanceReadingChange,
  odometerConflictMessage,
  type ReadingChange,
  roundMoney,
  scheduleLastDoneUpdate,
  updateMaintenanceRecordSchema,
  validateOdometerWrite,
} from '@ikrive/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { DataSource } from '../types';
import { deleteMaintenanceAttachments } from './attachments';
import type { LocalDb, LocalTx } from './database';
import { type LocalDeps, removeFiles } from './files';
import { badRequest, conflict, notFound, parseInput } from './problems';
import { localToday } from './settings';
import { listReadings, requireVehicle } from './vehicles';

export type MaintenanceRecordRow = typeof maintenanceRecords.$inferSelect;

/** New last done values of the schedule a record fulfils, written with the record. */
interface ScheduleLastDone {
  scheduleId: string;
  date: string;
  odometer: number | null;
}

const toDto = (row: MaintenanceRecordRow): MaintenanceRecord => {
  const { odometerReadingId: _odometerReadingId, createdAt, updatedAt, ...fields } = row;
  return { ...fields, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() };
};

/** Newest first, then by creation. */
export function listMaintenanceRecords(db: LocalDb, vehicleId: string): Promise<MaintenanceRecordRow[]> {
  return db
    .select()
    .from(maintenanceRecords)
    .where(eq(maintenanceRecords.vehicleId, vehicleId))
    .orderBy(desc(maintenanceRecords.date), desc(maintenanceRecords.createdAt))
    .all();
}

async function requireRecord(db: LocalDb, vehicleId: string, recordId: string) {
  await requireVehicle(db, vehicleId);
  const record = await db
    .select()
    .from(maintenanceRecords)
    .where(and(eq(maintenanceRecords.id, recordId), eq(maintenanceRecords.vehicleId, vehicleId)))
    .get();
  if (!record) throw notFound('Maintenance record not found');
  return record;
}

/**
 * Validates the resulting date and odometer before anything is written. The record's own linked reading
 * is left out of the comparison, so moving it does not conflict with its previous value.
 */
async function validate(
  db: LocalDb,
  vehicleId: string,
  { date, odometer }: { date: string; odometer?: number | null },
  ownReadingId: string | null = null,
) {
  const error = validateOdometerWrite({
    readings: await listReadings(db, vehicleId),
    ownReadingId,
    date,
    odometer,
    today: await localToday(db),
  });
  if (error?.kind === 'future_date') throw badRequest('The maintenance date cannot be in the future');
  if (error?.kind === 'conflict') throw conflict(odometerConflictMessage(error.conflict));
}

/**
 * Checks that the record's resulting schedule belongs to the vehicle and returns its new last done
 * values, only when the record is not older than the current ones.
 */
async function scheduleLastDone(
  db: LocalDb,
  vehicleId: string,
  { scheduleId, date, odometer }: { scheduleId: string | null; date: string; odometer: number | null },
): Promise<ScheduleLastDone | undefined> {
  if (scheduleId == null) return undefined;
  const schedule = await db
    .select()
    .from(maintenanceSchedules)
    .where(and(eq(maintenanceSchedules.id, scheduleId), eq(maintenanceSchedules.vehicleId, vehicleId)))
    .get();
  if (!schedule) throw badRequest('Maintenance schedule not found for this vehicle');
  const lastDone = scheduleLastDoneUpdate(schedule, { date, odometer });
  return lastDone ? { scheduleId, ...lastDone } : undefined;
}

async function markScheduleDone(tx: LocalTx, lastDone?: ScheduleLastDone) {
  if (!lastDone) return;
  await tx
    .update(maintenanceSchedules)
    .set({ lastDoneDate: lastDone.date, lastDoneOdometer: lastDone.odometer })
    .where(eq(maintenanceSchedules.id, lastDone.scheduleId));
}

/**
 * Applies `reading` to the record's linked `maintenance` reading and returns the resulting reading id.
 * A removed reading is deleted once the record no longer points to it.
 */
async function applyReadingChange(tx: LocalTx, record: MaintenanceRecordRow, reading: ReadingChange) {
  if (reading.kind === 'remove') return null;
  if (reading.kind === 'keep') return record.odometerReadingId;
  const { date, value } = reading;
  if (record.odometerReadingId) {
    await tx
      .update(odometerReadings)
      .set({ date, value })
      .where(eq(odometerReadings.id, record.odometerReadingId));
    return record.odometerReadingId;
  }
  const created = await tx
    .insert(odometerReadings)
    .values({ date, value, vehicleId: record.vehicleId, source: 'maintenance' })
    .returning({ id: odometerReadings.id })
    .get();
  return created.id;
}

/**
 * `maintenance` of the local `DataSource`: each record keeps its linked `maintenance` reading and the last
 * done values of its schedule in the same transaction.
 */
export function localMaintenance(
  db: LocalDb,
  { files }: Pick<LocalDeps, 'files'>,
): DataSource['maintenance'] {
  return {
    async list(vehicleId) {
      await requireVehicle(db, vehicleId);
      return (await listMaintenanceRecords(db, vehicleId)).map(toDto);
    },

    /** Rounded to cents so float sums (10.1 + 20.2) do not leak into the UI. */
    async spending(vehicleId) {
      await requireVehicle(db, vehicleId);
      // SQLite `total()` skips NULLs and returns 0.0 without rows.
      const row = await db
        .select({ total: sql<number>`total(${maintenanceRecords.cost})` })
        .from(maintenanceRecords)
        .where(eq(maintenanceRecords.vehicleId, vehicleId))
        .get();
      return { total: roundMoney(row?.total ?? 0) };
    },

    async create(vehicleId, input) {
      const record = parseInput(createMaintenanceRecordSchema, input);
      await requireVehicle(db, vehicleId);
      await validate(db, vehicleId, record);
      const lastDone = await scheduleLastDone(db, vehicleId, {
        scheduleId: record.scheduleId ?? null,
        date: record.date,
        odometer: record.odometer ?? null,
      });
      const created = await db.transaction(async (tx) => {
        const reading =
          record.odometer == null
            ? null
            : await tx
                .insert(odometerReadings)
                .values({ date: record.date, value: record.odometer, vehicleId, source: 'maintenance' })
                .returning({ id: odometerReadings.id })
                .get();
        const row = await tx
          .insert(maintenanceRecords)
          .values({ ...record, vehicleId, odometerReadingId: reading?.id ?? null })
          .returning()
          .get();
        await markScheduleDone(tx, lastDone);
        return row;
      });
      return toDto(created);
    },

    async update(vehicleId, recordId, input) {
      const changes = parseInput(updateMaintenanceRecordSchema, input);
      const record = await requireRecord(db, vehicleId, recordId);
      const date = changes.date ?? record.date;
      const odometer = changes.odometer === undefined ? record.odometer : changes.odometer;
      await validate(db, vehicleId, { date, odometer }, record.odometerReadingId);
      const scheduleId = changes.scheduleId === undefined ? record.scheduleId : changes.scheduleId;
      const lastDone = await scheduleLastDone(db, vehicleId, { scheduleId, date, odometer });
      const reading = maintenanceReadingChange(record, changes);
      const updated = await db.transaction(async (tx) => {
        const odometerReadingId = await applyReadingChange(tx, record, reading);
        const row = await tx
          .update(maintenanceRecords)
          .set({ ...changes, odometerReadingId })
          .where(eq(maintenanceRecords.id, record.id))
          .returning()
          .get();
        if (reading.kind === 'remove' && record.odometerReadingId) {
          await tx.delete(odometerReadings).where(eq(odometerReadings.id, record.odometerReadingId));
        }
        await markScheduleDone(tx, lastDone);
        return row;
      });
      return toDto(updated);
    },

    /** Deletes the record and its attachments: rows in the same transaction, files afterwards. */
    async remove(vehicleId, recordId) {
      const record = await requireRecord(db, vehicleId, recordId);
      const keys = await db.transaction(async (tx) => {
        const removed = await deleteMaintenanceAttachments(tx, [record.id]);
        await tx.delete(maintenanceRecords).where(eq(maintenanceRecords.id, record.id));
        if (record.odometerReadingId) {
          await tx.delete(odometerReadings).where(eq(odometerReadings.id, record.odometerReadingId));
        }
        return removed;
      });
      await removeFiles(files, keys);
    },
  };
}
