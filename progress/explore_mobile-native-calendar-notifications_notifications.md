# Exploración: bandeja de avisos, ajustes, i18n y tests (#52)

## 1. Cómo funciona la bandeja (#15 in-app-notifications, #16 notification-channels)

**Esquema de BD**: `apps/api/src/db/schema/notifications.ts:11-37` (migración `apps/api/src/db/migrations/0005_notifications.sql`)
- `id`: texto, UUID con `crypto.randomUUID()` (`:6-9`, `:14`).
- `userId` (FK cascade), `vehicleId` (nullable, FK cascade), `type` (`NOTIFICATION_TYPES` = `schedule_due_soon | schedule_overdue | odometer_nudge`, `packages/shared/src/enums.ts:59`), `title`, `body`, `link` (ruta interna de la SPA).
- `dedupeKey`: notNull y único (`:26`, `:34`); clave de evento del servidor. **No se expone** al cliente (`apps/api/src/modules/notifications/service.ts:5-14`).
- `readAt`: nullable, null = no leída (`:27`). `createdAt` (`:28`). Índice `(userId, createdAt)` (`:33`).
- Canales externos: `apps/api/src/db/schema/notification-channels.ts:10-32` (ntfy/gotify/apprise/webhook).

**DTO compartido** (`packages/shared/src/schemas/notifications.ts`):
- `notificationSchema` (`:5-14`): `id, type, title, body, link, readAt (ISO|null), createdAt (ISO)`.
- `notificationListQuerySchema` (`:18-21`): `limit` 20 por defecto, máx. 100; `offset` 0.
- `notificationListSchema` (`:25-29`): `{ items, total, unreadCount }` (totales del usuario).

**Endpoints** (`apps/api/src/modules/notifications/routes.ts`, autenticados):
- `GET /notifications?limit&offset` (`:17-21`); `PATCH /notifications/:id/read` (`:23-27`, idempotente); `POST /notifications/read-all` (204, `:29-32`).
- Orden `createdAt DESC, id DESC` (`repository.ts:20-30`).
- `createMany` con `onConflictDoNothing(dedupeKey)` devuelve solo filas nuevas (`repository.ts:51-60`); lo usan `apps/api/src/jobs/reminders.job.ts:105-106` y el job odometer-nudge, que luego hacen `dispatcher.dispatch(created)` (`notification-channels/dispatcher.ts:73`).

**Fetch en la web** (`apps/web/src/features/notifications/queries.ts`):
- `notificationsQuery` (`:7-11`): clave `['notifications','list']`, primera página (20), `refetchInterval: 60_000`.
- Mutaciones `useMarkNotificationRead` / `useMarkAllNotificationsRead` (`:23-27`) invalidan `['notifications']`.
- Claves en `apps/web/src/lib/query-keys.ts:10-16`. QueryClient global en `apps/web/src/main.tsx:15-16` (`retry: 1`, `refetchOnWindowFocus: false`).

**UI**: `apps/web/src/features/notifications/notification-bell.tsx`
- `NotificationBell` (`:17-85`), badge `unreadCount` («9+»), Popover con lista y «marcar todas».
- `NotificationItem` (`:87-124`): marca leída y navega a `link`.
- Montada en `apps/web/src/features/navigation/app-navigation.tsx:54` (Sidebar) y `:69` (MobileHeader); solo una a la vez según `useMediaQuery(DESKTOP_QUERY)`. Todo cuelga de `/_app` (`apps/web/src/routes/_app.tsx:24-35`).
- Ajustes de canales: `apps/web/src/features/notification-channels/channels-section.tsx:25-62`.

## 2. Clave de deduplicación y dónde engancharse

- **Clave estable: `notification.id`** (UUID inmutable; el `dedupeKey` del servidor garantiza una fila por evento). `createdAt` no sirve como clave (varias filas comparten ms, `repository.ts:17`), pero sí como marca de corte.
- Capacitor LocalNotifications exige id int32: derivarlo con hash del UUID y guardar los UUID ya notificados (p. ej. en `localStorage`).
- Criterio de «nuevo»: `readAt === null` e `id` no visto; además `createdAt > lastSeenCreatedAt` para no notificar el histórico en el primer arranque.
- Solo se pide la primera página (20); con >20 nuevas entre dos fetch se perderían algunas (improbable con job horario).
- **Puntos de enganche**:
  1. Hook montado una vez en `AppLayout` (`apps/web/src/routes/_app.tsx:24-26`, junto a `useUserLocale()`), con `useQuery(notificationsQuery)` y `useEffect` sobre `data`/`dataUpdatedAt`; comparte caché y polling con la campana.
  2. Alternativa: `queryClient.getQueryCache().subscribe(...)` filtrando la clave.
  3. No engancharse en `NotificationBell` (dos puntos de montaje).
- Limitar al APK con `isNativeApp()` (`apps/web/src/lib/platform.ts:6`) e import dinámico como `apps/web/src/lib/download.ts:10,32`.
- No hay plugin de notificaciones locales instalado (`apps/web/package.json:15-18`).

## 3. Permisos y página de ajustes

- No hay manejo de permisos hoy (ni `Notification.permission`, ni `requestPermission`, ni `navigator.permissions` en `apps/web/src`).
- `apps/web/src/routes/_app/settings.tsx`: loader precarga settings, canales y feed (`:35-43`). Secciones: Preferencias (`:67-162`), `NotificationChannelsSection` (`:163-165`), `CalendarFeedSection` (`:166-168`), Apariencia (`:169-193`, tema local vía `applyTheme`), `DataPortabilitySection` (`:194`).
- Sitio natural para «Notificaciones del teléfono» (estado del permiso + botón): Card nueva tras `:165`, solo si `isNativeApp()`, o fila dentro de `channels-section.tsx`. Patrón `Card/CardHeader/CardTitle/CardDescription/CardContent` de `@/components/ui/card`. Preferencias de dispositivo en local (precedente: `@/lib/theme`), no en `userSettingsSchema`.

## 4. i18n y tests

**i18n**: `apps/web/src/i18n/index.ts:8-13` (i18next, `fallbackLng: 'es'`). Locales en `apps/web/src/i18n/locales/{es,en}.json`. Claves anidadas camelCase por feature (`notifications.*` en `es.json:434-447`, `notificationChannels.*` `:448`, `settings.*` `:73`); plurales `_one/_other`; enums en subobjetos. `apps/web/src/i18n/locales.test.ts:13-15` exige las mismas claves en es y en.

**Tests (Vitest + Testing Library)**: `apps/web/vitest.config.ts` con proyectos `unit` (`*.test.ts`, Node, `src/test/setup-unit.ts`) y `dom` (`*.test.tsx`, jsdom, `src/test/setup.ts`).
- `setup.ts`: jest-dom; `fetch` que falla si no está mockeado (`:11-17`, `:44-45`); idioma `es` (`:31`); `afterEach` con `cleanup`, `unstubAllGlobals`, `restoreAllMocks`, `localStorage.clear()` (`:38-46`).
- `apps/web/src/test/render.tsx`: `createTestQueryClient()` (`:12-16`), `renderWithProviders(ui)` (`:23-35`), `mockApi({ 'GET /notifications': { body } })` (`:63-84`), `mockMediaQuery`, `setServerMode`.
- Página con router: `renderApp('/settings')` (`apps/web/src/test/render-app.tsx`; ejemplo `features/settings/settings-page.test.tsx:10-25`).
- Mocks: `vi.hoisted` + `vi.mock` con factory (`features/data-portability/data-section.test.tsx:22-23`; plugins en `lib/native-files.test.ts:5-10`). Modo nativo: `vi.stubEnv('MODE', 'native')`.
- Test de la campana: `features/notifications/notification-bell.test.tsx` (factory `notification(overrides)`, `page(items)`, router en memoria).
