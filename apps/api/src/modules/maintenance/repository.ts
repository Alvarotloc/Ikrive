import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { attachments, maintenanceRecords, odometerReadings } from '../../db/schema';

export type MaintenanceRecordRow = typeof maintenanceRecords.$inferSelect;
export type NewMaintenanceRecordRow = typeof maintenanceRecords.$inferInsert;

/** Odometer point written as the record's linked `maintenance` reading. */
export interface MaintenanceReading {
  date: string;
  value: number;
}

/** What to do with the record's linked odometer reading when it is edited. */
export type ReadingChange = { kind: 'keep' } | { kind: 'remove' } | ({ kind: 'upsert' } & MaintenanceReading);

export function createMaintenanceRepository(db: Db) {
  return {
    listByVehicle(vehicleId: string) {
      return db
        .select()
        .from(maintenanceRecords)
        .where(eq(maintenanceRecords.vehicleId, vehicleId))
        .orderBy(desc(maintenanceRecords.date), desc(maintenanceRecords.createdAt))
        .all();
    },
    /** Sum of the vehicle's costs. SQLite `total()` skips NULLs and returns 0.0 without rows. */
    sumCost(vehicleId: string): number {
      return (
        db
          .select({ total: sql<number>`total(${maintenanceRecords.cost})` })
          .from(maintenanceRecords)
          .where(eq(maintenanceRecords.vehicleId, vehicleId))
          .get()?.total ?? 0
      );
    },
    find(vehicleId: string, id: string) {
      return db
        .select()
        .from(maintenanceRecords)
        .where(and(eq(maintenanceRecords.id, id), eq(maintenanceRecords.vehicleId, vehicleId)))
        .get();
    },
    /** Inserts a record and, optionally, its linked odometer reading atomically. */
    create(values: Omit<NewMaintenanceRecordRow, 'odometerReadingId'>, reading?: MaintenanceReading) {
      return db.transaction((tx) => {
        const readingId = reading
          ? tx
              .insert(odometerReadings)
              .values({ ...reading, vehicleId: values.vehicleId, source: 'maintenance' })
              .returning({ id: odometerReadings.id })
              .get().id
          : null;
        return tx
          .insert(maintenanceRecords)
          .values({ ...values, odometerReadingId: readingId })
          .returning()
          .get();
      });
    },
    /** Updates a record and applies the change to its linked odometer reading atomically. */
    update(
      record: MaintenanceRecordRow,
      changes: Omit<Partial<NewMaintenanceRecordRow>, 'odometerReadingId'>,
      reading: ReadingChange,
    ) {
      return db.transaction((tx) => {
        let odometerReadingId = record.odometerReadingId;
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
              .values({ date, value, vehicleId: record.vehicleId, source: 'maintenance' })
              .returning({ id: odometerReadings.id })
              .get().id;
          }
        } else if (reading.kind === 'remove') {
          odometerReadingId = null;
        }
        const updated = tx
          .update(maintenanceRecords)
          .set({ ...changes, odometerReadingId })
          .where(eq(maintenanceRecords.id, record.id))
          .returning()
          .get();
        if (reading.kind === 'remove' && record.odometerReadingId) {
          tx.delete(odometerReadings).where(eq(odometerReadings.id, record.odometerReadingId)).run();
        }
        return updated;
      });
    },
    /**
     * Deletes a record together with its linked odometer reading and its attachment rows
     * (their files are removed by the service afterwards).
     */
    delete(record: MaintenanceRecordRow) {
      db.transaction((tx) => {
        tx.delete(attachments)
          .where(and(eq(attachments.entityType, 'maintenance'), eq(attachments.entityId, record.id)))
          .run();
        tx.delete(maintenanceRecords).where(eq(maintenanceRecords.id, record.id)).run();
        if (record.odometerReadingId) {
          tx.delete(odometerReadings).where(eq(odometerReadings.id, record.odometerReadingId)).run();
        }
      });
    },
  };
}

export type MaintenanceRepository = ReturnType<typeof createMaintenanceRepository>;
