# Explore — maintenance-schedules-api (#13): conventions

## 1. Conventions the spec must respect

**CONTRIBUTING.md**
- Module = `apps/api/src/modules/<dominio>/{routes,service,repository}.ts`, wired by hand in `src/app.ts` (CONTRIBUTING.md:14-20). Routes registered under the `/api` prefix (apps/api/src/app.ts:83-93).
- Errors: `AppError` subclasses (`apps/api/src/lib/errors.ts:1-46`: BadRequest 400, NotFound 404, Conflict 409…) → RFC 7807 (CONTRIBUTING.md:20).
- DB: schema in `apps/api/src/db/schema/` + `pnpm db:generate`; migrations auto-applied (CONTRIBUTING.md:24-26). Next migration will be `0004_*` (existing: 0000–0003 in `apps/api/src/db/migrations/`).
- Tests: pure logic unit tests in `packages/shared` (`*.test.ts`); API integration via `app.inject()` on in-memory SQLite in `apps/api/test/` (CONTRIBUTING.md:50-51).
- Strict TS, no `any` (CONTRIBUTING.md:60).

**CHECKPOINTS.md** (reviewer rejects if any fails)
- C2: requirements in strict EARS, one `DEBE` per R, table covering every `acceptance`; every R has a concrete test (CHECKPOINTS.md:13-17).
- C3: diff only touches what design.md lists (CHECKPOINTS.md:20-21) → design must list every file (incl. edits to `modules/maintenance/*` for schedule_id).
- C4: routes validate with `@ikrive/shared` schemas; service checks owner, foreign resource → 404; `AppError` only; schema + generated migration; **pure domain logic in `packages/shared` with unit tests** (CHECKPOINTS.md:25-30).
- C5: date-only as `YYYY-MM-DD`; **odometer never converted between units** (CHECKPOINTS.md:35).
- C6: tests use in-memory SQLite, no DB mocks (CHECKPOINTS.md:42).
- C7: update `docs/PLAN.md` if a decision changes (CHECKPOINTS.md:49).

**docs/PLAN.md decisions** (docs/PLAN.md:15-30)
- Dates without time as `YYYY-MM-DD`; "today" uses the user's timezone (:25) → use `todayIn(settings.get(userId).timezone)` from `apps/api/src/lib/dates.ts:2` (pattern: apps/api/src/modules/maintenance/service.ts:58).
- Km stored in user's unit, never converted (:26). In API the field is named `odometer`, not `km` (specs/maintenance-records-api/requirements.md:4).
- Ownership → 404, not 403 (:27).
- Backend layers / `app.authenticate` + `currentUser(req)` (:100-105).

**docs/sdd.md**
- EARS patterns table (docs/sdd.md:66-80): Ubicuo / CUANDO / MIENTRAS / DONDE / SI…ENTONCES; no soft verbs.
- design.md must contain: files per layer, DB + migration, HTTP contract, types/signatures, UI impact, ≥1 discarded alternative, risks, out of scope (docs/sdd.md:91-101). Don't repeat CONTRIBUTING/PLAN.
- tasks.md: `- [ ] T<n> — … Cubre: R<x>.`; harness fails if any R is not referenced by a task (docs/sdd.md:103-115).

## 2. Reference spec format: specs/maintenance-records-api/

**requirements.md** (72 lines)
- Header `# Requirements — <name>` + blockquote with feature #/phase and naming notes (:1-4).
- `## R<n>` + one sentence each, e.g. R4 event (:15-16), R3 unwanted (`SI … ENTONCES … responder 400 application/problem+json sin guardar nada`, :12-13), R17/R18 ownership 404 (:54-58).
- Ends with `## Trazabilidad acceptance → requirements` table `| Criterio de feature_list.json | Requirements |` (:60-72), last row maps the test file acceptance to R ranges.

**design.md** (142 lines) sections in order:
1. One-line scope ("Solo API y packages/shared…") (:1-3)
2. `## Archivos` table `| Capa | Archivo | Cambio |` (shared/db/api/test) (:5-20)
3. `## Base de datos` with a drizzle `sqliteTable` sketch + FK/onDelete rationale (:22-48)
4. `## Contrato HTTP` table `| Método y ruta | Cuerpo | Éxito | Errores |` + exact error messages (`NotFoundError('Vehicle not found')`…) (:50-62)
5. `## Esquemas` zod sketch (create = fields, update = `.partial()` without defaults, response, params) (:64-87)
6. `## Servicio y repositorio` signatures, transactions, validation order (validate before writing; single sync `db.transaction`) (:91-113)
7. `## Impacto en UI`, `## Alternativas descartadas`, `## Decisiones a validar (Gate 1)` (numbered), `## Riesgos`, `## Fuera de alcance` (:115-142)
- Note: Decision 5 (:131) explicitly deferred `scheduleId` to phase 4: "ALTER TABLE ADD COLUMN nullable, trivial en SQLite".

**tasks.md** (17 lines): T1 shared helpers/schemas → T3 shared unit tests → T4 table + db:generate → T5 repository → T6 service → T7 routes + app.ts wiring → T8–T14 one task per named integration test (`'creates, lists, …'`) → T15 `pnpm harness --full` + `progress/impl_<name>.md` covering all R. All `Cubre: R…`.

Also useful: specs/vehicle-maintenance-spending/design.md (read-only computed endpoint inside module `maintenance`; static sub-route coexisting with `:recordId`).

## 3. API response shape conventions

- **JSON is camelCase** everywhere (DB columns snake_case via drizzle `casing: 'snake_case'`, apps/api/drizzle.config.ts:7, apps/api/src/db/client.ts:18). E.g. `vehicleId`, `includeInReport`, `createdAt` (packages/shared/src/schemas/maintenance.ts:29-42). → The acceptance's `next_due_date`/`next_due_km`/`interval_months`/`interval_km`/`schedule_id` should be exposed as **`nextDueDate`, `nextDueOdometer` (or `nextDueKm`), `intervalMonths`, `intervalKm`/`intervalDistance`, `scheduleId`**; flag as a Gate 1 decision (records spec already renamed km→`odometer`).
- Dates: date-only `isoDateSchema` (`z.iso.date()`, packages/shared/src/schemas/vehicles.ts:6); timestamps `z.iso.datetime()` serialized with `toISOString()` (apps/api/src/modules/vehicles/service.ts:41-52). Nullables are explicit `null`, not omitted.
- **Errors**: `application/problem+json` `{ type:'about:blank', title, status, detail? , errors?[{path,message}] }` (packages/shared/src/schemas/common.ts:22-30; apps/api/src/plugins/errors.ts:7-39). Zod validation → 400 `title: 'Validation failed'` with `errors[]`; service errors → `detail` = AppError message (English).
  - Note: "at least one of intervalMonths/intervalKm" must be a zod `.refine`/`superRefine` in the shared schema so it surfaces as 400 Validation failed (and PATCH must check the *resulting* state in the service → `BadRequestError`).
- **Pagination**: none exists yet; lists return plain arrays (`200 MaintenanceRecord[]`, specs/maintenance-records-api/design.md:128). First paginated endpoint is planned for notifications (#15). Schedules list → plain array.
- **Computed fields precedent**: derived on read in the service `toDto`, never stored: vehicle `status` (enum `VEHICLE_STATUSES`, packages/shared/src/enums.ts:16-18), `photoUrl`, `odometer: {value,date}|null` (apps/api/src/modules/vehicles/service.ts:41-52; schema vehicles.ts:75-79). Status enums live in `packages/shared/src/enums.ts` with a doc comment → add e.g. `SCHEDULE_STATUSES = ['ok','due_soon','overdue']`.
- Internal columns are not exposed in DTOs (e.g. `odometerReadingId`, design.md:161; `ownerId`/`photo` stripped in vehicles toDto).
- Existing pure domain fns to reuse/extend: `packages/shared/src/domain/odometer.ts` (`latestOdometerReading` :28, `averageDistancePerYear` :42 with `MIN_SPAN_DAYS=30` null-on-insufficient-data pattern, `DAY_MS`). New `domain/schedules.ts` (+ `.test.ts`) fits there.
- Validation helpers: `odometerValueSchema`, `optionalText`, `moneySchema`, `idParamSchema` in packages/shared/src/schemas/common.ts:5-20; params pattern `maintenanceRecordParamsSchema` (maintenance.ts:45) → `{ id, scheduleId }`.
- Maintenance record schema to extend with `scheduleId` (nullable/optional) in create/update/response: packages/shared/src/schemas/maintenance.ts:6-42; table apps/api/src/db/schema/maintenance.ts:10-40.

## 4. What PLAN.md / feature_list pre-decide about the data model & threshold

- docs/PLAN.md:128-130: `maintenance_schedules`: `interval_months?` and/or `interval_km?` (**whichever comes first**), "último realizado", `next_due_*` and "**umbral de aviso**" (single threshold, unit not specified). Linking a record recalculates next due.
- docs/PLAN.md:127: `maintenance_records.schedule_id?` (nullable).
- docs/PLAN.md:162-163 (Fase 4): km rules → due **date estimated with km/day average over the last 90 days**; the daily job evaluates rules (job itself is #15, out of scope here).
- docs/PLAN.md:11: alerts "por fecha o por kilometraje".
- feature_list.json #13 acceptance (pre-decided):
  - Table fields: vehicle_id, título, categoría, interval_months?, interval_km?, umbral de aviso, último realizado; `maintenance_records.schedule_id` FK.
  - Endpoints `GET|POST /api/vehicles/:id/schedules`, `GET|PATCH|DELETE /api/vehicles/:id/schedules/:scheduleId`; 400 if both intervals missing; 404 for non-owners.
  - Each rule returns next_due_date, next_due_km, status ok|due_soon|overdue; km-rule estimated date null when insufficient data.
  - Optional last-done date/km on create; default start = vehicle purchase date/km, else rule creation date + latest reading.
  - Creating/editing a record with schedule_id updates last-done + next due; deleting rule → records `schedule_id = null` (FK `onDelete: 'set null'`).
  - Due + km/day average as pure fns in shared with tests (months, km, first-to-come, threshold, no data).
- **NOT pre-decided (open for Gate 1)**:
  - Threshold unit: PLAN says only "umbral de aviso". Options: days only; km only; both (`warnDays` + `warnKm`) each applying to its own dimension; or a single days threshold applied also to the estimated date of km rules. Note #15 job triggers on due_soon, and #19 calendar uses next due date (real or estimated).
  - Whether `status` for km rules uses current odometer vs nextDueKm (real) or the estimated date, or both (first to trigger).
  - Month arithmetic for end-of-month (e.g. Jan 31 + 1 month).
  - Recalc semantics when editing/unlinking/deleting a linked record (use latest linked record by date? or just the edited one?), and whether "último realizado" is stored or derived from linked records.
  - Whether the schedule uses `MAINTENANCE_CATEGORIES` (enums.ts:32-42) — acceptance says "categoría", so yes most likely.
  - "90 days" window anchor (today in user tz vs latest reading) and minimum span/readings for the average (precedent: 30-day min span in averageDistancePerYear).
