# Exploración #87 vehicle-expenses-api — patrón de API y estadísticas de coste

> Informe de un agente `Explore` (solo lectura), guardado por el leader.

Lo más importante:
- El backlog ya tiene la feature `vehicle-expenses-api` (fase 9, status pending), con unos criterios de aceptación más amplios que un CRUD.
- No hay ningún modelo de datos definido para los gastos. Lo tiene que fijar el spec.
- Los importes se guardan como decimales (`real`) en la moneda del usuario, no en céntimos. Las fechas son texto `YYYY-MM-DD`.
- Los gastos **no** van a subir las líneas de odómetro, porque no tienen `odometer`. El patrón más cercano es `maintenance_records` con un `odometer` nullable, o directamente sin ese campo y sin la lectura vinculada.

## 1. Patrón a copiar, de punta a punta

**Schema Drizzle.** Está en `packages/db/src/schema/` y lo comparten la API y el modo local del móvil.
- Ejemplo: `packages/db/src/schema/fuel.ts`.
- Hay que reexportarlo en `packages/db/src/schema/index.ts` (`export * from './fuel'`).
- La API lo reexporta en `apps/api/src/db/schema.ts` (`export * from '@ikrive/db/schema'`).

Patrón de la tabla:
```ts
const id = () => text().primaryKey().$defaultFn(() => crypto.randomUUID());
export const fuelLogs = sqliteTable('fuel_logs', {
  id: id(),
  vehicleId: text().notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  /** Date-only, `YYYY-MM-DD`. */
  date: text().notNull(),
  ...
  /** Decimal amount in the user's currency, 2 decimals when computed. */
  totalPrice: real().notNull(),
  createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, (t) => [index('fuel_logs_vehicle_id_date_idx').on(t.vehicleId, t.date), ...]);
```
Las columnas de categoría son `text().notNull()`. El enum se valida en zod, no en la base de datos.

**Migraciones.**
- Se generan con `pnpm db:generate` (drizzle-kit). La config está en `packages/db/drizzle.config.ts`: `dialect: 'sqlite'`, `casing: 'snake_case'`, `out: './migrations'`.
- Se nombran `NNNN_<tag>.sql` en `packages/db/migrations/`, con su snapshot en `meta/NNNN_snapshot.json` y una entrada en `meta/_journal.json`.
- La última es `0012_data_imports`, así que la siguiente sería `0013_vehicle_expenses` (o el tag que se elija).
- Ejemplo de referencia: `0009_fuel_logs.sql`.
- Se aplican solas al arrancar el servidor (`apps/api/src/db/migrate.ts` y `runMigrations`) y en el móvil (`apps/web/src/lib/data-source/local/migrations.ts`, empaquetadas con Vite).
- Lo explican `docs/PLAN.md` (Convenciones) y `CONTRIBUTING.md:29-30`.

**Módulo de rutas Fastify.** `apps/api/src/modules/fuel-logs/routes.ts`.
- Es un `FastifyPluginAsyncZod<{ service }>` con `app.addHook('preHandler', app.authenticate)`.
- Rutas: `GET/POST /vehicles/:id/fuel-logs` y `GET/PATCH/DELETE /vehicles/:id/fuel-logs/:logId`.
- Los schemas de params son `idParamSchema` y `fuelLogParamsSchema` (`{id, logId}`).
- Las respuestas son `fuelLogSchema` / `z.array(...)`. POST devuelve 201 y DELETE 204.
- Se registra en `apps/api/src/app.ts`. La composición repo → service se hace hacia las líneas 109-150 y el registro con `api.register(fuelLogsRoutes, { service: fuelLogsService })` hacia la línea 229.
- `statsService` recibe los repos (líneas 143-147), así que habrá que pasarle también el repo de gastos.

**Servicio.** `apps/api/src/modules/fuel-logs/service.ts`.
- `toDto` quita los campos internos y convierte `createdAt`/`updatedAt` con `.toISOString()`.
- El 404 de propiedad se resuelve así:
```ts
/** Ownership check: other users' vehicles are reported as missing so their ids are not disclosed. */
const requireVehicle = (userId, vehicleId) => {
  if (!vehicles.findOwned(userId, vehicleId)) throw new NotFoundError('Vehicle not found');
};
const requireLog = (userId, vehicleId, logId) => {
  requireVehicle(userId, vehicleId);
  const log = repo.find(vehicleId, logId);   // WHERE id = ? AND vehicle_id = ?
  if (!log) throw new NotFoundError('Fuel log not found');
  return log;
};
```
- `vehicles.findOwned` está en `apps/api/src/modules/vehicles/repository.ts:39` y filtra por `id` + `ownerId`.
- Los errores están en `apps/api/src/lib/errors.ts` (`NotFoundError`, `BadRequestError`, `ConflictError`) y se serializan como RFC 7807 `application/problem+json`.
- La fecha futura se rechaza con `todayIn(settings.get(userId).timezone)`, dentro de la validación de odómetro.
- Para gastos haría falta otra comprobación de "no en el futuro", si se decide tenerla, porque no habrá odómetro.

**Repositorio.** `apps/api/src/modules/fuel-logs/repository.ts`.
- Expone `listByVehicle`, ordenado por `desc(date), desc(odometer), desc(createdAt)`, además de `find(vehicleId, id)`, `create`, `update` y `delete`.
- Escribe en transacción junto con la lectura de odómetro. Los gastos no necesitarían transacción.
- Tipos: `typeof fuelLogs.$inferSelect` y `$inferInsert`.
- El repo de mantenimiento tiene además `sumCost(vehicleId)`, que usa el endpoint `GET /vehicles/:id/maintenance/spending` (`apps/api/src/modules/maintenance/service.ts:100`, con `roundMoney`).

**Validación zod compartida.** `packages/shared/src/schemas/fuel-logs.ts`, con su test `fuel-logs.test.ts`, y `maintenance.ts`, que es el modelo más parecido porque tiene categoría, coste y texto opcional.
- Se exporta desde `packages/shared/src/index.ts`.
- El patrón es `fieldsSchema`, del que salen `createXSchema`, `updateXSchema = fields.extend({flags sin default}).partial()`, `xSchema` (respuesta, con `createdAt: z.iso.datetime()`) y `xParamsSchema`.
- Piezas comunes en `packages/shared/src/schemas/common.ts`:
```ts
export const moneySchema = z.number().min(0).max(1_000_000_000);   // "Decimal amount in the user's currency."
export const optionalText = (max, {upperCase}={}) => z.string().trim().max(max).transform(v => ... || null).nullable().optional();
export const idParamSchema = z.object({ id: z.string().min(1) });
```
- `isoDateSchema = z.iso.date()` está en `packages/shared/src/schemas/vehicles.ts:6`.
- Los enums van en `packages/shared/src/enums.ts`. Ejemplo:
```ts
export const MAINTENANCE_CATEGORIES = ['oil_change','tires','brakes','inspection','repair','filters','battery','other'] as const;
export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number];
```
  Habría que añadir algo como `EXPENSE_CATEGORIES = ['insurance','tax','tolls','parking','fines','other']`.

**Tests de API.**
- Helpers en `apps/api/test/helpers.ts`:
  - `createTestApp()` monta una base SQLite `:memory:`, aplica `runMigrations`, crea un `DATA_DIR` temporal y llama a `buildApp`. Devuelve `{ app, db, dataDir }`.
  - `signUp(app, email?, name?)` devuelve `{ response, cookie }`.
- Estructura de `apps/api/test/fuel-logs.test.ts`:
  - Funciones locales `setup()`, `createVehicle(app, cookie)` (POST `/api/vehicles` con `{make:'Seat', model:'León'}`) y `client(app, cookie, vehicleId)`, que agrupa list/create/get/patch/remove con `app.inject`.
  - Casos: CRUD completo (comprueba la respuesta con `toEqual` y la fila con `db.select().from(fuelLogs)`), validación del payload, fecha futura, borrado en cascada con el vehículo, y "hides other users' vehicles and fuel logs".
- El test de aislamiento recorre todos los métodos con la cookie del intruso:
```ts
expect(response.statusCode).toBe(404);
expect(response.headers['content-type']).toContain('application/problem+json');
expect(response.json().detail).toBe('Vehicle not found');
```
  Después prueba un id de registro de otro vehículo (del mismo usuario o de otro) y espera 404 con `'Fuel log not found'`.

## 2. Estadísticas de coste

**Fórmulas puras.** `packages/shared/src/domain/stats.ts`.

Entradas:
```ts
export interface StatsFuelLog { date; odometer; quantity; totalPrice; fullTank; missedPrevious }
export interface StatsMaintenanceRecord { date: string; category: MaintenanceCategory; cost: number | null }
export interface VehicleStatsInput {
  purchasePrice: number | null;
  readings: readonly OdometerPoint[];
  fuelLogs: readonly StatsFuelLog[];
  maintenance: readonly StatsMaintenanceRecord[];
}
```

Funciones:
- `roundMoney` (2 decimales) y `ratio`, que devuelve null si el denominador es ≤ 0 o el resultado no es finito.
- `distanceDriven(readings)`.
- `costPerDistance(total, distance)`, redondeado a 3 decimales.
- `spendingByCategory(records)`, solo de mantenimiento, ordenado por total descendente.
- `spendingByMonth(logs, records)`, que devuelve `{month, fuel, maintenance}` y rellena con 0 los meses intermedios.
- `computeVehicleStats(input)`. Su núcleo:
```ts
const fuel = sum(fuelLogs.map((log) => log.totalPrice));
const maintenanceCost = sum(withCost(maintenance).map((record) => record.cost));
costPerDistance: { fuel: costPerDistance(fuel, driven), maintenance: costPerDistance(maintenanceCost, driven) },
spending: { purchase, fuel: roundMoney(fuel), maintenance: roundMoney(maintenanceCost),
  total: roundMoney((purchasePrice ?? 0) + fuel + maintenanceCost),
  byCategory: spendingByCategory(maintenance) },
series: { ..., spendingByMonth: spendingByMonth(fuelLogs, maintenance) }
```

**Schema de respuesta.** `packages/shared/src/schemas/stats.ts` (`vehicleStatsSchema`).
- `costPerDistance: {fuel, maintenance}`.
- `spending: {purchase, fuel, maintenance, total /* purchase + fuel + maintenance */, byCategory: [{category: z.enum(MAINTENANCE_CATEGORIES), total}]}`.
- `series.spendingByMonth: [{month, fuel, maintenance}]`.

**Endpoint.**
- `apps/api/src/modules/stats/routes.ts` expone `GET /vehicles/:id/stats`.
- `apps/api/src/modules/stats/service.ts` comprueba `findOwned` (404 'Vehicle not found'), mapea filas de los repos a las entradas puras y llama a `computeVehicleStats`. Los fuel logs se pasan con `.reverse()`.
- El DataSource local hace exactamente lo mismo en `apps/web/src/lib/data-source/local/stats.ts`, y también habrá que tocarlo.

**Cómo añadir los gastos.**
1. Añadir `expenses: readonly StatsExpense[]` (`{date, category: ExpenseCategory, amount}`) a `VehicleStatsInput`.
2. Sumar los gastos a `total` y añadir `spending.expenses`.
3. Añadir `costPerDistance.expenses`, y quizá `costPerDistance.total`. La feature pide que el coste por km los incluya.
4. Decidir si `byCategory` mezcla categorías de mantenimiento y de gastos. Afecta al enum de `vehicleStatsSchema` y a la web en `vehicle-expenses-web`.
5. Añadir `expenses` a `spendingByMonth`.
6. Actualizar los dos llamadores (el servicio de la API y `local/stats.ts`) y `createStatsService` en `app.ts`.

**Tests existentes.**
- Unitarios: `packages/shared/src/domain/stats.test.ts`.
  - Builders `refuel(...)` y `maintenance(date, category, cost)`.
  - Bloques `distance`, `consumption`, `costs` y `computeVehicleStats`. El bloque `costs` cubre coste por distancia, null sin distancia, coste total de propiedad, desglose por categoría y gasto por mes. El de `computeVehicleStats` comprueba "never returns NaN or Infinity".
- De API: `apps/api/test/stats.test.ts`, con stats con datos, stats vacíos, 404 de vehículos ajenos y conservación de las unidades guardadas.

## 3. Importes, moneda y fechas en fuel_logs

- **Importes:** decimales (`real`), sin céntimos enteros, en la moneda del usuario.
  - No se guarda moneda por registro: es `user_settings.currency` (`z.string().length(3)`, 'EUR' por defecto, en `packages/shared/src/schemas/settings.ts`).
  - La validación usa `moneySchema` (0 a 1e9) y `.positive()` en el precio del repostaje.
  - Al calcular se redondea a 2 decimales con `roundMoney` (3 en precio por unidad y en coste por distancia), y el comentario del redondeo dice "so float sums (10.1 + 20.2) do not leak".
- **Fechas:**
  - `date` es texto `YYYY-MM-DD` (`isoDateSchema = z.iso.date()`).
  - `createdAt`/`updatedAt` se guardan como `integer timestamp_ms` y la API los devuelve en ISO datetime.
  - Decisión de `docs/PLAN.md`: «Fechas sin hora (compra, venta, lecturas) como texto `YYYY-MM-DD`; se formatean en UTC para que el día no se desplace. «Hoy» se calcula con la zona horaria del usuario.»
- **Mismo criterio en el export:** `packages/shared/src/schemas/data-export.ts` usa `moneySchema` e `isoDateSchema`.

## 4. Qué dicen `docs/PLAN.md` y el backlog

`docs/PLAN.md` no define tabla ni columnas para los gastos. La sección «Modelo de datos (SQLite)» no menciona expenses. Lo que sí dice, en «Fase 9: adopción y gastos reales»:
> Objetivo: que quien viene de otra app traiga su historial, que el coste total refleje lo que cuesta de verdad el vehículo y que Ikrive encaje en un homelab con login único. Cierra con la release v0.4.0.
> - **Otros gastos:** seguro, impuesto de circulación, peajes, parking, multas y otros, incluidos en el coste total de propiedad y en el coste por km. Features: `vehicle-expenses-api` y `vehicle-expenses-web`.
> - **Modo «En este teléfono»:** importación, gastos y documentos funcionan también en local, y las tablas nuevas entran en el zip de export/import.

Decisiones relacionadas (sección «Decisiones tomadas»):
> - **Autorización por propiedad:** un recurso de otro usuario responde 404 (no 403) para no revelar que existe.

También aplican, de «Convenciones»: «Cambios en la base de datos: 1. Editar `packages/db/src/schema/` … 2. Ejecutar `pnpm db:generate` … 3. Commitear el SQL generado.»

La feature siguiente, `vehicle-expenses-web` (id 88), pide filtro por categoría y que los gastos salgan en el desglose por categoría y en el coste total de las estadísticas.

**Lo que los criterios de #87 añaden al alcance, más allá del CRUD:**
- **Export/import:**
  - En `packages/shared/src/schemas/data-export.ts` hay que añadir el array `expenses` a `vehicleExportSchema` (línea 117) y su colección en `checkIntegrity` (`seen`).
  - `DATA_EXPORT_FORMAT_VERSION = 1` es `z.literal`. Para que un zip antiguo se siga importando, `expenses` debería ser opcional o tener `.default([])` en lugar de subir la versión.
  - El builder está en `packages/shared/src/domain/data-export-builder.ts`, con sus versiones en `apps/api/src/modules/data-export|data-import` y `apps/web/src/lib/data-source/local/data-export.ts`.
- **DataSource local:** la interfaz está en `apps/web/src/lib/data-source/types.ts`, con la implementación HTTP en `http.ts` y la local en `local/*.ts` (modelo: `local/fuel-logs.ts` y `local/maintenance.ts`).
- **Importación CSV:** las filas que hoy se omiten con `reason: 'not_maintenance'` están en `packages/shared/src/csv-import/fuelio.ts` (líneas 101-104 y 191), `drivvo.ts:184` y `lubelogger.ts:159`. La aplicación de las filas está en `packages/shared/src/csv-import/apply.ts` y `apps/api/src/modules/csv-import`, más `local/csv-import.ts`.

Con todo esto, conviene plantearse si la feature es demasiado grande para un solo spec.
