# Exploración: vehicle-documents-api — recordatorios (servidor y local)

Informe de un agente `Explore` (solo lectura). Rutas relativas a la raíz del repo.

## 1. Servidor

- Job: `apps/api/src/jobs/reminders.job.ts` — croner `'0 * * * *'` (l.20), `protect: true` (l.88-102). Se registra en `apps/api/src/server.ts:29-32` con el dispatcher y en `apps/api/src/jobs/registry.ts:14` (CLI `apps/api/src/jobs/cli.ts`, disparo admin en `apps/api/src/modules/admin/routes.ts`). Job hermano con el mismo patrón: `apps/api/src/jobs/odometer-nudge.job.ts`.
- `runReminders` (l.30-85):
  1. `schedulesRepo.listForActiveVehicles()` (`apps/api/src/modules/schedules/repository.ts:25-42`) une vehículos, usuario y `user_settings` (timezone, reminderHour).
  2. Sin settings se usa `DEFAULT_USER_SETTINGS`.
  3. Filtra con `isReminderTime`; `today = todayIn(tz)`.
  4. Lee lecturas de 90 días y llama a `scheduleReminderNotification(...)` por regla.
  5. Inserta con `notifications.createMany(rows)` antes de cualquier llamada de red (l.82) y luego `dispatcher.dispatch(created)`. Solo se envían las filas recién insertadas; las deduplicadas no.
- Funciones puras (`packages/shared`):
  - `packages/shared/src/domain/reminders.ts`: `NotificationDraft {vehicleId|null, type, title, body, link, dedupeKey}` (10-17), `isReminderTime` (23-25), `reminderDedupeKey` (31-37), `scheduleReminderNotification` (43-59, null si status `ok`), `odometerNudgeDedupeKey` / `isOdometerNudgeTime` / `odometerNudgeNotification` (61-116).
  - `packages/shared/src/domain/schedules.ts`: `computeScheduleDue` (71-106): `overdue` si `today >= dueDate`, `due_soon` si `today >= addDays(dueDate, -warnDays)`, más variante por distancia. `addDays`, `addMonths` (14-28). `scheduleLastDoneUpdate` (112-117).
  - Una caducidad de documento puede reutilizar la misma comparación con `addDays(expiry, -warnDays)`.
- Dedupe: clave `schedule:${id}:${status}:${lastDoneDate}:${lastDoneOdometer}` (`reminders.ts:138`). La garantiza el índice único `notifications_dedupe_key_idx` junto con `onConflictDoNothing({target: dedupeKey})` (`apps/api/src/modules/notifications/repository.ts:49-57`). Resultado: una notificación por estado (due_soon, luego overdue) y periodo. Editar los intervalos no vuelve a avisar.
- Rearmado: no hay reinicio explícito. Hacer el mantenimiento actualiza `lastDone*` (`apps/api/src/modules/maintenance/service.ts:89`, copia local en `apps/web/src/lib/data-source/local/maintenance.ts:94`), eso cambia la clave y el siguiente periodo vuelve a avisar. Para documentos: clave `document:${id}:${status}:${expiryDate}`, así renovar cambia la fecha y rearma solo.
- Canales: `apps/api/src/modules/notification-channels/dispatcher.ts:73-94`. Agrupa por usuario, `listEnabledByUsers`, resuelve el locale, `toChannelMessage` (`messages.ts:133-142`) y `createChannel` (`channels.ts`: ntfy, gotify, apprise, webhook; `packages/shared/src/enums.ts:59`). Guarda el último error con `setLastError`; `dispatch` nunca rechaza. `messages.ts:113-130` tiene `TEXTS: Record<Locale, {types: Record<NotificationType,string>}>`, así que un tipo nuevo no compila sin su etiqueta.

## 2. Esquema de notificaciones

- `packages/db/src/schema/notifications.ts:11-37`: `id`, `userId` (FK a user, cascade), `vehicleId` (FK nullable a vehicles, cascade), `type text({enum: NOTIFICATION_TYPES})`, `title`, `body`, `link`, `dedupeKey` (único), `readAt`, `createdAt`.
- No hay FK ni columna de id hacia el origen: solo `type` y el prefijo de `dedupeKey` (`schedule:…`, `odometer_nudge:…`).
- `NOTIFICATION_TYPES = ['schedule_due_soon','schedule_overdue','odometer_nudge']` (`packages/shared/src/enums.ts:63`). Es un enum TS sobre text, probablemente sin CHECK SQL (el SQL de la migración no se revisó). Alimenta `notificationSchema` (`packages/shared/src/schemas/notifications.ts:7`, `z.enum`).
- Un tipo «documento» implica:
  - añadir p. ej. `document_due_soon` / `document_expired` a `NOTIFICATION_TYPES`;
  - añadir sus etiquetas en `messages.ts`;
  - añadir las entradas i18n web `notifications.types.*` (`apps/web/src/i18n/locales/es.json:~489-492`, `en.json`), que usa `notification-bell.tsx:110`;
  - usar un prefijo de dedupeKey nuevo.
- Al borrar un documento, sus notificaciones no se borran (no hay FK); solo caen con el vehículo, salvo que se añada una columna FK `documentId`.

## 3. Modo local

- `apps/web/src/lib/data-source/local/notifications.ts`:
  - `scheduleReminders` (46-87) usa la misma `scheduleReminderNotification`.
  - `odometerNudge` (90-111).
  - `generateLocalReminders(db, now)` (118-137) aplica la misma lógica de settings, `isReminderTime` y `todayIn`, e inserta con `onConflictDoNothing({target: dedupeKey})`.
- No hay planificador: se generan de forma perezosa en `localNotifications().list()` (155-172), al arrancar, con el polling de la campana y al reanudar la app (`apps/web/src/features/notifications/local-reminders-refresh.tsx`, que invalida `queryKeys.notifications.all` en `onAppResume`).
- La BD local usa el mismo esquema Drizzle y las mismas migraciones, empaquetadas desde `packages/db/migrations` (`apps/web/src/lib/data-source/local/migrations.ts:3-17`): una tabla nueva aplica a ambos lados.
- Notificaciones nativas:
  - `apps/web/src/features/notifications/device-notifications-sync.tsx:38-59` → `selectNewNotifications` (`device-notifications.ts:31-42`, dedupe por dispositivo en `localStorage` `{since, seen}`; la primera vez no muestra nada) → `showNotifications` con id `notificationIntId(uuid)` (hash FNV, `device-notifications.ts:45-52`).
  - `apps/web/src/lib/native-notifications.ts:6-8,40-50` usa Capacitor `LocalNotifications.schedule`, que muestra en el momento; nada se programa a futuro.
  - Es igual en modo servidor, así que un tipo nuevo fluye solo.

## 4. Plazo de aviso

- No hay ajuste global. `packages/shared/src/schemas/settings.ts:4-28` y `packages/db/src/schema/settings.ts` solo tienen timezone, reminderHour (8 por defecto), odometerReminderWeekday, moneda y unidades.
- El plazo va por regla: `maintenance_schedules.warnDays` (`packages/db/src/schema/maintenance.ts:27`) y `warnDistance`. `warnDaysSchema = z.number().int().min(0).max(365)`, 30 por defecto (`packages/shared/src/schemas/schedules.ts:9,18`). Un documento puede reutilizar `warnDaysSchema`, su valor por defecto y el filtro `reminderHour`/`timezone`.

## Otros

Feed iCal de reglas: `packages/shared/src/domain/calendar.ts` (`scheduleCalendarEvent` l.53, `toICalendar` l.156), servido por `apps/api/src/modules/calendar/routes.ts`. Los documentos con caducidad podrían añadirse ahí.
