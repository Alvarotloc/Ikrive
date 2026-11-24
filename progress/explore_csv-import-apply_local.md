# Exploración: csv-import-apply — DataSource local

All paths are relative to the repository root.

## 1. DataSource interface and its two implementations
- **Interface:** `apps/web/src/lib/data-source/types.ts:67-165`. Operations are grouped by domain. Failures must reject with an `ApiError` carrying an RFC 7807 `Problem` (doc comment at `:61-66`). `dataPortability` is at `:149-153` with `import(file: File): Promise<DataImportSummary>` and `export(): Promise<ExportedFile>`. `ExportedFile` is at `:56-57`.
- **Selection:** `apps/web/src/lib/data-source/index.ts`. A module-level `current`, read through `dataSource()` and set with `setDataSource()`, is resolved on every call from `features/*/queries.ts`. There is no React context.
- **HTTP implementation:** `apps/web/src/lib/data-source/http.ts:41`. `fileBody(file)` (`:29`) builds a multipart body with a single `file` part. Import is `api.post('/me/import', fileBody(file))` (`:129`) and export is `api.download('/me/export')` (`:130`).
- **Local implementation:** `apps/web/src/lib/data-source/local/index.ts:52-74` (`createLocalDataSource(db, deps)`). Each domain is a factory in its own file (`localFuelLogs(db)` and so on), wrapped in `serialized(queue, group)` (`:36-42`) so every method runs through the shared `SerialQueue`.
  - Unsupported operations use `reject` (a 501, `:29`).
  - Local zip import is still `import: reject` (`:70`). Only export was added locally, as `...localDataPortability(db, deps, queue)`.
- **How export was added in both modes (the pattern to copy):**
  - The method was declared in `types.ts`.
  - HTTP got a one-liner.
  - Locally, `apps/web/src/lib/data-source/local/data-export.ts:132-227` returns `Pick<DataSource['dataPortability'], 'export'>`. It receives `queue` explicitly and only puts the DB part in `queue.run` (`:212-215`), because the zip streaming happens outside the queue.
  - Optional dependencies go into `LocalDeps` (`local/files.ts:50+`, e.g. `exportSink`, `saleReportPdf`) with defaults.
  - The shared pure part lives in `@ikrive/shared` (`buildDataExport`, `streamDataExportZip`).
- **For CSV import:** add a method to the interface, either under `vehicles`/`dataPortability` or as a new group like `csvImport.apply(vehicleId, file, options)`.
  - HTTP: `api.post` with `fileBody`.
  - Local: a new `local/csv-import.ts` factory, wrapped with `serialized()` in `index.ts`.
  - The local 501 list in `local-data-source.test.ts:491-525` covers `dataPortability.import`. Only edit it if you touch that method.
  - `data-source.test.tsx:47` has `fakeDataSource(overrides)` for UI tests.
  - The guard `no-direct-api.test.ts` forbids `api` in `queries.ts`.

## 2. Local storage engine and atomic transactions
- The engine is SQLite on the device through `@capacitor-community/sqlite` (`apps/web/src/lib/native-sqlite.ts`). It is not IndexedDB.
  - The plugin connection is wrapped as a `drizzle-orm/sqlite-proxy` `AsyncRemoteCallback` (`:42-54`).
  - Writes go through `connection.run(sql, params, false)`, with the plugin's own transaction turned off.
  - Anything with `RETURNING` must go through `query` (Android bug, `:10-14`).
  - Computed or aggregate columns need an alias (`:16-21`).
- **DB setup:** `apps/web/src/lib/data-source/local/database.ts`.
  - `LocalDb = SqliteRemoteDatabase<typeof schema>` reuses the API's schema from `@ikrive/db/schema`.
  - `LocalTx` is defined at `:13`.
  - `openLocalDatabase` (`:28-46`) turns on `PRAGMA foreign_keys`, runs the migrations and seeds the user `LOCAL_USER` (id `LOCAL_USER_ID`) and its settings.
- **Atomicity:** `db.transaction(async (tx) => …)`. The proxy issues a plain `BEGIN`/`COMMIT` and rolls back when the callback throws. Examples:
  - `local/fuel-logs.ts:79-90`: reading and log inserted together.
  - `local/maintenance.ts:164`, `:193`, `:213`.
  - `local/vehicles.ts:103`, `:136`.
- Because there is one connection and a plain `BEGIN`, concurrency is handled by `createSerialQueue()` (`local/serial.ts`), which never interleaves operations. An operation must never call another serialized method from inside the queue, or it will deadlock. Call the inner helpers (`requireVehicle`, `listReadings`, …) instead.
- **Convention:** validate everything first (parse, `requireVehicle`, odometer checks), then do all writes inside one transaction. Tests assert that a rejected operation "writes nothing" by recording statements.

## 3. Odometer rules and dedupe locally
- **Odometer:** the local code reuses the pure functions from `@ikrive/shared`: `validateOdometerWrite`, `odometerConflictMessage`, `fuelReadingChange` and `maintenanceReadingChange`, from `packages/shared/src/domain/odometer-writes.ts:12,33,46,63`. Underneath they use `findOdometerConflict` from `domain/odometer.ts:15`.
  - Each domain has a local `validate()` that runs `validateOdometerWrite({readings: await listReadings(db, vehicleId), ownReadingId, date, odometer, today: await localToday(db)})`.
  - It maps `future_date` to a 400 and `conflict` to a 409 with `odometerConflictMessage`. See `local/fuel-logs.ts:50-65` and `local/maintenance.ts:61-76`. Manual readings are at `local/vehicles.ts:184-220`.
  - `listReadings` and `requireVehicle` are exported from `local/vehicles.ts:37,48`.
  - For a batch import you would validate each row against existing readings plus the rows already accepted, accumulated in memory. Report a conflict per row instead of throwing 409.
  - Each fuel or maintenance row creates its linked `odometerReadings` row with `source: 'fuel' | 'maintenance'` and the matching `odometerReadingId` (`fuel-logs.ts:80-88`).
- **Dedupe:** there is no row-level dedupe locally today.
  - The only existing dedupe is the zip import's `data_imports` sha256 fingerprint, which is API-only (`progress/impl_import-dedupe.md`). It answers 409 with `DUPLICATE_IMPORT_PROBLEM_TYPE`, and zip import is a 501 locally anyway.
  - For CSV, the intended mechanism is `csvRowKey` (`packages/shared/src/csv-import/keys.ts:11`). It is exported from `@ikrive/shared/csv-import` along with `parseCsvImport`, `detectCsvFormat` and `CSV_REQUIRED_COLUMNS` (`csv-import/index.ts:1-5`).
  - The design says `csvRowKey` also accepts the fields of a record already stored, so the feature can dedupe against the DB with no new column, including manual entries (`specs/csv-import-parsers/design.md:182-187`).
  - Two identical rows in one file share a `key`. The parser keeps both, and the second should count as a duplicate (`design.md:209`).
  - The size limit was left for features #85 and #86 (`progress/impl_csv-import-parsers.md`, "El límite de tamaño queda para #85 y #86").
  - The parser has no Node APIs (requirements R at `requirements.md:123`), so it runs in the WebView.

## 4. Local equivalents of HTTP errors
- **Helpers:** `apps/web/src/lib/data-source/local/problems.ts`.
  - `problem(status, title, detail?, errors?)` returns `new ApiError({type:'about:blank', title, status, …})` (`:11-19`).
  - Shortcuts: `badRequest`, `notFound`, `conflict` (`:21-23`) and `unsupported()` for 501 (`:26`).
  - `parseInput(zodSchema, value)` gives a 400 `'Validation failed'` with `errors: [{path, message}]`, paths joined with dots (`:32-41`).
- **404 / ownership:** `requireVehicle` (`local/vehicles.ts:37-45`) filters by `ownerId = LOCAL_USER_ID` and throws `notFound('Vehicle not found')`.
- **413:** `assertUploadSize(file)` in `local/files.ts:114-117` throws `problem(413, 'request file too large')` above `LOCAL_MAX_UPLOAD_MB = 20` (`files.ts:63`). This is the title `@fastify/multipart` gives. Reuse it, or a dedicated CSV limit, before reading or parsing the text.
- **API side for comparison:** `apps/api/src/modules/data-import/routes.ts:22-38` uses a per-route `request.file({limits:{fileSize}})`, then `file.file.truncated` leads to `PayloadTooLargeError`. The global multipart limit is at `apps/api/src/app.ts:101`.
- **How the UI shows them:** it branches on `ApiError.problem.status` and `type`, e.g. `apps/web/src/features/data-portability/import.ts:15-33` (`KEY_BY_STATUS` 400/409/413/415 mapped to i18n keys). A CSV import UI would follow the same pattern.

## 5. Test patterns for the local DataSource
- **In-memory DB:** `apps/web/src/test/memory-sqlite.ts`. `createMemorySqlite()` is a better-sqlite3 `:memory:` `AsyncRemoteCallback` that mimics the plugin (array rows, get/run semantics) and rejects unaliased computed columns like Android does.
- **Other fakes:** `apps/web/src/test/memory-file-store.ts` (`createMemoryFileStore`), `@/test/fake-images` (`fakeImages()`), `@/test/measuring-export-sink`, `@/test/bytes`.
- **Main suite:** `apps/web/src/lib/data-source/local/local-data-source.test.ts`.
  - `beforeEach` (`:40-51`) wraps the memory callback to record `statements`, then runs `openLocalDatabase(recording)` and `createLocalDataSource(db, {files: store, images: fakeImages()})`.
  - `problemOf(promise)` (`:54-61`) asserts an `ApiError` and returns its `problem`.
  - `writes()` (`:63`) filters insert/update/delete/begin, to assert that nothing was written.
  - `createVehicle()` (`:65`).
  - Examples: 404 matrix `:161-188`, odometer future/409 `:190-225`, validation 400 `:80-96`, serialized concurrency `:471`, 501 list `:491-525`.
- **Upload limits:** `local-files.test.ts:140` ("rejects files over maxUploadMb with 413 and writes nothing") is the template for the CSV 413 test.
- **Other suites using the same setup:** `local-export.test.ts`, `local-notifications.test.ts`, `local-sale-report.test.ts`, plus `database.test.ts` (schema parity with the API migrator).
- Shared parser fixtures are in `packages/shared/src/csv-import/fixtures/*.csv`.
