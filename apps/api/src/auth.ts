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
    // Native clients (CORS_ORIGINS) sign in from their own origin.
    trustedOrigins: [
      config.BASE_URL,
      ...(config.NODE_ENV === 'development' ? ['http://localhost:5173', 'http://localhost:5174'] : []),
      ...config.CORS_ORIGINS,
    ],
    // Better Auth skips the origin check when NODE_ENV is `test`; keep it on so tests see production.
    advanced: { disableOriginCheck: false },
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    user: {
      additionalFields: {
        role: { type: 'string', required: false, defaultValue: 'user', input: false },
      },
    },
    // Native clients send the signed session token (`set-auth-token` on sign-in) as
    // `Authorization: Bearer`. Unsigned tokens are the raw value stored in the session table.
    plugins: [bearer({ requireSignature: true })],
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
