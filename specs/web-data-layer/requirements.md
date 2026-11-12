# Requirements — web-data-layer

> Feature 53 (fase 8, etapa 2). Prepara el modo local (#54) sin cambios visibles: (A) las reglas de negocio que hoy solo están en la API y que el modo local necesita pasan a `packages/shared` como funciones puras con tests unitarios, y la API las usa; (B) los `queries.ts` de la web acceden a los datos a través de una interfaz `DataSource` con una única implementación HTTP.
> Fuentes: `progress/explore_web-data-layer_rules.md` (inventario #1, #2, #4, #5, #6, #8, #9, #10, #11, #12) y `progress/explore_web-data-layer_web.md`. Decisiones de la etapa 2 en `docs/PLAN.md` (fase 8).
> «Hoy» = fecha `YYYY-MM-DD` en la zona horaria del usuario. «Borrador de notificación» = `{ vehicleId, type, title, body, link, dedupeKey }` (sin `userId` ni `createdAt`, que pone quien la guarda).

## A. Reglas en `packages/shared`

### Fechas

## R1
El sistema DEBE exportar desde `@ikrive/shared` `todayIn(timeZone, now)`, `hourIn(timeZone, now)`, `weekdayOf(date)` e `isoWeekOf(date)` con el comportamiento actual de `apps/api/src/lib/dates.ts`, incluido el respaldo a UTC con una zona horaria inválida.

### Escrituras con km

## R2
SI la fecha de una escritura con km (lectura manual, mantenimiento o repostaje) es posterior a hoy ENTONCES `validateOdometerWrite` DEBE devolver `{ kind: 'future_date' }`.

## R3
SI el km de una escritura entra en conflicto (`findOdometerConflict`) con las lecturas del vehículo, excluida la lectura propia `ownReadingId`, ENTONCES `validateOdometerWrite` DEBE devolver `{ kind: 'conflict', conflict }` con la lectura en conflicto; sin km o sin conflicto devuelve `null`.

## R4
CUANDO se edita un mantenimiento, `maintenanceReadingChange(record, input)` DEBE devolver `remove` si `input.odometer` es `null`, `upsert` con la fecha y el km resultantes si hay km resultante y cambia la fecha o el km, y `keep` en otro caso.

## R5
CUANDO se edita un repostaje, `fuelReadingChange(log, input)` DEBE devolver `upsert` con la fecha y el km resultantes si cambia la fecha o el km, y `keep` en otro caso.

## R6
El sistema DEBE exportar `canDeleteOdometerReading(reading)`, que devuelve `true` solo para lecturas con `source: 'manual'`.

## R7
CUANDO se crea un vehículo con `currentOdometer`, `initialOdometerReading(currentOdometer, today)` DEBE devolver una lectura `{ date: today, value, source: 'manual' }`, y `undefined` sin `currentOdometer`.

### Mantenimientos programados

## R8
CUANDO se guarda un mantenimiento vinculado a un programado, `scheduleLastDoneUpdate(schedule, record)` DEBE devolver `{ date, odometer }` del mantenimiento si su fecha es igual o posterior a `schedule.lastDoneDate`, y `null` si es anterior.

## R9
CUANDO se crea un programado, `scheduleDefaults(input, vehicle, readings, today)` DEBE completar `lastDoneDate` con la del input, si no la fecha de compra, si no hoy; y `lastDoneOdometer` con el del input (incluido `null`), si no el km de compra, si no la última lectura, si no `null`.

## R10
SI la edición de un programado deja `intervalMonths` e `intervalDistance` resultantes a `null` ENTONCES `hasIntervalAfterUpdate(schedule, input)` DEBE devolver `false`.

### Repostajes y vehículos

## R11
CUANDO se edita un repostaje, `editedFuelPrices(stored, input)` DEBE aplicar las reglas actuales: ambos precios enviados se conservan; uno enviado recalcula el otro con la cantidad resultante; solo la cantidad conserva el total y recalcula el precio por unidad; ninguno devuelve `{}`.

## R12
El sistema DEBE exportar `vehicleStatus({ soldAt, archivedAt })` con la prioridad `sold` > `archived` > `active`.

## R13
CUANDO se edita un vehículo, `archivedAtAfterUpdate(current, archived, now)` DEBE devolver `undefined` sin `archived`, la fecha actual de archivo (o `now` si no tenía) con `true`, y `null` con `false`.

### Recordatorios y aviso de km

## R14
CUANDO un programado está `due_soon` u `overdue` para hoy, `scheduleReminderNotification` DEBE devolver un borrador con `type: schedule_<status>`, el título del programado, como cuerpo el alias del vehículo o «marca modelo», `link: /vehicles/<id>` y `dedupeKey` `schedule:<id>:<status>:<lastDoneDate>:<lastDoneOdometer|''>`; con `ok` devuelve `null`.

## R15
El sistema DEBE exportar `isReminderTime({ timezone, reminderHour }, now)`, verdadero desde la hora de recordatorio local del usuario hasta medianoche.

## R16
MIENTRAS el día de la semana local no es el `odometerReminderWeekday` del usuario (o es `null`), o la hora local es anterior a su `reminderHour`, `isOdometerNudgeTime` DEBE devolver `false`.

## R17
CUANDO hay vehículos activos cuya fecha de referencia (última lectura o, sin lecturas, fecha local de alta) es ≤ hoy − `ODOMETER_NUDGE_DAYS` (7), `odometerNudgeNotification` DEBE devolver un único borrador `type: odometer_nudge`, `vehicleId: null`, `body: null`, `link: /odometer`, título con sus nombres (alias o «marca modelo») separados por «, » y `dedupeKey` `odometer_nudge:<userId>:<semana ISO>`; sin vehículos pendientes devuelve `null`.

### Uso desde la API

## R18
La API DEBE validar y aplicar las escrituras de vehículos, lecturas, mantenimientos, repostajes y programados con las funciones de R1–R13 de `@ikrive/shared`, sin copias propias de esas reglas, conservando los códigos HTTP y los textos de error actuales.

## R19
Los jobs `reminders` y `odometer-nudge` DEBEN construir sus notificaciones con las funciones de R14–R17 de `@ikrive/shared`, con el mismo resultado actual (filas, deduplicación y envío por canales).

## B. Capa de datos de la web

## R20
El sistema DEBE definir la interfaz `DataSource` en `apps/web/src/lib/data-source/` con una operación por cada lectura y escritura que hacen hoy los `queries.ts` de `apps/web/src/features` y `lib/client-config.ts`, más `files.get(url)`, recibiendo `File` en las subidas y devolviendo `{ blob, fileName }` en las descargas.

## R21
Los `queries.ts` de `apps/web/src/features` y `apps/web/src/lib/client-config.ts` NO DEBEN importar `@/lib/api-client`.

## R22
MIENTRAS hay un `DataSource` activo instalado con `setDataSource`, las factorías de query y los hooks de mutación de los `queries.ts` DEBEN leer y escribir a través de él, manteniendo sus query keys e invalidaciones.

## R23
La implementación HTTP de `DataSource` DEBE enviar las mismas peticiones que hoy (método, ruta, cuerpo JSON y parte multipart `file` con el nombre del fichero).

## R24
SI la API responde con un estado no 2xx ENTONCES la implementación HTTP DEBE rechazar con `ApiError` y su `Problem` (salvo el caso de R27).

## R25
CUANDO la web descarga un fichero de la API por su URL (`useApiFileSrc`, `saveApiFile`, `openApiFile`), el sistema DEBE obtenerlo con `files.get(url)` del `DataSource` activo.

## R26
El sistema NO DEBE cambiar el comportamiento de la web ni de la API, comprobado porque los tests existentes de componentes (`mockApi`) y de integración de la API pasan sin cambiar sus aserciones.

## R27
SI `GET /api/me` responde 401 ENTONCES `me()` de la implementación HTTP DEBE resolver `null`.

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| Los `queries.ts` de `apps/web` usan una interfaz de acceso a datos con una implementación HTTP en lugar de llamar a `api` directamente | R20, R21, R22, R23, R24, R25, R27 |
| Las reglas que hoy solo están en la API y que necesita el modo local viven en `packages/shared` con tests unitarios, y la API las usa | R1–R17, R18, R19 |
| No cambia el comportamiento de la web ni de la API | R18, R19, R23, R24, R26 |
| `pnpm harness --full` pasa en verde | R26 |
