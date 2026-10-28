import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { calendarFeeds } from '../../db/schema';

export type CalendarFeedRow = typeof calendarFeeds.$inferSelect;

export function createCalendarRepository(db: Db) {
  return {
    find(userId: string) {
      return db.select().from(calendarFeeds).where(eq(calendarFeeds.userId, userId)).get();
    },
    findBySelector(selector: string) {
      return db.select().from(calendarFeeds).where(eq(calendarFeeds.selector, selector)).get();
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
