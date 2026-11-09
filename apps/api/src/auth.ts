import { APIError, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import { count, eq } from 'drizzle-orm';
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
    // The web (BASE_URL, plus Vite in development) and the native clients of TRUSTED_ORIGINS.
    trustedOrigins: [
      config.BASE_URL,
      ...(config.NODE_ENV === 'development' ? ['http://localhost:5173', 'http://localhost:5174'] : []),
      ...config.TRUSTED_ORIGINS,
    ],
    // Native clients authenticate with `Authorization: Bearer <set-auth-token>` instead of the cookie.
    plugins: [bearer()],
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    user: {
      additionalFields: {
        role: { type: 'string', required: false, defaultValue: 'user', input: false },
      },
    },
    rateLimit: { enabled: config.NODE_ENV === 'production' },
    // Better Auth skips the origin (CSRF) check under NODE_ENV=test unless this is set: keep the
    // production behaviour everywhere so the tests check it too.
    advanced: { disableOriginCheck: false },
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
      session: {
        create: {
          // A disabled account cannot sign in. Its sessions were deleted when it was disabled.
          before: async (session) => {
            const owner = db
              .select({ disabledAt: schema.user.disabledAt })
              .from(schema.user)
              .where(eq(schema.user.id, session.userId))
              .get();
            if (owner?.disabledAt) throw new APIError('FORBIDDEN', { message: 'This account is disabled' });
          },
        },
      },
    },
  });
}
