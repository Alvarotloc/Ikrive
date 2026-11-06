import { DUPLICATE_IMPORT_PROBLEM_TYPE, type VehicleIdentity } from '@ikrive/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { Db } from '../../db/client';
import {
  attachments,
  dataImports,
  fuelLogs,
  maintenanceRecords,
  maintenanceSchedules,
  notificationChannels,
  odometerReadings,
  vehicles,
} from '../../db/schema';
import { ConflictError } from '../../lib/errors';

type Insert<T extends SQLiteTable> = T['$inferInsert'];

/**
 * Rows to create, already with their new ids and remapped references. The owner (`ownerId`,
 * `userId`) is set by the repository.
 */
export interface ImportPlan {
  /** With their id set: the import reports matching vehicles by it. */
  vehicles: (Omit<Insert<typeof vehicles>, 'ownerId'> & { id: string })[];
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

/** 409 answered to an export whose `data.json` was already imported into the account. */
export function duplicateImportError(importedAt: Date) {
  return new ConflictError(
    `This export was already imported into your account on ${importedAt.toISOString()}`,
    { type: DUPLICATE_IMPORT_PROBLEM_TYPE },
  );
}

/** Whether better-sqlite3 rejected a UNIQUE index, directly or wrapped by drizzle (`cause`). */
function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ('code' in current && current.code === 'SQLITE_CONSTRAINT_UNIQUE') return true;
  }
  return false;
}

export function createDataImportRepository(db: Db) {
  /** When the account imported a `data.json` with this SHA-256, or `null` if it never did. */
  function hasImport(userId: string, dataSha256: string): Date | null {
    const row = db
      .select({ createdAt: dataImports.createdAt })
      .from(dataImports)
      .where(and(eq(dataImports.userId, userId), eq(dataImports.dataSha256, dataSha256)))
      .get();
    return row?.createdAt ?? null;
  }

  return {
    hasImport,

    /** Every vehicle of the account (archived and sold too), in creation order. */
    vehicles(userId: string): VehicleIdentity[] {
      return db
        .select({
          id: vehicles.id,
          name: vehicles.name,
          make: vehicles.make,
          model: vehicles.model,
          plate: vehicles.plate,
          vin: vehicles.vin,
        })
        .from(vehicles)
        .where(eq(vehicles.ownerId, userId))
        .orderBy(asc(vehicles.createdAt), asc(vehicles.id))
        .all();
    },

    /**
     * Inserts the whole plan in one transaction: first the fingerprint (`data_imports`), then the
     * rows, parents before children (foreign keys) and in the plan's order, so `rowid` keeps the
     * tie-break order of the export. Only INSERTs: nothing the user already had is touched. Any
     * failure rolls everything back; a fingerprint the account already has (an import that got
     * past the service's check at the same time) is answered with the repeated import 409.
     */
    insert(userId: string, plan: ImportPlan, dataSha256: string): ImportCounts {
      try {
        return insertPlan(userId, plan, dataSha256);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        throw duplicateImportError(hasImport(userId, dataSha256) ?? new Date());
      }
    },
  };

  function insertPlan(userId: string, plan: ImportPlan, dataSha256: string): ImportCounts {
    return db.transaction((tx) => {
      tx.insert(dataImports).values({ userId, dataSha256 }).run();
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
  }
}

export type DataImportRepository = ReturnType<typeof createDataImportRepository>;
