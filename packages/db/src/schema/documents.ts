import { DOCUMENT_TYPES } from '@ikrive/shared';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { vehicles } from './vehicles';

const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/**
 * Vehicle documents with an expiry date (insurance policy, registration, inspection...). Their files
 * are `attachments` rows with `entityType: 'document'`. Named so to tell it from the import `document`.
 */
export const vehicleDocuments = sqliteTable(
  'vehicle_documents',
  {
    id: id(),
    vehicleId: text()
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    /** Typed with `DOCUMENT_TYPES`; SQLite stores plain text and zod validates it. */
    type: text({ enum: DOCUMENT_TYPES }).notNull(),
    title: text().notNull(),
    /** Last valid day, `YYYY-MM-DD`; null when the document does not expire. */
    expiryDate: text(),
    /** Days before `expiryDate` from which the document is expiring (0..365). */
    warnDays: integer().notNull(),
    notes: text(),
    createdAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (t) => [index('vehicle_documents_vehicle_id_idx').on(t.vehicleId)],
);
