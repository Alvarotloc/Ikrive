import { DEFAULT_USER_SETTINGS, DISTANCE_UNITS, LOCALES, VOLUME_UNITS } from '@ikrive/shared';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './auth';

export const userSettings = sqliteTable('user_settings', {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  currency: text().notNull().default(DEFAULT_USER_SETTINGS.currency),
  distanceUnit: text({ enum: DISTANCE_UNITS }).notNull().default(DEFAULT_USER_SETTINGS.distanceUnit),
  volumeUnit: text({ enum: VOLUME_UNITS }).notNull().default(DEFAULT_USER_SETTINGS.volumeUnit),
  locale: text({ enum: LOCALES }).notNull().default(DEFAULT_USER_SETTINGS.locale),
  timezone: text().notNull().default(DEFAULT_USER_SETTINGS.timezone),
  odometerReminderWeekday: integer().notNull().default(DEFAULT_USER_SETTINGS.odometerReminderWeekday),
  /** Local hour (0-23) from which the reminders job notifies the user. */
  reminderHour: integer().notNull().default(DEFAULT_USER_SETTINGS.reminderHour),
});
