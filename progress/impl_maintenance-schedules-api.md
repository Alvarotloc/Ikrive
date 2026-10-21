# Implementación — maintenance-schedules-api (#13)

Rama `feat/maintenance-schedules-api`. T1–T19 marcadas en `specs/maintenance-schedules-api/tasks.md`. Sin UI (no hay capturas).

## Cambios por archivo

### packages/shared
- `src/enums.ts`: `SCHEDULE_STATUSES = ['ok','due_soon','overdue']` + `ScheduleStatus`.
- `src/domain/schedules.ts` (nuevo): `AVERAGE_WINDOW_DAYS` (90), `MIN_AVERAGE_SPAN_DAYS` (30), `addDays`, `addMonths` (ajusta al fin de mes), `averageDailyDistance(readings, today)`, `computeScheduleDue(rule, readings, today)` y los tipos `ScheduleRule`/`ScheduleDue`. Fechas `YYYY-MM-DD` con aritmética UTC; `today` llega como parámetro. El estado usa solo la fecha por meses y la última lectura (la fecha estimada no cuenta). Si la fecha por meses y la estimada coinciden, gana la de meses (`nextDueDateEstimated: false`).
- `src/domain/schedules.test.ts` (nuevo): tests de T3 (+ `adds and subtracts days`).
- `src/schemas/schedules.ts` (nuevo): `createMaintenanceScheduleSchema` (`refine` de al menos un intervalo en `path: ['intervalMonths']`, por defecto `warnDays` 30 y `warnDistance` 1000), `updateMaintenanceScheduleSchema` (parcial, sin valores por defecto), `maintenanceScheduleSchema` (respuesta con los campos calculados), `maintenanceScheduleParamsSchema` y los tipos `*Input`.
- `src/schemas/schedules.test.ts` (nuevo): tests de T5.
- `src/schemas/maintenance.ts`: `scheduleId` (`string | null`, opcional) en los campos de alta y edición, y `scheduleId: string | null` en la respuesta.
- `src/index.ts`: exporta `domain/schedules` y `schemas/schedules`.

### apps/api
- `src/db/schema/maintenance.ts`: tabla `maintenanceSchedules` (índice `maintenance_schedules_vehicle_id_idx`, FK al vehículo con cascade) y `maintenanceRecords.scheduleId` (FK `onDelete: 'set null'` en el esquema TS).
- `src/db/migrations/0004_maintenance_schedules.sql` + `meta/0004_snapshot.json` + `meta/_journal.json`: generados con `pnpm --filter @ikrive/api exec drizzle-kit generate --name maintenance_schedules`, sin editar a mano (ver desviación 1).
- `src/modules/schedules/repository.ts` (nuevo): `listByVehicle` (`createdAt` ascendente y `rowid` para desempatar), `find(vehicleId, id)`, `create`, `update`, `delete` (en una transacción pone a null el `schedule_id` de los mantenimientos y luego borra la regla).
- `src/modules/schedules/service.ts` (nuevo): `requireVehicle`/`requireSchedule` (404 con `Vehicle not found` / `Maintenance schedule not found`), `toDto` = fila + `computeScheduleDue`, hoy calculado con `todayIn(settings.timezone)` y lecturas leídas una vez por petición. Valores por defecto del último realizado, campo a campo. `update` fusiona los intervalos con los de la fila y lanza 400 (`A schedule needs an interval in months or distance`) antes de escribir.
- `src/modules/schedules/routes.ts` (nuevo): los cinco endpoints bajo `app.authenticate` (201 en el alta, 204 en el borrado).
- `src/modules/maintenance/repository.ts`: `ScheduleLastDone`; `create`/`update` aceptan un `lastDone?` opcional y actualizan `maintenance_schedules` dentro de su `db.transaction`.
- `src/modules/maintenance/service.ts`: nueva dependencia `schedules: SchedulesRepository`. `scheduleLastDone` comprueba el `scheduleId` resultante (400 `Maintenance schedule not found for this vehicle` antes de escribir) y solo devuelve `lastDone` si la fecha del mantenimiento es ≥ `lastDoneDate`.
- `src/app.ts`: cablea `schedulesRepo`, `schedulesService` y `schedulesRoutes`, y pasa `schedules` al servicio de mantenimientos.
- `test/schedules.test.ts` (nuevo): tests de integración T12–T17 y un test extra de borrado del vehículo.
- `test/maintenance.test.ts`: la respuesta esperada incluye `scheduleId: null` (ver desviación 2).

### apps/web (solo fixtures de tests, ver desviación 2)
- `src/features/maintenance/{form.test.ts,timeline.test.ts,maintenance-form.test.tsx,maintenance-spending.test.tsx,maintenance-timeline.test.tsx}`: `scheduleId: null` en los `MaintenanceRecord` de prueba.

### docs
- `docs/PLAN.md`: modelo de datos de `maintenance_schedules` (`interval_distance`, `warn_days` + `warn_distance`, `last_done_*`; `next_due_*` y el estado se calculan al leer). La nota de decisión de la fase 4 sigue en su sitio.

## Trazabilidad

| R | Test(s) |
|---|---|
| R1 | `apps/api/test/schedules.test.ts` › `creates, lists, reads, updates and deletes schedules` (fila en `maintenance_schedules`) |
| R2 | `schedules.test.ts` › `updates the schedule when a linked record is created or edited`, `rejects a schedule from another vehicle`; `maintenance.test.ts` › `creates, lists, reads, updates and deletes maintenance records` (`scheduleId: null`) |
| R3 | `packages/shared/src/schemas/schedules.test.ts` › `rejects categories outside MAINTENANCE_CATEGORIES`; `schedules.test.ts` › `validates the payload` |
| R4 | `schemas/schedules.test.ts` › `requires at least one interval`; `schedules.test.ts` › `validates the payload` (400 problem+json, lista vacía) |
| R5 | `schedules.test.ts` › `validates the payload` (PATCH `intervalMonths: null` → 400, regla intacta) |
| R6 | `schedules.test.ts` › `creates, lists, reads, updates and deletes schedules` |
| R7 | ídem (orden `[schedule, second]`) |
| R8 | ídem (`get` igual a la creada) |
| R9 | ídem (PATCH parcial conserva título y umbrales y recalcula `nextDueDate`/`nextDueOdometer`) |
| R10 | ídem (204 y luego 404) |
| R11 | `schedules.test.ts` › `unlinks records when a schedule is deleted` (+ `deletes the schedules with the vehicle`) |
| R12 | `schedules.test.ts` › `hides other users' vehicles and schedules` (los cinco endpoints → 404 `Vehicle not found`) |
| R13 | ídem (regla de otro vehículo propio y de otro usuario → 404 `Maintenance schedule not found`) |
| R14 | `schedules.test.ts` › `returns the computed due fields`, `creates, lists, …`; `domain/schedules.test.ts` (todos) |
| R15 | `domain/schedules.test.ts` › `computes the due odometer from distance`; `schedules.test.ts` › `returns the computed due fields` |
| R16 | `domain/schedules.test.ts` › `addMonths clamps to the end of the month`, `computes the due date from months` |
| R17 | `domain/schedules.test.ts` › `averages the distance of the last 90 days`, `returns a null average without enough data` |
| R18 | `domain/schedules.test.ts` › `estimates the due date from the daily average`; `schedules.test.ts` › `returns the computed due fields` |
| R19 | `domain/schedules.test.ts` › `uses whichever comes first`; `schedules.test.ts` › `returns the computed due fields` |
| R20 | `domain/schedules.test.ts` › `marks overdue by date and by distance` |
| R21 | `domain/schedules.test.ts` › `marks due_soon within the warning thresholds`; `schedules.test.ts` › `returns the computed due fields` (`due_soon` por distancia) |
| R22 | `domain/schedules.test.ts` › `ignores the estimated date for the status`, `marks due_soon within the warning thresholds` |
| R23 | `schedules.test.ts` › `stores the given last done values` |
| R24 | `schedules.test.ts` › `defaults last done to the vehicle purchase`, `defaults last done to today and the latest reading` |
| R25 | ídem (km de compra; última lectura; null sin lecturas; campo a campo) |
| R26 | `schedules.test.ts` › `updates the schedule when a linked record is created or edited` |
| R27 | `schedules.test.ts` › `keeps last done for an older linked record` |
| R28 | `schedules.test.ts` › `rejects a schedule from another vehicle` (alta y edición, regla de otro vehículo propio, de otro usuario e inexistente) |

## `pnpm harness --full`

```
[OK]    19 features: 12 done, 6 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #13 maintenance-schedules-api (in_progress)
[OK]    Rama actual: feat/maintenance-schedules-api
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test      shared 26/26 · api 62/62 · web 112/112
[OK]    Arnés en verde.
```

## Desviaciones del spec

1. **La FK `schedule_id` de la migración no lleva `ON DELETE SET NULL`.** drizzle-kit 0.31 genera
   `ALTER TABLE maintenance_records ADD schedule_id text REFERENCES maintenance_schedules(id);` y pierde la acción `onDelete` (el snapshot `0004_snapshot.json` sí dice `set null`). Con `foreign_keys = ON`, borrar una regla vinculada fallaría. Como no se puede escribir SQL a mano, `schedules/repository.ts › delete` pone a null el `schedule_id` de los mantenimientos y borra la regla en la misma transacción (archivo incluido en el diseño). R11 se cumple y está cubierto por un test. Además, `deletes the schedules with the vehicle` comprueba que el cascade del vehículo sigue funcionando con reglas y mantenimientos vinculados.
   **A decidir en la revisión o en Gate 2:** si se prefiere que la BD lo garantice, la alternativa es añadir `ON DELETE set null` a esa línea del SQL generado. Es un cambio de una línea y SQLite lo admite en `ADD COLUMN` nullable, pero contradice la regla de no tocar el SQL a mano. Mientras tanto, la BD real no coincide con el snapshot en esa acción.
2. **Fixtures de tests fuera de los archivos del diseño.** Por R2, `scheduleId` pasa a ser obligatorio en el tipo de respuesta `MaintenanceRecord`. Eso rompía `pnpm typecheck` en cinco tests de `apps/web/src/features/maintenance/` y una aserción `toEqual` de `apps/api/test/maintenance.test.ts`. Solo se ha añadido `scheduleId: null` a esos objetos; no hay cambios de código web.
3. **Extras menores:** un test unitario `adds and subtracts days` y uno de integración `deletes the schedules with the vehicle`, más el desempate por `rowid` en `listByVehicle`, para que el orden sea determinista si dos reglas se crean en el mismo milisegundo.

## Vuelta 1

Cambios pedidos en `progress/review_maintenance-schedules-api.md` (CHANGES_REQUESTED, hallazgo 1).

- `apps/api/src/db/migrations/0004_maintenance_schedules.sql`: se añade `ON DELETE set null` a la FK de `schedule_id`, con un comentario SQL que explica que es un retoque manual por el bug de drizzle-kit 0.31 en `ADD COLUMN`. Es una excepción **autorizada explícitamente por el humano (vía leader)** a la regla de no escribir SQL a mano. No se ha tocado el resto del SQL ni `meta/0004_snapshot.json`, que ya declaraba `set null`. Así la BD coincide con el esquema y con el snapshot.
- `apps/api/src/modules/schedules/repository.ts › delete`: se quita el `UPDATE` explícito y la transacción. Ahora solo borra la regla y la FK desvincula los mantenimientos. JSDoc actualizado.
- `apps/api/test/schedules.test.ts` › `unlinks records when a schedule is deleted`: ahora ejercita la acción real de la FK.
  - Exige que el registro conservado sea idéntico al original salvo `scheduleId: null`, incluido `updatedAt`. Con el `UPDATE` de aplicación, `$onUpdateFn` lo habría cambiado.
  - Comprueba con `PRAGMA foreign_key_list(maintenance_records)` que la FK hacia `maintenance_schedules` tiene `on_delete: 'SET NULL'`.
- La desviación 1 queda resuelta: ya no hay workaround.
- Avisos no bloqueantes del reviewer, sin cambios porque no lo piden: riesgo mínimo de `todayIn` al cambiar de día y reescritura idempotente del último realizado.

Trazabilidad actualizada: R2/R11 → `schedules.test.ts` › `unlinks records when a schedule is deleted` (FK `SET NULL` real + pragma).

`pnpm harness --full`: lint OK, typecheck OK, tests OK (shared 26, api 62, web 112). Arnés en verde.
