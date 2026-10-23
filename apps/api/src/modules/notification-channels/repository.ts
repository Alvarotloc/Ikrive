import type { NotificationChannelConfig } from '@ikrive/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { notificationChannels } from '../../db/schema';

export type NotificationChannelRow = typeof notificationChannels.$inferSelect;
export type NewNotificationChannelRow = typeof notificationChannels.$inferInsert;
type ChannelChanges = Partial<Pick<NotificationChannelRow, 'enabled' | 'config'>>;

/** Every user-facing query filters by `userId`: a user only ever sees or changes their own channels. */
export function createNotificationChannelsRepository(db: Db) {
  const owned = (userId: string, id: string) =>
    and(eq(notificationChannels.id, id), eq(notificationChannels.userId, userId));

  return {
    /** Oldest first; `id` breaks ties between rows created in the same millisecond. */
    listByUser(userId: string) {
      return db
        .select()
        .from(notificationChannels)
        .where(eq(notificationChannels.userId, userId))
        .orderBy(asc(notificationChannels.createdAt), asc(notificationChannels.id))
        .all();
    },
    findOwned(userId: string, id: string) {
      return db.select().from(notificationChannels).where(owned(userId, id)).get();
    },
    create(values: NewNotificationChannelRow) {
      return db.insert(notificationChannels).values(values).returning().get();
    },
    update(userId: string, id: string, changes: ChannelChanges) {
      return db.update(notificationChannels).set(changes).where(owned(userId, id)).returning().get();
    },
    remove(userId: string, id: string) {
      db.delete(notificationChannels).where(owned(userId, id)).run();
    },
    /** Enabled channels of the given users (used by the jobs, not by the API). */
    listEnabledByUsers(userIds: string[]) {
      if (userIds.length === 0) return [];
      return db
        .select()
        .from(notificationChannels)
        .where(and(inArray(notificationChannels.userId, userIds), eq(notificationChannels.enabled, true)))
        .orderBy(asc(notificationChannels.createdAt), asc(notificationChannels.id))
        .all();
    },
    /** Stores the error of a failed send, or clears it (`null`) after a successful one. */
    setLastError(id: string, error: string | null) {
      db.update(notificationChannels).set({ lastError: error }).where(eq(notificationChannels.id, id)).run();
    },
  };
}

export type NotificationChannelsRepository = ReturnType<typeof createNotificationChannelsRepository>;

/**
 * Type and config of a stored channel. Both columns are written together from the shared schema
 * (`type` never changes), so the pair is always consistent.
 */
export const channelConfigOf = ({ type, config }: NotificationChannelRow) =>
  ({ type, config }) as NotificationChannelConfig;
