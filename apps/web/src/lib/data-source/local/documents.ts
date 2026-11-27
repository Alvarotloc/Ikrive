import { vehicleDocuments } from '@ikrive/db/schema';
import {
  createVehicleDocumentSchema,
  documentStatus,
  updateVehicleDocumentSchema,
  type VehicleDocument,
} from '@ikrive/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { DataSource } from '../types';
import { deleteAttachmentsOf } from './attachments';
import type { LocalDb } from './database';
import { type LocalDeps, removeFiles } from './files';
import { notFound, parseInput } from './problems';
import { localToday } from './settings';
import { requireVehicle } from './vehicles';

export type VehicleDocumentRow = typeof vehicleDocuments.$inferSelect;

/** The status is computed for today in the user's time zone, as the API does. */
const toDto = ({ createdAt, updatedAt, ...fields }: VehicleDocumentRow, today: string): VehicleDocument => ({
  ...fields,
  status: documentStatus(fields, today),
  createdAt: createdAt.toISOString(),
  updatedAt: updatedAt.toISOString(),
});

/** Soonest expiry first and undated documents last; on the same date, oldest first. */
function listDocuments(db: LocalDb, vehicleId: string): Promise<VehicleDocumentRow[]> {
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
}

async function requireDocument(db: LocalDb, vehicleId: string, documentId: string) {
  await requireVehicle(db, vehicleId);
  const document = await db
    .select()
    .from(vehicleDocuments)
    .where(and(eq(vehicleDocuments.id, documentId), eq(vehicleDocuments.vehicleId, vehicleId)))
    .get();
  if (!document) throw notFound('Document not found');
  return document;
}

/** `documents` of the local `DataSource`: the same rules and problems as the API's service. */
export function localDocuments(db: LocalDb, { files }: LocalDeps): DataSource['documents'] {
  return {
    async list(vehicleId) {
      await requireVehicle(db, vehicleId);
      const today = await localToday(db);
      return (await listDocuments(db, vehicleId)).map((row) => toDto(row, today));
    },

    async create(vehicleId, input) {
      const document = parseInput(createVehicleDocumentSchema, input);
      await requireVehicle(db, vehicleId);
      const row = await db
        .insert(vehicleDocuments)
        .values({ ...document, vehicleId })
        .returning()
        .get();
      return toDto(row, await localToday(db));
    },

    async update(vehicleId, documentId, input) {
      const changes = parseInput(updateVehicleDocumentSchema, input);
      const document = await requireDocument(db, vehicleId, documentId);
      const row = await db
        .update(vehicleDocuments)
        .set(changes)
        .where(eq(vehicleDocuments.id, document.id))
        .returning()
        .get();
      return toDto(row, await localToday(db));
    },

    /** Deletes the document and its attachments: rows in the same transaction, files afterwards. */
    async remove(vehicleId, documentId) {
      const document = await requireDocument(db, vehicleId, documentId);
      const keys = await db.transaction(async (tx) => {
        const removed = await deleteAttachmentsOf(tx, 'document', [document.id]);
        await tx.delete(vehicleDocuments).where(eq(vehicleDocuments.id, document.id));
        return removed;
      });
      await removeFiles(files, keys);
    },
  };
}
