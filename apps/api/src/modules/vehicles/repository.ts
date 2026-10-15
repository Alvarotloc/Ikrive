import type { VehicleStatus } from '@ikrive/shared';
import { and, desc, eq, inArray, isNotNull, isNull, type SQL } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { attachments, maintenanceRecords, odometerReadings, vehicles } from '../../db/schema';

export type VehicleRow = typeof vehicles.$inferSelect;
export type NewVehicleRow = typeof vehicles.$inferInsert;
export type OdometerReadingRow = typeof odometerReadings.$inferSelect;
export type NewOdometerReadingRow = typeof odometerReadings.$inferInsert;

const statusFilter: Record<VehicleStatus, SQL | undefined> = {
  active: and(isNull(vehicles.soldAt), isNull(vehicles.archivedAt)),
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
     * Deletes a vehicle. Its readings and maintenance records go with it through the foreign keys;
     * the attachment rows of those records have no foreign key, so they are deleted first here
     * (their files are removed by the service afterwards).
     */
    delete(id: string) {
      db.transaction((tx) => {
        const records = tx
          .select({ id: maintenanceRecords.id })
          .from(maintenanceRecords)
          .where(eq(maintenanceRecords.vehicleId, id));
        tx.delete(attachments)
          .where(and(eq(attachments.entityType, 'maintenance'), inArray(attachments.entityId, records)))
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
