# Review — #45 disabled-user-public-access

**Veredicto:** APPROVED

## Trazabilidad requirements ↔ tests
- R1: [x] `apps/api/test/calendar.test.ts:362` › `returns the same 404 as an unknown token while the owner is disabled` (200 antes; tras desactivar, mismo `statusCode`, `content-type` y `json()` que un selector aleatorio bien formado)
- R2: [x] `apps/api/test/calendar.test.ts:375` › `serves the feed again with the same token after reactivation` (404 desactivado → 200 `text/calendar; charset=utf-8` con `BEGIN:VCALENDAR` y la misma URL)
- R3: [x] `apps/api/test/report-shares.test.ts:539` › `returns the same 404 as an unknown token while the owner is disabled` (problem+json, cuerpo no empieza por `%PDF-`, idéntico a token inexistente, `detail: 'Report not found'`)
- R4: [x] `apps/api/test/report-shares.test.ts:556` › `serves active links again with the same token after reactivation` (dos enlaces, 404 → 200 `application/pdf` con `%PDF-`)
- R5: [x] `apps/api/test/report-shares.test.ts:572` › `keeps expired and revoked links at 404 after reactivation` (caducado con `expireShare` y revocado en BD durante la desactivación siguen en 404; el tercero da 200)
- R6: [x] `apps/api/test/calendar.test.ts:387` y `apps/api/test/report-shares.test.ts:591` (filas iguales con `toEqual` tras desactivar y tras reactivar; incluye enlaces caducados y revocados)
- R7: [x] `apps/api/test/calendar.test.ts:397` (200, selector desconocido, sin sufijo `.ics`, dueño desactivado) y `apps/api/test/report-shares.test.ts:607` (desconocido, malformado, dueño desactivado) → `private, no-store`
- R8: [x] `apps/api/test/reminders.test.ts:256` › `skips disabled owners` (`evaluated: 1, created: 1`, solo fila de Bob, `fetch` solo al webhook de Bob)
- R9: [x] `apps/api/test/odometer-nudge.test.ts:300` › `skips disabled users` (ídem para el aviso de odómetro)
- R10: [x] `apps/api/test/reminders.test.ts:288` › `notifies a reactivated owner on the next run` (0/0 desactivado; tras reactivar `evaluated: 2, created: 2` con tipos y títulos concretos)
- R11: [x] `apps/api/test/odometer-nudge.test.ts:320` › `nudges a reactivated user on the next run` (0 → 1 con `dedupeKey` `odometer_nudge:<id>:2026-W43`)
- R12: [x] `apps/api/test/notification-channels-dispatch.test.ts:192` › `does not send to the channels of disabled users` (`dispatch` directo con filas de ambos: `{sent: 1}`, solo URL de Bob, `last_error` de Ada sigue `HTTP 502`)

## Tasks
- T1..T17: [x]

## Checkpoints
- C1: [x] harness OK, una sola feature activa (#45 in_progress), rama `feat/disabled-user-public-access`.
- C2: [x] spec completo, EARS, tabla de acceptance cubierta, tasks `[x]`, cada R con test leído.
- C3: [x] el diff toca exactamente los archivos de `design.md` (+ `progress/`, `tasks.md`); sin refactors ajenos.
- C4: [x] filtros en repositorios; servicios sin cambios, reutilizan `NotFoundError` (AppError); sin cambios de BD/web/shared (no aplica migración ni i18n).
- C5: [x] sin `any`, `@ts-ignore`, `console.log` ni TODOs nuevos.
- C6: [x] `pnpm harness --full` en verde (api 335, web 346, shared 119, e2e 1); tests sobre SQLite en memoria sin mocks de BD; sin UI → sin capturas.
- C7: [x] `impl_*.md` con archivos, mapa R→test y salida; `current.md` al día; `PLAN.md` actualizado (línea de `user.disabled_at`).

## Hallazgos
Ninguno bloqueante. Puntos verificados expresamente:
- **404 idéntico y mismo camino de código:** el filtro va en la consulta de `findBySelector` (`calendar/repository.ts`, `report-shares/repository.ts`); con dueño desactivado la fila no sale y el servicio entra en la misma rama `!row` que un selector desconocido (`calendar/service.ts:37`, `report-shares/service.ts:83-90`), sin comparar el verificador ni consultas extra. Cuerpo y cabeceras salen del mismo `NotFoundError` y del mismo `onSend`.
- **cache-control acotado:** `calendarFeedRoutes` y `publicReportRoutes` se registran en `app.ts:212,219` como plugins encapsulados (sin `fastify-plugin`), así que el hook `onSend` solo afecta a sus rutas, no a `calendarFeedSettingsRoutes` ni a `reportSharesRoutes`. Cubre también los errores del error handler y el 404 sin `.ics`.
- **Usuarios activos no afectados:** los `innerJoin(user)` son sobre PK (`user.id`) y FK no nulas (`vehicles.ownerId`, `notificationChannels.userId`), no duplican filas ni alteran el `groupBy(vehicles.id)`; los tests R8/R9/R12 comprueban que el activo sigue recibiendo notificación y envío en la misma ejecución. Los únicos jobs (`jobs/registry.ts`: reminders, odometer-nudge) y el dispatcher (`dispatcher.ts:78`) consumen exactamente las tres consultas filtradas.

## Avisos para el humano (no bloquean)
- No hay un test que afirme que otras rutas (p. ej. `GET /api/calendar-feed` autenticada) **no** reciben `cache-control: private, no-store`; la encapsulación de Fastify lo garantiza hoy, pero si algún día se envuelven estos plugins con `fastify-plugin`, el hook se filtraría al prefijo `/api`.
- Como indica el propio `design.md`, cualquier acceso por token o job futuro tiene que acordarse de `activeUserFilter`.

## Cambios requeridos
Ninguno.
