# Review — #15 in-app-notifications

**Veredicto:** APPROVED

Revisado: `git diff main...HEAD` (spec, `feature_list.json`, `docs/PLAN.md`), `git diff` del árbol de trabajo y todos los archivos sin trackear. `pnpm harness --full` ejecutado por el reviewer: verde (shared 29, api 91, web 152). `drizzle-kit check`: «Everything's fine».

## Trazabilidad requirements ↔ tests

- R1: [x] `apps/api/test/reminders.test.ts:149` › `notifies due soon and overdue schedules`: afirma la fila completa (`id`, `userId`, `vehicleId`, `type`, `title`, `body`, `link`, `dedupeKey`, `readAt`, `createdAt`). La migración `0005_notifications.sql` (generada, FKs en cascada, 3 índices) se aplica en todos los tests.
- R2: [x] `reminders.test.ts:310` › `ignores a duplicated dedupe key on insert` (segunda inserción devuelve `[]`, lote mixto inserta solo la nueva, la tabla tiene 2 filas); `:255` (segunda ejecución `created: 0`, filas idénticas).
- R3: [x] `reminders.test.ts:98` › `validates REMINDERS_ENABLED` (por defecto true, `false`/`0`/`1`, `yes` lanza mencionando la variable).
- R4: [x] `reminders.test.ts:106` › `schedules the job hourly when enabled` (`getPattern()` = `0 * * * *`, `isRunning`, `trigger()` llama a `run` una vez). `server.ts` lo arranca con `config.REMINDERS_ENABLED`.
- R5: [x] `reminders.test.ts:141` › `does not schedule the job when disabled` (devuelve `null`, `run` no se llama).
- R6: [x] `reminders.test.ts › runReminders › *`: llamadas directas a `runReminders({ db, now })` comprobando `{ evaluated, created }` exactos.
- R7: [x] `reminders.test.ts:149` y `:236` › `uses the owner's time zone for today` (mismo `now`, Madrid ya vencido y Nueva York no).
- R8: [x] `reminders.test.ts:149`: tipo, título, cuerpo (nombre, o marca + modelo si no tiene), enlace `/vehicles/<id>`, `vehicleId` y `userId` del dueño.
- R9: [x] `reminders.test.ts:196` › `skips ok schedules` (por meses y por km; `created: 0`, tabla vacía).
- R10: [x] `reminders.test.ts:215` › `skips archived and sold vehicles` (`evaluated: 0`, tabla vacía).
- R11: [x] `reminders.test.ts:149` (formato exacto de `dedupeKey`, con odómetro y sin él) y `:255` (sin duplicados ese día ni días después).
- R12: [x] `reminders.test.ts:271` (`due_soon` → `overdue`) y `:285` (cambio de `lastDoneDate` y solo de `lastDoneOdometer`), afirmando las claves.
- R13: [x] `apps/api/test/notifications.test.ts:41` (orden, `total`, `unreadCount`, DTO exacto sin `userId`/`dedupeKey`) y `:69` (por defecto 20, `limit=2&offset=3` → elementos concretos); shared `notifications.test.ts` (valores por defecto y coerción).
- R14: [x] `notifications.test.ts:86` (`limit=0|101|abc`, `offset=-1` → 400 problem+json); shared › `rejects a limit outside 1-100…`.
- R15: [x] `notifications.test.ts:96` (200, `readAt` fijado y conservado al repetir, `unreadCount` 0).
- R16: [x] `notifications.test.ts:112` (204 sin cuerpo, `unreadCount` 0, conserva el `readAt` anterior).
- R17: [x] `notifications.test.ts:167` (solo la propia en `items`, `total` y `unreadCount`).
- R18: [x] `notifications.test.ts:180` (ajena e inexistente → 404 problem+json; la de Bob sigue con `readAt` null en BD).
- R19: [x] `notifications.test.ts:195` (Bob sigue con 1 sin leer).
- R20: [x] `notifications.test.ts:207` (401 en los tres endpoints, sin modificar la fila).
- R21: [x] `apps/web/src/features/notifications/notification-bell.test.tsx:83` (nombre accesible «Notificaciones, 12 sin leer» y «9+») y `:91` (contador «1», sin contador con 0).
- R22: [x] `notification-bell.test.tsx:100` (diálogo «Notificaciones», etiqueta del tipo, título, cuerpo, fecha y no leída en negrita).
- R23: [x] `notification-bell.test.tsx:118` (texto de vacío, sin «Marcar todas»).
- R24: [x] `notification-bell.test.tsx:126` (500 → `role="alert"` con el texto; la campana sigue presente).
- R25: [x] `notification-bell.test.tsx:136` (un PATCH, ruta `/vehicles/v1`, panel cerrado; una ya leída navega sin PATCH).
- R26: [x] `notification-bell.test.tsx:157` (un POST, la campana pasa a 0 sin contador).
- R27: [x] `apps/web/src/i18n/locales.test.ts` (mismas claves en es/en). Los tests web afirman los textos en español y he revisado a mano los de `en.json`.
- R28: [x] `reminders.test.ts:331` (`hourIn` Madrid 12, Nueva York 6, zona inválida → UTC), `:338` (solo el usuario en hora; `evaluated: 1`), `:355` (7:59 → nada, 8:00 → aviso) y `:366` (se recupera más tarde el mismo día).
- R29: [x] `apps/api/test/settings.test.ts:35` (8 por defecto) y `reminders.test.ts:355` (sin fila de ajustes → 8). La migración incluye `ALTER TABLE … reminder_hour integer DEFAULT 8 NOT NULL`.
- R30: [x] `settings.test.ts:35` (PATCH 20 → 200 con el cuerpo completo, persistido en GET).
- R31: [x] `settings.test.ts:55` (`-1`, `24`, `7.5`, `'8'` → 400 problem+json; el valor sigue en 8).
- R32: [x] `apps/web/src/features/settings/settings-page.test.tsx:208` (24 opciones `00:00`–`23:00`, `08:00` seleccionada, descripción accesible, PATCH con `reminderHour: 20`).
- R33: [x] `notifications.test.ts:129` (al borrar el vehículo desaparecen sus avisos de la API y de la tabla, y los del otro vehículo siguen).
- R34: [x] `reminders.test.ts:379` (las lecturas antiguas no se cargan, la última anterior a la ventana se incluye con sus 2 valores y `computeScheduleDue` da lo mismo que con el historial completo; cubre `ok`/`due_soon`/`overdue`).

## Tasks

- T1–T31: [x] (todas marcadas; el diff de `tasks.md` solo cambia `[ ]` → `[x]`).

## Checkpoints

- C1: [x] `pnpm harness` OK · [x] una sola feature activa (#15 `in_progress`) · [x] rama `feat/in-app-notifications`.
- C2: [x] los tres archivos del spec · [x] EARS con tabla `acceptance → R<n>` completa · [x] tasks `[x]` · [x] cada `R<n>` con un test abierto y leído.
- C3: [x] el diff se ciñe a la tabla de archivos de `design.md` (ajuste de la cabecera móvil justificado en la desviación 6, ver avisos) · [x] sin cambios de otras features ni refactors no pedidos (`activeVehicleFilter` es una extracción pedida por el diseño).
- C4: [x] `modules/notifications/{routes,service,repository}.ts` cableados en `app.ts`, rutas validadas con esquemas de `@ikrive/shared` · [x] el repositorio filtra siempre por `userId` y lo ajeno da 404 · [x] `NotFoundError` (RFC 7807) · [x] esquema en `db/schema/` y migración `0005` generada (coincide con el snapshot según `drizzle-kit check`) · [x] web en `features/notifications/`, `queryOptions`, i18n en es/en y reutiliza `Button`, `label-caps` y tokens semánticos · [x] esquemas compartidos con tests unitarios.
- C5: [x] sin `any`, `@ts-ignore`, `console.log` ni TODOs · [x] fechas `YYYY-MM-DD` (`todayIn`, `lastDoneDate`) e instantes ISO en el DTO · [x] no aplica (no hay subidas).
- C6: [x] `pnpm harness --full` en verde (lo ha ejecutado el reviewer) · [x] SQLite en memoria real, sin mocks de BD; los tests web solo simulan `fetch` · [x] capturas en claro, oscuro y móvil referenciadas (14 en el scratchpad; he revisado `mobile-dark-panel.png`).
- C7: [x] `impl_in-app-notifications.md` incluye los archivos, el mapa y la verificación (también Docker) · [x] `current.md` al día · [x] `PLAN.md` actualizado (estructura `jobs/`; la fase 4 no se cierra).

## Hallazgos

Ninguno bloqueante.

Comprobaciones pedidas por el leader:
- **Lockfile y `package.json`:** `apps/api/package.json` solo añade `croner ^10.0.1`. `pnpm-lock.yaml` solo añade las tres entradas de `croner@10.0.1` (importer, `packages` y `snapshots`). `apps/web/package.json` y el `package.json` raíz no cambian. Los shims borrados de `node_modules/.bin` no aparecen en git, y el arnés pasa con el vitest de la raíz.
- **Portabilidad (`docs/PLAN.md` › Decisiones aplazadas):** el código nuevo no lleva SQL a mano (`sql\`…\``). `listRecentReadingsByVehicles` usa `inArray`, `or` y una subconsulta correlacionada con `max()`, que es SQL estándar. `createMany` usa `onConflictDoNothing(...).returning()`, que también existe en Postgres. El desempate `rowid` del diseño se cambió por `id` precisamente por esa nota. El job es invocable sin planificador (`runReminders`) y accede a los datos solo a través de los repositorios. La autorización por propiedad está en todas las consultas de la bandeja.
- **`POST read-all` / `PATCH read` sin cuerpo:** `api-client.ts` no envía `content-type` si no hay cuerpo, así que Fastify no responde 400 por cuerpo JSON vacío.

## Avisos para el humano (no bloquean)

1. **Orden dentro de una misma pasada del job** (`modules/notifications/repository.ts:20`): el desempate usa `id desc` (UUID aleatorio) y no `rowid` como dice `design.md`. Es estable pero arbitrario entre los avisos de la misma ejecución. La desviación es consciente y está justificada por la nota de portabilidad.
2. **Import de dialecto:** `vehicles/repository.ts` importa `alias` de `drizzle-orm/sqlite-core`. Habrá que cambiarlo al portar a `pg-core`, igual que todo el esquema; no es SQL específico.
3. **Deuda previa de portabilidad, fuera de esta feature:** `schedules/repository.ts:17` ya ordenaba con `sql\`rowid\`` antes de este cambio (lo mismo puede pasar en otros repositorios). Conviene anotarlo para el posible SaaS.
4. **Cabecera móvil de `_app.tsx`:** además de montar la campana, se han reducido huecos y paddings por debajo de `md`, y el botón de cerrar sesión se ha envuelto en un `div`. La desviación 6 lo justifica (a 375 px no cabía); en escritorio no cambia nada.
5. **Dedupe por periodo** (decisión 2 del diseño): si una regla pasa de `due_soon` a `ok` (corrección de odómetro o edición de intervalos) y vuelve a `due_soon` en el mismo periodo, no se avisa otra vez. Es el comportamiento aprobado.
6. **Capturas:** están en el scratchpad de la sesión, que es temporal, y no se versionan. Si quieres conservarlas, cópialas antes de cerrar la sesión.
7. **Rate limit:** el implementer ha visto que el `@fastify/rate-limit` global cuenta también los estáticos de la SPA (problema previo). Puede merecer una feature aparte.
8. **`tasks.md` › T21:** dice «Cubre: R21…R34», aunque R28–R34 los cubren otras tasks. Es ruido del spec aprobado y no afecta a la trazabilidad real.

## Cambios requeridos

Ninguno.
