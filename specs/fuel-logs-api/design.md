# Design — fuel-logs-api

Solo API y `packages/shared`. Sin cambios en la web (es la feature 23). Replica el patrón de `maintenance` (registro ↔ lectura de odómetro enlazada); ver `progress/explore_fuel-logs-api_patterns.md`.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `packages/shared/src/domain/fuel.ts` (nuevo) + `fuel.test.ts` | `fuelQuantityUnit()` y `resolveFuelPrices()` (puras). |
| shared | `packages/shared/src/enums.ts` | `FUEL_QUANTITY_UNITS = ['l', 'gal', 'kwh']` + tipo `FuelQuantityUnit`. |
| shared | `packages/shared/src/schemas/fuel-logs.ts` (nuevo) + `fuel-logs.test.ts` | Esquemas de alta, edición, respuesta y params + tipos. |
| shared | `packages/shared/src/index.ts` | Exportar `domain/fuel` y `schemas/fuel-logs`. |
| db | `apps/api/src/db/schema/fuel.ts` (nuevo) + `schema/index.ts` | Tabla `fuelLogs`. |
| db | `apps/api/src/db/migrations/0009_fuel_logs.sql` | `pnpm --filter api db:generate`. |
| api | `apps/api/src/modules/fuel-logs/{repository,service,routes}.ts` (nuevos) | CRUD + sincronización con el odómetro. |
| api | `apps/api/src/app.ts` | Cablear repo → service → routes bajo `/api`. |
| test | `apps/api/test/fuel-logs.test.ts` (nuevo) | Integración. |
| test | `apps/api/test/vehicles.test.ts` | Caso de R23 (hoy no hay test del 409 al borrar una lectura no manual). |

`modules/vehicles/service.ts` **no cambia**: `removeReading` ya responde 409 para toda lectura con `source !== 'manual'`.

## Base de datos

```ts
export const fuelLogs = sqliteTable('fuel_logs', {
  id: id(),
  vehicleId: text().notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  date: text().notNull(),                 // YYYY-MM-DD
  odometer: integer().notNull(),          // unidad de distancia del usuario
  odometerReadingId: text().references(() => odometerReadings.id, { onDelete: 'set null' }),
  quantity: real().notNull(),             // unidad: fuelQuantityUnit(vehicle.fuelType, settings.volumeUnit)
  totalPrice: real().notNull(),           // moneda del usuario, 2 decimales
  pricePerUnit: real().notNull(),         // moneda del usuario, 3 decimales
  fullTank: integer({ mode: 'boolean' }).notNull().default(true),
  missedPrevious: integer({ mode: 'boolean' }).notNull().default(false),
  createdAt / updatedAt                   // igual que maintenance
}, (t) => [
  index('fuel_logs_vehicle_id_date_idx').on(t.vehicleId, t.date),
  uniqueIndex('fuel_logs_odometer_reading_id_idx').on(t.odometerReadingId),
]);
```

- Enlace en `fuel_logs.odometer_reading_id`, nullable con `set null`, por la misma razón que en `maintenance_records` (no romper el borrado en cascada del vehículo). En la práctica siempre está relleno porque `odometer` es obligatorio; si faltara, la edición la recrea (`upsert`).
- `odometer_readings` no cambia: `ODOMETER_SOURCES` ya incluye `'fuel'`.

## Contrato HTTP

`preHandler: app.authenticate`; errores RFC 7807.

| Método y ruta | Cuerpo | Éxito | Errores |
|---|---|---|---|
| `GET /api/vehicles/:id/fuel-logs` | — | 200 `FuelLog[]` (fecha desc, `odometer` desc, `createdAt` desc) | 404 vehículo |
| `POST /api/vehicles/:id/fuel-logs` | `CreateFuelLogInput` | 201 `FuelLog` | 400 validación / fecha futura · 404 · 409 odómetro |
| `GET /api/vehicles/:id/fuel-logs/:logId` | — | 200 `FuelLog` | 404 vehículo o repostaje |
| `PATCH /api/vehicles/:id/fuel-logs/:logId` | `UpdateFuelLog` | 200 `FuelLog` | 400 · 404 · 409 |
| `DELETE /api/vehicles/:id/fuel-logs/:logId` | — | 204 | 404 |

Mensajes: `NotFoundError('Vehicle not found')`, `NotFoundError('Fuel log not found')`, `BadRequestError('The fuel log date cannot be in the future')`, `ConflictError('The odometer cannot go backwards: there is a reading of <v> on <date>')` (mismo texto que mantenimientos y odómetro, para que la feature 23 lo pinte en el campo de km).

## Shared

```ts
// domain/fuel.ts
export function fuelQuantityUnit(fuelType: FuelType, volumeUnit: VolumeUnit): FuelQuantityUnit; // electric → 'kwh'
export function resolveFuelPrices(input: { quantity: number; totalPrice?: number; pricePerUnit?: number }):
  { totalPrice: number; pricePerUnit: number };
// ambos → tal cual; solo total → ppu = round3(total / q); solo ppu → total = round2(q * ppu); ninguno → throw

// schemas/fuel-logs.ts
const fuelFields = z.object({
  date: isoDateSchema,
  odometer: odometerValueSchema,                  // obligatorio
  quantity: z.number().positive().max(10_000),
  totalPrice: moneySchema.positive(),
  pricePerUnit: moneySchema.positive(),
  fullTank: z.boolean().default(true),
  missedPrevious: z.boolean().default(false),
});
export const createFuelLogSchema = fuelFields
  .extend({ totalPrice: …optional(), pricePerUnit: …optional() })
  .refine(alguno de los dos precios, { path: ['totalPrice'] })
  .transform((v) => ({ ...v, ...resolveFuelPrices(v) }));   // salida: ambos precios number
export const updateFuelLogSchema = fuelFields
  .extend({ fullTank: z.boolean(), missedPrevious: z.boolean() })  // sin default: el PATCH no los resetea
  .partial();                                                      // sin null: ningún campo es borrable
export const fuelLogSchema = z.object({ id, vehicleId, date, odometer, quantity, totalPrice, pricePerUnit,
  fullTank, missedPrevious, createdAt, updatedAt });
export const fuelLogParamsSchema = z.object({ id: z.string().min(1), logId: z.string().min(1) });
// tipos: CreateFuelLog(+Input), UpdateFuelLog, FuelLog
```

`odometerReadingId` no se expone en el DTO. El DTO no lleva la unidad: el cliente la deriva con `fuelQuantityUnit` a partir del vehículo y sus ajustes.

## Servicio y repositorio

```ts
type ReadingChange = { kind: 'keep' } | { kind: 'upsert'; date: string; value: number };  // no hay 'remove'
createFuelLogsRepository(db) → { listByVehicle, find(vehicleId, logId), create(values, reading),
  update(log, changes, reading), delete(log) }   // create/update/delete en db.transaction, lectura source 'fuel'
createFuelLogsService({ repo, vehicles: VehiclesRepository, settings: SettingsService })
```

- Propiedad: `vehicles.findOwned` → 404; repostaje con `repo.find(vehicleId, logId)` → 404 si es de otro vehículo/usuario.
- Validación antes de escribir (alta y edición, sobre el estado resultante): fecha futura (`todayIn(timezone)`) → 400; `findOdometerConflict(lecturas sin la propia, { date, value: odometer })` → 409.
- Edición: `upsert` si cambian fecha u `odometer`, si no `keep`.
- Precios en edición (R14/R15), con `q` = cantidad resultante:
  - Llegan ambos precios → tal cual.
  - Llega uno → `resolveFuelPrices({ quantity: q, <ese precio> })`.
  - No llega ninguno pero sí `quantity` → `resolveFuelPrices({ quantity: q, totalPrice: log.totalPrice })`.
  - No llega ni `quantity` ni precios → no se tocan.

## Decisiones (validar en Gate 1)

1. **Unidad de la cantidad derivada, no guardada.** `electric` → kWh; el resto → `user_settings.volumeUnit` (l/gal). Es la convención de la app: el odómetro y el volumen se guardan como números en la unidad del usuario y la unidad es una etiqueta. Se añade `'kwh'` a un enum nuevo `FUEL_QUANTITY_UNITS` sin tocar `VOLUME_UNITS` (que es un ajuste del usuario). Riesgo asumido: si se cambia el `fuelType` de un vehículo entre eléctrico y no eléctrico, sus repostajes antiguos se reinterpretan en la otra unidad.
2. **`plugin_hybrid` registra combustible líquido** (volumeUnit). Las recargas eléctricas de un PHEV quedan fuera de alcance; mezclar L y kWh en el mismo vehículo rompería el consumo de la feature 24.
3. **Precios:** se guardan siempre los dos (no nulos). Cálculo en `packages/shared` (lo reutiliza el formulario de la feature 23). Redondeo: total a 2 decimales (céntimos del ticket) y precio por unidad a 3 (los surtidores publican 3 decimales, p. ej. 1,459 €/l). Si llegan los dos se guardan tal cual: el ticket redondea por separado y exigir que cuadren rechazaría tickets reales.
4. **`odometer` obligatorio** en el alta y no anulable en la edición: sin km no se puede calcular el consumo por tramo de la feature 24. Por eso no hay `ReadingChange.remove`.
5. **`fullTank` (defecto `true`) y `missedPrevious` (defecto `false`)** se guardan sin validaciones cruzadas. Semántica para la feature 24: el consumo se mide entre dos repostajes de depósito lleno sumando las cantidades intermedias (parciales incluidos); `missedPrevious = true` marca que antes de este repostaje hubo alguno sin registrar, así que el tramo que termina en él no se cuenta. El orden de la lista (fecha, luego `odometer`) es el que necesitan esos tramos.
6. Conflicto de km → **409**; fecha futura → **400** (igual que mantenimientos y odómetro).
7. Límites: `quantity` en (0, 10 000]; precios en (0, 1e9] (`moneySchema.positive()`).

## Alternativas descartadas

- **Guardar la unidad en cada repostaje** (`quantity_unit`): congela la unidad si cambia el `fuelType`, pero mezcla unidades dentro de un mismo vehículo, y las estadísticas tendrían que convertir o descartar tramos. Rompe además la convención de unidades-etiqueta de odómetro y volumen.
- **Guardar solo uno de los precios y calcular el otro al leer**: pierde el dato exacto del ticket cuando el usuario introduce los dos.
- **Permitir repostajes sin km** (como mantenimientos): impide calcular consumos y complica la feature 24 con huecos.

## Riesgos

- Duplicación `odometer` ↔ lectura: se escriben siempre en la misma transacción; un test comprueba que coinciden tras editar.
- Coma flotante en precios: el redondeo se hace en una sola función pura con tests unitarios (p. ej. `40 l × 1.459 = 58.36`).

## Fuera de alcance

Adjuntos/ticket del repostaje (más adelante), formulario y lista web (feature 23), estadísticas y consumo (feature 24), recargas eléctricas de híbridos enchufables, gasolinera, notas o tipo de combustible por repostaje, conversión de unidades.
