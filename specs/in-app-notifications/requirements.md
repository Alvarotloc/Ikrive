# Requirements — in-app-notifications

> Feature 15 (fase 4). Tabla `notifications`, job horario `reminders.job` (que avisa a cada usuario a partir de su «hora de los recordatorios») que avisa de las reglas de mantenimiento próximas o vencidas, endpoints de la bandeja y campana en la cabecera de la web.
> «Regla» = fila de `maintenance_schedules`. «Vehículo activo» = sin `sold_at` ni `archived_at`. «Hoy» = fecha actual en la zona horaria del dueño (`user_settings.timezone`, por defecto `Europe/Madrid`).
> Tipos de notificación: `schedule_due_soon` y `schedule_overdue`.

## Datos

## R1
El sistema DEBE persistir las notificaciones en la tabla `notifications` (`id`, `user_id` con FK a `user` en cascada, `vehicle_id` nullable con FK a `vehicles` en cascada, `type`, `title`, `body`, `link`, `dedupe_key`, `read_at` nullable y `created_at`), creada por una migración generada con drizzle-kit.

## R2
SI se inserta una notificación con un `dedupe_key` que ya existe ENTONCES el sistema DEBE omitir la inserción sin error y sin crear una segunda fila.

## Job de recordatorios

## R3
El sistema DEBE validar con zod la variable de entorno `REMINDERS_ENABLED` (`true|false|1|0`, por defecto `true`) y rechazar el arranque con cualquier otro valor.

## R4
CUANDO la API arranca con `REMINDERS_ENABLED` activo, el sistema DEBE programar con croner el job de recordatorios cada hora (patrón `0 * * * *`).

## R5
MIENTRAS `REMINDERS_ENABLED` es `false`, el sistema NO DEBE programar el job de recordatorios.

## R6
El sistema DEBE exponer `runReminders({ db, now })` como función invocable sin el planificador, que devuelve `{ evaluated, created }` (reglas evaluadas y notificaciones creadas).

## R7
CUANDO se ejecuta el job, el sistema DEBE calcular el estado de cada regla de un vehículo activo cuyo dueño cumple R28 con `computeScheduleDue` de `@ikrive/shared`, usando las lecturas de odómetro del vehículo y «hoy» en la zona horaria de su dueño.

## R8
CUANDO el job encuentra una regla de un vehículo activo en estado `due_soon` u `overdue`, el sistema DEBE crear una notificación para el dueño con `vehicle_id` = id del vehículo, `type` `schedule_due_soon` o `schedule_overdue`, `title` = título de la regla, `body` = nombre del vehículo y `link` = `/vehicles/<vehicleId>`.

## R9
CUANDO el job encuentra una regla en estado `ok`, el sistema NO DEBE crear ninguna notificación para ella.

## R10
MIENTRAS un vehículo está archivado o vendido, el sistema NO DEBE crear notificaciones para sus reglas.

## R11
El sistema DEBE usar como `dedupe_key` `schedule:<scheduleId>:<status>:<lastDoneDate>:<lastDoneOdometer|''>`, de modo que ejecutar el job varias veces sin cambios en la regla no cree notificaciones nuevas.

## R12
CUANDO una regla ya notificada cambia de estado (`due_soon` → `overdue`) o de periodo (cambia `lastDoneDate` o `lastDoneOdometer`), el sistema DEBE crear una notificación nueva en la siguiente ejecución del job.

## API

## R13
CUANDO el usuario hace `GET /api/notifications`, el sistema DEBE devolver `{ items, total, unreadCount }` con sus notificaciones ordenadas de más reciente a más antigua, paginadas con `limit` (1–100, por defecto 20) y `offset` (≥ 0, por defecto 0).

## R14
SI `limit` u `offset` de `GET /api/notifications` no son válidos ENTONCES el sistema DEBE responder 400 `application/problem+json`.

## R15
CUANDO el usuario hace `PATCH /api/notifications/:id/read` sobre una notificación suya, el sistema DEBE fijar `read_at` a la fecha actual si era null (conservándola si ya estaba leída) y responder 200 con la notificación.

## R16
CUANDO el usuario hace `POST /api/notifications/read-all`, el sistema DEBE marcar como leídas todas sus notificaciones no leídas y responder 204.

## R17
El sistema NO DEBE incluir en `items`, `total` ni `unreadCount` de `GET /api/notifications` notificaciones de otros usuarios.

## R18
SI la notificación de `PATCH /api/notifications/:id/read` no existe o pertenece a otro usuario ENTONCES el sistema DEBE responder 404 `application/problem+json` sin modificarla.

## R19
CUANDO un usuario hace `POST /api/notifications/read-all`, el sistema NO DEBE modificar notificaciones de otros usuarios.

## R20
SI la petición a cualquier endpoint de `/api/notifications` no tiene sesión ENTONCES el sistema DEBE responder 401.

## Web

## R21
MIENTRAS el usuario está en la app autenticada, la cabecera DEBE mostrar un botón de campana cuyo nombre accesible incluye el número de no leídas y, si es mayor que 0, un contador visible (con tope «9+»).

## R22
CUANDO el usuario pulsa la campana, la web DEBE abrir un panel con la lista de notificaciones (etiqueta del tipo, título, cuerpo y fecha), distinguiendo las no leídas.

## R23
MIENTRAS el usuario no tiene notificaciones, el panel DEBE mostrar un estado vacío.

## R24
SI la petición de notificaciones falla ENTONCES el panel DEBE mostrar un mensaje de error con `role="alert"` sin romper la cabecera.

## R25
CUANDO el usuario pulsa una notificación, la web DEBE marcarla como leída (`PATCH …/read` si no lo estaba), cerrar el panel y navegar a su `link`.

## R26
CUANDO el usuario pulsa «Marcar todas como leídas», la web DEBE llamar a `POST /api/notifications/read-all` y dejar de mostrar el contador.

## R27
El sistema DEBE tener todos los textos nuevos de la web (campana, panel, tipos, estados vacío y error, campo «Hora de los recordatorios») en `es.json` y en `en.json`.

## Hora de los recordatorios

## R28
CUANDO se ejecuta el job, el sistema DEBE evaluar solo las reglas de los usuarios cuya hora local en `now` (según `user_settings.timezone`) es mayor o igual que su `reminderHour`.

## R29
El sistema DEBE guardar en `user_settings` la columna `reminder_hour` (entero, por defecto 8), añadida por la migración de esta feature, y aplicar 8 a los usuarios sin fila de ajustes.

## R30
CUANDO el usuario hace `GET` o `PATCH /api/settings`, el sistema DEBE incluir `reminderHour` en la respuesta y persistir el valor enviado en `PATCH`.

## R31
SI `PATCH /api/settings` recibe un `reminderHour` que no es un entero entre 0 y 23 ENTONCES el sistema DEBE responder 400 `application/problem+json` sin modificar los ajustes.

## R32
La página de Ajustes DEBE mostrar un desplegable «Hora de los recordatorios» con las 24 horas (`00:00`–`23:00`) que guarda `reminderHour` al pulsar «Guardar».

## Datos relacionados

## R33
CUANDO se borra un vehículo, el sistema DEBE borrar sus notificaciones sin tocar las de otros vehículos.

## R34
CUANDO se ejecuta el job, el sistema DEBE cargar de cada vehículo evaluado solo las lecturas de odómetro de los últimos 91 días respecto a «hoy» más su última lectura (aunque sea anterior), obteniendo el mismo resultado de `computeScheduleDue` que con el historial completo.

## Trazabilidad del acceptance

| Acceptance (`feature_list.json`) | Requirements |
|---|---|
| Tabla notifications (user_id, tipo, título, cuerpo, enlace, dedupe_key único, read_at, created_at) con migración (cambio de Gate 1: `vehicle_id` en cascada) | R1, R2, R33 |
| reminders.job diario con croner al arrancar, desactivable por env validada con zod, invocable aparte (cambio de Gate 1: se ejecuta cada hora y avisa una vez al día a partir de la hora elegida por el usuario) | R3, R4, R5, R6, R28, R29, R30, R31, R32 |
| Una notificación por regla de vehículo activo que pasa a due_soon/overdue, con enlace a la ficha; dos ejecuciones el mismo día no duplican | R7, R8, R9, R10, R11, R12, R34 |
| GET paginado con contador, PATCH read, POST read-all; cada usuario solo lo suyo (404 al resto) | R13, R14, R15, R16, R17, R18, R19, R20 |
| Campana con no leídas y panel; pulsar marca leída y navega | R21, R22, R23, R24, R25, R26 |
| Textos en es.json y en.json | R27 |
| Tests del job y dedupe, de endpoints y autorización, y de componente de la campana | R2, R6–R12, R28, R33, R34 (job), R13–R20, R30, R31 (API), R21–R26, R32 (web) |
| `pnpm harness --full` en verde | todas |
