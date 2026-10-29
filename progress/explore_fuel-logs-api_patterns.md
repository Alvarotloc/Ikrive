# Explore: patrones de fuel-logs-api

Rutas relativas a la raíz del repo.

## 1. Cómo maintenance gestiona su lectura de odómetro (`source: 'maintenance'`)
- **Columnas de enlace**, en `apps/api/src/db/schema/maintenance.ts`:
  - L52: `odometer: integer()` (nullable).
  - L54: `odometerReadingId: text().references(() => odometerReadings.id, { onDelete: 'set null' })`.
  - L74: `uniqueIndex('maintenance_records_odometer_reading_id_idx').on(t.odometerReadingId)`.
  - `toDto` (service.ts L31-34) quita `odometerReadingId` de la respuesta.
- **Transacciones**, en `apps/api/src/modules/maintenance/repository.ts` (síncronas, better-sqlite3):
  - Tipo `ReadingChange = {kind:'keep'} | {kind:'remove'} | {kind:'upsert', date, value}` (L22).
  - `create` (L63-84): dentro de `db.transaction` inserta la lectura `source:'maintenance'` y después el registro con su `odometerReadingId`.
  - `update` (L89-126):
    - `upsert`: actualiza la lectura existente o inserta una nueva.
    - `remove`: pone el FK a null, actualiza el registro y borra la lectura antigua.
  - `delete` (L131-141): borra los attachments, luego el registro y luego la lectura, en la misma transacción.
- **Validación en el servicio**, en `apps/api/src/modules/maintenance/service.ts`:
  - `validate` (L60-77):
    - Una fecha futura (`todayIn(timezone)`) da 400 `BadRequestError`.
    - `findOdometerConflict(others, {date, value})` se aplica sobre las lecturas excluyendo la propia.
    - Si hay conflicto: `ConflictError("The odometer cannot go backwards: there is a reading of ${value} on ${date}")`.
  - `update` (L121-141): fusiona lo existente con la entrada; `upsert` si cambian la fecha o los km, y `keep` si no.
- **`findOdometerConflict`**: `packages/shared/src/domain/odometer.ts` L14-25.
- **409 problem+json**: `apps/api/src/lib/errors.ts` (`ConflictError`, `NotFoundError`, `BadRequestError`) y `apps/api/src/plugins/errors.ts` L27-32.

## 2. DELETE /api/vehicles/:id/odometer/:readingId
- Servicio: `apps/api/src/modules/vehicles/service.ts` L137-145. Si `reading.source !== 'manual'`, responde 409 «This reading belongs to another record; edit or delete that record instead». Las lecturas `'fuel'` quedan protegidas sin tocar nada.
- `ODOMETER_SOURCES` ya incluye `'fuel'` (`packages/shared/src/enums.ts` L48).
- Web: `odometer-timeline.tsx` L43 solo muestra el botón de borrar si `source === 'manual'`.
- Hueco: no hay ningún test del 409 al borrar una lectura que no es manual.

## 3. Estructura del módulo
- Archivos: `apps/api/src/modules/maintenance/{routes,service,repository}.ts` y el schema `apps/api/src/db/schema/maintenance.ts`, reexportado en `schema/index.ts`.
- Convenciones del schema:
  - `id()` con `randomUUID`.
  - `createdAt`/`updatedAt` en `timestamp_ms`.
  - Fechas como texto `YYYY-MM-DD`.
  - FK `vehicleId` con `onDelete: 'cascade'` e índice `(vehicleId, date)`.
- Repository: factoría `createXRepository(db)` con `listByVehicle` (orden `desc(date), desc(createdAt)`), `find`, `create`, `update` y `delete`.
- Service: `requireVehicle` usa `vehicles.findOwned`; si no hay resultado, `NotFoundError('Vehicle not found')`.
- Routes: `FastifyPluginAsyncZod`, `preHandler` con `app.authenticate` y schemas de `@ikrive/shared`. Códigos: POST 201, PATCH 200, DELETE 204.
- Se registra en `apps/api/src/app.ts`: composition root en L82-127 y rutas en L129-145, bajo `/api`.
- Zod shared: `packages/shared/src/schemas/maintenance.ts`.
  - Patrón `fieldsSchema` → create; update con `.partial()`; DTO; params.
  - Helpers en `schemas/common.ts`: `optionalText`, `odometerValueSchema` (int 0..9_999_999), `moneySchema` e `idParamSchema`. `isoDateSchema` está en `schemas/vehicles.ts`.
  - Tests del schema en `maintenance.test.ts`.
- Migraciones: `pnpm db:generate` (drizzle-kit, `casing: 'snake_case'`). La última es `0008_calendar_feeds`; la siguiente, `0009_fuel_logs`.

## 4. Dinero, cantidades y unidades
- El dinero es decimal `real()`, no en céntimos: `maintenance.cost` y `vehicles.purchasePrice`.
  - `moneySchema = z.number().min(0).max(1_000_000_000)`.
  - Las sumas se redondean a 2 decimales en el servicio y en SQL se usa `total(cost)`.
- El odómetro es `integer`, en la unidad del usuario. No hay precedente de cantidades decimales; para los litros lo coherente sería `real()` con `z.number().positive()`.
- Unidades:
  - `DISTANCE_UNITS = ['km','mi']` y `VOLUME_UNITS = ['l','gal']` (enums.ts).
  - `user_settings.volumeUnit`.
- `FUEL_TYPES` incluye `electric` y `plugin_hybrid`. **No existe ninguna unidad kWh**: el spec debe decidir qué hacer con los eléctricos.

## 5. Tests de integración
- Archivo: `apps/api/test/maintenance.test.ts`. Helpers: `createTestApp` y `signUp` en `apps/api/test/helpers.ts`; `setup`, `createVehicle` y `client` son locales del archivo.
- Casos que conviene replicar: CRUD, validación problem+json, lectura creada con source, actualización de la lectura enlazada, ignorar la propia lectura al editar, 409 en create y edit sin efectos secundarios, fecha futura → 400, borrar el registro borra la lectura e intruso → 404.
- Caso nuevo: `DELETE /odometer/:readingId` sobre una lectura 'fuel' debe devolver 409.
