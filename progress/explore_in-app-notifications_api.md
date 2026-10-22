# Explore: in-app-notifications (API side)

## 1. Bootstrap / scheduler placement
- `apps/api/src/app.ts:38` `buildApp({ config, db })` builds Fastify (composition root, repos → services → routes at L60-85; `/api` prefix block L93-105). **No listen here**; used by tests (`test/helpers.ts:18`).
- `apps/api/src/server.ts` is the real entry (tsup entry `src/server.ts`; `dev`/`start` scripts): `loadConfig()` L5 → `createDb` + `runMigrations` L6-7 → `buildApp` L9 → SIGINT/SIGTERM handler L11-18 (`app.close()`, `db.$client.close()`, `process.exit(0)`) → `app.listen` L20.
- **Recommendation:** start the croner job in `server.ts` (after `buildApp`, guarded by the env flag), and `job.stop()` inside the existing signal handler before `app.close()`. Alternatively an `app.addHook('onClose', …)`, but starting it in `server.ts` keeps tests scheduler-free with zero effort. Expose the job as a plain function, e.g. `apps/api/src/jobs/reminders.job.ts` exporting `runReminders({ db/repos, now })` + `startRemindersJob(deps, config)` returning the `Cron`. Wiring of services happens inside `buildApp`; if the job needs services/repos, either construct repos directly from `db` in `server.ts` (repos are `createXRepository(db)`, cheap) or have `buildApp` return/decorate them.

## 2. Env config
- `apps/api/src/config.ts`: zod `envSchema` L9-33, `loadConfig(env = process.env)` L37-43 (throws with `z.prettifyError`). `Config = z.infer<…>`.
- Booleans: `booleanString = z.enum(['true','false','1','0']).transform(v => v==='true'||v==='1')` L3-5; used as `DISABLE_SIGNUP: booleanString.default(false)` L17. Reuse it: e.g. `DISABLE_JOBS: booleanString.default(false)` (or `REMINDERS_ENABLED` default true). Optionally a cron expression var `REMINDERS_CRON: z.string().default('0 8 * * *')`.
- Tests: `createTestApp(env)` in `apps/api/test/helpers.ts:8-21` passes `{NODE_ENV:'test', BASE_URL, DATA_DIR: tmp, ...env}` to `loadConfig` (no process.env); example `createTestApp({ DISABLE_SIGNUP: 'true' })` in `test/auth.test.ts:17`. DB is `:memory:` with migrations. Test logger disabled (`app.ts:40`).
- Document new vars in `README.md` config table (L28-37) and `.env.example`. Note: `.env.example` already has `TZ=Europe/Madrid` "Time zone used by scheduled reminders" and README lists `TZ` — but `TZ` is not in `envSchema` (only process TZ). Per-user timezone lives in `user_settings.timezone` (`lib/dates.ts` `todayIn(tz)`), which the job should use for "today".

## 3. Scheduler / jobs / PLAN
- **croner is NOT a dependency** (`apps/api/package.json`; no scheduler at all). No `jobs/` folder exists. Add with `pnpm --filter @ikrive/api add croner`.
- `docs/PLAN.md:61`: «| Jobs | `croner`, dentro del mismo proceso (fase 4) |»
- `docs/PLAN.md:135`: «**notifications**: user_id, tipo, título, cuerpo, enlace, `dedupe_key` único y `read_at`.» (L136 `notification_channels` is a separate, later table.)
- `docs/PLAN.md:161-167` (Fase 4):
  > - `reminders.job` (diario):
  >   - Evalúa las reglas. Para las de km estima la fecha de vencimiento con la media de km/día de los últimos 90 días.
  >   - Crea la notificación in-app, deduplicada, y la envía por los canales del usuario.
  >   - **Decisión (spec maintenance-schedules-api):** el estado (al día / próximo / vencido) solo usa la fecha por meses y los km reales; la fecha estimada se informa pero no avisa.
  > - `odometer-nudge.job`: … avisa si un vehículo activo lleva 7 días sin lectura de km.
  > - Interfaz `NotificationChannel.send()` … (ntfy, Gotify, Apprise, webhook)
  > - Script o endpoint de admin para lanzar los jobs a mano.
- PLAN.md:146: the weekly odometer reminder will link to `/odometer`. PLAN structure tree (L72-86) has no `jobs/` entry — add `jobs/` there when done.
- Status logic to reuse: `packages/shared/src/domain/schedules.ts` `computeScheduleDue(row, readings, today)` (L71) → `nextDueDate`, `nextDueOdometer`, `status` (`SCHEDULE_STATUSES = ok|due_soon|overdue`, `enums.ts`). `SchedulesService` (`modules/schedules/service.ts`) is per-user/per-vehicle; the job needs a cross-user query (all non-archived/non-sold vehicles + their schedules + readings + owner's `settings.get(userId).timezone`). `vehiclesRepo.listReadings(vehicleId)` exists.
- `NOTIFICATION_CHANNEL_TYPES` already in `packages/shared/src/enums.ts`; no `NOTIFICATION_TYPES` yet → add e.g. `['schedule_due_soon','schedule_overdue']` there.

## 4. Module conventions
- `apps/api/src/modules/<domain>/{routes,service,repository}.ts`; wired in `app.ts` and registered in the `/api` block (`app.ts:93-105`) as `api.register(xRoutes, { service })`.
- Routes (`modules/schedules/routes.ts`): `FastifyPluginAsyncZod<{ service }>`, `app.addHook('preHandler', app.authenticate)` L17, schemas from `@ikrive/shared` (`params`, `body`, `querystring`, `response: {200: …}`), user via `currentUser(request).id` (`plugins/auth.ts:18-21`), 201 via `reply.status(201).send(...)`, 204 via `reply.status(204).send()`.
- Ownership 404: service-level, e.g. `modules/schedules/service.ts:38-49` (`requireVehicle` → `throw new NotFoundError('Vehicle not found')`, comment: «other users' vehicles are reported as missing so their ids are not disclosed»). Repos filter by owner: `vehicles.findOwned(userId, id)`; schedules repo `find(vehicleId, id)` uses `and(eq(id), eq(vehicleId))` (`schedules/repository.ts:19-25`). For notifications: `repo.findOwned(userId, id)` with `and(eq(notifications.id,id), eq(notifications.userId,userId))` → `NotFoundError('Notification not found')`.
- Errors: `apps/api/src/lib/errors.ts` (`AppError(status,title,detail)`, `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `UnsupportedMediaTypeError`); serialized as `application/problem+json` by `plugins/errors.ts` (zod validation → 400 `Validation failed` with `errors[]`).
- Services are factory functions `createXService(deps)` + `export type XService = ReturnType<…>`; DTO mapping converts `Date` → `toISOString()` (`schedules/service.ts:22-34`). Repos are sync better-sqlite3 (`.all()`, `.get()`, `.run()`, `.returning().get()`), ordering ties broken by `sql\`rowid\``.
- **Pagination: none exists anywhere.** Only query-schema precedent: `vehicleListQuerySchema` (`packages/shared/src/schemas/vehicles.ts:85-88`, `z.enum(...).default('active')`, type exported as `z.input`). Suggest: `notificationListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).default(0), unread?: booleanish })` — note querystrings are strings, so use `z.coerce`. Response `{ items: Notification[], total: number, unreadCount: number }` (offset-based is simplest; cursor by `createdAt,rowid` is the alternative). This shape is a new convention → decide in spec design.

## 5. DB schema / migrations
- Files: `apps/api/src/db/schema/{auth,vehicles,maintenance,attachments,settings}.ts`, barrel `schema/index.ts` (add `export * from './notifications'`). drizzle config `apps/api/drizzle.config.ts` (`casing: 'snake_case'`, out `src/db/migrations`), same casing in `db/client.ts:18`.
- Migrations: `pnpm db:generate` (root → `drizzle-kit generate` in api). Existing files are named `0000_init` … `0004_maintenance_schedules` → use `pnpm db:generate --name notifications` (produces `0005_notifications.sql` + `meta/0005_snapshot.json` + journal). Applied automatically at startup (`server.ts:7`) and in tests; tsup copies them to `dist/migrations`. Hand-edits are allowed with a SQL comment (see 0004 L18).
- Conventions (`schema/vehicles.ts`, `schema/maintenance.ts`):
  - id: local helper `const id = () => text().primaryKey().$defaultFn(() => crypto.randomUUID());` (duplicated per file).
  - timestamps: `createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date())`, `updatedAt` adds `.$onUpdateFn(() => new Date())`; nullable instants like `archivedAt: integer({ mode: 'timestamp_ms' })` → `readAt` the same. Date-only values are `text` `YYYY-MM-DD`.
  - user FK: `ownerId: text().notNull().references(() => user.id, { onDelete: 'cascade' })` with `import { user } from './auth'` (vehicles.ts); `userSettings.userId` same pattern. Use `userId` per PLAN (`user_id`).
  - enums: `text({ enum: SHARED_CONST })`.
  - indexes: third arg `(t) => [index('notifications_user_id_idx').on(...), uniqueIndex('notifications_dedupe_key_idx').on(t.dedupeKey)]`. Recommended: `index(...).on(t.userId, t.createdAt)` for listing and unique `dedupeKey` (e.g. `schedule:<id>:<status>:<nextDueDate>`); insert with `.onConflictDoNothing()` for idempotent job runs.

## 6. Shared schemas (`packages/shared`)
- One file per domain in `packages/shared/src/schemas/<domain>.ts`, re-exported from `src/index.ts`; enums in `src/enums.ts`; common helpers in `schemas/common.ts` (`idParamSchema` L20, `optionalText`, `problemSchema`).
- Pattern (`schemas/schedules.ts`): `createXSchema`, `updateXSchema` (`.partial()`), response `xSchema` with `createdAt/updatedAt: z.iso.datetime()`, nullable fields `.nullable()`; types `X = z.infer`, `XInput = z.input`. Tests next to schemas (`schemas/*.test.ts`).
- Add `schemas/notifications.ts`: `notificationSchema` (id, type enum, title, body nullable, link nullable, readAt `z.iso.datetime().nullable()`, createdAt), `notificationListQuerySchema`, `notificationListSchema` ({items,total,unreadCount}), maybe `readAllResultSchema` ({ updated: number }) or 204.

## 7. Tests
- Integration tests in `apps/api/test/<domain>.test.ts` with `createTestApp()` + `signUp(app, email)` (`test/helpers.ts`), `app.inject({ headers: { cookie } })`; direct DB access via returned `db` (e.g. `test/schedules.test.ts` imports tables from `../src/db/schema`) — useful to seed notifications / call `runReminders` directly with a fixed `now`. Cross-user 404 tests exist for vehicles (pattern to copy).

## Recommendations summary
1. `croner` dep in `apps/api`; `src/jobs/reminders.job.ts` with pure-ish `runReminders(deps, now)` + `startRemindersJob`.
2. Start/stop only in `server.ts` (signal handler L11-18), gated by new `booleanString` env var in `config.ts`; document in README/.env.example.
3. `notifications` table per PLAN:135 with unique `dedupe_key`, `onConflictDoNothing`; migration `0005_notifications` via `pnpm db:generate --name notifications`.
4. New module `modules/notifications/` following schedules; ownership via repo filtered by `userId` → `NotFoundError`.
5. Pagination is a new convention (none exists): define in spec (offset/limit with `z.coerce`, `{items,total,unreadCount}`).
6. Update PLAN.md structure tree (`jobs/`) and Fase 4 status when done.
