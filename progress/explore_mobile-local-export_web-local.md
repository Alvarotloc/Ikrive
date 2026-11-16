# Explore: web local-mode data layer (#66 mobile-local-export)

## 1. DataSource interface (#53)
- Definition: `apps/web/src/lib/data-source/types.ts:55-151`; returns `DownloadedFile` (`{ blob, fileName }`, `:41-45`); failures reject with `ApiError`/Problem (`:53`).
- `dataPortability` today only has `import(file): Promise<DataImportSummary>` (`types.ts:137-139`).
  - HTTP: `http.ts:128-130` posts to `/me/import`.
  - Local: `{ import: reject }` → 501 (`local/index.ts:65`).
- Selection: module-level swap in `lib/data-source/index.ts:157-168`. Default `httpDataSource`; `dataSource()` resolved in each queryFn/mutationFn.
  - Local installed by `activateLocalDataSource()` (`features/mobile/local-mode.ts:39-50`), lazy-imports native-sqlite, native-storage, canvas-images and local module; `createLocalDataSource(await openLocalDatabase(await openDeviceDatabase()), { files: createDeviceFileStore(), images: createCanvasImages() })` (`:17-33`).
  - Called from route guard `features/mobile/require-server.ts:22` under `isLocalMode()` (`lib/app-mode.ts`). Leaving local mode resets to HTTP (`local-mode.ts:72-80`, `features/mobile/use-change-server.ts:19`).
- Plug-in point:
  - Add `export(): Promise<DownloadedFile>` at `types.ts:137`.
  - HTTP: `api.downloadUrl('/me/export')`, like `files.get` at `http.ts:139`.
  - Local: new `localDataPortability(db, deps)` wired at `local/index.ts:65`; DB read via `serialized(queue, …)`/`queue.run` like `files-get.ts` (only the lookup through the queue, not file reads).

## 2. Local implementation
- Engine: on-device SQLite via `@capacitor-community/sqlite` (`lib/native-sqlite.ts`), Drizzle `sqlite-proxy` (`local/database.ts:1-46`). Not IndexedDB.
  - `LocalDb = SqliteRemoteDatabase<typeof schema>` (`database.ts:12`), `casing: 'snake_case'`; FKs on; migrations bundled by Vite (`local/migrations.ts`).
- Schema: same Drizzle schema as the API, `packages/db/src/schema/*` (vehicles + odometerReadings, fuel, maintenance schedules + records, attachments, settings, auth `user`). Local rows have exactly the API row shape (`vehicles.photo` storage key, `attachments.storageKey/mimeType/originalName`, …).
- Synthetic owner `LOCAL_USER` (`LOCAL_USER_ID` from `@ikrive/db`) at `database.ts:17-22`; its `user_settings` row upserted on open (`:43-44`).
- Domain modules map rows to shared DTOs like the API: `local/vehicles.ts`, `fuel-logs.ts`, `maintenance.ts`, `attachments.ts`, `schedules.ts`, `settings.ts`, `stats.ts`; `problems.ts` (`problem`/`notFound`/`unsupported`); `serial.ts` (serial queue).
- API export builder: `apps/api/src/modules/data-export/service.ts`, `build()` at `:81`; `presentFiles` (`:61-75`) skips missing files with `log.warn`; yazl (`:11`, `:206-214`). Loader `repository.ts:26` `load(userId)` is sync over better-sqlite3 → local side needs an async equivalent over `LocalDb`.
- Already shared: `packages/shared/src/schemas/data-export.ts` (`dataExportSchema`), `packages/shared/src/domain/data-export.ts` (`attachmentExportPath`, `photoExportPath`).

## 3. Local files (#65, #72)
- `LocalFileStore`: `save(folder, bytes, ext)`, `read(key, mimeType)`, `remove(key)` (`local/files.ts:51-58`); keys `<folder>/<uuid>.<ext>` as in the API.
- Device store `lib/native-storage.ts:25-56`: `@capacitor/filesystem`, `Directory.Data` under `uploads/<key>`, base64 round-trip. Missing → `MissingFileError` (`files.ts:64-69`, detection `native-storage.ts:22,41`).
- Opaque URLs `local://…` (`files.ts:96-127`) resolved by `localFiles().get` (`local/files-get.ts:189-219`); `readStored` maps `MissingFileError` → 404 (`:175-182`). Photos always WebP (`assertWebp`, `files.ts:133`); thumbnails via canvas (`local/canvas-images.ts`).
- For export: call `deps.files.read(row.storageKey, row.mimeType)` / `read(vehicle.photo, 'image/webp')` directly, catch `MissingFileError` and skip (mirror API `presentFiles`).

## 4. Current server export trigger and i18n
- UI: `features/data-portability/data-section.tsx` `DataPortabilitySection` («Tus datos»), export button `:84-106`.
  - `isServerMode()` (native app + server, token auth): `saveApiFile(EXPORT_URL, 'ikrive-export.zip')` = `dataSource().files.get(url)` + `downloadBlob` (`lib/api-files.ts:54-57`).
  - Browser (cookie auth): plain `<a href="/api/me/export" download>`.
  - `EXPORT_URL` at `features/data-portability/queries.ts:212`; import via `useImportData` → `dataSource().dataPortability.import`.
- Download: `lib/download.ts:8-23` `downloadBlob(fileName, blob)` (web `<a download>`; native `saveFile` from `lib/native-files.ts`, cache + share sheet).
- Hidden in local mode: `routes/_app/settings.tsx:220-221` `{!local && <DataPortabilitySection />}` with comment about #66. Local mode needs the card with export only (import still 501).
- i18n: `apps/web/src/i18n/locales/{es,en}.json:604`, namespace `dataPortability` (`title`, `description`, `export`, `exportHint`, `import`, …, `errors.*`); export failure uses `common.fileError`. Locale tests `apps/web/src/i18n/locales.test.ts`.

## 5. Zip library and tests
- apps/web has no zip dep. API uses `yazl`/`yauzl` (Node-only). `fflate@0.8.3` and `jszip@3.10.2` only transitive in lockfile → adding e.g. fflate is a new direct dep.
- `apps/web/vitest.config.ts`: `*.test.ts` in Node (`src/test/setup-unit.ts`), `*.test.tsx` in jsdom (`src/test/setup.ts`, resets to `httpDataSource` at `:48`).
- Local tests: in-memory better-sqlite3 behind sqlite-proxy (`src/test/memory-sqlite.ts:10`), `createMemoryFileStore()` (`src/test/memory-file-store.ts`, can simulate missing/failing files), `fakeImages` (`src/test/fake-images.ts`). Reference suite `lib/data-source/local/local-data-source.test.ts`; missing-file cases `local/local-files.test.ts`.
- Guard `lib/data-source/no-direct-api.test.ts` forbids direct `api` use outside the data source.
- #66 wants a cross-check: client zip validates with `dataExportSchema` and API `POST /api/me/import` accepts it.
