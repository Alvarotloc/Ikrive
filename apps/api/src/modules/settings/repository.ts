import type { UpdateUserSettings } from '@ikrive/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { userSettings } from '../../db/schema';

export function createSettingsRepository(db: Db) {
  return {
    findByUserId(userId: string) {
      return db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
    },
    upsert(userId: string, values: UpdateUserSettings) {
      return db
        .insert(userSettings)
        .values({ userId, ...values })
        .onConflictDoUpdate({ target: userSettings.userId, set: values })
        .returning()
        .get();
    },
  };
}

export type SettingsRepository = ReturnType<typeof createSettingsRepository>;
