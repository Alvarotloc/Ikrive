import { z } from 'zod';
import { DISTANCE_UNITS, LOCALES, VOLUME_UNITS } from '../enums';

export const userSettingsSchema = z.object({
  currency: z.string().length(3).toUpperCase(),
  distanceUnit: z.enum(DISTANCE_UNITS),
  volumeUnit: z.enum(VOLUME_UNITS),
  locale: z.enum(LOCALES),
  timezone: z.string().min(1),
  /** Day of week (0 = Sunday) on which the user is reminded to log the odometer. */
  odometerReminderWeekday: z.number().int().min(0).max(6),
});
export type UserSettings = z.infer<typeof userSettingsSchema>;

export const updateUserSettingsSchema = userSettingsSchema.partial();
export type UpdateUserSettings = z.infer<typeof updateUserSettingsSchema>;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  currency: 'EUR',
  distanceUnit: 'km',
  volumeUnit: 'l',
  locale: 'es',
  timezone: 'Europe/Madrid',
  odometerReminderWeekday: 0,
};
