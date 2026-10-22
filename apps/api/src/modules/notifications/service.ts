import type { Notification, NotificationList } from '@ikrive/shared';
import { NotFoundError } from '../../lib/errors';
import type { NotificationRow, NotificationsRepository } from './repository';

/** `userId`, `vehicleId` and `dedupeKey` stay on the server. */
const toDto = ({ id, type, title, body, link, readAt, createdAt }: NotificationRow): Notification => ({
  id,
  type,
  title,
  body,
  link,
  readAt: readAt?.toISOString() ?? null,
  createdAt: createdAt.toISOString(),
});

export function createNotificationsService(repo: NotificationsRepository) {
  return {
    list(userId: string, { limit, offset }: { limit: number; offset: number }): NotificationList {
      return {
        items: repo.listByUser(userId, limit, offset).map(toDto),
        total: repo.countByUser(userId),
        unreadCount: repo.countUnread(userId),
      };
    },

    /** Other users' notifications are reported as missing so their ids are not disclosed. */
    markRead(userId: string, id: string): Notification {
      if (!repo.findOwned(userId, id)) throw new NotFoundError('Notification not found');
      const row = repo.markRead(userId, id);
      if (!row) throw new NotFoundError('Notification not found');
      return toDto(row);
    },

    markAllRead(userId: string) {
      repo.markAllRead(userId);
    },
  };
}

export type NotificationsService = ReturnType<typeof createNotificationsService>;
