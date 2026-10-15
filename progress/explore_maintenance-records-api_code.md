# Exploración: maintenance-records-api (código existente)

## 1. Esquema Drizzle y migraciones
- Esquemas en `apps/api/src/db/schema/{auth,settings,vehicles}.ts`, reexportados en `schema/index.ts` (añadir `maintenance.ts`).
- `id = () => text().primaryKey().$defaultFn(() => crypto.randomUUID())` local en `vehicles.ts:5-8` (no exportado).
- `casing: 'snake_case'` en `drizzle.config.ts` y `db/client.ts:18`; claves camelCase.
- Timestamps: `createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date())`; `updatedAt` + `.$onUpdateFn`.
- Fechas sin hora: `text()` `YYYY-MM-DD`. Enums: `text({ enum: CONST })`. Dinero: `real()` decimal (no céntimos).
- Propiedad: solo `vehicles.ownerId` (FK user, cascade); hijos con `vehicleId` FK cascade.
- Índices en el 3er argumento: `index('odometer_readings_vehicle_id_date_idx').on(t.vehicleId, t.date)`.
- Migraciones: `pnpm --filter api db:generate` → `apps/api/src/db/migrations/` (`0000_init`, `0001_vehicles`); `runMigrations()` en `db/client.ts:25`.
- `odometer_readings` (`vehicles.ts:46-61`): id, vehicleId, date (text), value (int), source (enum default 'manual'), createdAt. `ODOMETER_SOURCES = ['manual','maintenance','fuel']`. **No hay columna de enlace** al registro origen: el spec debe añadirla (`maintenance_records.odometerReadingId` o `sourceId` en readings).

## 2. findOdometerConflict
- `packages/shared/src/domain/odometer.ts` (+ `odometer.test.ts`): `findOdometerConflict(readings, {date,value}): T | null`. Conflicto = fecha anterior con valor mayor o fecha posterior con valor menor; mismo día nunca. **No excluye la lectura editada**: filtrarla antes.
- Uso en `modules/vehicles/service.ts:120-130` (`addReading`): fecha futura → `BadRequestError` 400 (hoy = `todayIn(settings.timezone)`, `lib/dates.ts`); conflicto → `ConflictError` 409 con detalle.
- `removeReading` (132-140): 409 si `source !== 'manual'`.
- problem+json (`plugins/errors.ts`): `{ type:'about:blank', title, status, detail }`; zod → 400 `{ title:'Validation failed', errors }`. `problemSchema` en `shared/src/schemas/common.ts`.

## 3. Capas
- routes → service → repository (`modules/vehicles/`), cableado en `app.ts:50-64`, prefijo `/api`.
- Routes: `FastifyPluginAsyncZod`, `preHandler app.authenticate`, `currentUser(request).id`, esquemas de `@ikrive/shared`, 201 en altas.
- Repo: `createVehiclesRepository(db)`, sync `.all()/.get()/.run()`; tx síncrona `db.transaction((tx)=>…)` (`repository.ts:36-44`). `foreign_keys = ON`.
- 404 de propiedad: `requireOwned` (`service.ts:54-58`) → `NotFoundError('Vehicle not found')`; hijos por vehicleId.
- DTO en el service (`toISOString`, sin ownerId). Errores en `lib/errors.ts`.

## 4. packages/shared
- `schemas/vehicles.ts`, `schemas/common.ts`, `schemas/settings.ts`, exportados en `src/index.ts`.
- `MAINTENANCE_CATEGORIES` ya existe en `enums.ts`: oil_change, tires, brakes, inspection, repair, filters, battery, other.
- Helpers en `vehicles.ts`: `isoDateSchema` (exportado); `optionalText(max)`, `odometerValueSchema`, `moneySchema` **no exportados**.
- Moneda: ajuste por usuario `user_settings.currency`. Updates con `.partial()`; se exportan `z.infer` y `z.input`.

## 5. Tests
- `apps/api/test/helpers.ts`: `createTestApp()` → `{ app, db, dataDir }`; `signUp(app)` → `{ cookie }`; `app.inject`.
- Ejemplo: `vehicles.test.ts` (monotonía línea 120, autorización línea 190). Vitest.

## 6. docs/PLAN.md
- L120-122: odómetro fuente única; solo lecturas `manual` se borran directamente.
- L126: maintenance_records incluye `schedule_id?` (fase 4) e `include_in_report`; al crearlo se genera lectura.
- L150-157: Fase 3 (lectura `source:'maintenance'` validada con `findOdometerConflict`, facturas, gasto, timeline).
