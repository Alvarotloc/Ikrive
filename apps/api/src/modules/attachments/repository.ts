import type { AttachmentEntityType } from '@ikrive/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { attachments, maintenanceRecords } from '../../db/schema';

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
    /** Attachments of every maintenance record of a vehicle. */
    listByVehicle(vehicleId: string) {
      return db
        .select({ attachment: attachments })
        .from(attachments)
        .innerJoin(maintenanceRecords, eq(attachments.entityId, maintenanceRecords.id))
        .where(and(eq(attachments.entityType, 'maintenance'), eq(maintenanceRecords.vehicleId, vehicleId)))
        .all()
        .map(({ attachment }) => attachment);
    },
  };
}

export type AttachmentsRepository = ReturnType<typeof createAttachmentsRepository>;
