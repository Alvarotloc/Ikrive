import { z } from 'zod';

/** State of the user's iCal feed. The URL is only known right after enabling or regenerating it. */
export const calendarFeedSchema = z.object({
  enabled: z.boolean(),
  createdAt: z.string().nullable(),
});
export type CalendarFeed = z.infer<typeof calendarFeedSchema>;

/** Response of enabling/regenerating the feed: the only time the secret URL is returned. */
export const calendarFeedSecretSchema = calendarFeedSchema.extend({
  enabled: z.literal(true),
  createdAt: z.string(),
  url: z.url(),
});
export type CalendarFeedSecret = z.infer<typeof calendarFeedSecretSchema>;
