# Implementación — vehicle-stats-api (#24)

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `packages/shared/src/domain/odometer.ts` | Helper interno `distancePerDay` (umbral 30 días); `averageDistancePerYear` lo usa sin cambiar su contrato; nuevo `averageDistancePerMonth()` (× 365 / 12). `byDateThenValue` pasa a exportarse para reutilizarlo en `stats.ts`. |
| `packages/shared/src/domain/odometer.test.ts` | Test `averages the distance per month`. |
| `packages/shared/src/domain/stats.ts` (nuevo) | `ratio` interna (única división; null si denominador ≤ 0 o resultado no finito), `roundMoney`, `distanceDriven`, `distanceByMonth` (interpolación por días en el día 1 de cada mes, redondeo en cada frontera), `consumptionSegments`, `averageConsumption` (ponderado por distancia), `costPerDistance`, `spendingByCategory`, `spendingByMonth`, `computeVehicleStats`. Tipos de entrada `StatsFuelLog`, `StatsMaintenanceRecord`, `VehicleStatsInput`. |
| `packages/shared/src/domain/stats.test.ts` (nuevo) | Tests unitarios T3–T6. |
| `packages/shared/src/schemas/stats.ts` (nuevo) | `monthSchema`, `vehicleStatsSchema`, `VehicleStats`. |
| `packages/shared/src/index.ts` | Exporta `domain/stats` y `schemas/stats`. |
| `apps/api/src/modules/stats/service.ts` (nuevo) | `createStatsService({ vehicles, fuelLogs, maintenance })` → `forVehicle()`: 404 con `findOwned`, mapea filas a `VehicleStatsInput` (repostajes invertidos a orden cronológico para que el orden de creación desempate) y llama a `computeVehicleStats`. |
| `apps/api/src/modules/stats/routes.ts` (nuevo) | `GET /vehicles/:id/stats` con `app.authenticate`, `idParamSchema` y respuesta `vehicleStatsSchema`. |
| `apps/api/src/app.ts` | `fuelLogsRepo` compartido, `statsService` y registro de `statsRoutes`. |
| `apps/api/src/modules/maintenance/service.ts` | `spending()` usa `roundMoney`. |
| `apps/api/test/stats.test.ts` (nuevo) | Tests de integración T8–T10. |

## Trazabilidad

| R | Test |
|---|---|
| R1 | `packages/shared/src/domain/stats.test.ts` › `computes the distance driven`; `apps/api/test/stats.test.ts` › `returns the stats of a vehicle with data` |
| R2 | `packages/shared/src/domain/odometer.test.ts` › `averages the distance per month`, `extrapolates the distance to a year`; `apps/api/test/stats.test.ts` › `returns the stats of a vehicle with data` |
| R3 | `packages/shared/src/domain/odometer.test.ts` › `averages the distance per month`, `needs at least a month of history`; `stats.test.ts` › `never returns NaN or Infinity…` (perYear/perMonth null) |
| R4 | `packages/shared/src/domain/stats.test.ts` › `spreads the distance by month`; `apps/api/test/stats.test.ts` › `returns the stats of a vehicle with data` |
| R5 | `packages/shared/src/domain/stats.test.ts` › `returns no monthly distance without two readings` |
| R6 | `packages/shared/src/domain/stats.test.ts` › `computes consumption between full tanks` |
| R7 | `packages/shared/src/domain/stats.test.ts` › `skips segments with a missed refuel` |
| R8 | `packages/shared/src/domain/stats.test.ts` › `skips segments without distance` |
| R9 | `packages/shared/src/domain/stats.test.ts` › `weights the average consumption by distance` |
| R10 | `packages/shared/src/domain/stats.test.ts` › `returns null consumption without two full tanks` |
| R11 | `packages/shared/src/domain/stats.test.ts` › `computes the cost per distance` |
| R12 | `packages/shared/src/domain/stats.test.ts` › `computes the cost per distance` |
| R13 | `packages/shared/src/domain/stats.test.ts` › `returns null cost per distance without distance` |
| R14 | `packages/shared/src/domain/stats.test.ts` › `computes the total cost of ownership` |
| R15 | `packages/shared/src/domain/stats.test.ts` › `groups maintenance spending by category` |
| R16 | `packages/shared/src/domain/stats.test.ts` › `spreads spending by month` |
| R17 | `packages/shared/src/domain/stats.test.ts` › `never returns NaN or Infinity with zero quantities or prices` |
| R18 | `apps/api/test/stats.test.ts` › `returns the stats of a vehicle with data` |
| R19 | `apps/api/test/stats.test.ts` › `returns empty stats for a vehicle without data` |
| R20 | `apps/api/test/stats.test.ts` › `hides other users' vehicles` |
| R21 | `apps/api/test/stats.test.ts` › `returns the stats of a vehicle with data` (compara con `GET …/maintenance/spending`) |
| R22 | `apps/api/test/stats.test.ts` › `keeps the stored units` |

## `pnpm harness --full`

```
[OK]    26 features: 23 done, 2 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #24 vehicle-stats-api (in_progress)
[OK]    Rama actual: feat/vehicle-stats-api
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared  Test Files 10 passed · Tests 75 passed
apps/api         Test Files 24 passed · Tests 194 passed
apps/web         Test Files 29 passed · Tests 234 passed
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones y decisiones menores

- **`quantity` de cada tramo redondeada a 3 decimales** en la serie `consumptionBySegment`. El design fija el redondeo de importes, consumo, coste por distancia y distancias, pero no el de la cantidad del tramo; sin redondeo, sumas como 20.1 + 25.2 filtrarían ruido de coma flotante a la API. Se aplica solo a la salida: el consumo del tramo y el consumo medio se calculan con la suma sin redondear (no se redondean intermedios).
- **`byDateThenValue` exportado desde `domain/odometer.ts`** para que `stats.ts` ordene las lecturas con el mismo criterio que `latestOdometerReading`, como pide el design, sin duplicar el comparador.
- `consumptionSegments` y `averageConsumption` reciben los repostajes (no los tramos) y comparten un constructor interno de tramos sin redondear.
- Sin cambios de BD ni UI, así que no hay migraciones ni capturas.
