# Explore: notification-channels (backend)

Paths are relative to the repo root.

## 1. How in-app notifications are created today
- **Spec:** `specs/in-app-notifications/{requirements,design,tasks}.md`. `design.md:151` leaves push channels out of scope.
- **Only creation path:** `NotificationsRepository.createMany(rows)` in `apps/api/src/modules/notifications/repository.ts:48-56` (sync, better-sqlite3). It does `insert().onConflictDoNothing({target: dedupeKey}).returning().all()`, so it returns only the new rows; duplicates are skipped.
- **Service:** `apps/api/src/modules/notifications/service.ts` has only list / markRead / markAllRead (no create). `toDto` hides `userId`, `vehicleId`, `dedupeKey`.
- **Dedup:** unique index `notifications_dedupe_key_idx` (`apps/api/src/db/schema/notifications.ts:31`). Key format `schedule:<id>:<status>:<lastDoneDate>:<lastDoneOdometer>` (`apps/api/src/jobs/reminders.job.ts:20-26`).
- **Only caller:** `runReminders({db, now})` in `apps/api/src/jobs/reminders.job.ts:32-84`. It is sync, builds `NewNotificationRow[]`, and returns `{evaluated, created: notifications.createMany(rows).length}` (L83).
  - `startRemindersJob` (L87-100): croner with `protect: true` and `catch: logger.error`.
  - `apps/api/src/server.ts:13-17` wires it: `run: () => app.log.info(runReminders({db}), ...)`.
  - The next job (#17, odometer-nudge) must also send through channels (`feature_list.json:296-301`).
- **Where the hook fits:** right after `createMany` in `runReminders`, using its returned rows. Those are exactly the new notifications, so channels never get duplicates.
  - The DB insert finishes before any network I/O, so a channel failure can't affect the in-app notification.
  - Group rows by `userId`, load that user's active channels, send with `Promise.allSettled`. Each send in try/catch; store `last_error` on failure, clear it on success. Never rethrow.
  - Sending is async: either make `runReminders` async (croner `protect` handles async; `server.ts:15` and tests need `await`), or keep it sync and return created rows so a separate async `dispatchToChannels(rows)` runs after.
  - Recommended: a reusable `notify(rows)` / `createAndDispatch` service in `modules/notifications` (or `modules/notification-channels/dispatcher.ts`) that #17 can reuse, with `fetch` injected so tests can replace it.

## 2. Pattern for a per-user resource module
- **Layout:** `apps/api/src/modules/<name>/{repository,service,routes}.ts`.
  - Repository: `createXRepository(db)` returns sync drizzle queries; `export type XRepository = ReturnType<...>`. Every query filters by user, e.g. `findOwned(userId, id)` (`apps/api/src/modules/notifications/repository.ts:10-11,34-35`; `apps/api/src/modules/vehicles/repository.ts:31-37`).
  - Service: `createXService(deps)` with `toDto` (Date → ISO, server-only fields dropped). Throws `NotFoundError('X not found')` for other users' ids (`apps/api/src/modules/notifications/service.ts:26-31`; `apps/api/src/modules/schedules/service.ts:37-49`).
  - Errors: `apps/api/src/lib/errors.ts` (`AppError` subclasses) rendered as RFC 7807. Zod errors → 400 (`apps/api/src/plugins/errors.ts:14-20`).
  - Routes: `FastifyPluginAsyncZod<{service}>` with `app.addHook('preHandler', app.authenticate)` and `currentUser(request).id` (`apps/api/src/modules/schedules/routes.ts:13-70`). POST → 201, DELETE → 204. Response schema strips unlisted fields (helps hide secrets).
  - Wiring: composition root `apps/api/src/app.ts:69-116` (repo → service → `api.register(routes, {service})` under `/api`).
- **Zod schemas:** `packages/shared/src/schemas/<name>.ts`, exported from `packages/shared/src/index.ts`. Helpers in `packages/shared/src/schemas/common.ts` (`idParamSchema`, `optionalText`). Enums in `packages/shared/src/enums.ts`; `NOTIFICATION_CHANNEL_TYPES = ['ntfy','gotify','apprise','webhook']` already exists at L51-52. Pattern: create schema + update schema via `.partial()` (`packages/shared/src/schemas/settings.ts:17`).
- **Drizzle schema:** one file per area in `apps/api/src/db/schema/*.ts`, re-exported from `index.ts`.
  - `id = text().primaryKey().$defaultFn(crypto.randomUUID)`, `userId text().notNull().references(() => user.id, {onDelete:'cascade'})`, timestamps `integer({mode:'timestamp_ms'})`, enums `text({enum: ...})`, named indexes in the third arg (`apps/api/src/db/schema/notifications.ts`).
  - `apps/api/drizzle.config.ts`: `casing: 'snake_case'`, `out: ./src/db/migrations`.
- **Migrations:** `pnpm --filter @ikrive/api exec drizzle-kit generate --name notification_channels` (`specs/in-app-notifications/tasks.md:8`) → `0006_notification_channels.sql` + `meta/0006_snapshot.json` + `_journal.json` entry (existing: 0000_init … 0005_notifications). Applied by `runMigrations` (`apps/api/src/db/client.ts`) at start and in tests. Review the generated SQL.

## 3. HTTP client, timeouts, secrets, env config, JSON columns
- No `fetch`, undici, `AbortSignal`, encryption, `randomBytes` or `timingSafeEqual` in the API; no JSON columns. Channel sending is the first outbound HTTP.
  - Recommended: global `fetch` with `AbortSignal.timeout(ms)`, injected into the dispatcher.
  - JSON column: `text({ mode: 'json' }).$type<ChannelConfig>()`.
- **Secrets:** nothing at rest today. Acceptance only requires tokens not returned in clear → mask/omit in `toDto`. `AUTH_SECRET` exists (`apps/api/src/config.ts:15,26-34`) if at-rest encryption is ever wanted.
- **Env config:** zod `envSchema` in `apps/api/src/config.ts:9-35`; `booleanString` for flags like `REMINDERS_ENABLED`; `loadConfig(env)` is testable (`apps/api/test/reminders.test.ts:98-104`). Possible: `NOTIFICATION_TIMEOUT_MS: z.coerce.number().int().positive().default(10000)`.

## 4. Integration tests
- **Helpers:** `apps/api/test/helpers.ts`.
  - `createTestApp(env)`: temp `DATA_DIR`, in-memory SQLite, `runMigrations`, `buildApp`, `app.ready()` → `{app, db, dataDir}`.
  - `signUp(app, email)` → `{response, cookie}`; user id from `response.json().user.id`.
- Requests via `app.inject({method, url, headers: {cookie}, payload})`. Rows seeded through `db` (`apps/api/test/notifications.test.ts:16-30`).
- Job tests: `runReminders({db, now: NOW})` (`apps/api/test/reminders.test.ts:153+`) plus a `createUser` helper (L50-80).
- **Mocking:** only `vi.fn` / `vi.spyOn` so far (`apps/api/test/reminders.test.ts:107,124,142`); no MockAgent. Options:
  - Inject `fetch` into dispatcher/channel modules (also enables unit tests in `src/**/*.test.ts`, included by `apps/api/vitest.config.ts`).
  - `vi.stubGlobal('fetch', vi.fn())`.
  - Local `node:http` server on port 0 to test the timeout.
- `buildApp` takes only `{config, db}` (`apps/api/src/app.ts:36-41`). For the test endpoint either extend `AppDeps` with optional `fetch` or stub the global.

## 5. user_settings
- `apps/api/src/db/schema/settings.ts` (`user_settings`, PK `userId`): `locale` (es/en), `timezone`, `odometerReminderWeekday`, `reminderHour`.
- Defaults: `packages/shared/src/schemas/settings.ts:20-28` (Europe/Madrid, hour 8, es).
- Row created at sign-up via Better Auth `databaseHooks` (`apps/api/src/auth.ts:31-43`); `SettingsService.get` upserts if missing.
- `schedules.listForActiveVehicles` left-joins `timezone` and `reminderHour` (`apps/api/src/modules/schedules/repository.ts:24-40`).
- External message text: in-app `title`/`body` are user data and `type` is translated by the web; channels need server-side text, e.g. a small es/en map keyed by `user_settings.locale`.
