# Review — #53 web-data-layer

**Veredicto:** APPROVED

Revisado: `git diff main...HEAD` (solo spec, PLAN y feature_list), `git diff`, `git diff --cached` (borrado de `apps/api/src/lib/dates.ts`) y los ficheros sin trackear (`apps/web/src/lib/data-source/`, `packages/shared/src/domain/{dates,odometer-writes,reminders,vehicles}{,.test}.ts`). `pnpm harness --full` ejecutado por el reviewer: en verde (shared 165, web 478, api 368, e2e 6, mobile 27).

## Puntos de atención pedidos

1. **Tests de la API solo cambian imports.** `git diff -- apps/api/test` toca 6 ficheros (`admin-jobs`, `data-export`, `odometer-nudge`, `reminders`, `reports`, `schedules`) y en todos solo se mueve el import de `../src/lib/dates` a `@ikrive/shared`. Ninguna aserción tocada. Tampoco se ha modificado ningún test existente de `apps/web` ni de `packages/shared` (en `fuel.test.ts` y `schedules.test.ts` solo se añaden bloques `describe` nuevos y se amplía el import).
2. **Fidelidad de las reglas movidas** (comparado línea a línea con `main`):
   - `dates.ts`: `diff` contra `main:apps/api/src/lib/dates.ts` vacío, idéntico byte a byte.
   - `validateOdometerWrite`: mismo orden (fecha futura antes que «sin km»), mismo filtro por `ownReadingId`; en `addReading` el `ownReadingId` por defecto `null` no excluye ninguna lectura, igual que antes. Los textos de error siguen por entidad (`The maintenance date…`, `The fuel log date…`, `The reading date…`) y `odometerConflictMessage` reproduce el texto exacto.
   - `maintenanceReadingChange`: `remove` si `input.odometer === null`; km resultante con `=== undefined ? record.odometer : input.odometer`; `upsert` solo si hay km resultante y cambia fecha o km. Idéntico al bloque eliminado de `maintenance/service.ts`.
   - `fuelReadingChange`: `input.odometer ?? log.odometer` e `input.date ?? log.date`, igual que el original.
   - `scheduleDefaults`: misma cadena `input ?? purchaseDate ?? today` y `!== undefined ? input : purchaseOdometer ?? latest ?? null` (conserva `null` explícito).
   - `hasIntervalAfterUpdate` y `scheduleLastDoneUpdate` (`>=`): idénticos.
   - `editedFuelPrices`: copia literal de `editedPrices`.
   - `vehicleStatus`, `archivedAtAfterUpdate`, `initialOdometerReading`, `canDeleteOdometerReading`: equivalentes.
   - Recordatorios: `reminderDedupeKey` literal; `scheduleReminderNotification` produce los mismos campos (`vehicleId`, `schedule_<status>`, título, `name ?? make model`, `/vehicles/<id>`, clave). Aviso de km: `isOdometerNudgeTime` = `weekdayOf(todayIn) === weekday && hourIn >= reminderHour` (con `weekday: null` nunca coincide, como antes); umbral, filtro con `todayIn(timezone, createdAt)`, título con «, », `vehicleId: null`, `body: null`, `/odometer` y clave por semana ISO, idénticos. Los jobs añaden `userId` y `createdAt: now` como antes.
3. **Capa de datos web.** Los 13 `features/*/queries.ts` y `lib/client-config.ts` usan `dataSource()` dentro de cada `queryFn`/`mutationFn`; ninguno importa `@/lib/api-client` (verificado con grep). Query keys, `refetchInterval` (notificaciones), `staleTime` (`me`, `config`), `setQueryData` e invalidaciones sin cambios en el diff. `http.ts` reproduce cada ruta, método y cuerpo eliminados de los `queries.ts` (incluidos `?status=`, `{ role }`, `saleReportPath`, `FormData` con `file`).

## Trazabilidad requirements ↔ tests
- R1: [x] `packages/shared/src/domain/dates.test.ts` › `returns today in the time zone`, `falls back to UTC with an invalid time zone` (todayIn y hourIn), `returns the weekday of a date (0 = Sunday)`, `returns the ISO week of a date` (incluye 2027-01-03 → 2026-W53 y 2024-12-30 → 2025-W01)
- R2: [x] `packages/shared/src/domain/odometer-writes.test.ts` › `rejects a future date` (también sin km), `accepts today`
- R3: [x] `odometer-writes.test.ts` › `reports a conflicting reading` (devuelve la lectura exacta y el texto del mensaje), `ignores its own reading`, `skips the check without odometer`
- R4: [x] `odometer-writes.test.ts` › `maintenance: removes…`, `maintenance: upserts…` (incluido record sin km → upsert), `maintenance: keeps…` (incluido sin km resultante → keep)
- R5: [x] `odometer-writes.test.ts` › `fuel: upserts on date or odometer change`, `fuel: keeps when nothing changes`
- R6: [x] `odometer-writes.test.ts` › `only manual readings are deletable` (manual/fuel/maintenance)
- R7: [x] `odometer-writes.test.ts` › `builds the initial manual reading` (incluye 0, null y undefined)
- R8: [x] `packages/shared/src/domain/schedules.test.ts` › `moves last done for a newer or same-day record`, `keeps last done for an older record`
- R9: [x] `schedules.test.ts` › `defaults last done to the input`, `…to the vehicle purchase`, `…to today and the latest reading` (también sin lecturas → null), `keeps a null last done odometer from the input`
- R10: [x] `schedules.test.ts` › `requires an interval after an update` (5 combinaciones)
- R11: [x] `packages/shared/src/domain/fuel.test.ts` › `keeps both prices sent`, `recomputes the other price from the resulting quantity`, `keeps the total when only the quantity changes`, `returns nothing without price or quantity`
- R12: [x] `packages/shared/src/domain/vehicles.test.ts` › `sold wins over archived`, `archived wins over active`
- R13: [x] `vehicles.test.ts` › `keeps the archive date on re-archive`, `archives now` (Date y string), `unarchives`, `leaves archivedAt untouched without archived`
- R14: [x] `packages/shared/src/domain/reminders.test.ts` › `builds a due soon reminder`, `builds an overdue reminder with the make and model as body`, `returns no reminder for an ok schedule`, `reminder dedupe key changes with status and last done` (borradores completos con `toEqual`)
- R15: [x] `reminders.test.ts` › `is reminder time from the reminder hour` (límite 08:59/09:00 en Madrid)
- R16: [x] `reminders.test.ts` › `nudge time only on the weekday and from the hour` (incluye cambio de día por zona), `no nudge time without a weekday`
- R17: [x] `reminders.test.ts` › `nudges vehicles 7 days stale or more` (límite 18 vs 19), `counts vehicles without readings from their local creation date`, `returns no nudge without pending vehicles`, `nudge dedupe key is per ISO week`
- R18: [x] `apps/api/test/{vehicles,maintenance,fuel-logs,schedules}.test.ts` sin cambios y en verde (códigos y textos de error cubiertos por `rejects a future date`, `rejects a conflicting odometer on create and edit`, `ignores its own reading when validating an edit`, `refuses to delete readings owned by a record`, etc.); el diff de `src/` muestra que las copias locales se han eliminado
- R19: [x] `apps/api/test/reminders.test.ts` › `notifies due soon and overdue schedules`, `odometer-nudge.test.ts` › `notifies stale active vehicles in one notification`, `admin-jobs.test.ts`; sin cambios de aserciones
- R20: [x] `apps/web/src/lib/data-source/types.ts` (tipado por `pnpm typecheck`) + `data-source.test.tsx` y `http.test.tsx`
- R21: [x] `apps/web/src/lib/data-source/no-direct-api.test.ts` › `queries.ts files do not import the api client` (+ `finds the queries.ts files` ≥ 13, evita pasar en vacío)
- R22: [x] `apps/web/src/lib/data-source/data-source.test.tsx` › `queries read through the active data source` (`vehiclesQuery('archived')` llama a `list('archived')`, `meQuery`), `mutations write through the active data source and keep their invalidation` (comprueba `create`, `setQueryData` del detalle e `invalidateQueries({ queryKey: vehicles.all })`)
- R23: [x] `http.test.tsx` › `uploads a file as the multipart file part with its name` (URL, método, sin headers, única parte `file` con su nombre) + tests de componentes existentes con `mockApi` sin cambios
- R24: [x] `http.test.tsx` › `rejects a non-2xx response with its ApiError problem` (`problem` igual al cuerpo)
- R25: [x] `data-source.test.tsx` › `files are fetched through the active data source` (`saveApiFile` → `files.get(url)` y `downloadBlob` con el nombre devuelto)
- R26: [x] Suites completas en verde; `git diff apps/api/test` = solo imports; ningún test existente de web/shared modificado
- R27: [x] `http.test.tsx` › `resolves me to null on 401` (y 500 sigue rechazando con `ApiError`)

## Tasks
- T1..T26: [x]

## Checkpoints
- C1: [x] harness 0 · [x] una feature activa (#53 in_progress) · [x] rama `feat/web-data-layer`
- C2: [x] requirements/design/tasks · [x] EARS con tabla de acceptance · [x] tasks `[x]` · [x] cada R con test leído
- C3: [x] el diff coincide con las tablas de archivos de `design.md` (A y B) · [x] sin cambios de otras features ni refactors fuera de lo previsto
- C4: [x] API sigue en `modules/<dominio>/` · [x] propiedad intacta (`requireOwned`/`requireVehicle` sin tocar) · [x] errores siguen como `BadRequestError`/`ConflictError` · [x] sin cambios de BD (n/a) · [x] web: `queryOptions` y keys intactas; sin textos nuevos · [x] lógica pura en `packages/shared` con tests unitarios
- C5: [x] sin `any`/`@ts-ignore`/`console.log`/TODOs nuevos · [x] fechas `YYYY-MM-DD` · [x] ficheros: sin cambios (n/a)
- C6: [x] `pnpm harness --full` en verde (ejecutado por el reviewer) · [x] tests nuevos con aserciones concretas; los de API siguen con SQLite en memoria · [x] sin UI nueva: capturas n/a, justificado en impl
- C7: [x] `progress/impl_web-data-layer.md` con archivos, mapa R→test y salida · [x] `progress/current.md` describe la sesión · [x] `docs/PLAN.md` actualizado en el commit del spec; no cierra fase

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- `apps/api/src/modules/maintenance/service.ts` › `validate`: antes, sin km se salía sin consultar las lecturas; ahora `vehicles.listReadings(vehicleId)` se consulta siempre porque `validateOdometerWrite` recibe las lecturas por adelantado. El resultado no cambia; solo hay una consulta SQLite extra en altas/ediciones de mantenimiento sin km.
- `apps/api/src/jobs/{reminders,odometer-nudge}.job.ts` re-exportan funciones de shared solo para no tocar los imports de sus tests (previsto en design). Se puede limpiar en una feature posterior.
- `CONTRIBUTING.md` › Web no menciona aún `lib/data-source/` ni la regla «los `queries.ts` pasan por `dataSource()`»; conviene documentarlo (el implementer ya lo señala).
- `packages/shared/src/domain/vehicles.ts` › `vehicleStatus` tipa `soldAt`/`archivedAt` como `unknown` (design: `unknown | null`); equivalente.
- El implementer registró un fallo intermitente sin identificar en una pasada de `pnpm test`; en esta revisión la suite completa pasó a la primera.

## Cambios requeridos
Ninguno.
