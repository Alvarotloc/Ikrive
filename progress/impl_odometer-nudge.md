# Implementación — odometer-nudge (#17)

Rama `feat/odometer-nudge`. Tasks T1–T16 marcadas en `specs/odometer-nudge/tasks.md`. Sin commits (los hace el leader).

## Cambios por archivo

### packages/shared
- `src/enums.ts`: `NOTIFICATION_TYPES` añade `'odometer_nudge'`.
- `src/schemas/settings.ts`: `odometerReminderWeekday` pasa a `.nullable()`; `DEFAULT_USER_SETTINGS.odometerReminderWeekday` sigue en `0`.

### apps/api
- `src/db/schema/settings.ts`: `odometerReminderWeekday: integer().default(0)` (sin `notNull`). El default se escribe literal (como dice `design.md`), porque `DEFAULT_USER_SETTINGS.odometerReminderWeekday` ahora es `number | null` y `.default()` no acepta `null` en el tipo. Un comentario explica el porqué.
- `src/db/migrations/0007_odometer_reminder_optional.sql` + `meta/0007_snapshot.json` + `meta/_journal.json`: generados con `drizzle-kit generate --name odometer_reminder_optional`. Recrean `user_settings` y copian las 8 columnas (incluida `reminder_hour`) con `INSERT … SELECT`. Después, `drizzle-kit generate` no detecta más cambios pendientes.
- `src/lib/dates.ts`: `weekdayOf(date)` (0 = domingo) e `isoWeekOf(date)` (`YYYY-Www`; el jueves de la semana decide el año ISO).
- `src/modules/vehicles/repository.ts`: `listActiveForOdometerNudge()`. Es una sola consulta: vehículos activos (`activeVehicleFilter`) con `inner join user_settings` donde `odometer_reminder_weekday IS NOT NULL`, más `left join odometer_readings` con `max(date)` y `group by vehicles.id`, ordenada por `created_at` asc.
- `src/jobs/odometer-nudge.job.ts` (nuevo): `ODOMETER_NUDGE_CRON`, `ODOMETER_NUDGE_DAYS`, `odometerNudgeDedupeKey`, `runOdometerNudge` y `startOdometerNudgeJob`. Sigue el mismo patrón que `reminders.job.ts`: `protect: true`, `catch → logger.error`, las notificaciones in-app se guardan antes de `dispatcher.dispatch(created)`, y `evaluated` solo cuenta los usuarios a los que les toca ese día y a esa hora.
- `src/server.ts`: programa el job con el mismo `dispatcher` y `config.REMINDERS_ENABLED`, y llama a `odometerNudgeJob?.stop()` al apagar.
- `src/modules/notification-channels/messages.ts`: `odometer_nudge` = «Registra los km» / «Log your mileage».
- Tests: `test/odometer-nudge.test.ts` (nuevo), `test/settings.test.ts` (2 tests), `src/modules/notification-channels/messages.test.ts` (1 test).

### apps/web
- `src/routes/_app/settings.tsx`: el selector de día tiene como primera opción «No avisar» (`value=""`). `setValueAs` convierte `''`/`null` en `null` y el resto en `Number(v)`; sustituye a `valueAsNumber`.
- `src/i18n/locales/{es,en}.json`: `settings.odometerReminderOff` y `notifications.types.odometer_nudge`.
- Tests: `src/features/settings/settings-page.test.tsx` (2 tests) y `src/features/notifications/notification-bell.test.tsx` (1 test; añade la ruta `/odometer` al router mínimo del test).

### Cambios de Gate 2 (T17–T19)
- `apps/web/src/components/info-popover.tsx` (nuevo): `InfoPopover`, un botón fantasma con el icono `Info` de lucide y `aria-label` traducido. Abre el `Popover` de `components/ui/popover.tsx` al pulsar o tocar, así que funciona en móvil. El contenido lleva el mismo `aria-label`.
- `apps/web/src/components/form-field.tsx`: prop opcional `labelAction` que se pinta junto a la etiqueta. Si no se pasa, el HTML es el de antes.
- `apps/web/src/routes/_app/settings.tsx`: `InfoPopover` junto a «Día del recordatorio de kilometraje» y «Hora de los recordatorios». Las opciones siguen siendo `HH:00`.
- `apps/web/src/i18n/locales/{es,en}.json`: `settings.reminderHourInfoLabel`, `settings.reminderHourInfo`, `settings.odometerReminderWeekdayInfoLabel` y `settings.odometerReminderWeekdayInfo`.
- Tests: `settings-page.test.tsx`, con `explains the reminder hour` y `explains the odometer reminder day`.

## Trazabilidad

Todos los tests del job están en `apps/api/test/odometer-nudge.test.ts`, salvo los que indican otro archivo.

| R | Test |
|---|---|
| R1 | `runOdometerNudge` › `notifies stale active vehicles in one notification`, `creates nothing without stale vehicles` (se llama sin planificador y devuelve `{ evaluated, created }`) |
| R2 | `odometer nudge job scheduling` › `schedules the job hourly when enabled` |
| R3 | `odometer nudge job scheduling` › `does not schedule the job when disabled` |
| R4 | `odometer nudge job scheduling` › `logs a failing run instead of crashing` |
| R5 | `apps/api/test/settings.test.ts` › `accepts a null odometer reminder weekday`, `rejects an invalid odometer reminder weekday` |
| R6 | `apps/web/src/features/settings/settings-page.test.tsx` › `saves no odometer reminder day` (+ `saves an odometer reminder day as a number`, que comprueba que un día no se envía como `NaN`) |
| R7 | `weekday and time zone` › `only notifies on the user's weekday`, `uses the user's time zone for the weekday`; `weekdayOf and isoWeekOf` › `returns the weekday of a date (0 = Sunday)` |
| R8 | `weekday and time zone` › `skips users without a reminder weekday` (`null` y sin fila de ajustes; también comprueba que `listActiveForOdometerNudge()` devuelve `[]`) |
| R9 | `weekday and time zone` › `waits for the reminder hour` |
| R10 | `runOdometerNudge` › `notifies stale active vehicles in one notification` (alias y «marca modelo») |
| R11 | `threshold and exclusions` › `uses a 7-day threshold` |
| R12 | `threshold and exclusions` › `counts vehicles without readings from their creation date` (fecha local de alta en Madrid frente a UTC) |
| R13 | `threshold and exclusions` › `skips archived and sold vehicles` |
| R14 | `runOdometerNudge` › `creates nothing without stale vehicles` |
| R15 | `deduplication and channels` › `does not duplicate the notification in the same week`, `notifies again the next week`; `weekdayOf and isoWeekOf` › `returns the ISO week of a date` |
| R16 | `deduplication and channels` › `sends new notifications through the owner's channels`, `does not resend deduplicated notifications` |
| R17 | `apps/api/src/modules/notification-channels/messages.test.ts` › `formats an odometer nudge`; `apps/web/src/features/notifications/notification-bell.test.tsx` › `shows the odometer nudge label` |
| R18 | `apps/web/src/features/settings/settings-page.test.tsx` › `explains the reminder hour` (las opciones `HH:00` siguen cubiertas por `saves the reminder hour`) |
| R19 | `apps/web/src/features/settings/settings-page.test.tsx` › `explains the odometer reminder day` |

## `pnpm harness --full`

Última ejecución, tras T17–T19:

```
[OK]    21 features: 18 done, 2 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #17 odometer-nudge (in_progress)
[OK]    Rama actual: feat/odometer-nudge
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared test:       Tests  35 passed (35)
apps/api test:       Tests  142 passed (142)
apps/web test:       Tests  175 passed (175)
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Revisión visual

- **Entorno aislado.** Compilé la SPA en el scratchpad y la serví con la API en `127.0.0.1:3419`. `DATA_DIR` también estaba en el scratchpad y `REMINDERS_ENABLED=false`. No toqué la BD ni el `pnpm dev` del humano, y la API ya está parada.
- **Datos.** Cuenta `demo@ikrive.test` con un Golf (alias) y un Renault Clio (sin alias). La notificación la creó el `runOdometerNudge` real, lanzado desde un script en el scratchpad tras mover la fecha de alta de los vehículos. Después dejé el día en `null`.
- **Herramienta.** playwright-core contra `/usr/bin/google-chrome`, con `es-ES` y `Europe/Madrid`. El desbordamiento horizontal fue de 0 px en las cuatro variantes. El selector muestra «No avisar» (valor `""`) cuando el ajuste es `null`. La campana muestra «REGISTRA LOS KM» con «Golf, Renault Clio».
- **Capturas** (efímeras, en el scratchpad):
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/015c5f71-0ce6-4676-a67f-b32bbe1ec295/scratchpad/shots/desktop-light-settings.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/015c5f71-0ce6-4676-a67f-b32bbe1ec295/scratchpad/shots/desktop-dark-settings.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/015c5f71-0ce6-4676-a67f-b32bbe1ec295/scratchpad/shots/mobile-light-settings.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/015c5f71-0ce6-4676-a67f-b32bbe1ec295/scratchpad/shots/mobile-dark-settings.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/015c5f71-0ce6-4676-a67f-b32bbe1ec295/scratchpad/shots/desktop-light-bell.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/015c5f71-0ce6-4676-a67f-b32bbe1ec295/scratchpad/shots/desktop-dark-bell.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/015c5f71-0ce6-4676-a67f-b32bbe1ec295/scratchpad/shots/mobile-light-bell.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/015c5f71-0ce6-4676-a67f-b32bbe1ec295/scratchpad/shots/mobile-dark-bell.png`

- **Gate 2 (popovers).** Volví a compilar la SPA en el scratchpad y la serví en el mismo entorno aislado, que ya está parado. Abrí cada popover con clic en escritorio y con `tap()` en móvil (375 px, `hasTouch`). Radix lo mantiene dentro de la pantalla: en móvil queda en x=43 con 320 px de ancho.
  - Capturas:
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/015c5f71-0ce6-4676-a67f-b32bbe1ec295/scratchpad/shots/desktop-light-info-hour.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/015c5f71-0ce6-4676-a67f-b32bbe1ec295/scratchpad/shots/desktop-light-info-weekday.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/015c5f71-0ce6-4676-a67f-b32bbe1ec295/scratchpad/shots/desktop-dark-info-hour.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/015c5f71-0ce6-4676-a67f-b32bbe1ec295/scratchpad/shots/desktop-dark-info-weekday.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/015c5f71-0ce6-4676-a67f-b32bbe1ec295/scratchpad/shots/mobile-light-info-hour.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/015c5f71-0ce6-4676-a67f-b32bbe1ec295/scratchpad/shots/mobile-light-info-weekday.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/015c5f71-0ce6-4676-a67f-b32bbe1ec295/scratchpad/shots/mobile-dark-info-hour.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/015c5f71-0ce6-4676-a67f-b32bbe1ec295/scratchpad/shots/mobile-dark-info-weekday.png`

## Desviaciones del spec

Ninguna funcional. Algunos detalles menores:

- **Tests sin task propia.** T4 (`weekdayOf`/`isoWeekOf`) no tenía test asignado. Sus tests están en `odometer-nudge.test.ts`, que es un archivo que ya aparece en el diseño, igual que el test de `hourIn` vive en `reminders.test.ts`.
- **Tests extra.** Hay más tests que los que pedía el spec:
  - `saves an odometer reminder day as a number`, que comprueba que el cambio a `setValueAs` no envía `NaN`.
  - Un caso de recuperación más tarde el mismo día en `waits for the reminder hour`.
- **Espera en los tests de Ajustes.** Los dos tests nuevos esperan a la petición con `waitFor` en vez de esperar al toast «Ajustes guardados»: el toast del test anterior sigue montado y `findByText` encontraba varios.
- **`FormField.labelAction` (Gate 2).** T17 pide el botón «junto a la etiqueta», pero `FormField` solo aceptaba un `label` de texto. Le añadí una prop opcional en lugar de duplicar el marcado del campo en Ajustes. Los demás usos no cambian.
