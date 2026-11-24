# Exploración: csv-import-apply — API

All paths are relative to the repository root. Feature criteria are in `feature_list.json:1427-1442`. The local DataSource is covered in `progress/explore_csv-import-apply_local.md`. Its write code is in `apps/web/src/lib/data-source/local/{fuel-logs,maintenance,vehicles}.ts`, and all three already call `validateOdometerWrite`.

## 1. CSV parsers (`packages/shared/src/csv-import/`, exported as `@ikrive/shared/csv-import`, see `packages/shared/package.json:8`)

**Public API** (`index.ts:1-18`):
- `parseCsvImport(text: string, options: CsvImportOptions): CsvImportResult` (`parse.ts:149`). It is pure and never throws. Its input is a string that is already decoded; turning bytes into text is up to #85.
- `detectCsvFormat(text)` (`detect.ts:24`).
- `csvRowKey(row)` (`keys.ts:11`).
- `CSV_REQUIRED_COLUMNS` (`generic.ts:23`).
- The exported types.

**`CsvImportOptions`** (`types.ts:39`):
- `target: { distance, quantity }`: the vehicle's units, where `quantity` comes from `fuelQuantityUnit(fuelType, volumeUnit)`.
- Optional: `dateFormat` (`ymd|dmy|mdy`), `decimalSeparator`, `sourceUnits`, and `mapping` (a generic mapping, which skips format detection).

**`CsvImportResult`** (`types.ts:86-106`) has four statuses:
- `unknown` with `headers`.
- `needs_options` with `format`, `headers` and `missing[]`, e.g. `'dateFormat'` or `'columns.date'`.
- `unit_mismatch` with `source` and `target`. There is no unit conversion.
- `parsed` with `format`, `dateFormat`, `decimalSeparator`, `sourceUnits`, `rows`, `errors`, `skipped` and `droppedFuelFields {notes, station}`.

**`CsvRow`** (`types.ts:52-63`):
- Common fields: `sourceRow`, `sourceId|null`, `key` and `warnings` (`'odometer_rounded'|'merged_fuels'`).
- It is a union on `kind`:
  - `'odometer'` with `data: CreateOdometerReading`
  - `'fuel'` with `data: CreateFuelLog`
  - `'maintenance'` with `data: CreateMaintenanceRecord`
- `data` has already passed the creation zod schemas (`parse.ts:40-65`), so it can go straight into the services without remapping.

**Row errors:** `CsvRowError { row, code, field|null }` (`types.ts:65-78`).
- Codes: `malformed_row`, `missing_field`, `invalid_date`, `invalid_number`, `invalid_boolean`, `out_of_range`, `mixed_fuel_units`.
- A row that fails its schema becomes `missing_field` or `out_of_range` on the first issue's path (`parse.ts:33-38`).
- Skipped rows are `CsvSkippedRow { row, reason: 'not_maintenance'|'template'|'income', label }`.

**Size limit:** there is no file-size constant. The only limit is `MAX_QUOTED_LENGTH = 4096` (`tokenizer.ts:2`), the most characters an unclosed quoted value may run before the row becomes `malformed_row`. The design says outright that "El parser no limita el tamaño", so callers must enforce it before parsing (`specs/csv-import-parsers/design.md:243-245`).

**Contract for #85** (`design.md:177-209`):
- Fuel and maintenance rows do NOT produce a separate odometer row. #85 creates their linked reading with `source: 'fuel' | 'maintenance'`, as the services already do.
- `csvRowKey` also accepts the fields of rows already in the DB, so dedupe can run against the DB without a new column, manual entries included.
- Two identical rows in the same file share a `key`, and both are kept. The expected behaviour is to count the second as a duplicate.

**Key formats** (`keys.ts:12-21`):
- `odometer|date|value`
- `fuel|date|odometer|qty.toFixed(3)|total.toFixed(2)`
- `maintenance|date|odometer?|title.trim().toLowerCase()|cost?toFixed(2):''`. A cost of 0 is written as empty.

## 2. Creating readings, fuel logs and maintenance today

**Routes:**
- `POST /api/vehicles/:id/odometer`: `apps/api/src/modules/vehicles/routes.ts:84`.
- `POST /api/vehicles/:id/fuel-logs`: `fuel-logs/routes.ts:25-30`.
- `POST /api/vehicles/:id/maintenance`: `maintenance/routes.ts:27`.
- All are registered under the `/api` prefix (`app.ts:~204-231`). Each module calls `app.addHook('preHandler', app.authenticate)` and gets the user with `currentUser(request).id`.

**Services** (all in `apps/api/src/modules/`):
- Odometer, `vehicles/service.ts:122-135` (`addReading`): calls `validateOdometerWrite`, then `repo.createReading({...reading, vehicleId, source:'manual'})`. That insert is a single statement with no transaction (`vehicles/repository.ts:158`).
- Fuel, `fuel-logs/service.ts:44-59,71-75`: `validate()`, then `repo.create(values, {date, value: odometer})`. The repo inserts the `fuel` reading and then the log inside `db.transaction((tx) => …)` (`fuel-logs/repository.ts:40-53`).
- Maintenance, `maintenance/service.ts:59-76,109-119`:
  - The reading is only created when `odometer != null`.
  - It also applies `scheduleLastDone` and may throw 400 if `scheduleId` is not one of the vehicle's schedules.
  - The repo runs one transaction: the reading with `source:'maintenance'`, then the record, then `markScheduleDone` (`maintenance/repository.ts:61-82`).

**Odometer rules are shared pure functions:**
- `findOdometerConflict(readings, candidate)` (`packages/shared/src/domain/odometer.ts:15-26`): a conflict is an earlier date with a higher value, or a later date with a lower value. Readings on the same day may come in any order.
- `validateOdometerWrite({readings, ownReadingId, date, odometer, today})` (`packages/shared/src/domain/odometer-writes.ts:12-30`) returns one of:
  - `{kind:'future_date'}`
  - `{kind:'conflict', conflict: OdometerPoint}`
  - `null`
- `odometerConflictMessage` is at `odometer-writes.ts:33`.

**How the services use them:**
- `today` comes from `todayIn(settings.get(userId).timezone)`, and the readings from `vehicles.listReadings(vehicleId)`.
- A future date gives `BadRequestError` (400); a conflict gives `ConflictError` (409).
- For per-row reporting in a batch, the import has to call `validateOdometerWrite` itself. It must also add each accepted row to the in-memory list of readings, so later rows in the file are checked against it.

## 3. Existing dedupe and transactions

**import-dedupe (#44)** dedupes on a whole-file fingerprint, not per row:
- It stores the SHA-256 of `data.json` in table `data_imports` with `UNIQUE(user_id, data_sha256)` (`apps/api/src/db/schema/data-imports.ts`, migration `0012`).
- Pre-check: `repo.hasImport` (`data-import/repository.ts:63-72`).
- The fingerprint is inserted first, inside the same transaction as the data (`:111-138`).
- If the pre-check misses (a race), `isUniqueViolation`, which walks the `.cause` chain for `SQLITE_CONSTRAINT_UNIQUE` (`:55-61`), turns the error into the 409 `duplicateImportError` with `type: DUPLICATE_IMPORT_PROBLEM_TYPE` (`:48-53`, `:101-108`).
- Vehicle matching by plate/VIN uses `findMatchingVehicles` in `packages/shared/src/domain/vehicle-identifiers.ts`.
- #85's per-row dedupe would instead compare `csvRowKey` against keys built from the vehicle's existing rows (the design intends this).

**Transaction pattern:** synchronous better-sqlite3 via drizzle, `db.transaction((tx) => { tx.insert(...).values(...).run() / .returning().get() })`. A throw inside rolls everything back.

**Bulk insert:** `insertAll` with `chunks` uses `BATCH_SIZE = 500` rows per multi-row INSERT (`data-import/repository.ts:36-45`, `:114-117`). Child rows need the ids of their linked readings, so create each reading and use its returned id inside the transaction, as `fuel-logs/repository.ts:40-53` does.

## 4. Ownership, errors, uploads, limits, rate limit

**Ownership 404:** services call `requireVehicle`, i.e. `if (!vehicles.findOwned(userId, vehicleId)) throw new NotFoundError('Vehicle not found')` (`fuel-logs/service.ts:29-31`, `maintenance/service.ts:44-46`, `vehicles/repository.ts:39`).

**problem+json:**
- `AppError(status, title, detail, errors?, type='about:blank')` and its subclasses are in `apps/api/src/lib/errors.ts`. They include `BadRequestError(detail, errors[])`, `NotFoundError`, `ConflictError(detail, {type})`, `PayloadTooLargeError` (413, `:51-55`) and `UnsupportedMediaTypeError`.
- The handler in `apps/api/src/plugins/errors.ts:13-47` serializes them as `application/problem+json`. It turns zod validation errors into 400 `errors[{path,message}]`, and passes other 4xx Fastify errors (e.g. `FST_REQ_FILE_TOO_LARGE`) through with their status.

**Uploads:**
- `@fastify/multipart` is registered globally with `fileSize: MAX_UPLOAD_MB` (default 20 MiB, `config.ts:22`) and `files: 1` (`app.ts:~116`).
- No custom content-type parser exists: no `addContentTypeParser`, no `text/csv`, and no `bodyLimit` set. The Fastify default JSON `bodyLimit` of 1 MiB applies to JSON bodies.

**Upload patterns:**
- Small, in memory: `request.file()`, then `receiveToBuffer(file)` (`lib/uploads.ts:66-77`). It rethrows 4xx such as the multipart 413 and turns any other failure into a 400. Used at `attachments/routes.ts:66-69` and `vehicles/routes.ts:66-68`.
- With a route-specific limit and an explicit 413 (`data-import/routes.ts:18-47`):
  1. `if (!request.isMultipart()) throw BadRequestError` (avoids the 406).
  2. `request.file({ limits: { fileSize: maxBytes, files: 1 } })`.
  3. Check `fieldname === 'file'`, otherwise `file.file.resume()` and 400.
  4. After reading, `if (file.file.truncated) throw new PayloadTooLargeError(...)`.
  5. Only then call the service.
- That last pattern fits "413 before calling the parser".
- Limits are passed into the service from `app.ts` (`IMPORT_MAX_MB`, `config.ts:26`; `limits` object at `app.ts:~177-190`).
- The `incompleteMultipart` test helper covers truncated uploads.

**Rate limit:**
- Global `@fastify/rate-limit` allows 300 per minute and applies only to API routes (`allowList: !isApiRequest(url)`, `app.ts:~111-115`).
- Per-route override: `config: { rateLimit: { max: 10, timeWindow: '1 minute' } }` (`reports/routes.ts:15`, `report-shares/routes.ts:66`).
- Tests are in `apps/api/test/rate-limit.test.ts`.

## 5. API test patterns (`apps/api/test/`)

**Helpers** (`helpers.ts`):
- `createTestApp(env?, {fetch, logStream}?)` (`:17-34`) returns `{app, db, dataDir}`. It uses an in-memory SQLite with migrations, a temp `DATA_DIR`, and env overrides such as `{ MAX_UPLOAD_MB: '1' }`.
- `signUp(app, email?, name?)` (`:42-51`) returns `{response, cookie}`.
- `incompleteMultipart(payload)` (`:70-85`).

**Per-file conventions** (e.g. `fuel-logs.test.ts:10-52`):
- `setup()` creates the app, a user, and a vehicle via `POST /api/vehicles {make, model}`.
- A `client(app, cookie, vehicleId)` object wraps `app.inject` calls. It includes `addReading` and `readings()`, which is the odometer GET.

**Ownership test:** "hides other users' vehicles…" signs up an owner and an intruder, loops over the endpoints and expects 404 (`fuel-logs.test.ts:364-383`).

**Multipart builder:** a local `multipart(data, filename, mimetype, field='file')` with a fixed boundary (`attachments.test.ts:24-36`, `data-import.test.ts:149-158`).

**Atomicity/rejection helpers:** `snapshot(db, dataDir)` counts rows per table and lists files (`data-import.test.ts:305-330`). `expectRejected(response, status, before, after)` checks the status, the `application/problem+json` content-type, and that nothing changed (`:340-350`). There are 413 tests at `data-import.test.ts:1042-1070` and `attachments.test.ts:197`.

**Fixtures:** CSV fixtures are in `packages/shared/src/csv-import/fixtures/` (`fuelio.csv`, `drivvo.csv`, and `lubelogger-{fuel,odometer,service,tax}.csv`).
