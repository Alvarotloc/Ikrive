import { LOCAL_USER_ID } from '@ikrive/db';
import { userSettings } from '@ikrive/db/schema';
import { todayIn, type UserSettings, updateUserSettingsSchema } from '@ikrive/shared';
import { eq } from 'drizzle-orm';
import type { DataSource } from '../types';
import type { LocalDb } from './database';
import { parseInput } from './problems';

type SettingsRow = typeof userSettings.$inferSelect;

const toDto = ({ userId: _userId, ...settings }: SettingsRow): UserSettings => settings;

/** The local user's settings row, created with the defaults if it is missing (as the API's `get`). */
export async function settingsRow(db: LocalDb): Promise<SettingsRow> {
  const row = await db.select().from(userSettings).where(eq(userSettings.userId, LOCAL_USER_ID)).get();
  if (row) return row;
  return db.insert(userSettings).values({ userId: LOCAL_USER_ID }).returning().get();
}

/** Today in the local user's time zone (`YYYY-MM-DD`): the limit of every dated write. */
export async function localToday(db: LocalDb): Promise<string> {
  return todayIn((await settingsRow(db)).timezone);
}

/** `settings` of the local `DataSource`: the settings row of the local user. */
export function localSettings(db: LocalDb): DataSource['settings'] {
  return {
    async get() {
      return toDto(await settingsRow(db));
    },
    async update(changes) {
      const values = parseInput(updateUserSettingsSchema, changes);
      if (Object.keys(values).length === 0) return toDto(await settingsRow(db));
      const row = await db
        .insert(userSettings)
        .values({ userId: LOCAL_USER_ID, ...values })
        .onConflictDoUpdate({ target: userSettings.userId, set: values })
        .returning()
        .get();
      return toDto(row);
    },
  };
}
