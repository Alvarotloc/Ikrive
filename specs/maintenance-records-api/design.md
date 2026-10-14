# Design — maintenance-records-api

Solo API y `packages/shared`. Sin cambios en la web (la timeline es la feature 6).

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `packages/shared/src/schemas/common.ts` | Mover aquí y **exportar** `optionalText`, `odometerValueSchema`, `moneySchema` (hoy privados en `vehicles.ts`). |
| shared | `packages/shared/src/schemas/vehicles.ts` | Importar esos helpers de `./common` (sin cambio de comportamiento). |
| shared | `packages/shared/src/schemas/maintenance.ts` (nuevo) | `createMaintenanceRecordSchema`, `updateMaintenanceRecordSchema`, `maintenanceRecordSchema`, `maintenanceRecordParamsSchema` + tipos. |
| shared | `packages/shared/src/schemas/maintenance.test.ts` (nuevo) | Tests unitarios de los esquemas. |
| shared | `packages/shared/src/index.ts` | `export * from './schemas/maintenance'`. |
| db | `apps/api/src/db/schema/maintenance.ts` (nuevo) + `schema/index.ts` | Tabla `maintenanceRecords`. |
| db | `apps/api/src/db/migrations/0002_*.sql` | `pnpm --filter api db:generate`. |
| api | `apps/api/src/modules/maintenance/{repository,service,routes}.ts` (nuevos) | CRUD + sincronización con el odómetro. |
| api | `apps/api/src/app.ts` | Cablear repo → service → routes bajo `/api`. |
| test | `apps/api/test/maintenance.test.ts` (nuevo) | Integración con `createTestApp()` / `signUp()`. |

El helper `id()` de `db/schema/vehicles.ts` es local: se duplica en `maintenance.ts` (3 líneas) en lugar de crear un módulo compartido; si la fase 4/5 lo necesita otra vez se extrae entonces.

## Base de datos

```ts
export const maintenanceRecords = sqliteTable('maintenance_records', {
  id: id(),
  vehicleId: text().notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  date: text().notNull(),                       // YYYY-MM-DD
  odometer: integer(),                          // nullable
  odometerReadingId: text().references(() => odometerReadings.id, { onDelete: 'set null' }),
  category: text({ enum: MAINTENANCE_CATEGORIES }).notNull(),
  title: text().notNull(),
  description: text(),
  workshop: text(),
  cost: real(),                                 // decimal, moneda = user_settings.currency
  includeInReport: integer({ mode: 'boolean' }).notNull().default(true),
  createdAt / updatedAt                         // igual que vehicles
}, (t) => [
  index('maintenance_records_vehicle_id_date_idx').on(t.vehicleId, t.date),
  uniqueIndex('maintenance_records_odometer_reading_id_idx').on(t.odometerReadingId),
]);
```

### Enlace mantenimiento ↔ lectura

- La columna vive en **`maintenance_records.odometer_reading_id`** (FK nullable, única). `odometer_readings` no cambia.
- `onDelete: 'set null'`: si la lectura desaparece por otra vía, el mantenimiento sobrevive (no se pierde el registro ni sus facturas). En la práctica no ocurre: `DELETE /odometer/:readingId` ya responde 409 para lecturas no `manual`, y al borrar el vehículo ambas filas caen por su `vehicleId` en cascada. `cascade` se descarta (borraría el mantenimiento al borrar una lectura) y `restrict` podría romper el borrado en cascada del vehículo según el orden en que SQLite procese las FKs.
- `odometer` se guarda también en el mantenimiento (lo pide el acceptance y evita un join para listar). Se mantiene igual que `odometer_readings.value` porque ambos se escriben siempre en la misma transacción.

## Contrato HTTP

Todos con `preHandler: app.authenticate`; errores RFC 7807.

| Método y ruta | Cuerpo | Éxito | Errores |
|---|---|---|---|
| `GET /api/vehicles/:id/maintenance` | — | 200 `MaintenanceRecord[]` (fecha desc, `createdAt` desc) | 404 vehículo |
| `POST /api/vehicles/:id/maintenance` | `CreateMaintenanceRecord` | 201 `MaintenanceRecord` | 400 validación / fecha futura · 404 · 409 conflicto odómetro |
| `GET /api/vehicles/:id/maintenance/:recordId` | — | 200 | 404 vehículo o registro |
| `PATCH /api/vehicles/:id/maintenance/:recordId` | `UpdateMaintenanceRecord` | 200 | 400 · 404 · 409 |
| `DELETE /api/vehicles/:id/maintenance/:recordId` | — | 204 | 404 |

Mensajes: `NotFoundError('Vehicle not found')` (reutiliza la regla de `requireOwned`), `NotFoundError('Maintenance record not found')`, `BadRequestError('The maintenance date cannot be in the future')`, `ConflictError('The odometer cannot go backwards: there is a reading of <v> on <date>')` (mismo texto que `addReading`, para que la feature 6 lo muestre en el campo de km).

## Esquemas (`packages/shared/src/schemas/maintenance.ts`)

```ts
const maintenanceFieldsSchema = z.object({
  date: isoDateSchema,
  odometer: odometerValueSchema.nullable().optional(),
  category: z.enum(MAINTENANCE_CATEGORIES),
  title: z.string().trim().min(1).max(120),
  description: optionalText(2000),
  workshop: optionalText(120),
  cost: moneySchema.nullable().optional(),
  includeInReport: z.boolean().default(true),
});
export const createMaintenanceRecordSchema = maintenanceFieldsSchema;
export const updateMaintenanceRecordSchema = maintenanceFieldsSchema
  .extend({ includeInReport: z.boolean() })   // sin default: un PATCH parcial no lo resetea
  .partial();
export const maintenanceRecordSchema = z.object({
  id, vehicleId, date, odometer: int|null, category, title, description: string|null,
  workshop: string|null, cost: number|null, includeInReport: boolean, createdAt, updatedAt,
});
export const maintenanceRecordParamsSchema = z.object({ id: z.string().min(1), recordId: z.string().min(1) });
// tipos: CreateMaintenanceRecord(+Input), UpdateMaintenanceRecord(+Input), MaintenanceRecord
```

`odometerReadingId` no se expone en el DTO (detalle interno).

## Servicio y repositorio

```ts
type ReadingChange = { kind: 'keep' } | { kind: 'remove' } | { kind: 'upsert'; date: string; value: number };

createMaintenanceRepository(db) → {
  listByVehicle(vehicleId), find(vehicleId, recordId),
  create(values, reading?: { date; value }): Row,            // tx: insert lectura 'maintenance' → insert registro con su id
  update(record: Row, changes, reading: ReadingChange): Row,  // tx: update/insert/delete lectura + update registro
  delete(record: Row),                                        // tx: delete registro + delete lectura enlazada
}
createMaintenanceService({ repo, vehicles: VehiclesRepository, settings: SettingsService })
```

- La propiedad del vehículo se comprueba con `vehicles.findOwned(userId, id)`; el registro con `repo.find(vehicleId, recordId)` (filtra por vehículo, así un `recordId` de otro vehículo/usuario da 404).
- **Validación de la lectura** (alta y edición), antes de escribir:
  1. `date > todayIn(timezone)` → 400. Se aplica siempre a la fecha del mantenimiento, tenga o no `odometer` (fecha futura = mantenimiento planificado, que es la fase 4).
  2. Si el resultado tiene `odometer`: `findOdometerConflict(vehicles.listReadings(vehicleId).filter(r => r.id !== record.odometerReadingId), { date, value })` → 409 si hay conflicto. En el alta no hay lectura propia que excluir.
- **Edición** (estado resultante = registro actual + cambios):
  - `odometer` resultante no nulo y cambian fecha u `odometer` → `upsert` (actualiza la lectura enlazada o la crea si no existía).
  - `odometer: null` explícito → `remove`: se borra la lectura y `odometerReadingId = null`.
  - `odometer` ausente y fecha sin cambios → `keep`.
- Todo lo que escribe va en una única `db.transaction` síncrona; la validación se hace antes, así un 400/409 no deja escrituras parciales.

## Impacto en UI

Ninguno en esta feature. El contrato (orden, mensaje del 409) está pensado para la feature 6.

## Alternativas descartadas

- **`odometer_readings.source_id` genérico** (lo usarían también los repostajes): sin FK real (polimórfico), sin integridad referencial ni cascada; habría que borrar a mano. Se prefiere una FK por tabla de origen.
- **No guardar `odometer` en el mantenimiento y leerlo de la lectura con un join**: evita la duplicación, pero contradice el acceptance («km opcional» en la tabla) y complica el listado y el informe de la fase 6.
- **Validar con un `findOdometerConflict` nuevo que reciba un id a excluir**: cambia una función pura compartida para un único llamador; filtrar antes es una línea.

## Decisiones a validar (Gate 1)

1. Enlace en `maintenance_records.odometer_reading_id` con `onDelete: 'set null'` (ver arriba).
2. Conflicto de odómetro → **409** (igual que `POST /odometer`); fecha futura → **400**, también para mantenimientos sin km.
3. `PATCH` con `odometer: null` borra la lectura enlazada; el mantenimiento se conserva.
4. `includeInReport` por defecto `true`.
5. **`scheduleId` no se añade ahora**: no existe aún `maintenance_schedules` para la FK y no está en el acceptance; la fase 4 lo añade con su migración (`ALTER TABLE ADD COLUMN` nullable, trivial en SQLite).
6. Los helpers zod se mueven a `schemas/common.ts` y pasan a ser API pública de `@ikrive/shared`.
7. Límites: `title` 1–120, `workshop` ≤120, `description` ≤2000.

## Riesgos

- Duplicación `odometer` ↔ lectura: mitigada escribiendo siempre ambos en la misma transacción; un test comprueba que coinciden tras editar.
- Mover los helpers zod podría alterar `vehicles`: los tests existentes de `vehicles.test.ts` lo cubren.

## Fuera de alcance

Facturas adjuntas (feature 5), timeline y formulario web (6), gasto acumulado (8), `schedule_id` y recálculo de vencimientos (fase 4), uso de `include_in_report` en el informe (fase 6).
