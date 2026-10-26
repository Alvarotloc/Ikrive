# Tasks — admin-run-jobs

- [x] T1 — `JOB_NAMES`, `JobName` y `jobRunSummarySchema` en `packages/shared/src/schemas/admin.ts`, exportados desde `index.ts`. Cubre: R1, R2, R4.
- [x] T2 — `dispatch` devuelve `{ sent, failed }` en `apps/api/src/modules/notification-channels/dispatcher.ts`; `runReminders` y `runOdometerNudge` devuelven `failed`. Actualizar los `toEqual` de `reminders.test.ts`, `odometer-nudge.test.ts` y `notification-channels-dispatch.test.ts`. Cubre: R3.
- [x] T3 — Test `counts failed sends` en `apps/api/test/notification-channels-dispatch.test.ts` (dos canales, uno caído → `runReminders` devuelve `failed: 1`; sin canales → `failed: 0`). Cubre: R3.
- [x] T4 — `isJobName` y `runJob` en `apps/api/src/jobs/registry.ts`. Cubre: R1, R2, R4, R8.
- [x] T5 — Decorador `requireAdmin` en `apps/api/src/plugins/auth.ts`. Cubre: R5, R6.
- [x] T6 — `apps/api/src/modules/admin/routes.ts` con `POST /admin/jobs/:name/run` y registro en `apps/api/src/app.ts` compartiendo el `dispatcher`. Cubre: R1, R2, R4, R7.
- [x] T7 — Tests en `apps/api/test/admin-jobs.test.ts`: `runs the reminders job` (admin con regla vencida → 200, `{ job: 'reminders', created: 1, failed: 0 }` y fila en `notifications`) y `runs the odometer-nudge job` (vehículo sin lecturas desde hace >7 días, en su día y hora → `created: 1`). Sin falsear el reloj: los usuarios ponen `reminderHour: 0` y, para el aviso de km, `odometerReminderWeekday = weekdayOf(todayIn(timezone, new Date()))`. Cubre: R1, R2.
- [x] T8 — Test `reports failed sends` en `apps/api/test/admin-jobs.test.ts` (`createTestApp` con `fetch` que falla para un webhook → `failed: 1`). Cubre: R3.
- [x] T9 — Tests de errores en `apps/api/test/admin-jobs.test.ts`: `returns 404 for an unknown job` (admin, `/api/admin/jobs/foo/run` → 404 problem+json), `returns 401 without a session` y `returns 403 for a regular user` (segunda cuenta → 403 y ninguna notificación creada). Cubre: R4, R5, R6.
- [x] T10 — Test `runs even when the scheduler is disabled` en `apps/api/test/admin-jobs.test.ts` (`createTestApp({ REMINDERS_ENABLED: 'false' })` → 200 y `created: 1`). Cubre: R7.
- [x] T11 — `runJobCli` en `apps/api/src/jobs/cli.ts`, entrada `apps/api/src/job.ts`, script `job` en `apps/api/package.json` y entrada `src/job.ts` en `apps/api/tsup.config.ts`. Cubre: R8, R9, R10.
- [x] T12 — Tests en `apps/api/test/job-cli.test.ts`: `runs a job against DATA_DIR` (BD en un `DATA_DIR` temporal con un admin y una regla vencida creados vía `buildApp`; `runJobCli(['reminders'], { env, now, … })` → 0, stdout con el resumen JSON y la fila en BD) y `rejects an unknown or missing job` (`['foo']` y `[]` → 1, stderr con `reminders` y `odometer-nudge`, sin crear `ikrive.db`). Cubre: R8, R9.
- [x] T13 — Sección «Lanzar los jobs a mano» en `README.md` y fila de `REMINDERS_ENABLED` actualizada. Cubre: R11.
- [x] T14 — Verificación Docker: `docker build -f docker/Dockerfile -t ikrive:dev .`, `docker run` con un volumen temporal y `docker exec <c> node dist/job.js reminders` → JSON con código 0, y `… foo` → código 1; salida en `progress/impl_admin-run-jobs.md`. Cubre: R10.
- [x] T15 — Ejecutar `pnpm harness --full` y documentar trazabilidad en `progress/impl_admin-run-jobs.md`. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11.
