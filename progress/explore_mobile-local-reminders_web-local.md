# Explore — mobile-local-reminders: modo local, bandeja web, notificaciones nativas y ciclo de vida

> Informe del agente `Explore` (solo lectura) guardado por el leader. Rutas relativas a la raíz del repo.

## 1. DataSource local (`apps/web/src/lib/data-source/local/`)

**Organización**
- Un fichero por dominio con una fábrica `localX(db, deps?) => DataSource['x']`: `settings.ts`, `vehicles.ts` (incluye `localOdometer`), `fuel-logs.ts`, `maintenance.ts`, `attachments.ts`, `schedules.ts`, `stats.ts`, `data-export.ts`, `files-get.ts`.
- Comunes: `problems.ts` (`problem`, `badRequest`, `notFound`, `conflict`, `unsupported()`=501 l.25, `parseInput(schema, value)` l.32-41 → 400 con `errors`); `database.ts` (`LocalDb`, `LocalTx`, `LOCAL_USER`); `files.ts` (`LocalDeps`).
- **Ensamblado:** `local/index.ts:49-71`, `createLocalDataSource(db, deps)`. Nuevo recurso = fábrica en su fichero + registro con `serialized(queue, localX(db))` (l.34-40), que envuelve cada método con `queue.run`. `dataPortability` (l.67) y `files` (l.69) reciben `queue` directamente.
- Contrato: `DataSource` en `apps/web/src/lib/data-source/types.ts:55-153`; notificaciones l.120-124: `list(): Promise<NotificationList>`, `markRead(id): Promise<Notification>`, `markAllRead(): Promise<void>`.
- **Cola serie:** `local/serial.ts:16-21` (`createSerialQueue`), encadena sobre `tail`; un fallo no bloquea las siguientes. Existe porque el plugin tiene una sola conexión y el proxy abre transacciones con `BEGIN` plano. Una cola por DataSource (`index.ts:50`). **Cualquier cálculo de recordatorios que use `db` fuera de los métodos del DataSource tendría que pasar por esa cola; hoy no está expuesta fuera de `createLocalDataSource`.**
- **Instalación:** `apps/web/src/features/mobile/local-mode.ts:17-50`: `openLocalDataSource()` importa dinámicamente `native-sqlite`, `native-storage`, `canvas-images` y `local`, abre la base una vez por ejecución (`let local`, l.11); `activateLocalDataSource()` → `setDataSource` (`apps/web/src/lib/data-source/index.ts:15`). Se llama desde `requireDataSource()` (`features/mobile/require-server.ts:21-24`) en el `beforeLoad` de `/_app` (`routes/_app.tsx:13-14`). `dataSource()` se evalúa en cada `queryFn`.
- **SQLite y migraciones:** `local/database.ts:52-67` `openLocalDatabase(callback)`: drizzle `sqlite-proxy` (`casing: 'snake_case'`, `PRAGMA foreign_keys = ON`), `migrateLocal`, insert idempotente de `user` LOCAL_USER y `user_settings` (valores por defecto). `local/migrations.ts`: las mismas `packages/db/migrations/*.sql` (`import.meta.glob` + `_journal.json`); `migrateLocal` (l.47-75) imita a drizzle (`__drizzle_migrations`, una transacción). Driver: `apps/web/src/lib/native-sqlite.ts` (`deviceCallback`: lecturas y `RETURNING` por `query`, el resto por `run`; base `ikrive`, sin cifrar). `LOCAL_USER_ID = 'local'` (`packages/db/src/index.ts:4`).
- **La tabla `notifications` ya existe en la SQLite local** (migración 0005): `id`, `user_id`, `vehicle_id` (FK cascade), `type`, `title`, `body`, `link`, `dedupe_key`, `read_at` (ms), `created_at` (ms); índice único `notifications_dedupe_key_idx` e índice `(user_id, created_at)`. Esquema drizzle `packages/db/src/schema/notifications.ts`. Nadie la usa en local.
- **Hoy:** `local/index.ts:64` `notifications: { list: reject, markRead: reject, markAllRead: reject }` → 501 «Not available on this device»; `notificationChannels` 501 (l.65). Test `local-data-source.test.ts:491-527` comprueba el 501. Sin bandeja local; export local `notificationChannels: []` (`data-export.ts:38,107`).
- **Paridad con el servidor:** `apps/api/src/modules/notifications/repository.ts`: `listByUser` (`createdAt desc, id desc`), `markRead` solo si `readAt` null, `createMany` con `onConflictDoNothing` sobre `dedupeKey` devolviendo solo las nuevas. `service.ts:67-98`: `toDto` oculta `userId`, `vehicleId`, `dedupeKey`; `list` → `{items, total, unreadCount}`; `markRead` 404 si no existe. Paginación por defecto `limit=20` (`packages/shared/src/schemas/notifications.ts:23-28`).
- **Funciones puras:** `packages/shared/src/domain/reminders.ts` (`NotificationDraft` l.10, `isReminderTime` l.23, `reminderDedupeKey` l.31, `scheduleReminderNotification` l.43, `ODOMETER_NUDGE_DAYS=7`, `odometerNudgeDedupeKey` l.65, `isOdometerNudgeTime` l.73, `odometerNudgeNotification` l.86). Fechas en `packages/shared/src/domain/dates.ts`. `NOTIFICATION_TYPES` en `packages/shared/src/enums.ts:59`. Helpers locales: `listReadings(db, vehicleId)` (`local/vehicles.ts:47`), `requireVehicle` (l.36), `localToday(db)` (`local/settings.ts:21`); `local/schedules.ts:29` ya usa `computeScheduleDue`.

## 2. Bandeja en la web

- **Queries:** `apps/web/src/features/notifications/queries.ts`: `notificationsQuery` (`['notifications','list']`, `refetchInterval: 60_000`); `useMarkNotificationRead` y `useMarkAllNotificationsRead` invalidan `queryKeys.notifications.all` (`apps/web/src/lib/query-keys.ts:10-12`). HTTP: `lib/data-source/http.ts:111-114`.
- **Componente:** `features/notifications/notification-bell.tsx`: popover con contador `unreadCount` («9+», l.22-41); «Marcar todas» solo si hay sin leer (l.48-59); carga/error/vacío (l.62-71); `NotificationItem` (l.87-124): `markRead` si no leída y `navigate({ href: link })`; etiqueta `t('notifications.types.<type>')`. Textos en `i18n/locales/es.json:438-451` y `en.json`.
- **Oculto en local:** `features/navigation/app-navigation.tsx:69` (Sidebar) y `:84` (MobileHeader) `{!isLocalMode() && <NotificationBell />}` (comentario #67 en l.68). `routes/_app.tsx:34-35`: `DeviceNotificationsSync` solo con `isNativeApp() && !isLocalMode()`. `isLocalMode()` en `lib/app-mode.ts:10` (`ikrive.mode` en localStorage).

## 3. Notificaciones locales nativas (#52)

- **`apps/web/src/lib/native-notifications.ts`** (solo vía `import()` en nativo): `getNotificationPermission()` (l.20), `requestNotificationPermission()` (l.26) → `'granted'|'denied'|'prompt'`; `DeviceNotification { id: number; title; body; extra: NotificationTapData }` (l.32-37); `showNotifications(items)` (l.40-45): `LocalNotifications.schedule` inmediato, `isExactNotification: false` (nada programado para más tarde; `SCHEDULE_EXACT_ALARM` eliminado en `apps/mobile/android/app/src/main/AndroidManifest.xml:45-46`); `onNotificationTap(listener)` (l.52-57).
- **Lógica pura:** `features/notifications/device-notifications.ts`: `selectNewNotifications` (l.31-42; primera ejecución no notifica; estado `{since, seen}` en `ikrive.deviceNotifications.<userId>`, l.15, 65-83); `notificationIntId(uuid)` FNV-1a (l.45); `wasPermissionAsked`/`markPermissionAsked` (`ikrive.notificationPermissionAsked`, l.16, 86-100); `NotificationTapData { userId, notificationId, link }` (l.106-116); `parseNotificationTapData` (l.125-134, solo enlaces internos).
- **Sync:** `features/notifications/device-notifications-sync.tsx`: pide permiso una vez (l.21-35); comparte `notificationsQuery`, aplica `selectNewNotifications` y `showNotifications` si `granted` (l.37-58). Solo modo servidor (`routes/_app.tsx:35`).
- **Al tocar:** `features/notifications/notification-tap-handler.tsx`, montado en la raíz con `isNativeApp()` (`routes/__root.tsx:59`), también en local: `fetchQuery(meQuery)`, compara `me.id` con `tap.userId`, `markRead` vía DataSource, `navigate({ href: link })` (l.19-28). En local `me.id` = `'local'` (`LOCAL_ME`) y hoy `markRead` rechazaría con 501, así que no navegaría.
- **Tarjeta de permiso en Ajustes:** `features/notifications/device-notifications-section.tsx`, oculta en local (`routes/_app/settings.tsx:184-194`).
- Los recordatorios de calendario no usan notificaciones (`lib/native-calendar.ts`, `createEventWithPrompt`; `features/calendar/actions.ts:15`).
- Plugins: `@capacitor/local-notifications` 8.3.1 y `@capacitor/app` 8.1.2 en `apps/mobile/package.json` y `apps/web/package.json:17,20`.

## 4. Ciclo de vida

- **Nada reacciona hoy a `visibilitychange`, `appStateChange` ni `resume`** (grep sin resultados en `apps/web/src` y `apps/mobile`).
- Único uso de `@capacitor/app`: `lib/native-back-button.ts` (`onBackButton`, `minimizeApp`), consumido por `features/mobile/back-button-handler.tsx` (`routes/__root.tsx:60`), con patrón async compatible con StrictMode (`active`/`stop`, l.15-47), igual que `notification-tap-handler.tsx`.
- Arranque: `beforeLoad` de `/_app` hace `requireDataSource()` y `ensureQueryData(meQuery)` (`routes/_app.tsx:13-18`); el loader precarga `settingsQuery` (l.20-22).
- React Query: `refetchInterval` en `notificationsQuery` y refetch al recuperar el foco por defecto (sin configuración que lo cambie).

## 5. Ajustes en modo local

- Tabla `user_settings` de la SQLite local, fila `user_id='local'`. Esquema `packages/db/src/schema/settings.ts` (`locale`, `timezone`, `odometerReminderWeekday` nullable def. 0, `reminderHour` def. 8); migraciones 0005 y 0007. Zod y defaults en `packages/shared/src/schemas/settings.ts` (`DEFAULT_USER_SETTINGS` = `es`, `Europe/Madrid`, 0, 8).
- Acceso local: `local/settings.ts`: `settingsRow` (l.15-19) crea la fila si falta; `localToday(db)` (l.21-23); `get`/`update` (l.26-42).
- Web: `features/settings/queries.ts` (`settingsQuery`; `useUpdateSettings` hace `setQueryData`); idioma con `features/settings/use-user-locale.ts` desde `routes/_app.tsx:28`; tema y permiso de notificaciones en localStorage.
- **UI de Ajustes:** `routes/_app/settings.tsx`: en local se ocultan día del aviso de km y hora de recordatorios (`local = isLocalMode()`, l.61-63; `{!local && …}` l.123-175; siguen en el formulario con su valor). También se ocultan Canales, tarjeta de permiso y feed iCal (l.184-194); el loader no pide sus queries (l.39-49). Lo exige `specs/mobile-local-core/requirements.md:112` («ocultos hasta #67»; `specs/mobile-local-core/design.md:100`). Zona horaria e idioma sí se muestran (l.93-122).

## Backlog

- Criterios de #67 en `feature_list.json`; decisión en `docs/PLAN.md:235,238`.
- Pendiente en `specs/mobile-local-core/design.md:125`: «Añadir al calendario» apunta a `https://localhost/…` en local, «se revisa con #67/#68».
