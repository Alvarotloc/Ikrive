# Requirements — odometer-nudge

> Feature 17 (fase 4). `odometer-nudge.job`: el día de la semana elegido por cada usuario, en su zona horaria, una notificación in-app (y por sus canales) con los vehículos activos que llevan 7 días o más sin lectura de km, con enlace a `/odometer`. Reutiliza croner y `REMINDERS_ENABLED` (#15), `notifications.createMany` (#15) y `NotificationDispatcher` (#16).
> «Hoy» = fecha local del usuario (`todayIn(timezone, now)`). «Vehículo activo» = ni vendido ni archivado (`activeVehicleFilter`). «Fecha de referencia» de un vehículo = fecha de su última lectura de km o, si no tiene ninguna, fecha local de alta del vehículo. «Vehículo pendiente» = vehículo activo cuya fecha de referencia es ≤ hoy − 7 días.

## Job y planificación

## R1
El sistema DEBE exponer `runOdometerNudge({ db, now, dispatcher })` en `apps/api/src/jobs/odometer-nudge.job.ts`, invocable sin el planificador, que devuelve `{ evaluated, created }` (usuarios evaluados y notificaciones creadas).

## R2
MIENTRAS `REMINDERS_ENABLED` es `true`, el sistema DEBE programar `odometer-nudge.job` al arrancar la API con croner, cada hora en punto (`0 * * * *`) y sin solapar ejecuciones.

## R3
SI `REMINDERS_ENABLED` es `false` ENTONCES el sistema NO DEBE programar `odometer-nudge.job`.

## R4
SI una ejecución programada de `odometer-nudge.job` lanza un error ENTONCES el sistema DEBE registrarlo con el logger de la API sin detener el proceso.

## Día de recordatorio

## R5
El sistema DEBE aceptar y devolver `odometerReminderWeekday: null` en `GET`/`PATCH /api/settings` como «sin día configurado», conservando `0`–`6` (0 = domingo) como valores válidos y `0` como valor por defecto de los usuarios nuevos.

## R6
CUANDO el usuario elige «No avisar» en el selector de día del recordatorio de Ajustes y guarda, la web DEBE enviar `odometerReminderWeekday: null`.

## R7
MIENTRAS el día de la semana de hoy, en la zona horaria del usuario, no coincide con su `odometerReminderWeekday`, el job NO DEBE crear notificaciones de km para ese usuario.

## R8
SI el usuario tiene `odometerReminderWeekday: null` o no tiene fila de ajustes ENTONCES el job NO DEBE crear notificaciones de km para ese usuario.

## R9
MIENTRAS la hora local del usuario es anterior a su `reminderHour`, el job NO DEBE crear notificaciones de km para ese usuario.

## Contenido

## R10
CUANDO el job se ejecuta en el día y a partir de la hora de recordatorio de un usuario con vehículos pendientes, el sistema DEBE crear una única notificación de tipo `odometer_nudge`, con `link: '/odometer'`, `vehicleId: null` y como título los nombres de sus vehículos pendientes (alias, o «marca modelo» sin alias) separados por «, ».

## R11
El job DEBE considerar pendiente un vehículo activo cuya última lectura tiene exactamente 7 días o más, y no uno cuya última lectura tiene 6 días o menos.

## R12
SI un vehículo activo no tiene lecturas de km ENTONCES el job DEBE usar la fecha local de alta del vehículo como fecha de referencia.

## R13
El job NO DEBE incluir vehículos archivados ni vendidos en la notificación.

## R14
SI el usuario no tiene vehículos pendientes ENTONCES el job NO DEBE crear ninguna notificación de km para él.

## Deduplicación y canales

## R15
El job DEBE deduplicar la notificación por usuario y semana ISO de hoy (`dedupeKey` `odometer_nudge:<userId>:<YYYY>-W<ww>`), de modo que otra ejecución la misma semana, aunque el usuario cambie de día, no cree otra.

## R16
CUANDO el job crea notificaciones de km, el sistema DEBE enviarlas por los canales activos de sus propietarios con `NotificationDispatcher.dispatch`, sin reenviar las deduplicadas.

## R17
El sistema DEBE mostrar el tipo `odometer_nudge` con una etiqueta traducida en la campana (`notifications.types.odometer_nudge` en `es.json` y `en.json`) y en los mensajes de canal (`TEXTS` de `messages.ts`).

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| `odometer-nudge.job` se programa con croner y es una función invocable aparte del planificador | R1, R2, R3, R4 |
| Solo usuarios cuyo día coincide con hoy en su zona horaria; sin día configurado no hay avisos | R5, R6, R7, R8, R9 |
| Una única notificación por usuario con los vehículos activos con ≥ 7 días sin lectura (sin archivados ni vendidos), enlace a `/odometer`; si no hay ninguno, nada | R10, R11, R12, R13, R14, R17 |
| Deduplicada por usuario y semana y enviada por los canales activos | R15, R16 |
| Tests de día y zona horaria, umbral de 7 días, vehículos excluidos y deduplicación | R7, R11, R13, R15 (ver `tasks.md`) |
| `pnpm harness --full` en verde | todas (T última) |
