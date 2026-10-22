import { and, count, desc, eq, isNull, type SQL } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { notifications } from '../../db/schema';

export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotificationRow = typeof notifications.$inferInsert;

/** Every query filters by `userId`: a user only ever sees or changes their own notifications. */
export function createNotificationsRepository(db: Db) {
  const owned = (userId: string, id: string) =>
    and(eq(notifications.id, id), eq(notifications.userId, userId));
  const unread = (userId: string) => and(eq(notifications.userId, userId), isNull(notifications.readAt));
  const countWhere = (where: SQL | undefined) =>
    db.select({ value: count() }).from(notifications).where(where).get()?.value ?? 0;

  return {
    /** Newest first; `id` breaks ties between rows inserted in the same millisecond (one job run). */
    listByUser(userId: string, limit: number, offset: number) {
      return db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(limit)
        .offset(offset)
        .all();
    },
    countByUser(userId: string) {
      return countWhere(eq(notifications.userId, userId));
    },
    countUnread(userId: string) {
      return countWhere(unread(userId));
    },
    findOwned(userId: string, id: string) {
      return db.select().from(notifications).where(owned(userId, id)).get();
    },
    /** Sets `readAt` only when it is still null, so marking twice keeps the first read time. */
    markRead(userId: string, id: string, now = new Date()) {
      db.update(notifications)
        .set({ readAt: now })
        .where(and(owned(userId, id), isNull(notifications.readAt)))
        .run();
      return db.select().from(notifications).where(owned(userId, id)).get();
    },
    markAllRead(userId: string, now = new Date()) {
      db.update(notifications).set({ readAt: now }).where(unread(userId)).run();
    },
    /** Inserts the rows whose `dedupeKey` is new and returns only those (duplicates are skipped). */
    createMany(rows: NewNotificationRow[]) {
      if (rows.length === 0) return [];
      return db
        .insert(notifications)
        .values(rows)
        .onConflictDoNothing({ target: notifications.dedupeKey })
        .returning()
        .all();
    },
  };
}

export type NotificationsRepository = ReturnType<typeof createNotificationsRepository>;
