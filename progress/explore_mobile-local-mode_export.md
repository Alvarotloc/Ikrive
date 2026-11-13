# Explore: export zip format and import endpoint (for mobile-local-mode)

Specs: specs/{data-export-api,data-import-api,import-dedupe}/

## 1. Zip contents
- `GET /api/me/export` → `ikrive-export-YYYY-MM-DD.zip` (date in user tz via shared `todayIn`).
- `data.json` at root (deflated, `JSON.stringify(doc, null, 2)`).
- `attachments/<attachmentId>.<pdf|jpg|png|webp>` and `photos/<vehicleId>.webp` stored uncompressed. Photos always WebP.
- No manifest; version fields in `data.json`: `formatVersion: 1` (`DATA_EXPORT_FORMAT_VERSION`), `appVersion` (api `lib/version.ts`), `exportedAt` ISO.
- Top level: `{formatVersion, appVersion, exportedAt, settings, notificationChannels[], vehicles[]}`.
- Vehicles nest `odometerReadings[]`, `maintenanceSchedules[]`, `maintenanceRecords[]` (with `attachments[]`), `fuelLogs[]`. Ownership by nesting; no vehicleId/entityId/ownerId.
- ids: reference-only, `^[A-Za-z0-9_-]{1,64}$`. `scheduleId`/`odometerReadingId` must resolve within same vehicle.
- Attachment: `{id, originalName, mimeType, size, sha256, path, createdAt}`; `path === attachmentExportPath(id, mimeType)`. Vehicle `photoPath === photoExportPath(vehicleId)` or null.
- Channels exported without id/userId/token; `hasToken` boolean.
- Excluded: profile, sessions/accounts, notifications, report_shares, calendar_feeds, storage keys.
- Dates `YYYY-MM-DD`, timestamps ISO, values in user units. Stable order. Missing files are omitted with a warning.

## 2. Shared code (zod only, portable)
- `packages/shared/src/schemas/data-export.ts`: `DATA_EXPORT_FORMAT_VERSION`, `dataExportSchema` (+ `superRefine(checkIntegrity)`: unique ids, same-vehicle refs, reading linked at most once, path === generated path), `DataExport*` types. Channel configs: discriminated union (ntfy, gotify, apprise, webhook). Form length limits not applied. Reuses `userSettingsSchema`, `isoDateSchema`, `moneySchema`, `odometerValueSchema`.
- `packages/shared/src/domain/data-export.ts`: `ATTACHMENT_EXTENSIONS`, `attachmentExportPath`, `photoExportPath`.
- `packages/shared/src/schemas/data-import.ts`: `dataImportSummarySchema`, `importedVehicleMatchSchema`, `DUPLICATE_IMPORT_PROBLEM_TYPE`.
- `packages/shared/src/domain/vehicle-identifiers.ts`: `normalizeVehicleIdentifier`, `findMatchingVehicles`.
- `notificationChannelConfigSchema` in shared.

## 3. Export code (apps/api/src/modules/data-export/)
- `repository.ts`: drizzle, `load(userId)` 7 queries scoped by owner.
- `service.ts`: `createDataExportService({repo, settings, storage, log})`; `build(userId)` maps rows → doc (closure, drizzle row types, Date objects, storage keys), `dataExportSchema.parse`; zip via `yazl` + Node streams. Not reusable as-is; the mapper would need extracting to shared with a storage-neutral row type.

## 4. Import (apps/api/src/modules/data-import/, lib/zip-reader.ts)
`POST /api/me/import` multipart `file`:
1. Staged to `DATA_DIR/tmp/import-<uuid>.zip`.
2. `openZip` (yauzl strict): >50k entries, dup names, encrypted, unsafe paths, non-zip → 400.
3. `data.json` at root ≤ 32 MiB (else 413); SHA-256 computed.
4. JSON.parse → 400; `formatVersion !== 1` → 400; `dataExportSchema.safeParse` → 400 with ≤20 errors.
5. Dedupe on `data_imports` (user_id, data_sha256) → 409 `DUPLICATE_IMPORT_PROBLEM_TYPE`.
6. `checkSettings`: currency, distanceUnit, volumeUnit must match user's settings, else 409. Other settings ignored.
7. Referenced paths must exist (else 400); unreferenced entries ignored.
8. Declared sizes vs `MAX_UPLOAD_MB` / `IMPORT_MAX_MB` (1024) → 413.
9. Per file: magic bytes must match mimeType (415); images decodable via sharp (415); size+sha256 match (400); photos decodable WebP, not re-encoded; saved under new random key.
10. `buildPlan`: new UUIDs everywhere, remaps refs; attachments → entityType 'maintenance', sanitized name; channels with hasToken or invalid skipped.
11. `repo.insert` single sync transaction, batches of 500, insert-only; cleanup of written files on failure. Plate/VIN matches returned as warnings.
- Web client (`apps/web/src/features/data-portability/`) only uploads the zip; no zip lib in web or mobile.

## 5. Client-side reuse
- Portable: `dataExportSchema` + types, path helpers, version constant, import summary schemas, `findMatchingVehicles`, `notificationChannelConfigSchema`. A local mode can build `data.json`, validate with `dataExportSchema.parse` and zip with a browser lib (`fflate` is a transitive dep via pdfkit).
- Server-coupled: export `build()` closure (drizzle rows, api APP_VERSION, yazl); import `parseDocument` (throws api errors), `buildPlan`/`channelRow` (not exported; `sanitizeFileName` lives in api attachments service), yauzl, `detectAttachmentType` (pure byte checks, easy to port), `assertDecodableImage` (sharp, server-only).

## Server-only assumptions relevant to local → server migration
- Owner/user ids set from the session on import.
- Storage keys never exposed; import creates new keys.
- Settings check: local currency/distance/volume units must equal the server account's, or 409.
- Dedupe fingerprint = sha256 of raw data.json; a rebuilt export (new `exportedAt`) is not detected as duplicate — only plate/VIN warnings.
- Any id matching the regex is accepted; locally generated ids are fine if unique per collection.
- Channel tokens never exported → channels with tokens skipped.
- Photos must be decodable WebP or 415.
- `appVersion` required non-empty; mobile must supply one.
