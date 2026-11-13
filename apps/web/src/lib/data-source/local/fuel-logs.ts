import { fuelLogs, odometerReadings } from '@ikrive/db/schema';
import {
  createFuelLogSchema,
  editedFuelPrices,
  type FuelLog,
  fuelReadingChange,
  odometerConflictMessage,
  updateFuelLogSchema,
  validateOdometerWrite,
} from '@ikrive/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { DataSource } from '../types';
import type { LocalDb } from './database';
import { badRequest, conflict, notFound, parseInput } from './problems';
import { localToday } from './settings';
import { listReadings, requireVehicle } from './vehicles';

export type FuelLogRow = typeof fuelLogs.$inferSelect;

const toDto = (row: FuelLogRow): FuelLog => {
  const { odometerReadingId: _odometerReadingId, createdAt, updatedAt, ...fields } = row;
  return { ...fields, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() };
};

/** Newest first; on the same day by odometer, then by creation (the order of the refuels). */
export function listFuelLogs(db: LocalDb, vehicleId: string): Promise<FuelLogRow[]> {
  return db
    .select()
    .from(fuelLogs)
    .where(eq(fuelLogs.vehicleId, vehicleId))
    .orderBy(desc(fuelLogs.date), desc(fuelLogs.odometer), desc(fuelLogs.createdAt))
    .all();
}

async function requireLog(db: LocalDb, vehicleId: string, logId: string): Promise<FuelLogRow> {
  await requireVehicle(db, vehicleId);
  const log = await db
    .select()
    .from(fuelLogs)
    .where(and(eq(fuelLogs.id, logId), eq(fuelLogs.vehicleId, vehicleId)))
    .get();
  if (!log) throw notFound('Fuel log not found');
  return log;
}

/**
 * Validates the resulting date and odometer before anything is written. The log's own linked reading is
 * left out of the comparison, so moving it does not conflict with its previous value.
 */
async function validate(
  db: LocalDb,
  vehicleId: string,
  { date, odometer }: { date: string; odometer: number },
  ownReadingId: string | null = null,
) {
  const error = validateOdometerWrite({
    readings: await listReadings(db, vehicleId),
    ownReadingId,
    date,
    odometer,
    today: await localToday(db),
  });
  if (error?.kind === 'future_date') throw badRequest('The fuel log date cannot be in the future');
  if (error?.kind === 'conflict') throw conflict(odometerConflictMessage(error.conflict));
}

/** `fuelLogs` of the local `DataSource`: each log keeps its linked `fuel` reading in the same transaction. */
export function localFuelLogs(db: LocalDb): DataSource['fuelLogs'] {
  return {
    async list(vehicleId) {
      await requireVehicle(db, vehicleId);
      return (await listFuelLogs(db, vehicleId)).map(toDto);
    },

    async create(vehicleId, input) {
      const log = parseInput(createFuelLogSchema, input);
      await requireVehicle(db, vehicleId);
      await validate(db, vehicleId, log);
      const created = await db.transaction(async (tx) => {
        const reading = await tx
          .insert(odometerReadings)
          .values({ date: log.date, value: log.odometer, vehicleId, source: 'fuel' })
          .returning({ id: odometerReadings.id })
          .get();
        return tx
          .insert(fuelLogs)
          .values({ ...log, vehicleId, odometerReadingId: reading.id })
          .returning()
          .get();
      });
      return toDto(created);
    },

    async update(vehicleId, logId, input) {
      const changes = parseInput(updateFuelLogSchema, input);
      const log = await requireLog(db, vehicleId, logId);
      const date = changes.date ?? log.date;
      const odometer = changes.odometer ?? log.odometer;
      await validate(db, vehicleId, { date, odometer }, log.odometerReadingId);
      const reading = fuelReadingChange(log, changes);
      const values = { ...changes, ...editedFuelPrices(log, changes) };
      const updated = await db.transaction(async (tx) => {
        let odometerReadingId = log.odometerReadingId;
        if (reading.kind === 'upsert') {
          if (odometerReadingId) {
            await tx
              .update(odometerReadings)
              .set({ date: reading.date, value: reading.value })
              .where(eq(odometerReadings.id, odometerReadingId));
          } else {
            odometerReadingId = (
              await tx
                .insert(odometerReadings)
                .values({ date: reading.date, value: reading.value, vehicleId, source: 'fuel' })
                .returning({ id: odometerReadings.id })
                .get()
            ).id;
          }
        }
        return tx
          .update(fuelLogs)
          .set({ ...values, odometerReadingId })
          .where(eq(fuelLogs.id, log.id))
          .returning()
          .get();
      });
      return toDto(updated);
    },

    async remove(vehicleId, logId) {
      const log = await requireLog(db, vehicleId, logId);
      await db.transaction(async (tx) => {
        await tx.delete(fuelLogs).where(eq(fuelLogs.id, log.id));
        if (log.odometerReadingId) {
          await tx.delete(odometerReadings).where(eq(odometerReadings.id, log.odometerReadingId));
        }
      });
    },
  };
}
