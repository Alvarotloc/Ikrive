import { and, asc, eq, getTableColumns, isNotNull, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { activeUserFilter } from '../../db/filters';
import { attachments, user, userSettings, vehicleDocuments, vehicles } from '../../db/schema';
import { activeVehicleFilter } from '../vehicles/repository';

export type VehicleDocumentRow = typeof vehicleDocuments.$inferSelect;
export type NewVehicleDocumentRow = typeof vehicleDocuments.$inferInsert;

export function createDocumentsRepository(db: Db) {
  return {
    /**
     * Soonest expiry first and undated documents last; on the same date, oldest first (`rowid` breaks
     * ties between documents created in the same millisecond).
     */
    listByVehicle(vehicleId: string) {
      return db
        .select()
        .from(vehicleDocuments)
        .where(eq(vehicleDocuments.vehicleId, vehicleId))
        .orderBy(
          sql`${vehicleDocuments.expiryDate} IS NULL`,
          asc(vehicleDocuments.expiryDate),
          asc(vehicleDocuments.createdAt),
          asc(sql`rowid`),
        )
        .all();
    },
    find(vehicleId: string, id: string) {
      return db
        .select()
        .from(vehicleDocuments)
        .where(and(eq(vehicleDocuments.id, id), eq(vehicleDocuments.vehicleId, vehicleId)))
        .get();
    },
    create(values: NewVehicleDocumentRow) {
      return db.insert(vehicleDocuments).values(values).returning().get();
    },
    update(id: string, changes: Partial<Omit<NewVehicleDocumentRow, 'id' | 'vehicleId'>>) {
      return db.update(vehicleDocuments).set(changes).where(eq(vehicleDocuments.id, id)).returning().get();
    },
    /** Deletes a document and its attachment rows (their files are removed by the service afterwards). */
    delete(id: string) {
      db.transaction((tx) => {
        tx.delete(attachments)
          .where(and(eq(attachments.entityType, 'document'), eq(attachments.entityId, id)))
          .run();
        tx.delete(vehicleDocuments).where(eq(vehicleDocuments.id, id)).run();
      });
    },
    /**
     * Dated documents of every user's active vehicles, with the vehicle's owner and name and the
     * owner's time zone and reminder hour (null when the owner has no settings row yet). For jobs.
     */
    listForActiveVehicles() {
      return db
        .select({
          ...getTableColumns(vehicleDocuments),
          ownerId: vehicles.ownerId,
          vehicleName: vehicles.name,
          vehicleMake: vehicles.make,
          vehicleModel: vehicles.model,
          timezone: userSettings.timezone,
          reminderHour: userSettings.reminderHour,
        })
        .from(vehicleDocuments)
        .innerJoin(vehicles, eq(vehicles.id, vehicleDocuments.vehicleId))
        .innerJoin(user, eq(user.id, vehicles.ownerId))
        .leftJoin(userSettings, eq(userSettings.userId, vehicles.ownerId))
        .where(and(isNotNull(vehicleDocuments.expiryDate), activeVehicleFilter, activeUserFilter))
        .all();
    },
  };
}

export type DocumentsRepository = ReturnType<typeof createDocumentsRepository>;
