# Tasks — odometer-nudge

- [x] T1 — `odometer_nudge` en `NOTIFICATION_TYPES` (`packages/shared/src/enums.ts`) y `odometerReminderWeekday` `.nullable()` en `packages/shared/src/schemas/settings.ts`. Cubre: R5, R10.
- [x] T2 — Columna `odometerReminderWeekday` nullable en `apps/api/src/db/schema/settings.ts` + `drizzle-kit generate --name odometer_reminder_optional`; revisar que el SQL conserva las filas y `reminder_hour`. Cubre: R5, R8.
- [x] T3 — Tests en `apps/api/test/settings.test.ts`: `accepts a null odometer reminder weekday` (PATCH `null` → 200 y GET devuelve `null`; usuario nuevo → `0`) y `rejects an invalid odometer reminder weekday` (`7` y `1.5` → 400). Cubre: R5.
- [x] T4 — `weekdayOf` e `isoWeekOf` en `apps/api/src/lib/dates.ts`. Cubre: R7, R15.
- [x] T5 — `listActiveForOdometerNudge()` en `apps/api/src/modules/vehicles/repository.ts`. Cubre: R8, R12, R13.
- [x] T6 — `apps/api/src/jobs/odometer-nudge.job.ts` con `runOdometerNudge`, `odometerNudgeDedupeKey` y `startOdometerNudgeJob`, y su programación en `apps/api/src/server.ts` (con `stop()` al apagar). Cubre: R1, R2, R3, R4, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16.
- [x] T7 — `TEXTS.*.types.odometer_nudge` en `apps/api/src/modules/notification-channels/messages.ts` y test `formats an odometer nudge` en `messages.test.ts` (título «Registra los km: Golf, Clio», enlace absoluto a `/odometer`). Cubre: R17.
- [x] T8 — Tests de planificación en `apps/api/test/odometer-nudge.test.ts`: `schedules the job hourly when enabled` (patrón `0 * * * *`, `trigger()` llama a `run`), `does not schedule the job when disabled` y `logs a failing run instead of crashing`. Cubre: R1, R2, R3, R4.
- [x] T9 — Tests en `apps/api/test/odometer-nudge.test.ts` › `runOdometerNudge`: `notifies stale active vehicles in one notification` (dos vehículos pendientes → una fila `odometer_nudge`, `link: '/odometer'`, `vehicleId: null`, título con ambos nombres) y `creates nothing without stale vehicles`. Cubre: R1, R10, R14.
- [x] T10 — Tests de día y zona horaria en `apps/api/test/odometer-nudge.test.ts`: `only notifies on the user's weekday`, `uses the user's time zone for the weekday` (un `now` que es jueves en UTC y viernes en `Pacific/Auckland`), `skips users without a reminder weekday` (`null` y sin fila de ajustes) y `waits for the reminder hour`. Cubre: R7, R8, R9.
- [x] T11 — Tests de umbral y exclusiones en `apps/api/test/odometer-nudge.test.ts`: `uses a 7-day threshold` (lectura de hace 7 días entra, de hace 6 no), `counts vehicles without readings from their creation date` y `skips archived and sold vehicles`. Cubre: R11, R12, R13.
- [x] T12 — Tests de deduplicación y canales en `apps/api/test/odometer-nudge.test.ts`: `does not duplicate the notification in the same week` (dos ejecuciones, y cambio de día a otro de la misma semana ISO → una fila), `notifies again the next week`, `sends new notifications through the owner's channels` y `does not resend deduplicated notifications` (con `createTestDispatcher` y `fetch` simulado). Cubre: R15, R16.
- [x] T13 — Opción «No avisar» en el selector de `apps/web/src/routes/_app/settings.tsx` (`setValueAs`) y claves `settings.odometerReminderOff` y `notifications.types.odometer_nudge` en `es.json` y `en.json`. Cubre: R6, R17.
- [x] T14 — Test `saves no odometer reminder day` en `apps/web/src/features/settings/settings-page.test.tsx` (elegir «No avisar» → el PATCH lleva `odometerReminderWeekday: null`). Cubre: R6.
- [x] T15 — Test `shows the odometer nudge label` en `apps/web/src/features/notifications/notification-bell.test.tsx` (etiqueta «Registra los km» y navegación a `/odometer` al pulsar). Cubre: R17.
- [x] T16 — Ejecutar `pnpm harness --full` y documentar trazabilidad en `progress/impl_odometer-nudge.md`. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17.

## Cambios pedidos en Gate 2

- [x] T17 — Componente reutilizable `InfoPopover` (botón de icono `Info` de lucide, `aria-label` traducido, sobre `Popover` de `apps/web/src/components/ui/popover.tsx`) y su uso junto a las etiquetas de `reminderHour` y `odometerReminderWeekday` en `apps/web/src/routes/_app/settings.tsx`; claves de texto en `es.json` y `en.json`. Cubre: R18, R19.
- [x] T18 — Tests en `apps/web/src/features/settings/settings-page.test.tsx`: `explains the reminder hour` y `explains the odometer reminder day` (pulsar el botón por su nombre accesible → se ve el texto explicativo). Cubre: R18, R19.
- [x] T19 — Ejecutar `pnpm harness --full` y añadir R18–R19 a la trazabilidad de `progress/impl_odometer-nudge.md`. Cubre: R18, R19.
