# Implementación — #53 web-data-layer

Rama `feat/web-data-layer`, sin commitear. Tasks T1–T26 marcadas en `specs/web-data-layer/tasks.md`.

## Cambios por archivo

### A. Reglas en `packages/shared` (T1–T10)

| Archivo | Cambio |
|---|---|
| `packages/shared/src/domain/dates.ts` (nuevo) | `todayIn`, `hourIn`, `weekdayOf`, `isoWeekOf`, copiados tal cual de `apps/api/src/lib/dates.ts`. |
| `packages/shared/src/domain/odometer-writes.ts` (nuevo) | `OdometerWriteError`, `validateOdometerWrite`, `odometerConflictMessage`, `ReadingChange`, `maintenanceReadingChange`, `fuelReadingChange`, `canDeleteOdometerReading`, `initialOdometerReading`. |
| `packages/shared/src/domain/schedules.ts` | + `scheduleLastDoneUpdate`, `scheduleDefaults`, `hasIntervalAfterUpdate`. |
| `packages/shared/src/domain/fuel.ts` | + `editedFuelPrices` (antes `editedPrices`, privado en `fuel-logs/service.ts`). |
| `packages/shared/src/domain/vehicles.ts` (nuevo) | `vehicleStatus`, `archivedAtAfterUpdate<T>`. |
| `packages/shared/src/domain/reminders.ts` (nuevo) | `NotificationDraft`, `isReminderTime`, `reminderDedupeKey`, `scheduleReminderNotification`, `ODOMETER_NUDGE_DAYS`, `odometerNudgeDedupeKey`, `isOdometerNudgeTime`, `odometerNudgeNotification`. |
| `packages/shared/src/index.ts` | Re-exporta `dates`, `odometer-writes`, `reminders`, `vehicles`. |
| `packages/shared/src/domain/{dates,odometer-writes,vehicles,reminders}.test.ts` (nuevos), `{schedules,fuel}.test.ts` | Tests unitarios (125 → 165 tests en shared). |

### A. La API usa shared (T11–T17)

| Archivo | Cambio |
|---|---|
| `apps/api/src/lib/dates.ts` | Borrado (`git rm`). |
| `apps/api/src/modules/{calendar,data-export,reports}/service.ts` | Solo el import de `todayIn` pasa a `@ikrive/shared`. |
| `apps/api/test/{admin-jobs,data-export,odometer-nudge,reminders,reports,schedules}.test.ts` | Solo el import de las fechas pasa a `@ikrive/shared` (diff: 6 líneas de import, ninguna aserción). |
| `apps/api/src/modules/vehicles/service.ts` | `vehicleStatus`, `archivedAtAfterUpdate`, `initialOdometerReading`, `validateOdometerWrite` + `odometerConflictMessage` en `addReading`, `canDeleteOdometerReading` en `removeReading`. Fuera `statusOf`. |
| `apps/api/src/modules/maintenance/service.ts` | `validate` → `validateOdometerWrite` + mapeo a `BadRequestError`/`ConflictError`; `maintenanceReadingChange`; `scheduleLastDoneUpdate` (la comprobación «programado de este vehículo» sigue en la API). |
| `apps/api/src/modules/maintenance/repository.ts` | `ReadingChange` se importa de shared (se borra el tipo local). |
| `apps/api/src/modules/fuel-logs/service.ts` | `validateOdometerWrite`, `fuelReadingChange`, `editedFuelPrices`; borrado `editedPrices`. |
| `apps/api/src/modules/fuel-logs/repository.ts` | `ReadingChange` de shared; el tipo del parámetro es el subconjunto `Extract<ReadingChange, keep \| upsert>`. |
| `apps/api/src/modules/schedules/service.ts` | `scheduleDefaults` en `create`, `hasIntervalAfterUpdate` en `update`. |
| `apps/api/src/jobs/reminders.job.ts` | Filas con `{ ...scheduleReminderNotification(...), userId, createdAt }`; re-exporta `isReminderTime`, `reminderDedupeKey`. |
| `apps/api/src/jobs/odometer-nudge.job.ts` | `isOdometerNudgeTime` + `odometerNudgeNotification`; re-exporta `ODOMETER_NUDGE_DAYS`, `odometerNudgeDedupeKey`. |

Textos de error y códigos HTTP idénticos: el «future date» sigue por entidad y el de conflicto sale de `odometerConflictMessage` (mismo texto).

### B. Capa de datos de la web (T18–T25)

| Archivo | Cambio |
|---|---|
| `apps/web/src/lib/data-source/types.ts` (nuevo) | `DataSource` (una operación por llamada de los `queries.ts` + `config()` + `files.get`), `DownloadedFile`, `VehicleListStatus`. |
| `apps/web/src/lib/data-source/http.ts` (nuevo) | `httpDataSource` sobre `api` con las mismas rutas y cuerpos; `FormData` con la parte `file` en `setPhoto`/`attachments.upload`/`dataPortability.import`; `me()` con 401 → `null`; `saleReport.download` usa `saleReportPath`; `files.get` → `api.downloadUrl`. |
| `apps/web/src/lib/data-source/index.ts` (nuevo) | `dataSource()`, `setDataSource()`; re-exporta los tipos. |
| `apps/web/src/lib/api-client.ts` | `DownloadedFile` se mueve a `types.ts` y se re-exporta. |
| `apps/web/src/features/*/queries.ts` (13) | `queryFn`/`mutationFn` → `dataSource().<dominio>.<op>(…)`; keys, invalidaciones, `setQueryData`, `refetchInterval`, `staleTime` intactos. `vehicles/queries.ts` re-exporta `VehicleListStatus` (ahora definido en `types.ts`). `reports/queries.ts` mantiene el guardado (`downloadBlob` + nombre por defecto) en el hook. |
| `apps/web/src/lib/client-config.ts` | `dataSource().config()`. |
| `apps/web/src/lib/api-files.ts` | `useApiFileSrc`, `saveApiFile`, `openApiFile` → `dataSource().files.get(url)`; la rama `isServerMode()` no cambia. |
| `apps/web/src/lib/data-source/{no-direct-api.test.ts,data-source.test.tsx,http.test.tsx}` (nuevos) | Tests (469 → 478 tests en web). Ningún test existente modificado. |

## Trazabilidad

| R | Archivo › test |
|---|---|
| R1 | `packages/shared/src/domain/dates.test.ts` › `returns today in the time zone`, `falls back to UTC with an invalid time zone` (todayIn y hourIn), `returns the local hour in the time zone`, `returns the weekday of a date (0 = Sunday)`, `returns the ISO week of a date`; además `apps/api/test/odometer-nudge.test.ts` › `weekdayOf and isoWeekOf` (import cambiado) |
| R2 | `packages/shared/src/domain/odometer-writes.test.ts` › `rejects a future date`, `accepts today`; API: `maintenance.test.ts`/`fuel-logs.test.ts`/`vehicles.test.ts` › `rejects a future date` |
| R3 | `odometer-writes.test.ts` › `reports a conflicting reading`, `ignores its own reading`, `skips the check without odometer`; API › `rejects a conflicting odometer on create and edit`, `ignores its own reading when validating an edit` |
| R4 | `odometer-writes.test.ts` › `maintenance: removes the reading when odometer is cleared`, `maintenance: upserts on date or odometer change`, `maintenance: keeps when nothing changes`; API `maintenance.test.ts` › `removes the linked reading when odometer is cleared` |
| R5 | `odometer-writes.test.ts` › `fuel: upserts on date or odometer change`, `fuel: keeps when nothing changes` |
| R6 | `odometer-writes.test.ts` › `only manual readings are deletable`; API › `refuses to delete readings owned by a record` |
| R7 | `odometer-writes.test.ts` › `builds the initial manual reading` |
| R8 | `packages/shared/src/domain/schedules.test.ts` › `moves last done for a newer or same-day record`, `keeps last done for an older record`; API › `keeps last done for an older linked record` |
| R9 | `schedules.test.ts` › `defaults last done to the input`, `defaults last done to the vehicle purchase`, `defaults last done to today and the latest reading`, `keeps a null last done odometer from the input`; API `schedules.test.ts` › `defaults last done to the vehicle purchase` |
| R10 | `schedules.test.ts` › `requires an interval after an update` |
| R11 | `packages/shared/src/domain/fuel.test.ts` › `keeps both prices sent`, `recomputes the other price from the resulting quantity`, `keeps the total when only the quantity changes`, `returns nothing without price or quantity`; API › `recomputes prices on edit` |
| R12 | `packages/shared/src/domain/vehicles.test.ts` › `sold wins over archived`, `archived wins over active` |
| R13 | `vehicles.test.ts` › `keeps the archive date on re-archive`, `archives now`, `unarchives`, `leaves archivedAt untouched without archived`; API › `archives and marks vehicles as sold, filtering the list by status` |
| R14 | `packages/shared/src/domain/reminders.test.ts` › `builds a due soon reminder`, `builds an overdue reminder with the make and model as body`, `returns no reminder for an ok schedule`, `reminder dedupe key changes with status and last done` |
| R15 | `reminders.test.ts` › `is reminder time from the reminder hour` |
| R16 | `reminders.test.ts` › `nudge time only on the weekday and from the hour`, `no nudge time without a weekday` |
| R17 | `reminders.test.ts` › `nudges vehicles 7 days stale or more`, `counts vehicles without readings from their local creation date`, `returns no nudge without pending vehicles`, `nudge dedupe key is per ISO week` |
| R18 | `apps/api/test/{vehicles,maintenance,fuel-logs,schedules}.test.ts` sin cambios de aserciones (368/368 en verde) |
| R19 | `apps/api/test/reminders.test.ts` › `notifies due soon and overdue schedules`; `odometer-nudge.test.ts` › `notifies stale active vehicles in one notification`; `admin-jobs.test.ts` (sin cambios de aserciones) |
| R20 | `apps/web/src/lib/data-source/types.ts` (tipado comprobado por `pnpm typecheck`); `data-source.test.tsx` y `http.test.tsx` |
| R21 | `apps/web/src/lib/data-source/no-direct-api.test.ts` › `queries.ts files do not import the api client` (+ `finds the queries.ts files`; comprobado que falla al añadir un import de `../../lib/api-client` a un `queries.ts`) |
| R22 | `apps/web/src/lib/data-source/data-source.test.tsx` › `queries read through the active data source`, `mutations write through the active data source and keep their invalidation`, `uses the HTTP data source by default` |
| R23 | `apps/web/src/lib/data-source/http.test.tsx` › `uploads a file as the multipart file part with its name`; tests de componentes existentes con `mockApi` sin cambios |
| R24 | `http.test.tsx` › `rejects a non-2xx response with its ApiError problem`; `src/lib/api-client.test.tsx`, `odometer-form.test.tsx` sin cambios |
| R25 | `data-source.test.tsx` › `files are fetched through the active data source`; `src/lib/api-files.test.tsx`, `src/components/api-image.test.tsx` sin cambios |
| R26 | Suites completas: API 368, web 478 (469 previos sin cambios + 9 nuevos), shared 165; `git diff apps/api/test` = solo 6 líneas de import |
| R27 | `http.test.tsx` › `resolves me to null on 401` |

## `pnpm harness --full`

```
[OK]    64 features: 62 done, 1 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #53 web-data-layer (in_progress)
[OK]    Rama actual: feat/web-data-layer
[OK]    pnpm lint
[OK]    pnpm typecheck
e2e test:            Tests  6 passed (6)
apps/mobile test:    tests 27, pass 27
packages/shared:     Test Files 22 passed, Tests 165 passed
apps/web:            Test Files 73 passed, Tests 478 passed
apps/api:            Test Files 38 passed, Tests 368 passed
[OK]    pnpm test
[OK]    Arnés en verde.
```

Aviso: una de las primeras ejecuciones de `pnpm harness --full` dio `[FAIL] pnpm test` sin que pudiera identificar el test (la salida no se guardó). 3 ejecuciones de `pnpm test` y 8 de `pnpm harness --full` posteriores, todas en verde. Encaja con los flakes intermitentes ya registrados en `progress/history.md` (#38, #46, entrada de la línea 440); no parece relacionado con esta feature, pero conviene que el reviewer repita la suite.

## Revisión visual

No aplica: la feature no cambia UI (design › «Impacto en UI: ninguno»). No se han sacado capturas.

## Desviaciones del spec

- `VehicleListStatus` pasa a definirse en `lib/data-source/types.ts` (lo necesita la interfaz) y `features/vehicles/queries.ts` lo re-exporta, para que `lib` no dependa de un tipo de `features` y no cambien sus importadores.
- `DataSource.adminUsers.setRole(id, role)` recibe `AdminUserRoleUpdate['role']`; el cuerpo enviado sigue siendo `{ role }`.
- Tests añadidos además de los nombrados en tasks: `hourIn` › `returns the local hour in the time zone`, `uses the HTTP data source by default` y `finds the queries.ts files` (guarda de que el test de R21 no pasa en vacío).
- Sin cambios en `docs/` ni `CONTRIBUTING.md` (fuera del alcance de `design.md`). El leader puede querer documentar `lib/data-source/` en CONTRIBUTING › Web.
