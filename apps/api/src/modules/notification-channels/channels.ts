import type { NotificationChannelConfig, NotificationType } from '@ikrive/shared';

/** A channel that does not answer in this time is given up (no retries). */
export const CHANNEL_TIMEOUT_MS = 10_000;

/** Longest error stored in `last_error` and returned by the test endpoint. */
const MAX_ERROR_LENGTH = 500;

/** Text sent through a channel, already composed in the owner's language. */
export interface ChannelMessage {
  event: 'notification' | 'test';
  /** In-app notification type; `null` for the test message. */
  type: NotificationType | null;
  title: string;
  body: string;
  /** Absolute URL into the app, if any. */
  link: string | null;
  createdAt: string;
}

export interface NotificationChannel {
  /** Resolves when the service answers 2xx; rejects with a short, storable error otherwise. */
  send(message: ChannelMessage): Promise<void>;
}

/** Joins a base URL and a path without a double slash, whatever the user typed. */
const joinUrl = (base: string, path: string) => `${base.replace(/\/+$/, '')}${path}`;

const jsonRequest = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

const bearer = (token: string | undefined): Record<string, string> =>
  token ? { authorization: `Bearer ${token}` } : {};

/** The HTTP request each service expects for a message. Pure, so it is tested without a network. */
export function buildChannelRequest(
  channel: NotificationChannelConfig,
  message: ChannelMessage,
): { url: string; init: RequestInit } {
  const { title, body, link } = message;
  switch (channel.type) {
    case 'ntfy': {
      const { serverUrl, topic, token } = channel.config;
      return {
        url: joinUrl(serverUrl, '/'),
        init: jsonRequest({ topic, title, message: body, ...(link ? { click: link } : {}) }, bearer(token)),
      };
    }
    case 'gotify': {
      const { serverUrl, token } = channel.config;
      return {
        url: joinUrl(serverUrl, '/message'),
        init: jsonRequest(
          {
            title,
            message: body,
            priority: 5,
            ...(link ? { extras: { 'client::notification': { click: { url: link } } } } : {}),
          },
          { 'x-gotify-key': token },
        ),
      };
    }
    case 'apprise': {
      const { serverUrl, key, tag } = channel.config;
      return {
        url: joinUrl(serverUrl, `/notify/${key}`),
        init: jsonRequest({ title, body: link ? `${body}\n\n${link}` : body, ...(tag ? { tag } : {}) }),
      };
    }
    case 'webhook': {
      const { url, token } = channel.config;
      return {
        url,
        init: jsonRequest(
          { event: message.event, type: message.type, title, body, link, createdAt: message.createdAt },
          bearer(token),
        ),
      };
    }
  }
}

const truncate = (text: string) =>
  text.length > MAX_ERROR_LENGTH ? `${text.slice(0, MAX_ERROR_LENGTH - 1)}…` : text;

const isTimeout = (error: unknown) =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');

/** `fetch failed` alone says nothing: add the cause (DNS, refused connection…) when there is one. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? error.cause.message : null;
  return cause && cause !== error.message ? `${error.message}: ${cause}` : error.message;
}

export function createChannel(
  channel: NotificationChannelConfig,
  { fetch, timeoutMs = CHANNEL_TIMEOUT_MS }: { fetch: typeof globalThis.fetch; timeoutMs?: number },
): NotificationChannel {
  return {
    async send(message) {
      const { url, init } = buildChannelRequest(channel, message);
      let response: Response;
      try {
        response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      } catch (error) {
        throw new Error(isTimeout(error) ? `Timeout after ${timeoutMs} ms` : truncate(describe(error)));
      }
      // The body is not used: release the connection.
      await response.body?.cancel().catch(() => undefined);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    },
  };
}
