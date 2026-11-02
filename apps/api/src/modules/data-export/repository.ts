import { and, asc, eq, getTableColumns, inArray, type SQL, sql } from 'drizzle-orm';
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

/** `rowid` breaks ties between rows created in the same millisecond, so the order is stable. */
const rowid = (table: SQLiteTable): SQL => asc(sql`${table}.rowid`);

/**
 * Reads everything a user exports, one query per table (no N+1). Every query is scoped to the user:
 * children through an inner join on `vehicles.owner_id`, attachments by `owner_id` and by belonging
 * to one of the user's maintenance records.
 */
export function createDataExportRepository(db: Db) {
  const ownedBy = (userId: string) => eq(vehicles.ownerId, userId);

  return {
    load(userId: string) {
      const vehicleRows = db
        .select()
        .from(vehicles)
        .where(ownedBy(userId))
        .orderBy(asc(vehicles.createdAt), rowid(vehicles))
        .all();

      const readings = db
        .select(getTableColumns(odometerReadings))
        .from(odometerReadings)
        .innerJoin(vehicles, eq(vehicles.id, odometerReadings.vehicleId))
        .where(ownedBy(userId))
        .orderBy(asc(odometerReadings.date), asc(odometerReadings.createdAt), rowid(odometerReadings))
        .all();

      const schedules = db
        .select(getTableColumns(maintenanceSchedules))
        .from(maintenanceSchedules)
        .innerJoin(vehicles, eq(vehicles.id, maintenanceSchedules.vehicleId))
        .where(ownedBy(userId))
        .orderBy(asc(maintenanceSchedules.createdAt), rowid(maintenanceSchedules))
        .all();

      const records = db
        .select(getTableColumns(maintenanceRecords))
        .from(maintenanceRecords)
        .innerJoin(vehicles, eq(vehicles.id, maintenanceRecords.vehicleId))
        .where(ownedBy(userId))
        .orderBy(asc(maintenanceRecords.date), asc(maintenanceRecords.createdAt), rowid(maintenanceRecords))
        .all();

      const fuel = db
        .select(getTableColumns(fuelLogs))
        .from(fuelLogs)
        .innerJoin(vehicles, eq(vehicles.id, fuelLogs.vehicleId))
        .where(ownedBy(userId))
        .orderBy(asc(fuelLogs.date), asc(fuelLogs.createdAt), rowid(fuelLogs))
        .all();

      const ownedRecordIds = db
        .select({ id: maintenanceRecords.id })
        .from(maintenanceRecords)
        .innerJoin(vehicles, eq(vehicles.id, maintenanceRecords.vehicleId))
        .where(ownedBy(userId));
      const files = db
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.ownerId, userId),
            eq(attachments.entityType, 'maintenance'),
            inArray(attachments.entityId, ownedRecordIds),
          ),
        )
        .orderBy(asc(attachments.createdAt), rowid(attachments))
        .all();

      const channels = db
        .select()
        .from(notificationChannels)
        .where(eq(notificationChannels.userId, userId))
        .orderBy(asc(notificationChannels.createdAt), rowid(notificationChannels))
        .all();

      return {
        vehicles: vehicleRows,
        odometerReadings: readings,
        maintenanceSchedules: schedules,
        maintenanceRecords: records,
        fuelLogs: fuel,
        attachments: files,
        notificationChannels: channels,
      };
    },
  };
}

export type DataExportRepository = ReturnType<typeof createDataExportRepository>;
export type DataExportRows = ReturnType<DataExportRepository['load']>;
