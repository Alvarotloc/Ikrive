# Explore — mobile-local-reminders: jobs del servidor y bandeja

> Informe del agente `Explore` (solo lectura) guardado por el leader. Rutas relativas a la raíz del repo.

## 1. Jobs del servidor que generan notificaciones

Hay dos jobs. Ambos se programan con `croner` cada hora (`'0 * * * *'`, `protect: true`, `catch` → `logger.error`) y se activan con `REMINDERS_ENABLED` (apps/api/src/config.ts:20-21, por defecto `true`). Se arrancan en apps/api/src/server.ts:17-33 y comparten el `dispatcher` creado en server.ts:17. También se lanzan a mano con `runJob` (apps/api/src/jobs/registry.ts:12-28, `JOB_NAMES` en shared), `POST /admin/jobs/:name/run` (apps/api/src/modules/admin/routes.ts:21-30) y la CLI `job <name>` (apps/api/src/jobs/cli.ts).

**a) Recordatorios de planes — apps/api/src/jobs/reminders.job.ts**
- `runReminders({db, now, dispatcher})` (30-85); `startRemindersJob` (87-102).
- Entrada 1: `schedulesRepo.listForActiveVehicles()` (apps/api/src/modules/schedules/repository.ts:25-42): columnas de `maintenance_schedules` + `ownerId`, `vehicleName/Make/Model`, `timezone` y `reminderHour` de `user_settings` (LEFT JOIN). Filtros: `activeVehicleFilter` (soldAt y archivedAt nulos, apps/api/src/modules/vehicles/repository.ts:21) y `activeUserFilter` (apps/api/src/db/filters.ts:8).
- Sin ajustes → `DEFAULT_USER_SETTINGS` (`timezone` 'Europe/Madrid', `reminderHour` 8).
- Filtra con `isReminderTime`; `today = todayIn(tz, now)`.
- Entrada 2: `vehiclesRepo.listRecentReadingsByVehicles(ids, addDays(earliestToday, -AVERAGE_WINDOW_DAYS))` (vehicles/repository.ts:92-113): lecturas de los últimos 90 días + la de fecha máxima.
- Por plan: `scheduleReminderNotification(...)` → `notifications.createMany(rows)` (`userId`, `createdAt: now`) → `dispatcher.dispatch(created)`. Devuelve `{evaluated, created, failed}`.
- No lee registros de mantenimiento: usa `lastDoneDate`/`lastDoneOdometer` del plan (`scheduleLastDoneUpdate`, shared schedules.ts:112).

**b) Aviso de km — apps/api/src/jobs/odometer-nudge.job.ts**
- `runOdometerNudge` (31-73); `startOdometerNudgeJob` (75-90).
- Entrada: `vehiclesRepo.listActiveForOdometerNudge()` (vehicles/repository.ts:119-141): `vehicleId`, `ownerId`, `name/make/model`, `createdAt`, `lastReadingDate = max(odometer_readings.date)`, `weekday = user_settings.odometerReminderWeekday`, `timezone`, `reminderHour`. INNER JOIN con `user_settings`; filtros: vehículo activo, usuario activo, `weekday` no nulo.
- Agrupa por usuario, `isOdometerNudgeTime(first, now)`, `odometerNudgeNotification({userId, today, timezone, vehicles})` → `createMany` → `dispatch`.

**Ajustes** (packages/db/src/schema/settings.ts:5-21; zod packages/shared/src/schemas/settings.ts:25-49): `timezone`; `reminderHour` 0–23 (def. 8); `odometerReminderWeekday` 0–6 (0 = domingo) o `null` (def. 0); `locale` (solo dispatcher).

## 2. Puro en packages/shared vs acoplado

**Puro — packages/shared/src/domain/reminders.ts** (exportado en packages/shared/src/index.ts:10):
- `NotificationDraft { vehicleId: string|null; type; title; body: string|null; link; dedupeKey }` (10-17).
- `isReminderTime(owner: {timezone; reminderHour}, now)` (23-25).
- `reminderDedupeKey(scheduleId, status: 'due_soon'|'overdue', rule: {lastDoneDate; lastDoneOdometer})` (31-37).
- `scheduleReminderNotification(schedule: ScheduleRule & {id; title}, vehicle: {id; name; make; model}, readings: readonly OdometerPoint[], today): NotificationDraft | null` (43-59).
- `ODOMETER_NUDGE_DAYS = 7` (62); `odometerNudgeDedupeKey(userId, today)` (65-67).
- `isOdometerNudgeTime(owner: {timezone; reminderHour; weekday: number|null}, now)` (73-79).
- `odometerNudgeNotification({userId, today, timezone, vehicles: {name, make, model, lastReadingDate: string|null, createdAt: Date}[]}): NotificationDraft | null` (86-116).

**Auxiliares puras:** packages/shared/src/domain/dates.ts: `todayIn` (:2), `hourIn` (:11), `weekdayOf` (:25), `isoWeekOf` (:30). packages/shared/src/domain/schedules.ts: `AVERAGE_WINDOW_DAYS = 90` (:5), `addDays` (:14), `ScheduleRule` (:49), `computeScheduleDue(rule, readings, today)` (:71-109). `OdometerPoint` en packages/shared/src/domain/odometer.ts:1.

**Tests:** packages/shared/src/domain/reminders.test.ts (todas las funciones anteriores), dates.test.ts, schedules.test.ts. Integración: apps/api/test/reminders.test.ts (dedupe, hora, zona horaria, archivados/vendidos, usuarios desactivados) y apps/api/test/odometer-nudge.test.ts (día, umbral 7 días, dedupe semanal, canales).

**Acoplado a API/BD:** consultas `listForActiveVehicles`, `listRecentReadingsByVehicles`, `listActiveForOdometerNudge`; agrupado por usuario y relleno de ajustes por defecto en los jobs; inserción con dedupe (`createMany`); dispatcher y croner.

**Estado actual en móvil:**
- El modo local ya calcula el estado de los planes con `computeScheduleDue` (apps/web/src/lib/data-source/local/schedules.ts:3,29).
- Bandeja rechazada en local: `notifications: { list: reject, markRead: reject, markAllRead: reject }` (apps/web/src/lib/data-source/local/index.ts:64).
- Campana oculta con `!isLocalMode()` (apps/web/src/features/navigation/app-navigation.tsx:69,84).
- `DeviceNotificationsSync` solo si `isNativeApp() && !isLocalMode()`, comentario "local reminders come with #67" (apps/web/src/routes/_app.tsx:34-35).
- La BD local aplica las migraciones de packages/db (apps/web/src/lib/data-source/local/migrations.ts:13-34): la tabla `notifications` ya existe en el dispositivo.
- Usuario local `LOCAL_USER_ID = 'local'` (packages/db/src/index.ts:4); filas en `user` y `user_settings` creadas en apps/web/src/lib/data-source/local/database.ts:18,44.

## 3. Duplicados y esquema

**Tabla `notifications`** (packages/db/src/schema/notifications.ts:10-36; packages/db/migrations/0005_notifications.sql): `id` (UUID PK), `user_id` (FK cascade), `vehicle_id` (nullable, FK cascade), `type` (enum), `title`, `body` (nullable), `link` (nullable), `dedupe_key` (NOT NULL), `read_at` (nullable), `created_at`. Índices: `(user_id, created_at)`, **UNIQUE `dedupe_key`**, `vehicle_id`. La misma migración añade `user_settings.reminder_hour` (DEFAULT 8); `odometer_reminder_weekday` pasa a nullable en 0007.

**Dedupe:** `createMany` = `insert … onConflictDoNothing({ target: dedupeKey }).returning()`, devuelve solo las nuevas (apps/api/src/modules/notifications/repository.ts:48-57); solo esas van al dispatcher.
- Plan: `schedule:${scheduleId}:${status}:${lastDoneDate}:${lastDoneOdometer ?? ''}` — una por plan, estado y periodo.
- Km: `odometer_nudge:${userId}:${isoWeekOf(today)}` — una por usuario y semana ISO.
- No hay otra tabla de estado: la clave única es todo el estado.
- Se avisa en la primera ejecución desde `reminderHour` hasta medianoche (se recupera más tarde el mismo día).

**Estado en el dispositivo (modo servidor):** apps/web/src/features/notifications/device-notifications.ts:34-68: `{since, seen[]}` en `localStorage` (`ikrive.deviceNotifications.${userId}`); `selectNewNotifications(items, state)`; primera ejecución no muestra nada; `notificationIntId(uuid)` (FNV-1a).

## 4. Forma, i18n y API de la bandeja

`NOTIFICATION_TYPES = ['schedule_due_soon', 'schedule_overdue', 'odometer_nudge']` (packages/shared/src/enums.ts:59).

| Tipo | `title` | `body` | `link` | `vehicleId` |
|---|---|---|---|---|
| plan (`schedule_${status}`) | `schedule.title` | nombre del vehículo o `make model` | `/vehicles/${id}` | id |
| `odometer_nudge` | nombres de vehículos unidos con ", " | `null` | `/odometer` | `null` |

Título y cuerpo son datos del usuario (no se traducen).

**DTO:** `notificationSchema` = `{id, type, title, body|null, link|null, readAt|null (ISO), createdAt (ISO)}` (packages/shared/src/schemas/notifications.ts:4-14); el servicio no expone `userId`, `vehicleId` ni `dedupeKey` (apps/api/src/modules/notifications/service.ts:6-14).

**Etiqueta del tipo:** web `t('notifications.types.${type}')` (apps/web/src/features/notifications/notification-bell.tsx:110; es.json:438-451). Canales externos: `TEXTS` en apps/api/src/modules/notification-channels/messages.ts:12-29 (`toChannelMessage`, 32-41). La notificación Android de `DeviceNotificationsSync` usa `item.title` y `item.body ?? ''` sin etiqueta (device-notifications-sync.tsx:48-55).

**API** (apps/api/src/modules/notifications/routes.ts): `GET /notifications?limit=20&offset=0` (1–100) → `{items, total, unreadCount}` (`createdAt desc, id desc`); `PATCH /notifications/:id/read` → `Notification` (solo si `readAt` nulo; 404 si no es del usuario); `POST /notifications/read-all` → 204.

**Cliente:** contrato `DataSource.notifications {list, markRead, markAllRead}` (apps/web/src/lib/data-source/types.ts:120-123); HTTP en http.ts:111-115; queries en apps/web/src/features/notifications/queries.ts (`refetchInterval` 60 s, mutaciones invalidan `queryKeys.notifications.all`). Al tocar: notification-tap-handler.tsx:17-31 (`markRead` + navegar a `link`); `extra = {userId, notificationId, link}` (device-notifications.ts:132-160).

## 5. Canales

- **In-app:** siempre, en `notifications`.
- **Externos:** `notification_channels` (migración 0006), tipos `ntfy`, `gotify`, `apprise`, `webhook`; dispatcher (apps/api/src/modules/notification-channels/dispatcher.ts:68-126) envía por todos los canales `enabled` de usuarios activos con su `locale`; sin preferencias por tipo.
- **Android:** no lo envía el servidor: la app nativa consulta la bandeja cada 60 s y muestra las nuevas con `@capacitor/local-notifications` (apps/web/src/lib/native-notifications.ts:102-107), inmediatas (`isExactNotification: false`), sin `SCHEDULE_EXACT_ALARM`. Permiso pedido una vez (`ikrive.notificationPermissionAsked`). Desactivado en modo local (_app.tsx:35).
- Modo local sin canales: local/index.ts:65 los rechaza; local/data-export.ts:107 exporta `notificationChannels: []`.
