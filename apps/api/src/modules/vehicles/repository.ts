import type { VehicleStatus } from '@ikrive/shared';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, max, or, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Db } from '../../db/client';
import { activeUserFilter } from '../../db/filters';
import {
  attachments,
  maintenanceRecords,
  odometerReadings,
  user,
  userSettings,
  vehicleDocuments,
  vehicles,
} from '../../db/schema';

export type VehicleRow = typeof vehicles.$inferSelect;
export type NewVehicleRow = typeof vehicles.$inferInsert;
export type OdometerReadingRow = typeof odometerReadings.$inferSelect;
export type NewOdometerReadingRow = typeof odometerReadings.$inferInsert;

/** Active = neither sold nor archived. Shared with the queries of jobs that only consider active vehicles. */
export const activeVehicleFilter = and(isNull(vehicles.soldAt), isNull(vehicles.archivedAt));

const statusFilter: Record<VehicleStatus, SQL | undefined> = {
  active: activeVehicleFilter,
  archived: and(isNull(vehicles.soldAt), isNotNull(vehicles.archivedAt)),
  sold: isNotNull(vehicles.soldAt),
};

export function createVehiclesRepository(db: Db) {
  return {
    listByOwner(ownerId: string, status: VehicleStatus | 'all') {
      return db
        .select()
        .from(vehicles)
        .where(and(eq(vehicles.ownerId, ownerId), status === 'all' ? undefined : statusFilter[status]))
        .orderBy(desc(vehicles.createdAt))
        .all();
    },
    findOwned(ownerId: string, id: string) {
      return db
        .select()
        .from(vehicles)
        .where(and(eq(vehicles.id, id), eq(vehicles.ownerId, ownerId)))
        .get();
    },
    /** Inserts a vehicle and, optionally, its first odometer reading atomically. */
    create(values: NewVehicleRow, firstReading?: Omit<NewOdometerReadingRow, 'vehicleId'>) {
      return db.transaction((tx) => {
        const vehicle = tx.insert(vehicles).values(values).returning().get();
        if (firstReading) {
          tx.insert(odometerReadings)
            .values({ ...firstReading, vehicleId: vehicle.id })
            .run();
        }
        return vehicle;
      });
    },
    update(id: string, values: Partial<NewVehicleRow>) {
      return db.update(vehicles).set(values).where(eq(vehicles.id, id)).returning().get();
    },
    /**
     * Deletes a vehicle. Its readings, maintenance records and documents go with it through the
     * foreign keys; the attachment rows of those records and documents have no foreign key, so they
     * are deleted first here (their files are removed by the service afterwards).
     */
    delete(id: string) {
      db.transaction((tx) => {
        const records = tx
          .select({ id: maintenanceRecords.id })
          .from(maintenanceRecords)
          .where(eq(maintenanceRecords.vehicleId, id));
        const documents = tx
          .select({ id: vehicleDocuments.id })
          .from(vehicleDocuments)
          .where(eq(vehicleDocuments.vehicleId, id));
        tx.delete(attachments)
          .where(
            or(
              and(eq(attachments.entityType, 'maintenance'), inArray(attachments.entityId, records)),
              and(eq(attachments.entityType, 'document'), inArray(attachments.entityId, documents)),
            ),
          )
          .run();
        tx.delete(vehicles).where(eq(vehicles.id, id)).run();
      });
    },

    listReadings(vehicleId: string) {
      return db
        .select()
        .from(odometerReadings)
        .where(eq(odometerReadings.vehicleId, vehicleId))
        .orderBy(desc(odometerReadings.date), desc(odometerReadings.value))
        .all();
    },
    /**
     * Readings of several vehicles in one query: those dated on or after `since` plus every reading
     * on each vehicle's latest date, even when it is older. Enough for `computeScheduleDue` when
     * `since` is at most `today - AVERAGE_WINDOW_DAYS`.
     */
    listRecentReadingsByVehicles(vehicleIds: readonly string[], since: string) {
      if (vehicleIds.length === 0) return [];
      const latest = alias(odometerReadings, 'latest');
      const latestDate = db
        .select({ date: max(latest.date) })
        .from(latest)
        .where(eq(latest.vehicleId, odometerReadings.vehicleId));
      return db
        .select({
          vehicleId: odometerReadings.vehicleId,
          date: odometerReadings.date,
          value: odometerReadings.value,
        })
        .from(odometerReadings)
        .where(
          and(
            inArray(odometerReadings.vehicleId, [...vehicleIds]),
            or(gte(odometerReadings.date, since), eq(odometerReadings.date, latestDate)),
          ),
        )
        .all();
    },
    /**
     * Active vehicles of the users with an odometer reminder day, with their latest reading date
     * (`null` without readings) and their owner's reminder settings, oldest vehicle first. Users
     * without a settings row or with `odometerReminderWeekday: null` are left out.
     */
    listActiveForOdometerNudge() {
      return db
        .select({
          vehicleId: vehicles.id,
          ownerId: vehicles.ownerId,
          name: vehicles.name,
          make: vehicles.make,
          model: vehicles.model,
          createdAt: vehicles.createdAt,
          lastReadingDate: max(odometerReadings.date),
          weekday: userSettings.odometerReminderWeekday,
          timezone: userSettings.timezone,
          reminderHour: userSettings.reminderHour,
        })
        .from(vehicles)
        .innerJoin(user, eq(user.id, vehicles.ownerId))
        .innerJoin(userSettings, eq(userSettings.userId, vehicles.ownerId))
        .leftJoin(odometerReadings, eq(odometerReadings.vehicleId, vehicles.id))
        .where(and(activeVehicleFilter, activeUserFilter, isNotNull(userSettings.odometerReminderWeekday)))
        .groupBy(vehicles.id)
        .orderBy(asc(vehicles.createdAt))
        .all();
    },
    latestReading(vehicleId: string) {
      return db
        .select()
        .from(odometerReadings)
        .where(eq(odometerReadings.vehicleId, vehicleId))
        .orderBy(desc(odometerReadings.date), desc(odometerReadings.value))
        .limit(1)
        .get();
    },
    findReading(vehicleId: string, id: string) {
      return db
        .select()
        .from(odometerReadings)
        .where(and(eq(odometerReadings.id, id), eq(odometerReadings.vehicleId, vehicleId)))
        .get();
    },
    createReading(values: NewOdometerReadingRow) {
      return db.insert(odometerReadings).values(values).returning().get();
    },
    deleteReading(id: string) {
      db.delete(odometerReadings).where(eq(odometerReadings.id, id)).run();
    },
  };
}

export type VehiclesRepository = ReturnType<typeof createVehiclesRepository>;
