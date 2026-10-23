import {
  CHANNEL_URL_CREDENTIALS,
  type CreateNotificationChannelInput,
  createNotificationChannelSchema,
  NOTIFICATION_CHANNEL_TYPES,
  type NotificationChannel,
  type NotificationChannelType,
  type UpdateNotificationChannelInput,
  updateNotificationChannelSchema,
} from '@ikrive/shared';
import { z } from 'zod';
import i18n from '@/i18n';

export type ChannelField = 'serverUrl' | 'url' | 'topic' | 'key' | 'tag' | 'token';

/** Config fields of each type, in display order. */
export const CHANNEL_FIELDS: Record<NotificationChannelType, readonly ChannelField[]> = {
  ntfy: ['serverUrl', 'topic', 'token'],
  gotify: ['serverUrl', 'token'],
  apprise: ['serverUrl', 'key', 'tag'],
  webhook: ['url', 'token'],
};

/**
 * Every field as text, whatever the type: switching the type in the form keeps what was typed.
 * Only the fields of the selected type are validated and sent.
 */
const channelFormShape = z.object({
  type: z.enum(NOTIFICATION_CHANNEL_TYPES),
  config: z.object({
    serverUrl: z.string(),
    url: z.string(),
    topic: z.string(),
    key: z.string(),
    tag: z.string(),
    token: z.string(),
  }),
});
export type ChannelFormValues = z.infer<typeof channelFormShape>;

/** `{ type, config }` with the fields of the type, trimmed, and blank ones left out. */
function pickConfig({ type, config }: ChannelFormValues) {
  const picked: Partial<Record<ChannelField, string>> = {};
  for (const field of CHANNEL_FIELDS[type]) {
    const value = config[field].trim();
    if (value) picked[field] = value;
  }
  return { type, config: picked };
}

/**
 * Translated message of a shared schema issue. The global zod error map already translates the
 * built-in ones; the credentials refine carries a literal English message that takes precedence.
 */
const issueMessage = (message: string) =>
  message === CHANNEL_URL_CREDENTIALS ? i18n.t('notificationChannels.errors.urlCredentials') : message;

/**
 * Validates the picked config with the shared schema of `mode` (a token is required to create a
 * Gotify channel but optional when editing) and reports its issues on the form fields
 * (`config.<field>`).
 */
export const channelFormSchema = (mode: 'create' | 'edit') => {
  const schema = mode === 'create' ? createNotificationChannelSchema : updateNotificationChannelSchema;
  return channelFormShape.superRefine((values, ctx) => {
    const result = schema.safeParse(pickConfig(values));
    if (result.success) return;
    for (const issue of result.error.issues) {
      ctx.addIssue({ code: 'custom', path: issue.path, message: issueMessage(issue.message) });
    }
  });
};

/** Form values for editing `channel` (its token is never sent back, so it starts blank), or a new ntfy one. */
export function defaultsFrom(channel?: NotificationChannel): ChannelFormValues {
  const config: Partial<Record<ChannelField, string | null>> = channel?.config ?? {};
  const text = (field: ChannelField) => config[field] ?? '';
  return {
    type: channel?.type ?? 'ntfy',
    config: {
      serverUrl: text('serverUrl'),
      url: text('url'),
      topic: text('topic'),
      key: text('key'),
      tag: text('tag'),
      token: '',
    },
  };
}

/** Body of `POST`; the API makes the new channel active. */
export function toCreateBody(values: ChannelFormValues): CreateNotificationChannelInput {
  return createNotificationChannelSchema.parse(pickConfig(values));
}

/** Body of `PATCH`: a blank token is left out so the API keeps the stored one. */
export function toUpdateBody(values: ChannelFormValues): UpdateNotificationChannelInput {
  return updateNotificationChannelSchema.parse(pickConfig(values));
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** Where a channel sends to, to tell the rows apart: the host, plus the ntfy topic or apprise key. */
export function channelSummary(channel: NotificationChannel): string {
  switch (channel.type) {
    case 'ntfy':
      return `${hostOf(channel.config.serverUrl)}/${channel.config.topic}`;
    case 'gotify':
      return hostOf(channel.config.serverUrl);
    case 'apprise':
      return `${hostOf(channel.config.serverUrl)}/${channel.config.key}`;
    case 'webhook':
      return hostOf(channel.config.url);
  }
}
