# Implementación — fuel-logs-api (#22)

## Cambios por archivo

### packages/shared
- `src/enums.ts`: `FUEL_QUANTITY_UNITS = ['l', 'gal', 'kwh']` y el tipo `FuelQuantityUnit`.
- `src/domain/fuel.ts` (nuevo):
  - `fuelQuantityUnit(fuelType, volumeUnit)`: devuelve `'kwh'` solo para `electric`.
  - `resolveFuelPrices({ quantity, totalPrice?, pricePerUnit? })`: si llegan los dos precios, los deja tal cual; si solo llega el total, calcula `ppu = round3(total / q)`; si solo llega el precio por unidad, calcula `total = round2(q × ppu)`; sin ningún precio lanza un error.
- `src/domain/fuel.test.ts` (nuevo): tests unitarios de las dos funciones.
- `src/schemas/fuel-logs.ts` (nuevo):
  - `createFuelLogSchema`: precios opcionales, `refine` que exige al menos uno (path `totalPrice`) y `transform` con `resolveFuelPrices`.
  - `updateFuelLogSchema`: parcial, sin defaults ni `null`.
  - `fuelLogSchema` (sin `odometerReadingId`) y `fuelLogParamsSchema`.
  - Tipos `CreateFuelLog`, `CreateFuelLogInput`, `UpdateFuelLog`, `UpdateFuelLogInput` y `FuelLog`.
- `src/schemas/fuel-logs.test.ts` (nuevo): tests de los esquemas.
- `src/index.ts`: exporta `domain/fuel` y `schemas/fuel-logs`.

### apps/api
- `src/db/schema/fuel.ts` (nuevo): tabla `fuelLogs`, tal como la define el design:
  - FK `vehicleId` con cascade.
  - `odometerReadingId` con set null e índice único.
  - Índice `(vehicle_id, date)`.
- `src/db/schema/index.ts`: reexporta `./fuel`.
- `src/db/migrations/0009_fuel_logs.sql` y `meta/0009_snapshot.json`, `meta/_journal.json`: generados con `pnpm --filter @ikrive/api db:generate --name fuel_logs`.
- `src/modules/fuel-logs/repository.ts` (nuevo):
  - `listByVehicle` ordena por fecha desc, `odometer` desc y `createdAt` desc.
  - `find`.
  - `create`, `update` (con `ReadingChange` `keep | upsert`) y `delete` son transaccionales y escriben o borran la lectura `source: 'fuel'`.
- `src/modules/fuel-logs/service.ts` (nuevo):
  - Comprobación de propiedad: 404 `Vehicle not found` / `Fuel log not found`.
  - Fecha futura → 400.
  - `findOdometerConflict` excluyendo la lectura propia → 409, con el mismo texto que mantenimientos.
  - Hace `upsert` de la lectura si cambian la fecha o el odómetro.
  - `editedPrices` aplica las reglas de precios de R14/R15.
  - `toDto` no incluye `odometerReadingId`.
- `src/modules/fuel-logs/routes.ts` (nuevo): los cinco endpoints (POST 201, DELETE 204).
- `src/app.ts`: conecta repo → service → routes bajo `/api`.
- `test/fuel-logs.test.ts` (nuevo): 13 tests de integración.
- `test/vehicles.test.ts`: nuevo test `refuses to delete readings owned by a record`, sobre una lectura de mantenimiento.

## Trazabilidad

| R | Test(s) |
|---|---|
| R1 | `apps/api/test/fuel-logs.test.ts` › `creates, lists, reads, updates and deletes fuel logs` (filas en `fuel_logs`; la migración se aplica en `createTestApp`) |
| R2 | `apps/api/test/fuel-logs.test.ts` › `deletes fuel logs with the vehicle` |
| R3 | `packages/shared/src/schemas/fuel-logs.test.ts` › `rejects non-positive quantity and prices`, `requires the odometer on create`; `apps/api/test/fuel-logs.test.ts` › `validates the payload` |
| R4 | `packages/shared/src/domain/fuel.test.ts` › `computes the price per unit rounded to 3 decimals`; `apps/api/test/fuel-logs.test.ts` › `completes the missing price on create` |
| R5 | `packages/shared/src/domain/fuel.test.ts` › `computes the total price rounded to 2 decimals`; `apps/api/test/fuel-logs.test.ts` › `completes the missing price on create` |
| R6 | `packages/shared/src/domain/fuel.test.ts` › `keeps both prices when both are given`; `apps/api/test/fuel-logs.test.ts` › `completes the missing price on create` |
| R7 | `packages/shared/src/schemas/fuel-logs.test.ts` › `requires at least one price`; `apps/api/test/fuel-logs.test.ts` › `validates the payload` |
| R8 | `apps/api/test/fuel-logs.test.ts` › `validates the payload` (alta y PATCH → 400 problem+json, nada guardado) |
| R9 | `packages/shared/src/schemas/fuel-logs.test.ts` › `defaults fullTank and missedPrevious on create only`; `apps/api/test/fuel-logs.test.ts` › `creates, lists, reads, updates and deletes fuel logs` |
| R10 | `apps/api/test/fuel-logs.test.ts` › `creates, lists, reads, updates and deletes fuel logs` |
| R11 | `apps/api/test/fuel-logs.test.ts` › `creates, lists, reads, updates and deletes fuel logs` (fecha, `odometer` y `createdAt`) |
| R12 | `apps/api/test/fuel-logs.test.ts` › `creates, lists, reads, updates and deletes fuel logs` |
| R13 | `apps/api/test/fuel-logs.test.ts` › `creates, lists, reads, updates and deletes fuel logs` (PATCH parcial que no resetea `fullTank`) |
| R14 | `apps/api/test/fuel-logs.test.ts` › `recomputes prices on edit` |
| R15 | `apps/api/test/fuel-logs.test.ts` › `recomputes prices on edit` (PATCH de `date` + `fullTank`) |
| R16 | `apps/api/test/fuel-logs.test.ts` › `creates, lists, reads, updates and deletes fuel logs` |
| R17 | `apps/api/test/fuel-logs.test.ts` › `creates a fuel odometer reading` |
| R18 | `apps/api/test/fuel-logs.test.ts` › `updates the linked reading when date or odometer change` (incluye recrear la lectura si el FK quedó a null y comprobar que `odometer` coincide con la lectura) |
| R19 | `apps/api/test/fuel-logs.test.ts` › `ignores its own reading when validating an edit` |
| R20 | `apps/api/test/fuel-logs.test.ts` › `rejects a conflicting odometer on create and edit` |
| R21 | `apps/api/test/fuel-logs.test.ts` › `rejects a future date` |
| R22 | `apps/api/test/fuel-logs.test.ts` › `deletes the linked reading with the log` |
| R23 | `apps/api/test/fuel-logs.test.ts` › `cannot delete its reading from the odometer endpoint`; `apps/api/test/vehicles.test.ts` › `refuses to delete readings owned by a record` |
| R24 | `apps/api/test/fuel-logs.test.ts` › `hides other users' vehicles and fuel logs` |
| R25 | `apps/api/test/fuel-logs.test.ts` › `hides other users' vehicles and fuel logs` |
| R26 | `packages/shared/src/domain/fuel.test.ts` › `uses kWh only for electric vehicles` |

## `pnpm harness --full`

```
[OK]    25 features: 21 done, 3 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #22 fuel-logs-api (in_progress)
[OK]    Rama actual: feat/fuel-logs-api
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared test:       Tests  60 passed (60)
apps/api test:       Tests  190 passed (190)
apps/web test:       Tests  183 passed (183)
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones del spec

Ninguna. Hay un test unitario extra (`throws without any price`) para el caso en que `resolveFuelPrices` lanza un error. La feature no tiene UI, así que no hay capturas.
