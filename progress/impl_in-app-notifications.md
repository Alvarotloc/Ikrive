# Implementación — in-app-notifications (#15)

Rama `feat/in-app-notifications`, sin commits. Tasks T1–T31 marcadas en `specs/in-app-notifications/tasks.md`.

## Cambios por archivo

### `packages/shared`
- `src/enums.ts`: `NOTIFICATION_TYPES` (`schedule_due_soon`, `schedule_overdue`) y `NotificationType`.
- `src/schemas/notifications.ts` (nuevo): `notificationSchema`, `notificationListQuerySchema` (`z.coerce`, `limit` 1–100 por defecto 20, `offset` ≥ 0 por defecto 0) y `notificationListSchema` (`{ items, total, unreadCount }`). Se exporta en `src/index.ts`.
- `src/schemas/notifications.test.ts` (nuevo): valores por defecto, coerción y rechazos.
- `src/schemas/settings.ts`: `reminderHour` (entero 0–23) en `userSettingsSchema` y `DEFAULT_USER_SETTINGS.reminderHour = 8`. No había fixtures que dejaran de compilar.

### `apps/api`
- `src/db/schema/notifications.ts` (nuevo) + barrel: tabla `notifications` según `design.md`, con FK `user_id` y `vehicle_id` en cascada, índice `(user_id, created_at)`, índice `(vehicle_id)` e índice único en `dedupe_key`.
- `src/db/schema/settings.ts`: columna `reminderHour` con default 8.
- `src/db/migrations/0005_notifications.sql` + `meta/0005_snapshot.json` + `_journal.json`: generados con `drizzle-kit generate --name notifications`. El SQL incluye `CREATE TABLE notifications`, los 3 índices y `ALTER TABLE user_settings ADD reminder_hour integer DEFAULT 8 NOT NULL`. Ninguna edición a mano.
- `src/modules/notifications/{repository,service,routes}.ts` (nuevos):
  - Repositorio: `listByUser`, `countByUser`, `countUnread`, `findOwned`, `markRead`, `markAllRead` y `createMany`. Todas las consultas filtran por `userId`. `createMany` usa `onConflictDoNothing({ target: dedupeKey })` y `.returning()`.
  - Servicio: DTO sin `userId`, `vehicleId` ni `dedupeKey`. Devuelve `NotFoundError('Notification not found')` si la notificación no existe o es de otro usuario.
  - Rutas: `GET /notifications`, `PATCH /notifications/:id/read` (200) y `POST /notifications/read-all` (204), todas tras `app.authenticate`.
- `src/app.ts`: conecta el módulo de notificaciones.
- `src/config.ts`: `REMINDERS_ENABLED: booleanString.default(true)`.
- `src/lib/dates.ts`: `hourIn(timeZone, now)` con `Intl` y `hourCycle: 'h23'`. Si la zona no es válida, usa la hora UTC.
- `src/modules/vehicles/repository.ts`:
  - Exporta `activeVehicleFilter`, que `statusFilter.active` reutiliza.
  - Nuevo `listRecentReadingsByVehicles(ids, since)`: una sola consulta con `inArray` y `date >= since OR date = (subconsulta correlacionada max(date))`. Es SQL estándar generado por Drizzle (comprobado imprimiendo la sentencia) y no depende de nada específico de SQLite.
- `src/modules/schedules/repository.ts`: `listForActiveVehicles()` hace una sola consulta: reglas `INNER JOIN vehicles` (activos) `LEFT JOIN user_settings`. Devuelve `ownerId`, el nombre, la marca y el modelo del vehículo, y `timezone` y `reminderHour` (pueden ser null).
- `src/jobs/reminders.job.ts` (nuevo): `REMINDERS_CRON = '0 * * * *'`, `isReminderTime`, `reminderDedupeKey`, `runReminders({ db, now })` y `startRemindersJob({ enabled, run, logger })`. Este último usa `Cron` con `protect: true` y `catch` → `logger.error`, o devuelve `null` si `enabled` es falso. El job solo accede a los datos a través de los repositorios.
- `src/server.ts`: arranca el job después de `buildApp` con `config.REMINDERS_ENABLED`, y llama a `remindersJob?.stop()` en el handler de señales antes de `app.close()`. `buildApp` no programa nada.
- `package.json` / `pnpm-lock.yaml`: `croner ^10.0.1` (el lock solo añade croner).
- Tests: `test/notifications.test.ts` y `test/reminders.test.ts` (nuevos), y 2 casos nuevos en `test/settings.test.ts`.

### `apps/web`
- `src/components/ui/popover.tsx` (nuevo): wrapper de `Popover` de `radix-ui` (Portal, tarjeta `rounded-xl border bg-card shadow-float`, `collisionPadding`).
- `src/lib/query-keys.ts`: `notifications.{all,list}`.
- `src/lib/format.ts`: `dateTime(iso)` en `useFormat`, con fecha y hora en la zona del usuario. Si la zona no es válida, usa la del navegador.
- `src/features/notifications/queries.ts` (nuevo): `notificationsQuery` (`refetchInterval: 60_000`), `useMarkNotificationRead` y `useMarkAllNotificationsRead`. Las dos mutaciones invalidan `notifications.all`.
- `src/features/notifications/notification-bell.tsx` (nuevo): campana con `useQuery` (no suspense) y `aria-label` «Notificaciones, N sin leer». El contador es `bg-destructive` y llega como mucho a «9+». El panel está alineado a `end` y tiene:
  - Cabecera con «Marcar todas como leídas».
  - Lista con scroll `max-h-96`.
  - Estados de cargando, vacío y error (`role="alert"`).
  - Filas `<button>` que marcan la notificación como leída si no lo estaba, cierran el panel y navegan con `navigate({ href: link })`.
- `src/routes/_app.tsx`: monta `<NotificationBell />` junto a «Cerrar sesión» (ver la desviación 6).
- `src/routes/_app/settings.tsx`: desplegable «Hora de los recordatorios» con 24 opciones `HH:00` y `valueAsNumber`. Debajo lleva un texto de ayuda enlazado con `aria-describedby`.
- `src/i18n/locales/{es,en}.json`: bloque `notifications` (title, open_one/_other, markAllRead, empty, error, loading, types.*) y `settings.reminderHour` / `settings.reminderHourHint`.
- `src/features/settings/use-user-locale.test.tsx`: mock de `GET /notifications`.
- Tests: `src/features/notifications/notification-bell.test.tsx` y `src/features/settings/settings-page.test.tsx` (nuevos).

### Docs
- `README.md` y `.env.example`: `REMINDERS_ENABLED`. `TZ` ya no fija la hora de los recordatorios: ahora cada usuario elige zona y hora en Ajustes.
- `docs/PLAN.md`: carpeta `jobs/` en la estructura. No se cambia el estado de la fase 4, que no está terminada.

## Trazabilidad

| R | Test(s) |
|---|---|
| R1 | Migración `0005_notifications` aplicada en todos los tests de la API (`createTestApp` → `runMigrations`). `reminders.test.ts › notifies due soon and overdue schedules` comprueba todas las columnas de la fila |
| R2 | `reminders.test.ts › deduplication › ignores a duplicated dedupe key on insert`; `… › does not duplicate notifications when run twice the same day` |
| R3 | `reminders.test.ts › reminders job scheduling › validates REMINDERS_ENABLED` (por defecto true, `false`/`0` → false, `1` → true, `yes` → `loadConfig` lanza). Docker: `REMINDERS_ENABLED=yes` → «Invalid option … at REMINDERS_ENABLED» |
| R4 | `reminders.test.ts › schedules the job hourly when enabled` (`getPattern()` = `0 * * * *`, `isRunning`, `trigger()` llama a `run`, `stop()`); `… › logs a failing run instead of crashing` |
| R5 | `reminders.test.ts › does not schedule the job when disabled` |
| R6 | `reminders.test.ts › runReminders › *`, que llama a `runReminders({ db, now })` sin planificador y comprueba `{ evaluated, created }` |
| R7 | `reminders.test.ts › notifies due soon and overdue schedules`; `… › uses the owner's time zone for today` |
| R8 | `reminders.test.ts › notifies due soon and overdue schedules` (tipo, título, cuerpo, enlace, `vehicleId`, `userId`) |
| R9 | `reminders.test.ts › skips ok schedules` (por meses y por km) |
| R10 | `reminders.test.ts › skips archived and sold vehicles` |
| R11 | `reminders.test.ts › notifies due soon and overdue schedules` (formato exacto de `dedupeKey`); `… › does not duplicate notifications when run twice the same day` |
| R12 | `reminders.test.ts › notifies again when the schedule becomes overdue`; `… › notifies again in a new period` |
| R13 | `notifications.test.ts › lists notifications newest first with total and unread count`; `… › paginates with limit and offset`; `notifications.test.ts` (shared) › `defaults limit and offset`, `coerces query strings` |
| R14 | `notifications.test.ts › rejects invalid pagination` (400 problem+json); shared › `rejects a limit outside 1-100 and a negative offset` |
| R15 | `notifications.test.ts › marks a notification as read` (`readAt` fijado y conservado al repetir) |
| R16 | `notifications.test.ts › marks all notifications as read` (204, `unreadCount` 0, conserva el `readAt` anterior) |
| R17 | `notifications.test.ts › authorization › hides other users' notifications` |
| R18 | `notifications.test.ts › authorization › returns 404 when marking another user's notification` (ajena e inexistente; sigue sin leer) |
| R19 | `notifications.test.ts › authorization › read-all does not touch other users' notifications` |
| R20 | `notifications.test.ts › authorization › requires a session` (401 en los tres endpoints) |
| R21 | `notification-bell.test.tsx › shows the unread count on the bell` («9+»); `… › shows a small count as is and no counter without unread notifications`; capturas |
| R22 | `notification-bell.test.tsx › lists notifications in the panel` (etiqueta, título, cuerpo, fecha; no leída en negrita); capturas |
| R23 | `notification-bell.test.tsx › shows an empty state` |
| R24 | `notification-bell.test.tsx › shows an error alert when the request fails` |
| R25 | `notification-bell.test.tsx › marks a notification as read and navigates to its link` (PATCH, ruta `/vehicles/v1`, panel cerrado; una ya leída solo navega). E2E real en Chrome: clic → `/vehicles/<id>`, panel cerrado, contador de 2 a 1 |
| R26 | `notification-bell.test.tsx › marks all as read` (POST enviado y contador oculto) |
| R27 | `src/i18n/locales.test.ts` (mismas claves en es/en); todos los tests de la web afirman los textos en español |
| R28 | `reminders.test.ts › reminder hour › hourIn returns the local hour of the time zone`; `… › only evaluates owners whose local hour reached their reminder hour`; `… › uses the default reminder hour without settings`; `… › catches up later the same day` |
| R29 | `settings.test.ts › returns and updates the reminder hour` (8 por defecto); `reminders.test.ts › uses the default reminder hour without settings` (sin fila → 8) |
| R30 | `settings.test.ts › returns and updates the reminder hour` |
| R31 | `settings.test.ts › rejects an invalid reminder hour` (`-1`, `24`, `7.5`, `'8'` → 400 problem+json, sin cambios) |
| R32 | `settings-page.test.tsx › saves the reminder hour` (24 opciones, `08:00` seleccionada, texto de ayuda como descripción accesible, `PATCH` con `reminderHour: 20`) |
| R33 | `notifications.test.ts › deletes notifications with their vehicle` |
| R34 | `reminders.test.ts › bounded readings give the same due status as the full history` (lecturas antiguas no cargadas, última lectura anterior a la ventana incluida con sus 2 valores, resultado de `computeScheduleDue` idéntico; el fixture cubre `ok`, `due_soon` y `overdue`) |

## Verificación

`pnpm harness --full`:

```
[OK]    20 features: 15 done, 4 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #15 in-app-notifications (in_progress)
[OK]    Rama actual: feat/in-app-notifications
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared  Test Files 5 passed (5)   Tests 29 passed (29)
apps/api         Test Files 11 passed (11) Tests 91 passed (91)
apps/web         Test Files 20 passed (20) Tests 152 passed (152)
[OK]    pnpm test
[OK]    Arnés en verde.
```

Los tests de la web que montan el router siguen imprimiendo «Not implemented: Window's scrollTo()» de jsdom. Ese aviso ya salía en `use-user-locale.test.tsx`.

**Docker** (la feature añade una dependencia):
- `docker build -f docker/Dockerfile -t ikrive:dev .` termina bien.
- El contenedor (con `AUTH_SECRET`) responde `/api/health` → `{"status":"ok"}`.
- `node_modules/croner` y `dist/migrations/0005_notifications.sql` están presentes.
- Con `REMINDERS_ENABLED=yes` el arranque falla con el error de zod.

**Revisión visual:**
- Entorno aislado: SPA compilada en el scratchpad y servida por la API en `127.0.0.1:3418`, con `DATA_DIR` también en el scratchpad. No se tocó el `:5173` ocupado por otro proyecto. La API ya está parada.
- Datos sembrados por la API real: 2 vehículos y 3 reglas. `runReminders` se ejecutó con `now` fijo y devolvió `{ evaluated: 3, created: 3 }`. Una notificación está leída.
- Herramienta: playwright-core 1.58 contra `/usr/bin/google-chrome`, `es-ES`, `Europe/Madrid`.
- Desbordamiento horizontal de la página: 0 px en todas las capturas. El panel queda dentro del viewport (margen de 12 px en móvil).
- Capturas (`/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/dbdbacf1-90a2-436e-a500-4d65cab3faa0/scratchpad/shots/`):
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/dbdbacf1-90a2-436e-a500-4d65cab3faa0/scratchpad/shots/desktop-light-panel.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/dbdbacf1-90a2-436e-a500-4d65cab3faa0/scratchpad/shots/desktop-dark-panel.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/dbdbacf1-90a2-436e-a500-4d65cab3faa0/scratchpad/shots/mobile-light-panel.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/dbdbacf1-90a2-436e-a500-4d65cab3faa0/scratchpad/shots/mobile-dark-panel.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/dbdbacf1-90a2-436e-a500-4d65cab3faa0/scratchpad/shots/mobile-light-header.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/dbdbacf1-90a2-436e-a500-4d65cab3faa0/scratchpad/shots/mobile-dark-header.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/dbdbacf1-90a2-436e-a500-4d65cab3faa0/scratchpad/shots/desktop-light-settings.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/dbdbacf1-90a2-436e-a500-4d65cab3faa0/scratchpad/shots/desktop-dark-settings.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/dbdbacf1-90a2-436e-a500-4d65cab3faa0/scratchpad/shots/mobile-light-settings.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/dbdbacf1-90a2-436e-a500-4d65cab3faa0/scratchpad/shots/mobile-dark-settings.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/dbdbacf1-90a2-436e-a500-4d65cab3faa0/scratchpad/shots/desktop-light-after-click.png`: ficha del vehículo tras pulsar una notificación, con el contador en 1.

## Desviaciones y decisiones de implementación

1. **Desempate del orden por `id` en vez de `rowid`.** `design.md` pide ordenar por `createdAt desc, rowid desc`, pero `rowid` es específico de SQLite. La nota de `docs/PLAN.md` › Decisiones aplazadas, que el leader recordó, pide no usar ese tipo de SQL. Solo se empata dentro de una misma pasada del job, porque todas sus filas comparten `createdAt = now`. Para ese caso, un desempate determinista por `id` es suficiente y portable.
2. **`PATCH …/read` sin `coalesce`.** Se hace un `UPDATE … SET read_at = now WHERE id AND user_id AND read_at IS NULL` y después un `SELECT`. La semántica es la misma (conserva la primera lectura, R15) y no hace falta una expresión SQL a mano con el formato del timestamp de SQLite.
3. **Cuerpo de la notificación cuando el vehículo no tiene `name`.** `vehicles.name` admite null. En ese caso se usa `` `${make} ${model}` ``, que es el mismo criterio que la web (`vehicleTitle` en `features/vehicles/display.ts`). R8 dice «nombre del vehículo», y esa es la forma en que la app lo muestra.
4. **`createdAt = now` en las filas del job.** Así los tests y la llamada manual con `now` fijo son coherentes. En producción `now` es `new Date()` y el resultado no cambia.
5. **Texto de ayuda del desplegable.** `FormField` no tiene la prop `hint`. El `<p>` se renderiza dentro del propio `settings.tsx`, enlazado con `aria-describedby`, sin tocar `FormField` (que está fuera del diseño).
6. **Cabecera móvil compactada (`_app.tsx`, solo por debajo de `md`).** Con la campana, la barra superior a 375 px no cabía y el icono de Inicio tapaba el texto «ikrive». Se redujeron algunos huecos y paddings solo en móvil (`gap-1`, `gap-0.5`, `px-2.5`). Los valores de escritorio se mantienen con `md:gap-2` y `md:px-3`. Ahora hay 18 px entre el logo y la navegación, medidos en Chrome.
7. **Panel `w-96` y cabecera que se parte en dos líneas.** Con `w-80`, «Marcar todas como leídas» (`whitespace-nowrap`) ensanchaba el contenido por encima del panel. Ahora cabe en escritorio y en móvil la acción baja bajo el título.
8. **Punto de no leída con `bg-success`** en vez de menta `accent`. `--success` es menta en oscuro y verde profundo en claro. Con `accent-strong` el punto casi no se veía en modo oscuro.
9. **`startRemindersJob`** envuelve `run` en un callback `() => { run(); }`, porque el tipo de croner espera `void`. La firma pública `run: () => unknown` sigue como en el diseño.
10. **Tests extra** no listados en las tasks: `logs a failing run instead of crashing` (job) y `shows a small count as is and no counter without unread notifications` (campana).

## Incidencias de entorno (fuera del repo)

- `pnpm --filter @ikrive/api add croner` podó una copia huérfana de vitest en `node_modules/.pnpm`. Eso dejó roto el shim `apps/api/node_modules/.bin/vitest`, que era un resto de una instalación antigua: vitest es devDependency de la raíz, no de `apps/api`, y pnpm no regenera ese shim. Al intentar reenlazar con `pnpm install --frozen-lockfile --force`, se podó otra copia y le pasó lo mismo a `apps/web/node_modules/.bin/vitest`. Se borraron los dos shims rotos, que están ignorados por git. Ahora se usa el de la raíz y todo funciona. El lockfile no cambió salvo por croner.
- Para la revisión visual hubo que espaciar las cargas porque el `@fastify/rate-limit` global (300 peticiones/min por IP) cuenta también los estáticos de la SPA. Ocho cargas completas seguidas lo agotan. Es comportamiento previo y queda fuera del alcance de esta feature. Se anota por si conviene excluir los estáticos más adelante.
