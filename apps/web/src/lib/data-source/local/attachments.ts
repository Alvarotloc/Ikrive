import { LOCAL_USER_ID } from '@ikrive/db';
import { attachments, maintenanceRecords } from '@ikrive/db/schema';
import { type Attachment, detectAttachmentType, sanitizeFileName } from '@ikrive/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { DataSource } from '../types';
import type { LocalDb, LocalTx } from './database';
import { assertUploadSize, fileBytes, type LocalDeps, localAttachmentUrl, removeFiles } from './files';
import { notFound, problem } from './problems';
import { requireVehicle } from './vehicles';

export type AttachmentRow = typeof attachments.$inferSelect;

const FOLDER = 'attachments';
const UNSUPPORTED = 'Only PDF, JPEG, PNG and WebP files are allowed';

const unsupportedMediaType = () => problem(415, 'Unsupported Media Type', UNSUPPORTED);

export const isImage = (row: Pick<AttachmentRow, 'mimeType'>) => row.mimeType.startsWith('image/');

const toDto = (vehicleId: string, row: AttachmentRow): Attachment => {
  const url = localAttachmentUrl(vehicleId, row.entityId, row.id);
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

/** Ownership chain: vehicle -> record. Anything missing is reported as the API does. */
async function requireRecord(db: LocalDb, vehicleId: string, recordId: string) {
  await requireVehicle(db, vehicleId);
  const record = await db
    .select()
    .from(maintenanceRecords)
    .where(and(eq(maintenanceRecords.id, recordId), eq(maintenanceRecords.vehicleId, vehicleId)))
    .get();
  if (!record) throw notFound('Maintenance record not found');
  return record;
}

/** Ownership chain: vehicle -> record -> attachment. */
export async function requireAttachment(
  db: LocalDb,
  vehicleId: string,
  recordId: string,
  attachmentId: string,
): Promise<AttachmentRow> {
  await requireRecord(db, vehicleId, recordId);
  const row = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.id, attachmentId),
        eq(attachments.entityType, 'maintenance'),
        eq(attachments.entityId, recordId),
      ),
    )
    .get();
  if (!row || row.ownerId !== LOCAL_USER_ID) throw notFound('Attachment not found');
  return row;
}

/** Deletes the attachment rows of the given maintenance records and returns their storage keys. */
export async function deleteMaintenanceAttachments(tx: LocalTx, recordIds: readonly string[]) {
  if (recordIds.length === 0) return [];
  const rows = await tx
    .delete(attachments)
    .where(and(eq(attachments.entityType, 'maintenance'), inArray(attachments.entityId, [...recordIds])))
    .returning({ storageKey: attachments.storageKey })
    .all();
  return rows.map((row) => row.storageKey);
}

/** `attachments` of the local `DataSource`: the files go to the local store, their rows to `attachments`. */
export function localAttachments(db: LocalDb, { files, images }: LocalDeps): DataSource['attachments'] {
  return {
    /** In upload order (`rowid` breaks ties within the same millisecond). */
    async list(vehicleId, recordId) {
      await requireRecord(db, vehicleId, recordId);
      const rows = await db
        .select()
        .from(attachments)
        .where(and(eq(attachments.entityType, 'maintenance'), eq(attachments.entityId, recordId)))
        .orderBy(asc(attachments.createdAt), asc(sql`${attachments}.rowid`))
        .all();
      return rows.map((row) => toDto(vehicleId, row));
    },

    async upload(vehicleId, recordId, file) {
      await requireRecord(db, vehicleId, recordId);
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
            entityType: 'maintenance',
            entityId: recordId,
            originalName: sanitizeFileName(file.name, type.extension),
            mimeType: type.mimeType,
            size: data.length,
            sha256: hash,
            storageKey,
          })
          .returning()
          .get();
        return toDto(vehicleId, row);
      } catch (error) {
        await removeFiles(files, [storageKey]);
        throw error;
      }
    },

    async remove(vehicleId, recordId, attachmentId) {
      const row = await requireAttachment(db, vehicleId, recordId, attachmentId);
      await db.delete(attachments).where(eq(attachments.id, row.id));
      await removeFiles(files, [row.storageKey]);
    },
  };
}
