import { and, eq, getTableColumns } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { activeUserFilter } from '../../db/filters';
import { calendarFeeds, user } from '../../db/schema';

export type CalendarFeedRow = typeof calendarFeeds.$inferSelect;

export function createCalendarRepository(db: Db) {
  return {
    find(userId: string) {
      return db.select().from(calendarFeeds).where(eq(calendarFeeds.userId, userId)).get();
    },
    /** The feed of a token selector, unless its owner is disabled (then it behaves as an unknown token). */
    findBySelector(selector: string) {
      return db
        .select(getTableColumns(calendarFeeds))
        .from(calendarFeeds)
        .innerJoin(user, eq(user.id, calendarFeeds.userId))
        .where(and(eq(calendarFeeds.selector, selector), activeUserFilter))
        .get();
    },
    /** Creates the user's feed or replaces its token (selector, hash and creation date). */
    upsert(userId: string, values: Pick<CalendarFeedRow, 'selector' | 'verifierHash'>) {
      const createdAt = new Date();
      return db
        .insert(calendarFeeds)
        .values({ userId, ...values, createdAt })
        .onConflictDoUpdate({ target: calendarFeeds.userId, set: { ...values, createdAt } })
        .returning()
        .get();
    },
    delete(userId: string) {
      db.delete(calendarFeeds).where(eq(calendarFeeds.userId, userId)).run();
    },
  };
}

export type CalendarRepository = ReturnType<typeof createCalendarRepository>;
