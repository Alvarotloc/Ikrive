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
   * because of a send. Returns how many messages (channel × notification) went through or failed.
   */
  dispatch(rows: NotificationRow[]): Promise<DispatchResult>;
  /** Sends the test message, even through a disabled channel, and stores the result like a real send. */
  sendTest(channel: NotificationChannelRow): Promise<NotificationChannelTestResult>;
}

export interface DispatchResult {
  sent: number;
  failed: number;
}

interface Delivery extends NotificationChannelTestResult {
  sent: number;
  failed: number;
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

  /**
   * Sends the messages one after another, counts the failed ones and keeps the last error, or clears
   * it if all went through.
   */
  const deliver = async (channel: NotificationChannelRow, messages: ChannelMessage[]): Promise<Delivery> => {
    const sender = createChannel(channelConfigOf(channel), { fetch, timeoutMs });
    let error: string | null = null;
    let failed = 0;
    for (const message of messages) {
      try {
        await sender.send(message);
      } catch (cause) {
        error = errorMessage(cause);
        failed++;
      }
    }
    channels.setLastError(channel.id, error);
    return { ok: error === null, error, sent: messages.length - failed, failed };
  };

  return {
    async dispatch(rows) {
      if (rows.length === 0) return { sent: 0, failed: 0 };
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
      const result: DispatchResult = { sent: 0, failed: 0 };
      for (const outcome of await Promise.allSettled(sends)) {
        // `deliver` only rejects on a storage error; its messages are not counted as sent.
        if (outcome.status !== 'fulfilled') continue;
        result.sent += outcome.value.sent;
        result.failed += outcome.value.failed;
      }
      return result;
    },

    async sendTest(channel) {
      const { ok, error } = await deliver(channel, [testMessage(localeOf(channel.userId))]);
      return { ok, error };
    },
  };
}
