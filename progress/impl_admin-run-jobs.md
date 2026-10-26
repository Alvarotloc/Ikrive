# Implementación — admin-run-jobs

Feature #18, rama `feat/admin-run-jobs`. Todas las tasks T1–T15 marcadas. Sin cambios de BD ni de web.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `packages/shared/src/schemas/admin.ts` (nuevo) | `JOB_NAMES`, `JobName`, `jobRunSummarySchema` / `JobRunSummary`. |
| `packages/shared/src/index.ts` | Exporta `schemas/admin`. |
| `apps/api/src/modules/notification-channels/dispatcher.ts` | `dispatch` devuelve `DispatchResult { sent, failed }`; `deliver` cuenta los mensajes fallidos (canal × notificación) además de guardar `lastError`. `sendTest` sigue devolviendo `{ ok, error }`. Sigue sin rechazar por un envío. |
| `apps/api/src/jobs/reminders.job.ts`, `odometer-nudge.job.ts` | Devuelven `{ evaluated, created, failed }` (`failed: 0` sin filas). |
| `apps/api/src/jobs/registry.ts` (nuevo) | `isJobName` y `runJob(name, { db, dispatcher, now? })` → `{ job, evaluated, created, failed }`. Único mapa nombre → función. |
| `apps/api/src/plugins/auth.ts` | Decorador `requireAdmin`: `authenticate` (401) + `ForbiddenError` si `role !== 'admin'` (403). |
| `apps/api/src/modules/admin/routes.ts` (nuevo) | `POST /admin/jobs/:name/run` con `preHandler` `requireAdmin` (hook del plugin, antes del 404), `params: { name: z.string() }`, respuesta `jobRunSummarySchema`; `NotFoundError('Unknown job: <name>')`; `request.log.info(summary)`. |
| `apps/api/src/app.ts` | Un único `dispatcher`, compartido por `notificationChannelsService` y `adminRoutes`. |
| `apps/api/src/jobs/cli.ts` (nuevo) | `runJobCli(args, { env, stdout, stderr, now?, fetch? })` según el design (uso → 1 sin abrir la BD; `loadConfig`, `createDb`, `runMigrations`, `runJob`, JSON + `\n`, cierra la BD en `finally`, 0). |
| `apps/api/src/job.ts` (nuevo) | Punto de entrada: `process.exitCode = await runJobCli(process.argv.slice(2), …)`. |
| `apps/api/tsup.config.ts` | `entry: ['src/server.ts', 'src/job.ts']` (genera `dist/job.js` + un chunk común en `dist/`). |
| `apps/api/package.json` | Script `job`. |
| `README.md` | Sección «Lanzar los jobs a mano» (Docker, curl con cookie de admin, códigos 401/403/404), comando de desarrollo y fila de `REMINDERS_ENABLED` actualizada. |
| `apps/api/test/admin-jobs.test.ts` (nuevo) | Tests T7–T10. |
| `apps/api/test/job-cli.test.ts` (nuevo) | Tests T12. |
| `apps/api/test/notification-channels-dispatch.test.ts` | `toEqual` con `failed`; el caso de canal caído pasa a `failed: 1`; tests T3 nuevos. |
| `apps/api/test/reminders.test.ts`, `odometer-nudge.test.ts` | `toEqual` con `failed: 0`. |

## Trazabilidad

| R | Test |
|---|---|
| R1 | `apps/api/test/admin-jobs.test.ts › runs the reminders job` |
| R2 | `apps/api/test/admin-jobs.test.ts › runs the odometer-nudge job` |
| R3 | `apps/api/test/admin-jobs.test.ts › reports failed sends`; `apps/api/test/notification-channels-dispatch.test.ts › counts failed sends`, `› counts no failed sends without channels`, `› a failing channel stores last_error and does not stop the rest` |
| R4 | `apps/api/test/admin-jobs.test.ts › returns 404 for an unknown job` |
| R5 | `apps/api/test/admin-jobs.test.ts › returns 401 without a session` (también con `:name` desconocido; sin filas en `notifications`) |
| R6 | `apps/api/test/admin-jobs.test.ts › returns 403 for a regular user` (ambos jobs y `foo`; sin filas en `notifications`) |
| R7 | `apps/api/test/admin-jobs.test.ts › runs even when the scheduler is disabled` |
| R8 | `apps/api/test/job-cli.test.ts › runs a job against DATA_DIR` |
| R9 | `apps/api/test/job-cli.test.ts › rejects an unknown or missing job` |
| R10 | Verificación Docker (abajo) + entrada `src/job.ts` en `tsup.config.ts` |
| R11 | `README.md` › «Lanzar los jobs a mano» y bloque de Desarrollo |

## Verificación Docker (T14)

`docker build -f docker/Dockerfile -t ikrive:dev .` → OK. Contenedor con volumen temporal `ikrive-t14`, admin creado por HTTP con `timezone: UTC`, `reminderHour: 0` y una regla vencida:

```
GET /api/health → {"status":"ok","version":"0.0.0"}
$ docker exec ikrive-t14 node dist/job.js reminders
{"job":"reminders","evaluated":1,"created":1,"failed":0}
exit=0
$ docker exec ikrive-t14 node dist/job.js reminders   (otra vez: deduplicado)
{"job":"reminders","evaluated":1,"created":0,"failed":0}
exit=0
$ docker exec ikrive-t14 node dist/job.js odometer-nudge
{"job":"odometer-nudge","evaluated":0,"created":0,"failed":0}
exit=0
$ docker exec ikrive-t14 node dist/job.js foo
Usage: job <reminders|odometer-nudge>
exit=1
$ docker exec ikrive-t14 node dist/job.js
Usage: job <reminders|odometer-nudge>
exit=1
HTTP (admin)  POST /api/admin/jobs/odometer-nudge/run → 200 {"job":"odometer-nudge","evaluated":0,"created":0,"failed":0}
HTTP (anón.)  POST /api/admin/jobs/reminders/run      → 401 problem+json
HTTP (admin)  POST /api/admin/jobs/foo/run            → 404 {"detail":"Unknown job: foo"}
```

Contenedor y volumen eliminados después. También probado en local: `pnpm --filter @ikrive/api job reminders` → JSON, 0; `… job foo` → uso, 1; `node dist/job.js odometer-nudge` tras `pnpm --filter @ikrive/api build` → JSON, 0.

## `pnpm harness --full`

```
[OK]    21 features: 19 done, 1 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #18 admin-run-jobs (in_progress)
[OK]    Rama actual: feat/admin-run-jobs
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test      (shared OK; api 19 files / 153 tests; web 23 files / 175 tests)
[OK]    Arnés en verde.
```

## Desviaciones del spec

- T3: el caso «sin canales → `failed: 0`» va en un test aparte (`counts no failed sends without channels`) en vez de dentro de `counts failed sends`, para que cada test tenga un único escenario. Cubre lo mismo.
- Ninguna otra. Sin UI, así que no hay capturas.
