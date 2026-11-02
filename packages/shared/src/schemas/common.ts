import { z } from 'zod';
import { USER_ROLES } from '../enums';

/** Optional free text: blank strings are stored as null. */
export const optionalText = (max: number, { upperCase = false } = {}) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (upperCase ? value.toUpperCase() : value) || null)
    .nullable()
    .optional();

/** Odometer value in the user's distance unit. */
export const odometerValueSchema = z.number().int().min(0).max(9_999_999);

/** Decimal amount in the user's currency. */
export const moneySchema = z.number().min(0).max(1_000_000_000);

export const idParamSchema = z.object({ id: z.string().min(1) });

/** RFC 7807 problem details returned by the API on errors. */
export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type Problem = z.infer<typeof problemSchema>;

export const healthSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
});
export type Health = z.infer<typeof healthSchema>;

export const meSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  role: z.enum(USER_ROLES),
});
export type Me = z.infer<typeof meSchema>;

/** Read-only server configuration the SPA needs (`GET /api/config`). */
export const clientConfigSchema = z.object({
  /** Largest file the API accepts in an upload, in MB (`MAX_UPLOAD_MB`). */
  maxUploadMb: z.number().int().positive(),
  /** `BASE_URL` points to a host only reachable from the local network (public links will not work outside). */
  localBaseUrl: z.boolean(),
});
export type ClientConfig = z.infer<typeof clientConfigSchema>;
