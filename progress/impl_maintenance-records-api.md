# Implementación — maintenance-records-api

Feature #4, rama `feat/maintenance-records-api`. Todas las tasks T1–T15 están marcadas en `specs/maintenance-records-api/tasks.md`. Sin commits.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `packages/shared/src/schemas/common.ts` | `optionalText`, `odometerValueSchema` y `moneySchema` se mueven aquí y se exportan (T1). |
| `packages/shared/src/schemas/vehicles.ts` | Importa esos helpers de `./common`; el comportamiento no cambia (T1). |
| `packages/shared/src/schemas/maintenance.ts` (nuevo) | `createMaintenanceRecordSchema`, `updateMaintenanceRecordSchema` (parcial, `includeInReport` sin default), `maintenanceRecordSchema`, `maintenanceRecordParamsSchema` y los tipos `CreateMaintenanceRecord(Input)`, `UpdateMaintenanceRecord(Input)` y `MaintenanceRecord` (T2). |
| `packages/shared/src/schemas/maintenance.test.ts` (nuevo) | 3 tests unitarios (T3). |
| `packages/shared/src/index.ts` | `export * from './schemas/maintenance'`. |
| `apps/api/src/db/schema/maintenance.ts` (nuevo) | Tabla `maintenanceRecords`: FK `vehicleId` en cascade, `odometerReadingId` en set null con índice único, índice `(vehicle_id, date)` y un helper `id()` local duplicado, como dice el diseño (T4). |
| `apps/api/src/db/schema/index.ts` | Reexporta `./maintenance`. |
| `apps/api/src/db/migrations/0002_maintenance_records.sql`, `meta/0002_snapshot.json`, `meta/_journal.json` | Generados con `pnpm --filter api db:generate --name maintenance_records`. |
| `apps/api/src/modules/maintenance/repository.ts` (nuevo) | `listByVehicle` (orden `date` desc y luego `createdAt` desc), `find(vehicleId, id)` y los métodos `create`, `update` y `delete`, cada uno en una sola transacción, que también escriben, actualizan o borran la lectura `source: 'maintenance'` según el `ReadingChange` (`keep` / `remove` / `upsert`) (T5). |
| `apps/api/src/modules/maintenance/service.ts` (nuevo) | Comprueba la propiedad (`Vehicle not found` / `Maintenance record not found`). Fecha futura → 400. `findOdometerConflict` sobre las lecturas del vehículo sin contar la propia → 409, con el mismo texto que `addReading`. Calcula el `ReadingChange` sobre el estado resultante y devuelve el DTO sin `odometerReadingId` (T6). |
| `apps/api/src/modules/maintenance/routes.ts` (nuevo) | Los cinco endpoints con `preHandler: app.authenticate`, 201 en el alta y 204 en el borrado (T7). |
| `apps/api/src/app.ts` | El `VehiclesRepository` se comparte entre los servicios de vehículos y mantenimiento; registra `maintenanceRoutes` bajo `/api` (T7). |
| `apps/api/test/maintenance.test.ts` (nuevo) | 11 tests de integración (T8–T14). |

## Trazabilidad

| R | Test(s) |
|---|---|
| R1 | `apps/api/test/maintenance.test.ts` › `creates, lists, reads, updates and deletes maintenance records` (comprueba todos los campos persistidos; la migración se aplica en `createTestApp`) |
| R2 | `packages/shared/src/schemas/maintenance.test.ts` › `rejects categories outside MAINTENANCE_CATEGORIES`, `stores blank optional texts as null`, `does not default includeInReport on update`; `maintenance.test.ts` › `validates the payload` |
| R3 | `maintenance.test.ts` › `validates the payload` |
| R4 | `maintenance.test.ts` › `creates, lists, reads, updates and deletes maintenance records` |
| R5 | ídem (orden por fecha desc y, a igual fecha, por `createdAt` desc) |
| R6 | ídem |
| R7 | ídem (PATCH parcial; el resto de campos no cambia) |
| R8 | ídem (204 y luego 404) |
| R9 | `maintenance.test.ts` › `creates a maintenance odometer reading` |
| R10 | `maintenance.test.ts` › `does not create a reading without odometer` |
| R11 | `maintenance.test.ts` › `updates the linked reading when date or odometer change` |
| R12 | `maintenance.test.ts` › `removes the linked reading when odometer is cleared` |
| R13 | `maintenance.test.ts` › `ignores its own reading when validating an edit` (con una mutación que quita el filtro, este test falla) |
| R14 | `maintenance.test.ts` › `rejects a conflicting odometer on create and edit` |
| R15 | `maintenance.test.ts` › `rejects a future date` |
| R16 | `maintenance.test.ts` › `deletes the linked reading with the record` |
| R17 | `maintenance.test.ts` › `hides other users' vehicles and records` |
| R18 | ídem (`recordId` de otro vehículo propio y de otro usuario) |

## `pnpm harness --full`

```
[OK]    8 features: 3 done, 4 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #4 maintenance-records-api (in_progress)
[OK]    Rama actual: feat/maintenance-records-api
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test      (shared 11 tests, api 25 tests, web 15 tests)
[OK]    Arnés en verde.
```

## Desviaciones del spec

Ninguna funcional. Detalles:

- La migración se generó con `--name maintenance_records` para seguir el nombre de `0001_vehicles`. Encaja con el patrón `0002_*.sql` del diseño.
- En un PATCH que no toca ni la fecha ni el `odometer`, la fecha resultante se vuelve a validar contra hoy. Así lo dice el diseño: «se aplica siempre a la fecha del mantenimiento».
- No hay UI, así que no hay capturas.
