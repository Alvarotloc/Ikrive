import { z } from 'zod';

/** Background jobs an admin can run by hand (endpoint and CLI script). */
export const JOB_NAMES = ['reminders', 'odometer-nudge'] as const;
export type JobName = (typeof JOB_NAMES)[number];

/**
 * Result of a manual job run: evaluated entries, in-app notifications created (deduplicated ones do
 * not count) and channel messages that failed to send.
 */
export const jobRunSummarySchema = z.object({
  job: z.enum(JOB_NAMES),
  evaluated: z.number().int(),
  created: z.number().int(),
  failed: z.number().int(),
});
export type JobRunSummary = z.infer<typeof jobRunSummarySchema>;
