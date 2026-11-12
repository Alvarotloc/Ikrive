# Explore #53 web-data-layer: business rules in API vs packages/shared

> Written by the leader from the Explore agent's report (Explore is read-only).

## Overview
Most of the calculations already live in shared as pure, unit-tested code. Only **orchestration glue** is left in apps/api: deciding what to write, defaults, ownership checks, and the job bodies. Drizzle transactions mix that glue with the DB writes. Main gaps for local mode:
- **(a)** the odometer-link "ReadingChange" decision plus schedule last-done.
- **(b)** the reminder and km-nudge selection logic.
- **(c)** the date/time-zone helpers in `apps/api/src/lib/dates.ts`.
- **(d)** the small validations (no future dates, "needs an interval", only manual readings deletable, and others).

## Already in packages/shared (src/index.ts re-exports everything)
- **domain/odometer.ts:** `OdometerPoint`, `byDateThenValue`, `findOdometerConflict`, `latestOdometerReading`, `averageDistancePerYear/Month`.
- **domain/schedules.ts:** `AVERAGE_WINDOW_DAYS`, `MIN_AVERAGE_SPAN_DAYS`, `addDays`, `addMonths`, `averageDailyDistance`, `ScheduleRule`, `ScheduleDue`, `computeScheduleDue(rule, readings, today)` (next-due date/odometer plus ok/due_soon/overdue).
- **domain/fuel.ts:** `fuelQuantityUnit`, `resolveFuelPrices`.
- **domain/stats.ts:** `roundMoney`, `distanceDriven`, `distanceByMonth`, `consumptionSegments`, `averageConsumption`, `costPerDistance`, `spendingByCategory`, `spendingByMonth`, `computeVehicleStats`.
- **domain/sale-report.ts:** `buildSaleReport`, `saleReportFileName`, `SALE_REPORT_TEXTS`.
- **domain/calendar.ts:** `scheduleCalendarEvent`, google/outlook URLs, `toICalendar`.
- **domain/vehicle-identifiers.ts:** `normalizeVehicleIdentifier`, `findMatchingVehicles`.
- **domain/data-export.ts:** `attachmentExportPath`, `photoExportPath`.
- **Other:** `report-shares.ts` (`reportShareStatus`), `admin-users.ts` (`adminUserLocks`).
- **enums.ts, schemas/\*:** zod schemas, including `dataExportSchema`, `DATA_EXPORT_FORMAT_VERSION`, `DEFAULT_USER_SETTINGS`.
- **Tests:** vitest `*.test.ts` next to the code; `pnpm --filter @ikrive/shared test`. Only dependency: zod.

## Inventory (API logic that is not a plain query)

| # | Where | What | Pure? | In shared? | Extraction | #53/#54 |
|---|---|---|---|---|---|---|
| 1 | maintenance/service.ts:61-78; fuel-logs/service.ts:210-226; vehicles/service.ts:389-398 | Write validation: date not after today in user's TZ + `findOdometerConflict` excluding the record's own linked reading. Same error text in 3 places. | Mixed (repo + settings) | Conflict check yes; wrapper no | Easy: `validateOdometerWrite({readings, ownReadingId, date, odometer, today})` → typed error or null | **Essential** |
| 2 | maintenance/service.ts:135-140; fuel-logs/service.ts:250-254 | `ReadingChange` (keep/remove/upsert) for the linked reading on update. Maintenance can remove it (odometer null); fuel cannot. A log that lost its reading gets it back on next change. | Pure inline | No | Easy: `maintenanceReadingChange`, `fuelReadingChange`; move `ReadingChange` type | **Essential** |
| 3 | maintenance/repository.ts:63-141; fuel-logs/repository.ts:184-237 | Applies the reading change in a tx: insert/update/delete reading with source 'maintenance'/'fuel', set `odometerReadingId`; on delete remove linked reading and attachment rows. | DB-bound | No | Rules to shared (source tag, cascades, 1:1 link), tx code reimplemented in local mode | Rules essential; tx #54 |
| 4 | maintenance/service.ts:84-92 (+ repo markScheduleDone 25-31) | Schedule link: schedule must belong to vehicle; last-done moves only if `record.date >= schedule.lastDoneDate`. | Mixed | No | Easy: `scheduleLastDoneUpdate(schedule, {date, odometer})` | **Essential** |
| 5 | schedules/service.ts:74-87 | Create defaults: lastDoneDate = input → vehicle.purchaseDate → today; lastDoneOdometer = input (null allowed) → purchaseOdometer → latest reading → null. | Mixed | Partly | Easy: `scheduleDefaults(input, vehicle, readings, today)` | **Essential** |
| 6 | schedules/service.ts:96-103 | Update: merged schedule must keep an interval (months or distance). | Pure inline | No | Trivial: `hasScheduleInterval(merged)` | **Essential** |
| 7 | schedules/service.ts:22-34 | DTO = row + `computeScheduleDue` | Shared | Yes | None | Done |
| 8 | jobs/reminders.job.ts:142-156, 176-217 | `isReminderTime`, `reminderDedupeKey` (`schedule:{id}:{status}:{lastDoneDate}:{lastDoneOdometer}`), row: type `schedule_${status}`, title, body = name or "make model", link `/vehicles/{id}`. | Helpers pure in api; loop mixes repo + dispatch | Only `computeScheduleDue` | Easy-medium: `scheduleReminders(rules, readingsByVehicle, today) -> NewNotification[]` + dedupe key | Recommend #53 |
| 9 | jobs/odometer-nudge.job.ts:254-259, 283-316 | `ODOMETER_NUDGE_DAYS=7`, `odometerNudgeDedupeKey(user, isoWeek)`, weekday+hour gate. Vehicle pending if (lastReadingDate else createdAt day in TZ) <= today-7. Title = names joined ", ", link `/odometer`. SQL max(date) in vehicles/repository.ts:119-140. | Mixed | No | Easy-medium: `odometerNudge({vehicles, today, weekday}) -> notification or null` | Recommend #53 |
| 10 | lib/dates.ts (37 lines) | `todayIn`, `hourIn`, `weekdayOf`, `isoWeekOf`. Intl only. | Pure | No (web has `todayIso()` in apps/web/src/lib/format.ts:8 using browser TZ) | Trivial; tests in apps/api/test/odometer-nudge.test.ts:121-137 can move | **Essential** |
| 11 | fuel-logs/service.ts:184-191 | `editedPrices` merge rules on edit, built on `resolveFuelPrices`. | Pure, private | Base yes | Trivial: export `editedFuelPrices(stored, input)` | **Essential** |
| 12 | vehicles/service.ts:292-293, 339-343, 349-350, 401-408 | `statusOf` (sold > archived > active); create puts first manual reading at today; archivedAt kept on re-archive; only `manual` readings deletable; DTO odometer = latest reading. | Pure inline + repo | Only `latestOdometerReading` | Easy: `vehicleStatus`, `archivedAtFor`, `canDeleteReading` | **Essential** (small) |
| 13 | maintenance/service.ts:101-104 (+ repo sumCost 43-51) | Spending total = SQL total + `roundMoney` | SQL | Partly | Easy | Nice-to-have |
| 14 | stats/service.ts:355-376 | Glue to `computeVehicleStats`; fuel logs reversed (relies on repo order date desc, odometer desc, createdAt desc). | Thin | Yes | Document order or sort helper | Done (note order) |
| 15 | reports/service.ts:45-121 | Annex budget, attachments, PDF | Storage/PDF | Model yes | Not needed | #54 or never |
| 16 | calendar/service.ts:67-99 | iCal feed | Token/DB | Events yes | Not needed (no public links locally) | Not needed |
| 17 | data-import/service.ts:74-100, 107-262, 307-316 | parseDocument, buildPlan (id remap), channelRow, checkSettings, sha256 dedupe | Mostly pure except randomUUID/Date | Partly | Medium | **#54** |
| 18 | data-export/service.ts:34-57, 80+ | groupBy, channelOf, rows → `DataExport` | Mostly pure | Paths/schema yes | Medium: `buildDataExportDocument(rows, settings)` | **#54** |
| 19 | attachments/service.ts:32-37 | `sanitizeFileName` | Pure | No | Trivial | #54 |
| 20 | db schema FKs | Cascades and 1:1 reading link | DB | No | Local migrations | #54 |
| 21 | Ownership checks, `activeUserFilter` | Multi-user filtering | DB | n/a | Not needed in local mode | Not needed |

## Recommendation for #53 scope
Move to shared with unit tests, API uses them: dates (#10), write validation (#1), ReadingChange deciders (#2), `scheduleLastDoneUpdate` (#4), `scheduleDefaults` + interval check (#5, #6), `editedFuelPrices` (#11), vehicle rules (#12), reminder and nudge builders + dedupe keys (#8, #9). All ~10-40 lines; existing API integration tests guard behaviour.

Defer to #54: import/export document building (#17, #18), `sanitizeFileName` (#19), local schema/migrations/transactions (#3, #20).

## Key paths
- apps/api/src/modules/{maintenance,fuel-logs,vehicles,schedules,stats,data-import,data-export,attachments}/service.ts
- apps/api/src/modules/{maintenance,fuel-logs,vehicles}/repository.ts
- apps/api/src/jobs/{reminders,odometer-nudge}.job.ts
- apps/api/src/lib/dates.ts
- packages/shared/src/domain/*.ts, packages/shared/src/index.ts
- apps/web/src/lib/format.ts (`todayIso`, browser TZ rather than user setting)
