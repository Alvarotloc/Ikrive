# Exploration: maintenance-schedules-api (domain)

## 1. maintenance_records: table, routes, service, schemas

Module layout (CONTRIBUTING.md:15-19): `apps/api/src/modules/<domain>/{routes,service,repository}.ts`. Wiring by hand in the composition root `apps/api/src/app.ts:62-90` (repo → service → `api.register(xRoutes, { service })` under prefix `/api`, app.ts:93).

- **Table** `apps/api/src/db/schema/maintenance.ts:10-41` (`maintenanceRecords` → `maintenance_records`):
  `id` text UUID (`id()` helper, :5-8), `vehicleId` FK → vehicles cascade, `date` text `YYYY-MM-DD`, `odometer` int nullable,
  `odometerReadingId` FK → odometer_readings set null (+ unique index), `category` text enum `MAINTENANCE_CATEGORIES`,
  `title`, `description`, `workshop`, `cost` real, `includeInReport` bool default true, `createdAt`/`updatedAt` `timestamp_ms`.
  Index `maintenance_records_vehicle_id_date_idx` (:38). **No `schedule_id` yet** (planned in docs/PLAN.md:127).
  Schema files are re-exported in `apps/api/src/db/schema/index.ts`. Column names come from `casing: 'snake_case'`.
- **Category enum**: `packages/shared/src/enums.ts:32-42` `MAINTENANCE_CATEGORIES = ['oil_change','tires','brakes','inspection','repair','filters','battery','other']` + `MaintenanceCategory` type. Pattern: `const X = [...] as const; type X = (typeof X)[number]`; DB uses `text({ enum: X })`, zod uses `z.enum(X)`.
- **Repository** `apps/api/src/modules/maintenance/repository.ts`: `createMaintenanceRepository(db)` returns an object literal (listByVehicle, sumCost, find(vehicleId,id), create/update/delete inside `db.transaction` with the linked odometer reading). Types `MaintenanceRecordRow = $inferSelect`, `ReadingChange`. Exports `MaintenanceRepository = ReturnType<...>` (:116). Delete also removes `attachments` rows (entityType `'maintenance'`) (:102-112).
- **Service** `apps/api/src/modules/maintenance/service.ts`: `createMaintenanceService({ repo, vehicles, settings, attachments, storage })` (:16-36).
  - `toDto` strips `odometerReadingId`, converts Dates to ISO strings (:24-27).
  - **Ownership → 404**: `requireVehicle` = `vehicles.findOwned(userId, vehicleId)` else `NotFoundError('Vehicle not found')` (:37-40); `requireRecord` then `repo.find(vehicleId, recordId)` scoped by vehicle (:41-46). Other users' vehicles are always 404, never 403.
  - `validate` (:52-69): date not in future (`todayIn(settings.get(userId).timezone)`, 400), odometer monotonic via shared `findOdometerConflict` (409 `ConflictError`).
  - Errors: `apps/api/src/lib/errors.ts` (`AppError(status,title,detail)`, `BadRequestError` 400, `NotFoundError` 404, `ConflictError` 409…), serialised as RFC 7807 (`problemSchema`, packages/shared/src/schemas/common.ts:23-30).
- **Routes** `apps/api/src/modules/maintenance/routes.ts`: `FastifyPluginAsyncZod<{ service }>`, `app.addHook('preHandler', app.authenticate)` (:19), user via `currentUser(request).id` (`plugins/auth.ts`). Paths: `GET|POST /vehicles/:id/maintenance`, static `GET /vehicles/:id/maintenance/spending` declared before `/:recordId` (:40-45), `GET|PATCH|DELETE /vehicles/:id/maintenance/:recordId`. Params schemas `idParamSchema` / `maintenanceRecordParamsSchema` ({id, recordId}). Response schemas declared per status; POST → 201, DELETE → 204.
- **Shared zod** `packages/shared/src/schemas/maintenance.ts`: private `maintenanceFieldsSchema` (:6-16); `createMaintenanceRecordSchema`; `updateMaintenanceRecordSchema` = fields `.extend({ includeInReport: z.boolean() }).partial()` (no defaults on PATCH, :22-25); output `maintenanceRecordSchema` (:29-42, `createdAt: z.iso.datetime()`); exports `X` + `type X = z.infer`, and `XInput = z.input` for create/update. Helpers in `schemas/common.ts`: `optionalText(max)` (blank → null), `odometerValueSchema` int 0..9_999_999 (:15), `moneySchema`, `idParamSchema`. `isoDateSchema = z.iso.date()` lives in `schemas/vehicles.ts:6`. Barrel: `packages/shared/src/index.ts`.
- Schema unit test exists: `packages/shared/src/schemas/maintenance.test.ts`.

## 2. Odometer readings, units, purchase data

- Table `odometer_readings` `apps/api/src/db/schema/vehicles.ts:46-61`: `id`, `vehicleId` FK cascade, `date` text `YYYY-MM-DD`, `value` int, `source` enum `ODOMETER_SOURCES = ['manual','maintenance','fuel']` (enums.ts:44), `createdAt` timestamp_ms. Index `(vehicle_id, date)`.
- Queries in `apps/api/src/modules/vehicles/repository.ts`: `listReadings(vehicleId)` all, ordered `date desc, value desc` (:67-74); `latestReading` (:75-83); `findReading`, `createReading`, `deleteReading`. No date-range query exists yet (90-day window must be added or filtered in memory).
- **Units**: values are stored **as entered, in the user's distance unit — no conversion anywhere**. `odometerValueSchema` doc: "Odometer value in the user's distance unit" (common.ts:14). `user_settings.distance_unit` enum `['km','mi']` default `km` (schema/settings.ts:10, shared schemas/settings.ts:6,20); only used by the web for labels (`apps/web/src/lib/format.ts:23`). So `interval_km` should be treated as "distance in the user's unit", consistent with readings.
- Vehicle purchase: `vehicles.purchaseDate` text `YYYY-MM-DD` nullable, `purchaseOdometer` int nullable, `purchasePrice` real (schema/vehicles.ts:17-20). Creating a vehicle with `currentOdometer` creates the first `manual` reading dated today (shared schemas/vehicles.ts:25-26). Vehicle DTO exposes `odometer: {value,date} | null` = latest reading (vehicles.ts:78-79).

## 3. Vehicle status

- Not a column: derived from `soldAt` (text date, nullable) and `archivedAt` (timestamp_ms, nullable) (schema/vehicles.ts:23-24). `VEHICLE_STATUSES = ['active','archived','sold']`, sold wins over archived (enums.ts:16-18).
- `statusOf(row)` in `apps/api/src/modules/vehicles/service.ts:28-29`; SQL filter map `statusFilter` in `vehicles/repository.ts:11-15` (active = both null). List query `?status=active|archived|sold|all` default active.
- Maintenance currently does NOT restrict by status (archived/sold vehicles still accept records).

## 4. Migrations & integration tests

- `apps/api/drizzle.config.ts`: dialect sqlite, schema `./src/db/schema/index.ts`, out `./src/db/migrations`, `casing: 'snake_case'`.
- Generate: `pnpm db:generate` (root → `pnpm --filter @ikrive/api db:generate` → `drizzle-kit generate`); previous specs' tasks say `pnpm --filter api db:generate` (specs/maintenance-records-api/tasks.md:6).
- Files: `apps/api/src/db/migrations/{0000_init,0001_vehicles,0002_maintenance_records,0003_attachments}.sql` + `meta/_journal.json` and `meta/000N_snapshot.json`. Tags are descriptive (`NNNN_<name>`), so use `drizzle-kit generate --name maintenance_schedules` (→ `0004_maintenance_schedules.sql`). Never hand-edit snapshots.
- Applied automatically at boot (`apps/api/src/server.ts:7` `runMigrations(db)`), via `runMigrations` in `apps/api/src/db/client.ts:24-26` (drizzle migrator); manual `pnpm --filter @ikrive/api db:migrate` (src/db/migrate.ts). `createDb` enables WAL + `foreign_keys = ON` (client.ts:12-19).
- SQLite ALTER caveat: adding nullable `schedule_id` FK column to `maintenance_records` → drizzle-kit may emit an ALTER ADD COLUMN with REFERENCES (OK in SQLite for nullable w/o default) or a table rebuild; check the generated SQL.
- Test helpers `apps/api/test/helpers.ts`:
  - `createTestApp(env?)` (:8-21): tmp `DATA_DIR`, `createDb(':memory:')` + `runMigrations`, `buildApp({config, db})`, returns `{ app, db, dataDir }`.
  - `signUp(app, email?, name?)` (:26-35): POST `/api/auth/sign-up/email` with `origin` header, returns `{ response, cookie }`; first user becomes admin. Second user: `signUp(app, 'other@example.com')`.
- Pattern in `apps/api/test/maintenance.test.ts`: local `setup()` (:10-15) → app + cookie + vehicle via POST `/api/vehicles` `{make, model}`; `client(app, cookie, vehicleId)` shortcut object wrapping `app.inject` (:28-52, incl. `addReading(date, value)` to POST `/vehicles/:id/odometer`); cross-user 404 tests at :279 ("hides other users' vehicles and records") and :363. Direct DB assertions via `db.select()...` with drizzle `eq`.
- Vitest per package (`apps/api/vitest.config.ts`); shared: `vitest run --passWithNoTests`.

## 5. Pure functions in shared & date conventions

- `packages/shared/src/domain/odometer.ts` + co-located `odometer.test.ts`: `OdometerPoint {date, value}`, `findOdometerConflict`, `latestOdometerReading`, `averageDistancePerYear` (:35-50: sorts, `Date.parse` diff / `DAY_MS`, returns null if span < 30 days, rounded). Generic `<T extends OdometerPoint>`, readonly arrays, JSDoc on each export, module-level consts (`DAY_MS = 86_400_000`, `MIN_SPAN_DAYS`). Re-exported in `packages/shared/src/index.ts:1`. Tests: `describe`/`it` from vitest, fixture arrays with `10_000` style numbers, `toBeNull`/`toEqual`. Used by API services and web (`apps/web/src/routes/_app/vehicles/$vehicleId/index.tsx:45`).
  → New logic (km/day over last 90 days, next-due date/km, "first to arrive" status) fits as `packages/shared/src/domain/maintenance-schedule.ts` + `.test.ts`, taking `today` as a parameter (no `new Date()` inside) for determinism.
- **Dates**: calendar dates are `text` `YYYY-MM-DD` (records, readings, purchaseDate, soldAt), validated with `isoDateSchema = z.iso.date()`, compared lexicographically (`date > today`). Instants are `integer({ mode: 'timestamp_ms' })` (createdAt/updatedAt/archivedAt) and serialised as ISO datetime strings in DTOs.
- **Timezone**: per-user `user_settings.timezone` (IANA, default `Europe/Madrid`). "Today" = `todayIn(timeZone, now = new Date())` in `apps/api/src/lib/dates.ts:2-8` (Intl `en-CA` → `YYYY-MM-DD`, UTC fallback). Services call `todayIn(settings.get(userId).timezone)` (maintenance/service.ts:58, vehicles/service.ts:62). Date arithmetic on `YYYY-MM-DD` uses `Date.parse` (UTC midnight), so day diffs are DST-safe; adding months needs a pure helper (none exists; mind month-end clamping, e.g. 31 Jan + 1 month).
