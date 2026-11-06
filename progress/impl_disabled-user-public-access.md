# Implementación — disabled-user-public-access (#45)

## Resumen de cambios

| Archivo | Cambio |
|---|---|
| `apps/api/src/db/filters.ts` (nuevo) | `activeUserFilter = isNull(user.disabledAt)` con JSDoc. |
| `apps/api/src/modules/admin-users/repository.ts` | `countActiveAdmins` usa `activeUserFilter` (se quita el import `isNull` sobrante). |
| `apps/api/src/modules/calendar/repository.ts` | `findBySelector`: `select(getTableColumns(calendarFeeds))` + `innerJoin(user)` + `and(selector, activeUserFilter)`. |
| `apps/api/src/modules/report-shares/repository.ts` | `findBySelector`: `innerJoin(user, eq(user.id, vehicles.ownerId))` + `activeUserFilter`. |
| `apps/api/src/modules/calendar/routes.ts` | `calendarFeedRoutes`: hook `onSend` con `cache-control: private, no-store`; se quita la cabecera del handler. |
| `apps/api/src/modules/report-shares/routes.ts` | `publicReportRoutes`: mismo hook `onSend`; se quita la cabecera del handler (se mantienen `x-robots-tag` y `nosniff`). |
| `apps/api/src/modules/schedules/repository.ts` | `listForActiveVehicles`: `innerJoin(user)` + `and(activeVehicleFilter, activeUserFilter)`. |
| `apps/api/src/modules/vehicles/repository.ts` | `listActiveForOdometerNudge`: `innerJoin(user)` + `activeUserFilter`. |
| `apps/api/src/modules/notification-channels/repository.ts` | `listEnabledByUsers`: `select(getTableColumns(notificationChannels))` + `innerJoin(user)` + `activeUserFilter`. |
| `apps/api/test/calendar.test.ts` | `describe('calendar feed of a disabled owner')` (4 tests). |
| `apps/api/test/report-shares.test.ts` | `describe('public sale report of a disabled owner')` (5 tests). |
| `apps/api/test/reminders.test.ts` | Helper `setDisabled` + 2 tests en `runReminders`. |
| `apps/api/test/odometer-nudge.test.ts` | Helper `setDisabled` + `describe('disabled users')` (2 tests). |
| `apps/api/test/notification-channels-dispatch.test.ts` | 1 test de dispatcher. |
| `docs/PLAN.md` | Línea de `user.disabled_at` del modelo de datos completada. |

Sin cambios de BD, shared ni web. Servicios, jobs y dispatcher intactos.

## Trazabilidad

| R | Test |
|---|---|
| R1 | `apps/api/test/calendar.test.ts › calendar feed of a disabled owner › returns the same 404 as an unknown token while the owner is disabled` |
| R2 | `apps/api/test/calendar.test.ts › calendar feed of a disabled owner › serves the feed again with the same token after reactivation` |
| R3 | `apps/api/test/report-shares.test.ts › public sale report of a disabled owner › returns the same 404 as an unknown token while the owner is disabled` |
| R4 | `apps/api/test/report-shares.test.ts › public sale report of a disabled owner › serves active links again with the same token after reactivation` |
| R5 | `apps/api/test/report-shares.test.ts › public sale report of a disabled owner › keeps expired and revoked links at 404 after reactivation` |
| R6 | `apps/api/test/calendar.test.ts › … › keeps the feed row when disabling and enabling the owner`; `apps/api/test/report-shares.test.ts › … › keeps the share rows when disabling and enabling the owner` |
| R7 | `apps/api/test/calendar.test.ts › … › sends no-store on feed 404s`; `apps/api/test/report-shares.test.ts › … › sends no-store on public report 404s` |
| R8 | `apps/api/test/reminders.test.ts › runReminders › skips disabled owners` |
| R9 | `apps/api/test/odometer-nudge.test.ts › runOdometerNudge › disabled users › skips disabled users` |
| R10 | `apps/api/test/reminders.test.ts › runReminders › notifies a reactivated owner on the next run` |
| R11 | `apps/api/test/odometer-nudge.test.ts › runOdometerNudge › disabled users › nudges a reactivated user on the next run` |
| R12 | `apps/api/test/notification-channels-dispatch.test.ts › sending notifications through channels › does not send to the channels of disabled users` |

Comprobación: con `apps/api/src` revertido temporalmente, 11 de los nuevos tests fallan (todos menos los de R5 y R6, que protegen frente a regresiones y ya se cumplían porque nada modificaba esas filas). Con el cambio aplicado pasan todos.

## `pnpm harness --full`

```
[OK]    47 features: 45 done, 1 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #45 disabled-user-public-access (in_progress)
[OK]    Rama actual: feat/disabled-user-public-access
[OK]    pnpm lint
[OK]    pnpm typecheck
e2e            Tests    1 passed
packages/shared Tests 119 passed (18 files)
apps/web       Tests  346 passed (50 files)
apps/api       Tests  335 passed (34 files)
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones del spec

Ninguna. Detalles menores dentro del diseño:
- En los tests de jobs (R8, R9) se añadió además un webhook por usuario para comprobar que `fetch` solo recibe al activo, como pide la sección «Tests» de `design.md`.
- El test de R7 del feed también prueba el 404 sin sufijo `.ics`, que se lanza antes de llegar al servicio.
- Sin UI: no hay capturas.
