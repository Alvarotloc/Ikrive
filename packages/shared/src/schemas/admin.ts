import { z } from 'zod';
import { ADMIN_USER_LOCK_REASONS, USER_ROLES, USER_STATUSES } from '../enums';

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

const lockSchema = z.enum(ADMIN_USER_LOCK_REASONS).nullable();

/** Admin actions that are not allowed on an account, with the reason; `null` = allowed. */
export const adminUserLocksSchema = z.object({ demote: lockSchema, disable: lockSchema, delete: lockSchema });
export type AdminUserLocks = z.infer<typeof adminUserLocksSchema>;

/** An account of the instance as seen by an admin. */
export const adminUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(USER_ROLES),
  status: z.enum(USER_STATUSES),
  disabledAt: z.string().nullable(),
  createdAt: z.string(),
  vehicleCount: z.number().int().min(0),
  isSelf: z.boolean(),
  locks: adminUserLocksSchema,
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminUserRoleUpdateSchema = z.object({ role: z.enum(USER_ROLES) });
export type AdminUserRoleUpdate = z.infer<typeof adminUserRoleUpdateSchema>;
