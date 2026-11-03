import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const INSECURE_DEV_SECRET = 'ikrive-insecure-development-secret-change-me';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().positive().default(3000),
    BASE_URL: z.url().default('http://localhost:3000'),
    AUTH_SECRET: z.string().min(32).optional(),
    DATA_DIR: z.string().default('./data'),
    DISABLE_SIGNUP: booleanString.default(false),
    /** Schedules the hourly reminders job in `server.ts`. */
    REMINDERS_ENABLED: booleanString.default(true),
    MAX_UPLOAD_MB: z.coerce.number().int().positive().default(20),
    /** Total size, in MB of stored files, of the invoices appended to one sale report. */
    REPORT_MAX_ANNEX_MB: z.coerce.number().int().positive().default(100),
    /** Size, in MB, of an uploaded export zip and of the uncompressed files the import reads from it. */
    IMPORT_MAX_MB: z.coerce.number().int().positive().default(1024),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    /** Directory with the built SPA. When set, the API also serves the frontend. */
    WEB_DIST_DIR: z.string().optional(),
  })
  .transform((env, ctx) => {
    if (!env.AUTH_SECRET && env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_SECRET'],
        message: 'AUTH_SECRET is required in production',
      });
      return z.NEVER;
    }
    return { ...env, AUTH_SECRET: env.AUTH_SECRET ?? INSECURE_DEV_SECRET };
  });

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
