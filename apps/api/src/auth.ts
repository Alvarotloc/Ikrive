import { APIError, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { count } from 'drizzle-orm';
import type { Config } from './config';
import type { Db } from './db/client';
import * as schema from './db/schema';

export type Auth = ReturnType<typeof createAuth>;
export type SessionUser = Auth['$Infer']['Session']['user'];

export function createAuth(db: Db, config: Config) {
  const countUsers = () => db.select({ value: count() }).from(schema.user).get()?.value ?? 0;

  return betterAuth({
    appName: 'Ikrive',
    baseURL: config.BASE_URL,
    basePath: '/api/auth',
    secret: config.AUTH_SECRET,
    trustedOrigins:
      config.NODE_ENV === 'development'
        ? [config.BASE_URL, 'http://localhost:5173', 'http://localhost:5174']
        : [config.BASE_URL],
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    user: {
      additionalFields: {
        role: { type: 'string', required: false, defaultValue: 'user', input: false },
      },
    },
    rateLimit: { enabled: config.NODE_ENV === 'production' },
    databaseHooks: {
      user: {
        create: {
          // The first account becomes the instance admin. Later sign-ups can be disabled.
          before: async (data) => {
            const existing = countUsers();
            if (existing > 0 && config.DISABLE_SIGNUP) {
              throw new APIError('FORBIDDEN', { message: 'Sign-up is disabled on this instance' });
            }
            return { data: { ...data, role: existing === 0 ? 'admin' : 'user' } };
          },
          after: async (created) => {
            db.insert(schema.userSettings).values({ userId: created.id }).onConflictDoNothing().run();
          },
        },
      },
    },
  });
}
