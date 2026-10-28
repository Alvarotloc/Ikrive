# Explore: maintenance-calendar — API & feed

Paths relative to repo root.

## 1. Esquema Drizzle y migraciones
- Tablas: un archivo por dominio en `apps/api/src/db/schema/*.ts`, re-exportados en `schema/index.ts`.
  - `apps/api/drizzle.config.ts`: sqlite, `casing: 'snake_case'`, out `src/db/migrations`.
  - Columnas camelCase con `text()`/`integer()` sin nombre (BD en snake_case).
  - IDs: `text().primaryKey().$defaultFn(() => crypto.randomUUID())`. Timestamps: `integer({mode:'timestamp_ms'})`.
  - Índices `<table>_<col>_idx` (ver `schema/notification-channels.ts:31`).
- Generar: `pnpm db:generate` (drizzle-kit). Nombres `NNNN_snake_name.sql`; la última es `0007_odometer_reminder_optional.sql` → la siguiente `0008_...`. Cada una añade `meta/NNNN_snapshot.json` y entrada en `meta/_journal.json`.
- Aplicar: `runMigrations(db)` en `apps/api/src/db/client.ts:24` (arranque `server.ts:10`, CLI de jobs `jobs/cli.ts:32`, tests `test/helpers.ts:23`, manual `pnpm db:migrate`).
- `user_settings` (`apps/api/src/db/schema/settings.ts:5-21`): `userId` PK/FK cascade; currency, units, locale, timezone, `odometerReminderWeekday`, `reminderHour`. Se crea al registrarse (`apps/api/src/auth.ts:31-43`) o upsert perezoso (`modules/settings/service.ts`). DTO `userSettingsSchema` (`packages/shared/src/schemas/settings.ts`) se construye quitando `userId` → una columna nueva se filtraría a GET /settings.
- **Recomendación:** tabla nueva `calendar_feeds` (`userId` PK/FK cascade, `tokenHash` con índice único, `createdAt`) en `schema/calendar.ts`. Lookup por hash; el secreto no entra en el DTO de settings; «desactivado» = sin fila.
- `notification_channels` guarda tokens de bots en claro (comentario L18): no copiar ese patrón.

## 2. Hashing/tokens existentes
- No hay `timingSafeEqual` ni `randomBytes` en `apps/api/src`.
- Solo `createHash('sha256')` para contenido de ficheros en `apps/api/src/modules/attachments/service.ts:1,90`. IDs con `crypto.randomUUID()`.
- Admin usa sesión + rol (`app.requireAdmin`, `modules/admin/routes.ts:18`).
- Generación, hash y comparación en tiempo constante son código nuevo (`node:crypto`).

## 3. Módulos Fastify, auth, rate limit, respuestas no JSON
- Layout `modules/<name>/{repository.ts, service.ts, routes.ts}`; factorías `createXRepository(db)`, `createXService({repo,...})`, `export type X = ReturnType<...>`. Rutas `FastifyPluginAsyncZod<{ service }>` con Zod de `@ikrive/shared`. Ejemplos: `modules/settings/routes.ts:6-21`, `modules/schedules/routes.ts`.
- Composición en `apps/api/src/app.ts:158-213`; todo bajo un plugin `{ prefix: '/api' }` (L198-213).
- Auth: `plugins/auth.ts` decora `app.authenticate` y `app.requireAdmin`; `currentUser(request)` (L253-271). Se aplica por módulo con `app.addHook('preHandler', app.authenticate)` (`settings/routes.ts:10`). Errores de `lib/errors.ts` (`UnauthorizedError`, `NotFoundError`…) renderizados como `application/problem+json` por `plugins/errors.ts`.
- Sin auth: no hay hook global; un módulo sin hook es público (`modules/health/routes.ts`, `modules/client-config/routes.ts`). El GET del feed va en un plugin encapsulado sin hook; las rutas de gestión (estado/activar/regenerar/desactivar) en otro con hook (o `preHandler` por ruta).
- Rate limit: `app.ts:146-152`, `@fastify/rate-limit` global `max: 300, timeWindow: '1 minute'`, `allowList: (req) => !isApiRequest(req.url)` (L231) → `/api/calendar/...` ya limitado. Límite más estricto por ruta con `config: { rateLimit: {...} }`. Tests `apps/api/test/rate-limit.test.ts`. Rate limit de Better Auth solo en producción (`auth.ts:30`).
- Respuestas no JSON: `modules/attachments/routes.ts:103-118` (`reply.type(...).header('content-disposition'|'cache-control'|'x-content-type-options'|'content-security-policy', ...).send(buffer)`), `modules/vehicles/routes.ts:57`. Para el feed: `reply.type('text/calendar; charset=utf-8').header('cache-control', 'private, no-store').send(ics)` sin schema de respuesta.
- Ojo: el parámetro `:token.ics`. Fastify admite `/calendar/:token.ics` (corta el param antes del punto), pero hay que verificarlo con un test.
- Helmet global (`app.ts:140`), compatible con text/calendar.

## 4. Próximo vencimiento en servidor y «vehículo activo»
- `computeScheduleDue(rule, readings, today)` en `packages/shared/src/domain/schedules.ts:71` → `{ nextDueDate, nextDueDateEstimated, nextDueOdometer, status }` (interfaz L57-65; `ScheduleRule` L48-55).
- Por petición: `modules/schedules/service.ts:22-34` (toDto) y `:52-55` (`today = todayIn(settings.get(userId).timezone)` de `lib/dates.ts:2`; `readings = vehicles.listReadings(vehicleId)`).
- En bloque: `apps/api/src/jobs/reminders.job.ts:61-90` usa `schedules.listForActiveVehicles()` (`modules/schedules/repository.ts:24-41`, todas las reglas de todos los usuarios con nombre/marca/modelo del vehículo y timezone/reminderHour del dueño; haría falta una variante filtrada por `ownerId`) y `vehicles.listRecentReadingsByVehicles(ids, since)` (`modules/vehicles/repository.ts:84+`).
- Activo: `activeVehicleFilter = and(isNull(vehicles.soldAt), isNull(vehicles.archivedAt))` en `modules/vehicles/repository.ts:12-13` (exportado); `listByOwner(ownerId, 'active')` L23. Columnas `soldAt` (texto fecha) y `archivedAt` (timestamp_ms) en `schema/vehicles.ts`.

## 5. Ajustes en web y cliente API
- Página `apps/web/src/routes/_app/settings.tsx` (`createFileRoute('/_app/settings')`). Loader precarga `settingsQuery` y `notificationChannelsQuery` con `ensureQueryData` (L32-39). Secciones `Card`: Preferencias (L63), `<Suspense><NotificationChannelsSection/></Suspense>` (L159-161), Apariencia (L162).
- Para añadir sección (patrón notification-channels): `apps/web/src/features/<feature>/queries.ts` (queryOptions + mutaciones) y `<feature>-section.tsx`; query en el loader; render dentro de `<Suspense>`; clave en `apps/web/src/lib/query-keys.ts`; textos en `apps/web/src/i18n/locales/{en,es}.json`.
- Modelos: `apps/web/src/features/notification-channels/queries.ts` (`useChannelMutation` invalida al terminar) y `channels-section.tsx`.
- No hay uso previo de portapapeles.
- Cliente `apps/web/src/lib/api-client.ts`: `api.get/post/patch/put/delete<T>(path)`, prefija `/api`, `credentials: 'include'`, lanza `ApiError(problem)`, undefined en 204.
- DTOs en `packages/shared/src/schemas/*.ts`, exportados en `index.ts`.
- Tests web: `apps/web/src/features/settings/settings-page.test.tsx` usa `mockApi({'GET /settings': {body}, ...})` de `@/test/render` y renderiza el `routeTree` → añadir allí el GET nuevo. Ejemplo de sección: `features/notification-channels/channels-section.test.tsx`.

## 6. Tests de integración de la API
- `apps/api/test/helpers.ts`: `createTestApp(env?, {fetch?})` (BASE_URL `http://localhost:3000`, BD en memoria con migraciones, DATA_DIR temporal; devuelve `{app, db, dataDir}`, L11-27); `signUp(app, email?, name?)` → `{response, cookie}` para `headers: { cookie }` en `app.inject` (L32-41); `createTestDispatcher` para jobs.
- Ejemplos: `apps/api/test/settings.test.ts`; más completos `schedules.test.ts`, `vehicles.test.ts`, `rate-limit.test.ts`, `admin-jobs.test.ts`. Vitest (`apps/api/vitest.config.ts`).
