import { z } from 'zod';
import { optionalText } from './common';

/** Error of a channel URL with `user:password@`: `fetch` rejects them, the secret goes in `token`. */
export const CHANNEL_URL_CREDENTIALS = 'URLs with credentials are not allowed: use the token field';

/**
 * Authority of an http(s) URL as the WHATWG parser reads it: after the scheme and any slashes or
 * backslashes, up to the first `/`, `\`, `?` or `#`. A `@` in it means there is userinfo.
 * (`URL` is not available here: this package has no DOM or Node types.)
 */
const AUTHORITY = /^\s*[a-z][a-z\d+.-]*:[/\\]*([^/\\?#]*)/i;
const hasCredentials = (value: string) => AUTHORITY.exec(value)?.[1]?.includes('@') ?? false;

/**
 * Only `http(s)`: the server POSTs to this URL (LAN services such as Gotify or ntfy are allowed).
 * Without credentials, which `fetch` refuses to send and the API would return in `config`.
 */
const channelUrlSchema = z
  .url({ protocol: /^https?$/ })
  .max(2048)
  .refine((value) => !hasCredentials(value), { message: CHANNEL_URL_CREDENTIALS });
/** ntfy topic or apprise-api key: they go into the URL path or body as is. */
const channelSlugSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
/** Secret: stored as is, never returned by the API. */
const channelTokenSchema = z.string().trim().min(1).max(512);

export const ntfyConfigSchema = z.object({
  serverUrl: channelUrlSchema,
  topic: channelSlugSchema,
  token: channelTokenSchema.optional(),
});
export const gotifyConfigSchema = z.object({
  serverUrl: channelUrlSchema,
  token: channelTokenSchema,
});
export const appriseConfigSchema = z.object({
  serverUrl: channelUrlSchema,
  key: channelSlugSchema,
  tag: optionalText(128),
});
export const webhookConfigSchema = z.object({
  url: channelUrlSchema,
  token: channelTokenSchema.optional(),
});
export type NtfyConfig = z.infer<typeof ntfyConfigSchema>;
export type GotifyConfig = z.infer<typeof gotifyConfigSchema>;
export type AppriseConfig = z.infer<typeof appriseConfigSchema>;
export type WebhookConfig = z.infer<typeof webhookConfigSchema>;

/** Stored type and config of a channel (the config includes the token). */
export const notificationChannelConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ntfy'), config: ntfyConfigSchema }),
  z.object({ type: z.literal('gotify'), config: gotifyConfigSchema }),
  z.object({ type: z.literal('apprise'), config: appriseConfigSchema }),
  z.object({ type: z.literal('webhook'), config: webhookConfigSchema }),
]);
export type NotificationChannelConfig = z.infer<typeof notificationChannelConfigSchema>;

export const createNotificationChannelSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ntfy'), enabled: z.boolean().default(true), config: ntfyConfigSchema }),
  z.object({ type: z.literal('gotify'), enabled: z.boolean().default(true), config: gotifyConfigSchema }),
  z.object({ type: z.literal('apprise'), enabled: z.boolean().default(true), config: appriseConfigSchema }),
  z.object({ type: z.literal('webhook'), enabled: z.boolean().default(true), config: webhookConfigSchema }),
]);
export type CreateNotificationChannel = z.infer<typeof createNotificationChannelSchema>;
export type CreateNotificationChannelInput = z.input<typeof createNotificationChannelSchema>;

/**
 * `type` is required to validate the config and cannot change. A config without `token` keeps the
 * stored one.
 */
export const updateNotificationChannelSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ntfy'), enabled: z.boolean().optional(), config: ntfyConfigSchema.optional() }),
  z.object({
    type: z.literal('gotify'),
    enabled: z.boolean().optional(),
    config: gotifyConfigSchema.extend({ token: channelTokenSchema.optional() }).optional(),
  }),
  z.object({
    type: z.literal('apprise'),
    enabled: z.boolean().optional(),
    config: appriseConfigSchema.optional(),
  }),
  z.object({
    type: z.literal('webhook'),
    enabled: z.boolean().optional(),
    config: webhookConfigSchema.optional(),
  }),
]);
export type UpdateNotificationChannel = z.infer<typeof updateNotificationChannelSchema>;
export type UpdateNotificationChannelInput = z.input<typeof updateNotificationChannelSchema>;

const channelDtoFields = {
  id: z.string(),
  enabled: z.boolean(),
  /** Whether a token is stored; the token itself is never returned. */
  hasToken: z.boolean(),
  /** Error of the latest failed send, cleared by the next successful one. */
  lastError: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};

/** Channel as returned by the API: config without `token`. */
export const notificationChannelSchema = z.discriminatedUnion('type', [
  z.object({
    ...channelDtoFields,
    type: z.literal('ntfy'),
    config: z.object({ serverUrl: z.string(), topic: z.string() }),
  }),
  z.object({ ...channelDtoFields, type: z.literal('gotify'), config: z.object({ serverUrl: z.string() }) }),
  z.object({
    ...channelDtoFields,
    type: z.literal('apprise'),
    config: z.object({ serverUrl: z.string(), key: z.string(), tag: z.string().nullable().optional() }),
  }),
  z.object({ ...channelDtoFields, type: z.literal('webhook'), config: z.object({ url: z.string() }) }),
]);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

/** Result of `POST /notification-channels/:id/test`: a failed send is not an HTTP error. */
export const notificationChannelTestResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
});
export type NotificationChannelTestResult = z.infer<typeof notificationChannelTestResultSchema>;
