# Design — maintenance-schedules-api

Solo API y `packages/shared`. Sin cambios en la web (feature 14). El job de avisos es la feature 15.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `packages/shared/src/enums.ts` | `SCHEDULE_STATUSES = ['ok','due_soon','overdue']` + tipo `ScheduleStatus`. |
| shared | `packages/shared/src/domain/schedules.ts` (nuevo) + `.test.ts` | Funciones puras: `addMonths`, `addDays`, `averageDailyDistance`, `computeScheduleDue`. |
| shared | `packages/shared/src/schemas/schedules.ts` (nuevo) + `.test.ts` | Esquemas de alta, edición, respuesta y params. |
| shared | `packages/shared/src/schemas/maintenance.ts` | `scheduleId` en campos de alta/edición y en la respuesta. |
| shared | `packages/shared/src/index.ts` | Exportar `domain/schedules` y `schemas/schedules`. |
| db | `apps/api/src/db/schema/maintenance.ts` | Tabla `maintenanceSchedules` (antes de `maintenanceRecords`) y columna `scheduleId` en `maintenanceRecords`. |
| db | `apps/api/src/db/migrations/0004_maintenance_schedules.sql` + `meta/` | `pnpm --filter @ikrive/api exec drizzle-kit generate --name maintenance_schedules`. |
| api | `apps/api/src/modules/schedules/{repository,service,routes}.ts` (nuevos) | CRUD de reglas + DTO con campos calculados. |
| api | `apps/api/src/modules/maintenance/{repository,service}.ts` | Validar `scheduleId` y actualizar el último realizado en la misma transacción. |
| api | `apps/api/src/app.ts` | Cablear `schedules` y pasar el repo de reglas al servicio de mantenimientos. |
| test | `apps/api/test/schedules.test.ts` (nuevo) | Integración: CRUD, validación, autorización, vinculación. |
| docs | `docs/PLAN.md` | Modelo de datos: `next_due_*` se calcula al leer, no se guarda; umbral = `warn_days` + `warn_distance`. |

## Base de datos

```ts
export const maintenanceSchedules = sqliteTable('maintenance_schedules', {
  id: id(),
  vehicleId: text().notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  title: text().notNull(),
  category: text({ enum: MAINTENANCE_CATEGORIES }).notNull(),
  intervalMonths: integer(),                 // nullable
  intervalDistance: integer(),               // nullable, unidad del usuario
  warnDays: integer().notNull(),
  warnDistance: integer().notNull(),
  lastDoneDate: text().notNull(),            // YYYY-MM-DD
  lastDoneOdometer: integer(),               // nullable
  createdAt / updatedAt                      // igual que maintenance_records
}, (t) => [index('maintenance_schedules_vehicle_id_idx').on(t.vehicleId)]);

// maintenance_records
scheduleId: text().references(() => maintenanceSchedules.id, { onDelete: 'set null' }),
```

- `onDelete: 'set null'` cubre R11 (SQLite con `foreign_keys = ON`, ya activo en `createDb`). Borrar el vehículo borra reglas y mantenimientos en cascada.
- Revisar el SQL generado: para una columna nullable con `REFERENCES` drizzle-kit emite `ALTER TABLE ... ADD COLUMN`, válido en SQLite.
- Solo se guarda el **último realizado**; `next_due_*` y `status` se calculan al leer (dependen de hoy y de las lecturas).

## Contrato HTTP

Todas bajo `app.authenticate`. Vehículo ajeno o inexistente → `NotFoundError('Vehicle not found')`; regla inexistente o de otro vehículo → `NotFoundError('Maintenance schedule not found')`.

| Método y ruta | Cuerpo | Éxito | Errores |
|---|---|---|---|
| `GET /api/vehicles/:id/schedules` | — | 200 `MaintenanceSchedule[]` (`createdAt` asc) | 404 |
| `POST /api/vehicles/:id/schedules` | `CreateMaintenanceSchedule` | 201 `MaintenanceSchedule` | 400 (zod, incluido sin intervalos), 404 |
| `GET /api/vehicles/:id/schedules/:scheduleId` | — | 200 | 404 |
| `PATCH /api/vehicles/:id/schedules/:scheduleId` | `UpdateMaintenanceSchedule` | 200 | 400 zod; 400 `BadRequestError('A schedule needs an interval in months or distance')` si el resultado queda sin intervalos; 404 |
| `DELETE /api/vehicles/:id/schedules/:scheduleId` | — | 204 | 404 |
| `POST\|PATCH /api/vehicles/:id/maintenance[/:recordId]` | + `scheduleId?: string \| null` | igual que hoy | + 400 `BadRequestError('Maintenance schedule not found for this vehicle')` |

## Esquemas (`schemas/schedules.ts`)

```ts
const fields = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.enum(MAINTENANCE_CATEGORIES),
  intervalMonths: z.number().int().min(1).max(240).nullable().optional(),
  intervalDistance: z.number().int().min(1).max(1_000_000).nullable().optional(),
  warnDays: z.number().int().min(0).max(365).default(30),
  warnDistance: z.number().int().min(0).max(100_000).default(1000),
  lastDoneDate: isoDateSchema.optional(),
  lastDoneOdometer: odometerValueSchema.nullable().optional(),
});
createMaintenanceScheduleSchema = fields.refine(atLeastOneInterval, { path: ['intervalMonths'], message })
updateMaintenanceScheduleSchema = fields.extend({ warnDays: …sin default, warnDistance: …sin default }).partial()
maintenanceScheduleSchema = { id, vehicleId, title, category, intervalMonths, intervalDistance, warnDays,
  warnDistance, lastDoneDate, lastDoneOdometer, nextDueDate: isoDate|null, nextDueDateEstimated: boolean,
  nextDueOdometer: int|null, status: z.enum(SCHEDULE_STATUSES), createdAt, updatedAt }
maintenanceScheduleParamsSchema = { id, scheduleId }
```

`maintenance.ts`: `scheduleId: z.string().min(1).nullable().optional()` en `maintenanceFieldsSchema`; respuesta `scheduleId: z.string().nullable()`.

## Dominio puro (`domain/schedules.ts`)

```ts
export const AVERAGE_WINDOW_DAYS = 90;
export const MIN_AVERAGE_SPAN_DAYS = 30;
export function addMonths(date: string, months: number): string;          // clamp a fin de mes
export function addDays(date: string, days: number): string;
export function averageDailyDistance(readings: readonly OdometerPoint[], today: string): number | null;
export interface ScheduleRule { intervalMonths: number | null; intervalDistance: number | null;
  warnDays: number; warnDistance: number; lastDoneDate: string; lastDoneOdometer: number | null }
export interface ScheduleDue { nextDueDate: string | null; nextDueDateEstimated: boolean;
  nextDueOdometer: number | null; status: ScheduleStatus }
export function computeScheduleDue(rule: ScheduleRule, readings: readonly OdometerPoint[], today: string): ScheduleDue;
```

- Fechas como `YYYY-MM-DD` con aritmética en UTC (`Date.parse`), sin `new Date()` interno: `today` es parámetro.
- Valor actual = `latestOdometerReading(readings)` (ya existe). Sin lecturas, la dimensión de distancia no cuenta para el estado.
- Ventana: lecturas con `fecha ≥ addDays(today, −90)` y `≤ today`; media = (último − primero) / días entre ellos.
- Comparaciones de fechas lexicográficas, como en el resto del código.

## Servicio y repositorio

- `createSchedulesRepository(db)`: `listByVehicle` (`createdAt` asc), `find(vehicleId, id)`, `create`, `update`, `delete`.
- `createSchedulesService({ repo, vehicles, settings })`: `requireVehicle`/`requireSchedule` (404); `toDto(row, readings, today)` = fila + `computeScheduleDue`; `today = todayIn(settings.get(userId).timezone)`; lecturas con `vehicles.listReadings(vehicleId)` una vez por petición (también en `list`).
- `create`: `lastDoneDate = input.lastDoneDate ?? vehicle.purchaseDate ?? today`; `lastDoneOdometer = input.lastDoneOdometer !== undefined ? input.lastDoneOdometer : vehicle.purchaseOdometer ?? latestReading?.value ?? null` (cada campo por separado).
- `update`: fusiona con la fila y comprueba que queda al menos un intervalo antes de escribir.
- Mantenimientos: el servicio recibe `schedules: SchedulesRepository`. Con el `scheduleId` resultante no nulo: `schedules.find(vehicleId, scheduleId)` o 400 (antes de escribir nada). Si `record.date >= schedule.lastDoneDate`, se pasa `lastDone = { scheduleId, date, odometer }` a `repo.create`/`repo.update`, que actualizan `maintenance_schedules` dentro de su `db.transaction` (como ya hace `delete` con `attachments`).

## Impacto en UI

Ninguno. El DTO incluye `nextDueDateEstimated` para que la feature 14 marque la fecha como estimada y la 19 use `nextDueDate`.

## Alternativas descartadas

- **Guardar `next_due_date`/`next_due_km`/`status` en la tabla** (como sugiere `docs/PLAN.md`): la fecha estimada y el estado cambian con cada lectura y con el paso de los días; habría que recalcularlos en cada lectura y en un job, con riesgo de datos obsoletos. Calcular al leer es barato (pocas reglas y lecturas por vehículo).
- **Último realizado derivado siempre del mantenimiento vinculado más reciente**: perdería el valor inicial indicado al crear la regla y obliga a una consulta extra por regla.
- **Un único umbral en días aplicado también a la fecha estimada**: una regla solo de km sin datos suficientes nunca pasaría a `due_soon`.

## Decisiones a validar (Gate 1)

1. Nombres de la API: `intervalDistance`, `warnDistance`, `lastDoneOdometer`, `nextDueOdometer` en vez de `*_km` (la unidad es la del usuario, como `odometer`).
2. **Umbral de aviso = dos campos**: `warnDays` (por defecto 30) y `warnDistance` (por defecto 1000), cada uno para su dimensión.
3. **Estado**: `overdue` en cuanto hoy ≥ fecha por meses o km actuales ≥ `nextDueOdometer` (el día del vencimiento ya cuenta como vencido). La **fecha estimada no afecta al estado**, solo se informa.
4. `nextDueDate` = la más temprana entre fecha por meses y estimada; `nextDueDateEstimated` indica el origen.
5. Media: lecturas de los últimos 90 días con al menos 30 días entre la primera y la última (como `averageDistancePerYear`); la estimación parte de la última lectura (de cualquier fecha).
6. Valores por defecto del último realizado, campo a campo (fecha y km se resuelven por separado).
7. Al vincular un mantenimiento solo se avanza el último realizado si su fecha es ≥ la actual; desvincular, editar a una fecha anterior o borrar el mantenimiento **no** lo revierte. Un mantenimiento sin `odometer` deja `lastDoneOdometer = null`.
8. `scheduleId` ajeno al vehículo en el cuerpo de un mantenimiento → **400** (no 404: el recurso de la ruta sí existe).
9. Se puede editar `lastDoneDate`/`lastDoneOdometer` con `PATCH`; no se valida que `lastDoneDate` sea futura ni que la categoría de la regla coincida con la del mantenimiento.
10. Límites: `intervalMonths` 1–240, `intervalDistance` 1–1 000 000, `warnDays` 0–365, `warnDistance` 0–100 000, `title` 1–120.

## Riesgos

- Tests de integración dependientes de «hoy»: se usan fechas lejanas (meses de margen) para no depender de la zona horaria; la precisión del cálculo se cubre en los tests unitarios de `domain/schedules.test.ts`.
- La migración altera `maintenance_records`: si drizzle-kit genera una reconstrucción de la tabla, comprobar que conserva datos e índices (los tests de `maintenance.test.ts` siguen pasando).

## Fuera de alcance

UI (14), job y notificaciones (15), calendario (19), revertir el último realizado al desvincular o borrar mantenimientos, filtrar reglas de vehículos archivados o vendidos.
