# Explore: API data export and moving the data.json builder to shared (#66 mobile-local-export)

**Summary:** data.json is built in one place, `build()` in `apps/api/src/modules/data-export/service.ts:80-197`. Almost all of it is pure row→document mapping; only file-existence checks, version string and zip streaming are server-bound. Schema and path helpers already live in `@ikrive/shared`.

## 1. Routes, flow, zip layout
- Export `GET /api/me/export` (`apps/api/src/modules/data-export/routes.ts:11`): session required; `service.export(userId)` stream; `application/zip`, `ikrive-export-<todayIn(tz)>.zip`, `cache-control: no-store`, `nosniff`, no Content-Length.
- Wiring `apps/api/src/app.ts:171`: `createDataExportService({ repo: createDataExportRepository(db), settings, storage, log })`.
- `build(userId)` (80-197): `repo.load` + `settings.get` → `presentFiles()` (61-74, `storage.exists`, warns on missing) → mapping. Returns `{ document, files: {key, path}[], timezone }`.
- `export()` (204-250): yazl `ZipFile`; `data.json` = `JSON.stringify(document, null, 2)` (214); files via `addReadStreamLazy(path, {compress:false})`, one open at a time, PassThrough + `pipeline` (209-243).
- Zip layout: `data.json`; `attachments/<id>.<pdf|jpg|png|webp>`; `photos/<vehicleId>.webp`. Helpers in shared: `packages/shared/src/domain/data-export.ts:12` `attachmentExportPath`, `:17` `photoExportPath`, `ATTACHMENT_EXTENSIONS` `:4`.
- Import `POST /api/me/import` (`apps/api/src/modules/data-import/routes.ts:18-47`): multipart `file`, limit `service.limits.zipBytes`, temp file, `service.import(userId, zipPath)`, 201 `dataImportSummarySchema`.
- Import service `apps/api/src/modules/data-import/service.ts:366-436`, yauzl via `apps/api/src/lib/zip-reader.ts` (`strictFileNames`, `validateEntrySizes`): entry limit → data.json exists/size → sha256 dedupe → `parseDocument` → `repo.hasImport` → `checkSettings` (currency/distanceUnit/volumeUnit must match, else 409) → `referencedFiles` (265) → `checkDeclaredSizes` → `storeFile` (319: magic bytes, sharp decode, size+sha256 must match) → `buildPlan` (107) → `repo.insert` (1 tx) → `findMatchingVehicles`. Rollback of saved files on failure.
- `yazl ^3.3.1`, `yauzl ^3.4.0` only in apps/api (`apps/api/package.json:35-36`).

## 2. dataExportSchema
- `packages/shared/src/schemas/data-export.ts`; `DATA_EXPORT_FORMAT_VERSION = 1` (15).
- Shape (`dataExportObjectSchema` 149-157): `formatVersion`, `appVersion`, `exportedAt` (ISO), `settings` (`userSettingsSchema`), `notificationChannels[]` (discriminated union ntfy/gotify/apprise/webhook, `hasToken`, never token), `vehicles[]` with `odometerReadings`, `maintenanceSchedules`, `maintenanceRecords` (with `attachments[]`: `id`, `originalName`, `mimeType`, `size`, `sha256`, `path`, `createdAt`), `fuelLogs`, `photoPath`. Ids `exportIdSchema = /^[A-Za-z0-9_-]{1,64}$/` (21).
- `superRefine(checkIntegrity)` (164-228): unique ids; `scheduleId`/`odometerReadingId` resolve within vehicle; reading linked at most once; `photoPath`/attachment `path` equal generated paths.
- Import `parseDocument` (`data-import/service.ts:74-103`): JSON.parse → formatVersion check → `safeParse`, 400 with ≤20 issues.
- Export runs `dataExportSchema.parse` on its own output (`data-export/service.ts:188`), stripping unknown keys.
- Schema tests `packages/shared/src/schemas/data-export.test.ts`.

## 3. The builder
- Inputs: `repo.load(userId)` (`data-export/repository.ts:26-100`), one Drizzle query per table (vehicles, odometerReadings, maintenanceSchedules, maintenanceRecords, fuelLogs, attachments, notificationChannels), owner-scoped via join on `vehicles.owner_id`, ordered by `createdAt`/`date` then `rowid`. Type `DataExportRows` (105) inferred from Drizzle; timestamps as `Date`, channel `config` JSON object. Plus `settings.get(userId)`.
- Server-only bits: `DataExportRows` type (reaches `@ikrive/db`), `storage.exists` in `presentFiles`, `log.warn`, `APP_VERSION` (`process.env.IKRIVE_VERSION`, `apps/api/src/lib/version.ts`), `new Date()`. No Buffer/crypto in builder (sha256 stored on row).
- Pure, movable: `groupBy` (34-44), `channelOf` (46-57, strips token, sets `hasToken`), `attachmentOf`/`vehicleOf` (95-185), final `dataExportSchema.parse` (188-195).
- Suggested shared signature:
  ```ts
  buildDataExport(input: {
    rows: DataExportInputRows; settings: UserSettings; appVersion: string; exportedAt: Date | string;
    presentAttachmentIds?: Set<string>; presentPhotoVehicleIds?: Set<string>;
  }): { document: DataExport; files: { key: string; path: string }[] }
  ```
- API keeps `presentFiles`, `APP_VERSION`, clock, logger, yazl.
- **Cycle warning:** `@ikrive/db` depends on `@ikrive/shared`, so shared must NOT import `@ikrive/db`; define structural input row types (Date timestamps, loose `config` record). Optionally an API-side type assertion that `DataExportRows` is assignable to the shared input.

## 4. Existing tests
- `apps/api/test/data-export.test.ts` (690 lines): fixtures via real HTTP (`createTestApp`, `signUp`), `seedUser` (124-155: vehicle, record, PDF attachment, photo PNG→webp, ntfy channel); `download()` (79-86) unzips with yauzl. Groups: route, data.json (194, 319; 240 asserts `dataExportSchema.safeParse`), files (333-401), isolation (423), no secrets (462), streaming (556, 598, 625, missing file skipped 656). Some build the service directly with fake storage.
- `apps/api/test/data-import.test.ts` (1247 lines): `readZip`, `buildZip` (yazl, in-memory entries), `patchZipEntry`. Round-trip test line 719 `round-trips an export into another account`. Groups: validation (444-585), creation/remapping (601), files (790), atomicity (893), limits (934-1001), dedupe (1063-1183), matching vehicles (1183).
- No unit test of the builder itself.

## 5. packages/shared
- Source-only (`exports` → `./src/index.ts`), scripts `typecheck`, `test` (`vitest run --passWithNoTests`), only dep `zod ^4.6.7`. tsconfig `lib: ["ES2023"]` (no DOM), `moduleResolution: Bundler`.
- Isomorphic (no `node:`, `Buffer`, `process.`, `require(` in sources). Consumed by apps/api, apps/web, `@ikrive/db`.
- `index.ts` re-exports `domain/*` (incl. data-export, dates `todayIn`, vehicle-identifiers `findMatchingVehicles`), `enums`, `schemas/*` (data-export, data-import `dataImportSummarySchema`, settings `userSettingsSchema`, …). Tests colocated.

## Suggested move
1. `packages/shared/src/domain/data-export-builder.ts` (or extend `domain/data-export.ts`): structural row types + pure `buildDataExport` taking `appVersion`, `exportedAt`, present-file sets; keeps final `parse`.
2. API `build()` → `repo.load` → `presentFiles` → `buildDataExport(...)`; `export()`/yazl unchanged.
3. Shared unit tests with plain rows (ordering, grouping, token stripping, paths, skipped files, schema validity). Existing API export tests + round-trip at `data-import.test.ts:719` cover regression.
