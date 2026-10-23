import { DEFAULT_USER_SETTINGS, type Locale, type NotificationChannelTestResult } from '@ikrive/shared';
import type { Db } from '../../db/client';
import type { NotificationRow } from '../notifications/repository';
import { createSettingsRepository } from '../settings/repository';
import { type ChannelMessage, createChannel } from './channels';
import { testMessage, toChannelMessage } from './messages';
import {
  channelConfigOf,
  createNotificationChannelsRepository,
  type NotificationChannelRow,
} from './repository';

export interface NotificationDispatcher {
  /**
   * Sends freshly created in-app notifications through their owners' enabled channels. Each channel
   * stores its error or clears it; a failing channel does not stop the others and this never rejects
   * because of a send.
   */
  dispatch(rows: NotificationRow[]): Promise<void>;
  /** Sends the test message, even through a disabled channel, and stores the result like a real send. */
  sendTest(channel: NotificationChannelRow): Promise<NotificationChannelTestResult>;
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createNotificationDispatcher({
  db,
  fetch,
  baseUrl,
  timeoutMs,
}: {
  db: Db;
  fetch: typeof globalThis.fetch;
  baseUrl: string;
  timeoutMs?: number;
}): NotificationDispatcher {
  const channels = createNotificationChannelsRepository(db);
  const settings = createSettingsRepository(db);
  const localeOf = (userId: string): Locale =>
    settings.findByUserId(userId)?.locale ?? DEFAULT_USER_SETTINGS.locale;

  /** Sends the messages one after another and keeps the last error, or clears it if all went through. */
  const deliver = async (
    channel: NotificationChannelRow,
    messages: ChannelMessage[],
  ): Promise<NotificationChannelTestResult> => {
    const sender = createChannel(channelConfigOf(channel), { fetch, timeoutMs });
    let error: string | null = null;
    for (const message of messages) {
      try {
        await sender.send(message);
      } catch (cause) {
        error = errorMessage(cause);
      }
    }
    channels.setLastError(channel.id, error);
    return { ok: error === null, error };
  };

  return {
    async dispatch(rows) {
      if (rows.length === 0) return;
      const byUser = new Map<string, NotificationRow[]>();
      for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);
      const locales = new Map<string, Locale>();
      const sends = channels.listEnabledByUsers([...byUser.keys()]).map((channel) => {
        const locale = locales.get(channel.userId) ?? localeOf(channel.userId);
        locales.set(channel.userId, locale);
        const messages = (byUser.get(channel.userId) ?? []).map((row) =>
          toChannelMessage(row, locale, baseUrl),
        );
        return deliver(channel, messages);
      });
      await Promise.allSettled(sends);
    },

    sendTest(channel) {
      return deliver(channel, [testMessage(localeOf(channel.userId))]);
    },
  };
}
