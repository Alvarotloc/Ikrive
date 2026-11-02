# Explore: report-shares-api — patrones existentes

Rutas relativas a la raíz del repo.

## 1. calendar_feeds (esquema de token a copiar)
- **Schema:** `apps/api/src/db/schema/calendar.ts:8-22`: `userId` (PK, FK user, cascade), `selector`, `verifierHash` (hex SHA-256), `createdAt` (`integer({ mode: 'timestamp_ms' })` + `$defaultFn`). `uniqueIndex('calendar_feeds_selector_idx')`. Exportado desde `apps/api/src/db/schema/index.ts`.
- **Helpers de token (genéricos, reutilizables):** `apps/api/src/lib/tokens.ts`
  - `generateFeedToken(): {token, selector, verifier}`: selector de 8 bytes + verificador de 32 bytes, token = 80 hex sin separador.
  - `parseFeedToken(token)` → `{selector, verifier} | null` (regex `^[0-9a-f]{80}$`).
  - `hashVerifier(verifier)` → hex SHA-256.
  - `verifierMatches(verifier, hash)` → `crypto.timingSafeEqual`, false si difiere la longitud, nunca lanza. Import por defecto de `crypto` a propósito para poder espiarlo en tests.
  - Tests unitarios: `apps/api/test/calendar-tokens.test.ts`.
- **Verificación:** `apps/api/src/modules/calendar/service.ts:109-116` (`requireOwner`). Mismo 404 para cualquier fallo:
  ```ts
  const parsed = parseFeedToken(token);
  const row = parsed && repo.findBySelector(parsed.selector);
  if (!parsed || !row || !verifierMatches(parsed.verifier, row.verifierHash)) throw new NotFoundError('Calendar feed not found');
  ```
- **URL:** `service.ts:133`, `new URL(`/api/calendar/${token}.ics`, baseUrl).href`; `baseUrl` se inyecta como dependencia del servicio.
- **Repositorio:** `apps/api/src/modules/calendar/repository.ts` (`find`, `findBySelector`, `upsert`, `delete`; factoría con `db`).
- **Rutas:** `apps/api/src/modules/calendar/routes.ts`, dos plugins:
  - `calendarFeedSettingsRoutes` (12-30): `app.addHook('preHandler', app.authenticate)`, `currentUser(request).id`, DELETE → 204.
  - `calendarFeedRoutes` (36-53): público; se salta la auth por ser un plugin aparte sin hook. `schema: { params: z.object({ file: z.string() }) }`, `.type('text/calendar; charset=utf-8').header('cache-control', 'private, no-store')`.
  - La ruta pública **no tiene rate limit propio** (solo el global de 300/min).
- **Registro:** `apps/api/src/app.ts:134-140` (servicio con `baseUrl: config.BASE_URL`), `161-162` (`api.register(...)` dentro del prefijo `/api`).
- **Schemas zod compartidos:** `packages/shared/src/schemas/calendar.ts`: `calendarFeedSchema` `{enabled, createdAt nullable}`; `calendarFeedSecretSchema` añade `url: z.url()` (solo al crear o regenerar).
- **Tests de integración:** `apps/api/test/calendar.test.ts`: `setup()` = `createTestApp()` + `signUp(app)` → `{app, db, cookie}`; `app.inject({ method, url, headers: { cookie } })`; la URL pública se pide con `new URL(url).pathname` sin cookie. Casos: solo se guarda el hash (90-105), 401 sin sesión (120-127), 200 público con content-type y cache-control (131-141), 404 para token desconocido, regenerado, desactivado o malformado (290-320).
- **Helpers de test:** `apps/api/test/helpers.ts`: `createTestApp(env?, {fetch, logStream}?)` (BASE_URL `http://localhost:3000`, `:memory:` + `runMigrations`), `signUp(app, email?, name?)` → `{response, cookie}`, `TEST_BASE_URL`.

## 2. PDF del informe de venta
- **Ruta:** `apps/api/src/modules/reports/routes.ts:10-34`, `GET /api/vehicles/:id/report.pdf`, autenticada, `schema: { params: idParamSchema, querystring: saleReportQuerySchema }`, `config: { rateLimit: { max: 10, timeWindow: '1 minute' } }`. Respuesta: `.type('application/pdf')`, `contentDisposition(fileName, 'attachment')`, `cache-control: private, no-store`, `x-content-type-options: nosniff`.
- `contentDisposition(filename, 'attachment' | 'inline')` en `apps/api/src/lib/http.ts`: usar `'inline'` para el enlace público.
- **Opciones:** `packages/shared/src/schemas/reports.ts:11-18`: `saleReportQuerySchema` con flags `z.stringbool` (`hidePrices`, `hidePlate`, `hideVin`, `includeInvoices`), `SaleReportOptions = z.output<...>`. Son booleanos de query string, así que el body del share necesita su propio schema booleano.
- **Generador:** `apps/api/src/modules/reports/service.ts`: `createReportsService({ vehicles, maintenance, settings, attachments, storage, maxAnnexBytes })` (18-35), conectado en `app.ts:121-128`. Firma: `generate(ownerId, vehicleId, options: SaleReportOptions, log): Promise<{ fileName, pdf: Buffer }>`. Usa `vehicles.findOwned(ownerId, vehicleId)` (404) y `settings.get(ownerId)`; locale, moneda, unidades y zona horaria salen de los ajustes del propietario (no hay parámetro de locale). Un share puede llamar a `generate(ownerId, share.vehicleId, opts, request.log)`.
- Dominio: `buildSaleReport` en `packages/shared/src/domain/sale-report.ts:330`; renderer en `apps/api/src/modules/reports/pdf/`.
- **Paquete shared:** `packages/shared/src/schemas/*.ts` (+ `*.test.ts` junto a cada uno), re-exportados desde `packages/shared/src/index.ts`. `idParamSchema` en `schemas/common.ts:20`.
- **Tests:** `apps/api/test/reports.test.ts`: helpers `reportUrl`, `createVehicle`, `seed`; otro usuario → 404 (199-213), 401 (215-221), 400 con opciones inválidas (223-236), rate limit (249-259: 10 × 200 y luego 429).

## 3. Propiedad del vehículo → 404
- `apps/api/src/modules/vehicles/repository.ts:31-37` `findOwned(ownerId, id)`.
- Patrón: `if (!vehicles.findOwned(userId, vehicleId)) throw new NotFoundError('Vehicle not found');` (p. ej. `apps/api/src/modules/fuel-logs/service.ts:42`).
- Errores: `apps/api/src/lib/errors.ts`, renderizados como problem+json en `apps/api/src/plugins/errors.ts`.
- Auth: `apps/api/src/plugins/auth.ts` (`app.authenticate` línea 28, `currentUser(request)` línea 20).
- Los vehículos tienen `archivedAt` (`apps/api/src/db/schema/vehicles.ts:34`): hay que decidir si un enlace de un vehículo archivado sigue funcionando.

## 4. Migraciones y BASE_URL
- `apps/api/drizzle.config.ts`: sqlite, `schema: './src/db/schema/index.ts'`, `out: './src/db/migrations'`, `casing: 'snake_case'`.
- `pnpm db:generate` (drizzle-kit generate). Última migración: `0009_fuel_logs.sql`, así que la siguiente es la 0010.
- `apps/api/src/config.ts:14`: `BASE_URL: z.url().default('http://localhost:3000')`, inyectado en los servicios como `baseUrl`.

## 5. Rate limiting
- Global: `apps/api/src/app.ts:77-83`, `@fastify/rate-limit` 300/min, solo `/api/*` (`isApiRequest`, línea 193), `trustProxy: true` (línea 64).
- Por ruta: `config: { rateLimit: { max: N, timeWindow: '1 minute' } }`.
- Tests: `apps/api/test/rate-limit.test.ts`; ejemplo por ruta en `reports.test.ts:249-259`.
- La ruta pública del PDF debe declarar su propio límite bajo (la del calendario no tiene).
