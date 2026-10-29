import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { fuelLogs, odometerReadings } from '../../db/schema';

export type FuelLogRow = typeof fuelLogs.$inferSelect;
export type NewFuelLogRow = typeof fuelLogs.$inferInsert;

/** Odometer point written as the log's linked `fuel` reading. */
export interface FuelReading {
  date: string;
  value: number;
}

/**
 * What to do with the log's linked odometer reading when it is edited. There is no `remove`: the
 * odometer of a fuel log cannot be cleared.
 */
export type ReadingChange = { kind: 'keep' } | ({ kind: 'upsert' } & FuelReading);

export function createFuelLogsRepository(db: Db) {
  return {
    /** Newest first; on the same day by odometer, then by creation (the order of the refuels). */
    listByVehicle(vehicleId: string) {
      return db
        .select()
        .from(fuelLogs)
        .where(eq(fuelLogs.vehicleId, vehicleId))
        .orderBy(desc(fuelLogs.date), desc(fuelLogs.odometer), desc(fuelLogs.createdAt))
        .all();
    },
    find(vehicleId: string, id: string) {
      return db
        .select()
        .from(fuelLogs)
        .where(and(eq(fuelLogs.id, id), eq(fuelLogs.vehicleId, vehicleId)))
        .get();
    },
    /** Inserts a log and its linked odometer reading atomically. */
    create(values: Omit<NewFuelLogRow, 'odometerReadingId'>, reading: FuelReading) {
      return db.transaction((tx) => {
        const readingId = tx
          .insert(odometerReadings)
          .values({ ...reading, vehicleId: values.vehicleId, source: 'fuel' })
          .returning({ id: odometerReadings.id })
          .get().id;
        return tx
          .insert(fuelLogs)
          .values({ ...values, odometerReadingId: readingId })
          .returning()
          .get();
      });
    },
    /** Updates a log and applies the change to its linked odometer reading atomically. */
    update(
      log: FuelLogRow,
      changes: Omit<Partial<NewFuelLogRow>, 'odometerReadingId'>,
      reading: ReadingChange,
    ) {
      return db.transaction((tx) => {
        let odometerReadingId = log.odometerReadingId;
        if (reading.kind === 'upsert') {
          const { date, value } = reading;
          if (odometerReadingId) {
            tx.update(odometerReadings)
              .set({ date, value })
              .where(eq(odometerReadings.id, odometerReadingId))
              .run();
          } else {
            odometerReadingId = tx
              .insert(odometerReadings)
              .values({ date, value, vehicleId: log.vehicleId, source: 'fuel' })
              .returning({ id: odometerReadings.id })
              .get().id;
          }
        }
        return tx
          .update(fuelLogs)
          .set({ ...changes, odometerReadingId })
          .where(eq(fuelLogs.id, log.id))
          .returning()
          .get();
      });
    },
    /** Deletes a log together with its linked odometer reading. */
    delete(log: FuelLogRow) {
      db.transaction((tx) => {
        tx.delete(fuelLogs).where(eq(fuelLogs.id, log.id)).run();
        if (log.odometerReadingId) {
          tx.delete(odometerReadings).where(eq(odometerReadings.id, log.odometerReadingId)).run();
        }
      });
    },
  };
}

export type FuelLogsRepository = ReturnType<typeof createFuelLogsRepository>;
