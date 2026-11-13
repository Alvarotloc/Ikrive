import { ATTACHMENT_ENTITY_TYPES, ATTACHMENT_MIME_TYPES } from '@ikrive/shared';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './auth';

const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/**
 * Files attached to another entity. `entityId` has no foreign key because it is polymorphic, so
 * deleting the entity must delete its attachments (rows and files) in code. Attachments are
 * immutable: replacing one means deleting it and uploading another.
 */
export const attachments = sqliteTable(
  'attachments',
  {
    id: id(),
    ownerId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    entityType: text({ enum: ATTACHMENT_ENTITY_TYPES }).notNull(),
    entityId: text().notNull(),
    /** Name sent by the client. Only used for the download; never touches the disk. */
    originalName: text().notNull(),
    /** Detected from the contents, not the type declared by the client. */
    mimeType: text({ enum: ATTACHMENT_MIME_TYPES }).notNull(),
    /** Bytes. */
    size: integer().notNull(),
    /** Hex SHA-256 of the contents. */
    sha256: text().notNull(),
    /** Random key inside the uploads directory, e.g. `attachments/<uuid>.pdf`. */
    storageKey: text().notNull().unique(),
    createdAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('attachments_entity_idx').on(t.entityType, t.entityId)],
);
