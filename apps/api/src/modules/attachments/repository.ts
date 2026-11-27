import type { AttachmentEntityType } from '@ikrive/shared';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { attachments, maintenanceRecords, vehicleDocuments } from '../../db/schema';

export type AttachmentRow = typeof attachments.$inferSelect;
export type NewAttachmentRow = typeof attachments.$inferInsert;

export function createAttachmentsRepository(db: Db) {
  return {
    /** Attachments of an entity in upload order (`rowid` breaks ties within the same millisecond). */
    listByEntity(entityType: AttachmentEntityType, entityId: string) {
      return db
        .select()
        .from(attachments)
        .where(and(eq(attachments.entityType, entityType), eq(attachments.entityId, entityId)))
        .orderBy(asc(attachments.createdAt), asc(sql`${attachments}.rowid`))
        .all();
    },
    find(entityType: AttachmentEntityType, entityId: string, id: string) {
      return db
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.id, id),
            eq(attachments.entityType, entityType),
            eq(attachments.entityId, entityId),
          ),
        )
        .get();
    },
    create(values: NewAttachmentRow) {
      return db.insert(attachments).values(values).returning().get();
    },
    delete(id: string) {
      db.delete(attachments).where(eq(attachments.id, id)).run();
    },
    /** Attachments of every maintenance record and document of a vehicle. */
    listByVehicle(vehicleId: string) {
      const records = db
        .select({ id: maintenanceRecords.id })
        .from(maintenanceRecords)
        .where(eq(maintenanceRecords.vehicleId, vehicleId));
      const documents = db
        .select({ id: vehicleDocuments.id })
        .from(vehicleDocuments)
        .where(eq(vehicleDocuments.vehicleId, vehicleId));
      return db
        .select()
        .from(attachments)
        .where(
          or(
            and(eq(attachments.entityType, 'maintenance'), inArray(attachments.entityId, records)),
            and(eq(attachments.entityType, 'document'), inArray(attachments.entityId, documents)),
          ),
        )
        .all();
    },
  };
}

export type AttachmentsRepository = ReturnType<typeof createAttachmentsRepository>;
