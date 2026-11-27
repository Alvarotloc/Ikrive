import { LOCAL_USER_ID } from '@ikrive/db';
import { attachments, maintenanceRecords, vehicleDocuments } from '@ikrive/db/schema';
import {
  type Attachment,
  type AttachmentEntityType,
  detectAttachmentType,
  sanitizeFileName,
} from '@ikrive/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { DataSource } from '../types';
import type { LocalDb, LocalTx } from './database';
import { assertUploadSize, fileBytes, type LocalDeps, localAttachmentUrl, removeFiles } from './files';
import { notFound, problem } from './problems';
import { requireVehicle } from './vehicles';

export type AttachmentRow = typeof attachments.$inferSelect;

/** The entity that owns some attachments: a maintenance record or a document of a vehicle. */
export interface AttachmentParent {
  entityType: AttachmentEntityType;
  vehicleId: string;
  entityId: string;
}

const FOLDER = 'attachments';
const UNSUPPORTED = 'Only PDF, JPEG, PNG and WebP files are allowed';

const unsupportedMediaType = () => problem(415, 'Unsupported Media Type', UNSUPPORTED);

export const isImage = (row: Pick<AttachmentRow, 'mimeType'>) => row.mimeType.startsWith('image/');

const toDto = (parent: AttachmentParent, row: AttachmentRow): Attachment => {
  const url = localAttachmentUrl(parent.vehicleId, parent.entityType, row.entityId, row.id);
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    sha256: row.sha256,
    url,
    thumbnailUrl: isImage(row) ? `${url}/thumbnail` : null,
    createdAt: row.createdAt.toISOString(),
  };
};

/** Hex SHA-256 of `data`. */
async function sha256(data: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data.slice()));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Ownership chain: vehicle -> record or document. Anything missing is reported as the API does. */
async function requireParent(db: LocalDb, { entityType, vehicleId, entityId }: AttachmentParent) {
  await requireVehicle(db, vehicleId);
  if (entityType === 'maintenance') {
    const record = await db
      .select({ id: maintenanceRecords.id })
      .from(maintenanceRecords)
      .where(and(eq(maintenanceRecords.id, entityId), eq(maintenanceRecords.vehicleId, vehicleId)))
      .get();
    if (!record) throw notFound('Maintenance record not found');
    return;
  }
  const document = await db
    .select({ id: vehicleDocuments.id })
    .from(vehicleDocuments)
    .where(and(eq(vehicleDocuments.id, entityId), eq(vehicleDocuments.vehicleId, vehicleId)))
    .get();
  if (!document) throw notFound('Document not found');
}

/** Ownership chain: vehicle -> record or document -> attachment. */
export async function requireAttachment(
  db: LocalDb,
  parent: AttachmentParent,
  attachmentId: string,
): Promise<AttachmentRow> {
  await requireParent(db, parent);
  const row = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.id, attachmentId),
        eq(attachments.entityType, parent.entityType),
        eq(attachments.entityId, parent.entityId),
      ),
    )
    .get();
  if (!row || row.ownerId !== LOCAL_USER_ID) throw notFound('Attachment not found');
  return row;
}

/** Deletes the attachment rows of the given records or documents and returns their storage keys. */
export async function deleteAttachmentsOf(
  tx: LocalTx,
  entityType: AttachmentEntityType,
  entityIds: readonly string[],
) {
  if (entityIds.length === 0) return [];
  const rows = await tx
    .delete(attachments)
    .where(and(eq(attachments.entityType, entityType), inArray(attachments.entityId, [...entityIds])))
    .returning({ storageKey: attachments.storageKey })
    .all();
  return rows.map((row) => row.storageKey);
}

type AttachmentsGroup = DataSource['attachments'] & DataSource['documentAttachments'];

/** The attachments of one kind of parent: the files go to the local store, their rows to `attachments`. */
function attachmentsOf(
  db: LocalDb,
  { files, images }: LocalDeps,
  entityType: AttachmentEntityType,
): AttachmentsGroup {
  const parentOf = (vehicleId: string, entityId: string): AttachmentParent => ({
    entityType,
    vehicleId,
    entityId,
  });

  return {
    /** In upload order (`rowid` breaks ties within the same millisecond). */
    async list(vehicleId, entityId) {
      const parent = parentOf(vehicleId, entityId);
      await requireParent(db, parent);
      const rows = await db
        .select()
        .from(attachments)
        .where(and(eq(attachments.entityType, entityType), eq(attachments.entityId, entityId)))
        .orderBy(asc(attachments.createdAt), asc(sql`${attachments}.rowid`))
        .all();
      return rows.map((row) => toDto(parent, row));
    },

    async upload(vehicleId, entityId, file) {
      const parent = parentOf(vehicleId, entityId);
      await requireParent(db, parent);
      assertUploadSize(file);
      const data = await fileBytes(file);
      const type = detectAttachmentType(data);
      if (!type) throw unsupportedMediaType();
      if (type.mimeType.startsWith('image/')) {
        await images.assertDecodable(data).catch(() => {
          throw unsupportedMediaType();
        });
      }

      const hash = await sha256(data);
      const storageKey = await files.save(FOLDER, data, type.extension);
      try {
        const row = await db
          .insert(attachments)
          .values({
            ownerId: LOCAL_USER_ID,
            entityType,
            entityId,
            originalName: sanitizeFileName(file.name, type.extension),
            mimeType: type.mimeType,
            size: data.length,
            sha256: hash,
            storageKey,
          })
          .returning()
          .get();
        return toDto(parent, row);
      } catch (error) {
        await removeFiles(files, [storageKey]);
        throw error;
      }
    },

    async remove(vehicleId, entityId, attachmentId) {
      const row = await requireAttachment(db, parentOf(vehicleId, entityId), attachmentId);
      await db.delete(attachments).where(eq(attachments.id, row.id));
      await removeFiles(files, [row.storageKey]);
    },
  };
}

/** `attachments` of the local `DataSource`: the attachments of maintenance records. */
export function localAttachments(db: LocalDb, deps: LocalDeps): DataSource['attachments'] {
  return attachmentsOf(db, deps, 'maintenance');
}

/** `documentAttachments` of the local `DataSource`: the attachments of documents. */
export function localDocumentAttachments(db: LocalDb, deps: LocalDeps): DataSource['documentAttachments'] {
  return attachmentsOf(db, deps, 'document');
}
