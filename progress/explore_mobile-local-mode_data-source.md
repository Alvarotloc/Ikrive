# Explore: swappable web data source (#53) and shared rules (for mobile-local-mode)

Sources: specs/web-data-layer/, docs/PLAN.md phase 8 (lines 205–234).

## 1. Where it is defined
- Interface: `apps/web/src/lib/data-source/types.ts` (`DataSource`, `DownloadedFile {blob, fileName|null}`, `VehicleListStatus`); DTO/input types from `@ikrive/shared`.
- HTTP impl: `apps/web/src/lib/data-source/http.ts` (`httpDataSource`, over `lib/api-client.ts`; uploads = FormData with one `file` part; `me()` maps 401 → null).
- Selection: `apps/web/src/lib/data-source/index.ts` — module variable `current`, `dataSource()`, `setDataSource(next)`. Resolved per call from every queryFn/mutationFn. No React context. Only tests call `setDataSource` today; #54 should call it at startup in local mode.
- Tests: `http.test.tsx`, `data-source.test.tsx` (`fakeDataSource`), `no-direct-api.test.ts` (guard: queries.ts must not call `api`).
- Consumers: 13 `apps/web/src/features/*/queries.ts` (auth, settings, vehicles, fuel, maintenance, schedules, stats, notifications, notification-channels, calendar-feed, reports, data-portability, admin-users), `lib/client-config.ts`, `lib/api-files.ts` (`files.get`). Query keys/invalidations stay in queries.ts.
- Error contract: implementations reject with `ApiError` (RFC 7807 `Problem`; `ApiError` in `lib/api-client.ts`, `problemSchema` in shared common.ts). ~10 UI sites branch on 404/409/413 — local mode must throw the same type.

## 2. Interface by domain
- Session/config: `me(): Me|null`, `config(): ClientConfig`
- settings: `get`, `update`
- vehicles: `list(status)`, `get`, `create`, `update`, `remove`, `setPhoto(id, File)`, `removePhoto`
- odometer: `list`, `add`, `remove`
- fuelLogs: `list`, `create`, `update`, `remove`
- maintenance: `list`, `spending` → `{total}`, `create`, `update`, `remove`
- attachments: `list`, `upload(vehicleId, recordId, File)`, `remove`
- schedules: `list`, `create`, `update`, `remove`
- stats: `get(vehicleId)`
- saleReport: `download(vehicleId, opts): DownloadedFile` (PDF)
- reportShares: `list`, `create`, `revoke`
- notifications: `list`, `markRead`, `markAllRead`
- notificationChannels: `list`, `create`, `update`, `remove`, `test`
- calendarFeed: `get`, `enable`, `disable`
- dataPortability: `import(File)`; **no `export()` yet**
- adminUsers: `list`, `setRole`, `disable`, `enable`, `remove`
- files: `get(url): DownloadedFile` — resolves opaque DTO URLs (`photoUrl`, `attachment.url`, `thumbnailUrl`); local mode can issue its own URLs.

### Outside the interface (design.md «Fuera de la interfaz»)
- Auth: Better Auth `authClient` in routes/login.tsx, routes/register.tsx, use-logout.ts.
- Server switching: lib/server.ts, features/mobile/*, routes/server.tsx, check-server.ts, `getServerUrl()` in add-to-calendar.tsx.
- Export: `EXPORT_URL = '/api/me/export'` (features/data-portability/queries.ts:6), downloaded via `saveApiFile` (data-section.tsx:90). #54 should add `dataPortability.export()`.
- Same-origin shortcut in `useApiFileSrc` (api-files.ts) bypasses the data source; #54 must change that condition.
- PLAN: local mode hides share link, iCal feed, admin, notification channels; local impl can reject those.

## 3. Hardest methods locally
1. `saleReport.download` (PDF) — hardest. API uses `@react-pdf/renderer` + fonts (`apps/api/src/modules/reports/pdf/*`) and `pdf-lib` annexes with sharp-resized images. Report data model already shared (`buildSaleReport`, `SALE_REPORT_TEXTS`, `saleReportFileName`). On-device needs react-pdf browser build + pdf-lib in WebView, no sharp.
2. `attachments.upload` / `vehicles.setPhoto` / `files.get` — API does magic-byte detection (`lib/file-type.ts`), decodability check, WebP thumbnails and photo resize (sharp), sha256, disk storage. Locally: Capacitor Filesystem/OPFS, canvas/createImageBitmap, WebCrypto, local URLs.
3. `dataPortability.import` + missing `export` — import service 429 lines (yauzl), export 254 lines (yazl). Shared format pieces exist. Needs JS zip lib (fflate/JSZip). PLAN: local → server migration via export/import.
4. Notifications (jobs) — `apps/api/src/jobs/{reminders,odometer-nudge}.job.ts`. PLAN #54: compute on app open/foreground with shared pure functions, local inbox, show via #52 local notifications. Channels meaningless locally.
5. Auth — synthetic local `Me`; admin, roles, report shares, calendar feed hidden/rejected.
6. Write orchestration (moderate) — odometer reading kept/upserted/removed with maintenance and fuel writes, schedule last-done from linked record, schedule-belongs-to-vehicle check, cascading deletes. Lives in `apps/api/src/modules/{vehicles,maintenance,fuel-logs,schedules}/{service,repository}.ts`.
7. Stats/spending (easy) — `computeVehicleStats` shared; spending = `roundMoney(sum(cost))`.

## 4. Reusable in packages/shared
- Schemas (`src/schemas/*`): vehicles, fuel-logs, maintenance, schedules, attachments, stats, settings (`DEFAULT_USER_SETTINGS`), notifications, notification-channels, reports, report-shares, calendar, data-export, data-import, common (`problemSchema`, `meSchema`, `clientConfigSchema`…), admin. Enums in `src/enums.ts`.
- Domain (`src/domain/*`, tested): dates (`todayIn`, `hourIn`…), odometer, odometer-writes (`validateOdometerWrite`, `maintenanceReadingChange`, `fuelReadingChange`, `canDeleteOdometerReading`, `initialOdometerReading`), schedules (`computeScheduleDue`, `scheduleLastDoneUpdate`, `scheduleDefaults`, `hasIntervalAfterUpdate`…), fuel (`resolveFuelPrices`, `editedFuelPrices`), vehicles (`vehicleStatus`, `archivedAtAfterUpdate`), reminders (`scheduleReminderNotification`, `odometerNudgeNotification`, dedupe keys, time checks), stats, sale-report (model only), calendar, data-export paths, vehicle-identifiers, report-shares, admin-users.
- Not in shared: DB loading/transactions, schedule-belongs-to-vehicle check, file sniffing, image processing, PDF rendering, zip, `sanitizeFileName`, channel delivery, per-entity future-date error texts.
