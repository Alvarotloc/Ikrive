import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { Db } from '../../db/client';
import {
  attachments,
  fuelLogs,
  maintenanceRecords,
  maintenanceSchedules,
  notificationChannels,
  odometerReadings,
  vehicles,
} from '../../db/schema';

type Insert<T extends SQLiteTable> = T['$inferInsert'];

/**
 * Rows to create, already with their new ids and remapped references. The owner (`ownerId`,
 * `userId`) is set by the repository.
 */
export interface ImportPlan {
  vehicles: Omit<Insert<typeof vehicles>, 'ownerId'>[];
  odometerReadings: Insert<typeof odometerReadings>[];
  maintenanceSchedules: Insert<typeof maintenanceSchedules>[];
  maintenanceRecords: Insert<typeof maintenanceRecords>[];
  fuelLogs: Insert<typeof fuelLogs>[];
  attachments: Omit<Insert<typeof attachments>, 'ownerId'>[];
  notificationChannels: Omit<Insert<typeof notificationChannels>, 'userId'>[];
}

export type ImportCounts = { [K in keyof ImportPlan]: number };

/** Rows per multi-row INSERT: well below SQLite's limit of bound variables per statement. */
const BATCH_SIZE = 500;

function chunks<T>(rows: T[]): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    batches.push(rows.slice(start, start + BATCH_SIZE));
  }
  return batches;
}

export function createDataImportRepository(db: Db) {
  return {
    /**
     * Inserts the whole plan in one transaction: parents before children (foreign keys) and in the
     * plan's order, so `rowid` keeps the tie-break order of the export. Only INSERTs: nothing the
     * user already had is touched. Any failure rolls everything back.
     */
    insert(userId: string, plan: ImportPlan): ImportCounts {
      return db.transaction((tx) => {
        const insertAll = <T extends SQLiteTable>(table: T, rows: Insert<T>[]) => {
          for (const batch of chunks(rows)) tx.insert(table).values(batch).run();
          return rows.length;
        };
        return {
          vehicles: insertAll(
            vehicles,
            plan.vehicles.map((row) => ({ ...row, ownerId: userId })),
          ),
          odometerReadings: insertAll(odometerReadings, plan.odometerReadings),
          maintenanceSchedules: insertAll(maintenanceSchedules, plan.maintenanceSchedules),
          maintenanceRecords: insertAll(maintenanceRecords, plan.maintenanceRecords),
          fuelLogs: insertAll(fuelLogs, plan.fuelLogs),
          attachments: insertAll(
            attachments,
            plan.attachments.map((row) => ({ ...row, ownerId: userId })),
          ),
          notificationChannels: insertAll(
            notificationChannels,
            plan.notificationChannels.map((row) => ({ ...row, userId })),
          ),
        };
      });
    },
  };
}

export type DataImportRepository = ReturnType<typeof createDataImportRepository>;
