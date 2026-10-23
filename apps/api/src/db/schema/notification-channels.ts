import { NOTIFICATION_CHANNEL_TYPES, type NotificationChannelConfig } from '@ikrive/shared';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './auth';

const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

export const notificationChannels = sqliteTable(
  'notification_channels',
  {
    id: id(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text({ enum: NOTIFICATION_CHANNEL_TYPES }).notNull(),
    /** Config of `type`, validated by the shared schema. Includes the token in clear. */
    config: text({ mode: 'json' }).notNull().$type<NotificationChannelConfig['config']>(),
    enabled: integer({ mode: 'boolean' }).notNull().default(true),
    /** Error of the latest failed send; a successful send clears it. */
    lastError: text(),
    createdAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (t) => [index('notification_channels_user_id_idx').on(t.userId)],
);
