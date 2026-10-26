# Requirements — admin-run-jobs

> Feature 18 (fase 4). Un admin lanza `reminders` (#15) y `odometer-nudge` (#17) a mano, por HTTP o desde la línea de comandos (también dentro de la imagen Docker), sin esperar al planificador. Reutiliza `runReminders`, `runOdometerNudge`, `NotificationDispatcher` (#16) y el `role` de Better Auth (primera cuenta = `admin`).
> «Job conocido» = `reminders` u `odometer-nudge`. «Resumen» = `{ job, evaluated, created, failed }`: nombre del job, entradas evaluadas, notificaciones in-app creadas (las deduplicadas no cuentan) y envíos por canal que fallaron en esa ejecución. Ejecutar a mano aplica las mismas reglas que el planificador (día, hora del usuario y deduplicación).

## Endpoint

## R1
CUANDO un admin hace `POST /api/admin/jobs/reminders/run`, el sistema DEBE ejecutar `runReminders` con la hora actual y responder 200 con el resumen.

## R2
CUANDO un admin hace `POST /api/admin/jobs/odometer-nudge/run`, el sistema DEBE ejecutar `runOdometerNudge` con la hora actual y responder 200 con el resumen.

## R3
CUANDO una ejecución envía notificaciones por canales, el sistema DEBE contar en `failed` del resumen cada mensaje cuyo envío por un canal falló.

## R4
SI `:name` no es un job conocido ENTONCES el sistema DEBE responder 404 `application/problem+json` sin ejecutar ningún job.

## R5
SI la petición no tiene sesión ENTONCES el sistema DEBE responder 401 `application/problem+json` sin ejecutar ningún job.

## R6
SI el usuario de la sesión no tiene `role` `admin` ENTONCES el sistema DEBE responder 403 `application/problem+json` sin ejecutar ningún job.

## R7
MIENTRAS `REMINDERS_ENABLED` es `false`, el sistema DEBE seguir ejecutando el job pedido por el endpoint.

## Script

## R8
CUANDO se ejecuta el script `job <name>` con un job conocido, el sistema DEBE ejecutarlo contra la base de datos de `DATA_DIR`, escribir el resumen en JSON por la salida estándar y terminar con código 0.

## R9
SI el script recibe un nombre desconocido o ninguno ENTONCES el sistema DEBE escribir por la salida de error los jobs válidos y terminar con código 1 sin ejecutar ningún job.

## R10
El sistema DEBE incluir el script compilado en la imagen Docker, ejecutable con `docker compose exec ikrive node dist/job.js <name>`.

## R11
El sistema DEBE documentar en `README.md` el endpoint y el script (en desarrollo y en Docker).

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| POST /api/admin/jobs/:name/run (name: reminders \| odometer-nudge) ejecuta el job y devuelve un resumen (notificaciones creadas y envíos fallidos); 404 para un job desconocido | R1, R2, R3, R4, R7 |
| Solo los usuarios con role admin pueden usarlo: 401 sin sesión y 403 para un usuario normal | R5, R6 |
| Un script (p. ej. pnpm --filter api job <name>) ejecuta el mismo job desde la línea de comandos, también dentro de la imagen Docker, y está documentado | R8, R9, R10, R11 |
| Tests de integración cubren la ejecución y la autorización | R1–R9 (tests en `tasks.md`) |
| pnpm harness --full pasa en verde | última task de `tasks.md` |
