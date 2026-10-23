import {
  type CreateNotificationChannel,
  type NotificationChannel,
  type NotificationChannelTestResult,
  notificationChannelConfigSchema,
  notificationChannelSchema,
  type UpdateNotificationChannel,
} from '@ikrive/shared';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import type { NotificationDispatcher } from './dispatcher';
import type { NotificationChannelRow, NotificationChannelsRepository } from './repository';

interface NotificationChannelsServiceDeps {
  repo: NotificationChannelsRepository;
  dispatcher: NotificationDispatcher;
}

const storedToken = (row: NotificationChannelRow) => ('token' in row.config ? row.config.token : undefined);

/** `userId` and the token stay on the server; `hasToken` tells the web whether one is stored. */
const toDto = (row: NotificationChannelRow): NotificationChannel => {
  const { token: _token, ...config } = { token: undefined, ...row.config };
  return notificationChannelSchema.parse({
    id: row.id,
    type: row.type,
    enabled: row.enabled,
    hasToken: Boolean(storedToken(row)),
    lastError: row.lastError,
    config,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
};

export function createNotificationChannelsService({ repo, dispatcher }: NotificationChannelsServiceDeps) {
  /** Other users' channels are reported as missing so their ids are not disclosed. */
  const requireChannel = (userId: string, id: string) => {
    const channel = repo.findOwned(userId, id);
    if (!channel) throw new NotFoundError('Notification channel not found');
    return channel;
  };

  return {
    list(userId: string): NotificationChannel[] {
      return repo.listByUser(userId).map(toDto);
    },

    create(userId: string, { type, enabled, config }: CreateNotificationChannel): NotificationChannel {
      return toDto(repo.create({ userId, type, enabled, config }));
    },

    /** The type cannot change; a config without `token` keeps the stored one. */
    update(userId: string, id: string, input: UpdateNotificationChannel): NotificationChannel {
      const channel = requireChannel(userId, id);
      if (input.type !== channel.type) throw new BadRequestError('The channel type cannot change');
      let config: NotificationChannelRow['config'] | undefined;
      if (input.config) {
        // A JSON body has no `undefined`: without `token` in it, the stored one survives the spread.
        const token = storedToken(channel);
        const merged = notificationChannelConfigSchema.safeParse({
          type: input.type,
          config: { ...(token === undefined ? {} : { token }), ...input.config },
        });
        if (!merged.success) throw new BadRequestError('Invalid channel config');
        config = merged.data.config;
      }
      if (input.enabled === undefined && config === undefined) return toDto(channel);
      const row = repo.update(userId, id, { enabled: input.enabled, config });
      if (!row) throw new NotFoundError('Notification channel not found');
      return toDto(row);
    },

    remove(userId: string, id: string) {
      requireChannel(userId, id);
      repo.remove(userId, id);
    },

    test(userId: string, id: string): Promise<NotificationChannelTestResult> {
      return dispatcher.sendTest(requireChannel(userId, id));
    },
  };
}

export type NotificationChannelsService = ReturnType<typeof createNotificationChannelsService>;
