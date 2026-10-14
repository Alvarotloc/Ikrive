import type { UpdateUserSettings, UserSettings } from '@ikrive/shared';
import type { SettingsRepository } from './repository';

export function createSettingsService(repo: SettingsRepository) {
  const toDto = ({
    userId: _userId,
    ...settings
  }: NonNullable<ReturnType<SettingsRepository['findByUserId']>>) => settings satisfies UserSettings;

  return {
    get(userId: string): UserSettings {
      // Rows are created on sign-up; upserting covers users created before that hook existed.
      return toDto(repo.findByUserId(userId) ?? repo.upsert(userId, {}));
    },
    update(userId: string, changes: UpdateUserSettings): UserSettings {
      return toDto(repo.upsert(userId, changes));
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
