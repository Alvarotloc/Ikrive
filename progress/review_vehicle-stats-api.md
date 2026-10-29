# Review — #24 vehicle-stats-api

**Veredicto:** APPROVED

## Trazabilidad requirements ↔ tests
- R1: [x] `packages/shared/src/domain/stats.test.ts` › `computes the distance driven` (null con 0 y 1 lecturas; 4 500 con lecturas desordenadas y dos del mismo día); además la integración afirma `driven: 1000`.
- R2: [x] `packages/shared/src/domain/odometer.test.ts` › `averages the distance per month` (833) y `extrapolates the distance to a year`; la integración afirma `perYear: 6186`, `perMonth: 516` (1 000 km / 59 días).
- R3: [x] `odometer.test.ts` › `averages the distance per month` (null con 1 lectura y con 14 días) y `needs at least a month of history`; `stats.test.ts` › `never returns NaN…` (perYear/perMonth null con lecturas del mismo día).
- R4: [x] `stats.test.ts` › `spreads the distance by month` (ejemplo exacto del design 3100/2800/0; serie sin huecos y suma = distancia con lecturas a mitad de mes); integración afirma 631/369/0.
- R5: [x] `stats.test.ts` › `returns no monthly distance without two readings` (`[]` con 0 y 1 lecturas).
- R6: [x] `stats.test.ts` › `computes consumption between full tanks` (800 / 45 / 5.63, parcial previo al primer lleno ignorado).
- R7: [x] `stats.test.ts` › `skips segments with a missed refuel` (missed en parcial intermedio y en lleno de cierre excluyen; missed en el lleno de apertura no).
- R8: [x] `stats.test.ts` › `skips segments without distance` (tramo 0 excluido de la serie y del medio; medio null si solo hay tramo 0).
- R9: [x] `stats.test.ts` › `weights the average consumption by distance` (tramos 10 y 5 → 5.5, no 7.5).
- R10: [x] `stats.test.ts` › `returns null consumption without two full tanks` (null y serie vacía).
- R11: [x] `stats.test.ts` › `computes the cost per distance` (105.3/3000 → 0.035).
- R12: [x] mismo test (120/3000 → 0.04, mantenimiento sin coste ignorado).
- R13: [x] `stats.test.ts` › `returns null cost per distance without distance` (sin lecturas y con distancia 0).
- R14: [x] `stats.test.ts` › `computes the total cost of ownership` (con y sin precio; 10.1 + 20.2 = 30.3 sin ruido).
- R15: [x] `stats.test.ts` › `groups maintenance spending by category` (orden desc, null excluido, 0 incluido).
- R16: [x] `stats.test.ts` › `spreads spending by month` (meses vacíos a 0, separados, `[]` sin datos con coste; mantenimiento null no extiende el rango).
- R17: [x] `stats.test.ts` › `never returns NaN or Infinity with zero quantities or prices` (recorrido recursivo `Number.isFinite`, `pricePerUnit: 0` incluido, más valores concretos).
- R18: [x] `apps/api/test/stats.test.ts` › `returns the stats of a vehicle with data` (200 y `toEqual` de la respuesta completa con cifras exactas).
- R19: [x] `stats.test.ts` (api) › `returns empty stats for a vehicle without data` (respuesta completa con ratios null, gastos 0, purchase/total = 9 999.99, series vacías).
- R20: [x] `stats.test.ts` (api) › `hides other users' vehicles` (ajeno e inexistente → 404 problem+json `Vehicle not found`; sin sesión → 401).
- R21: [x] `returns the stats of a vehicle with data` compara `spending.maintenance` con `GET …/maintenance/spending`.
- R22: [x] `keeps the stored units` (tras PATCH a mi/gal/USD la respuesta es idéntica).

## Tasks
- T1..T11: [x]

## Checkpoints
- C1: [x] `pnpm harness` 0; una feature activa (#24 in_progress); rama `feat/vehicle-stats-api`.
- C2: [x] Tres archivos del spec; EARS con tabla acceptance; tasks `[x]`; cada R con test leído.
- C3: [x] Diff limitado a los archivos de la tabla del design (+ `progress/`). Export de `byDateThenValue` justificado (lo pide el design para ordenar igual que `latestOdometerReading`).
- C4: [x] Módulo `stats/{routes,service}.ts` sin repository, justificado en design (sin tabla propia); cableado en `app.ts`; params con `idParamSchema` y respuesta con `vehicleStatsSchema`; propiedad con `findOwned` → `NotFoundError`; sin cambios de BD ni web; lógica pura en `packages/shared` con tests.
- C5: [x] Sin `any`/`@ts-ignore`/`console.log`/TODO; meses vía `slice(0, 7)` y días UTC con `Date.parse`; sin conversión de unidades.
- C6: [x] `pnpm harness --full` en verde (ejecutado por el reviewer: shared 75, api 194, web 234 tests); integración sobre SQLite en memoria sin mocks; sin UI, no aplican capturas.
- C7: [x] `progress/impl_vehicle-stats-api.md` completo; `progress/current.md` al día; `docs/PLAN.md` no cambia (la fase 5 sigue en curso hasta #25).

## Hallazgos
Ninguno bloqueante. Revisados: interpolación en fronteras de mes (siempre `before`/`after` válidos y `span > 0` porque la frontera es estrictamente posterior a la primera lectura y no posterior a la última), desempate de repostajes del mismo día (el `reverse()` del listado `desc(date, odometer, createdAt)` deja orden de creación ascendente y `sort` es estable), `ratio` única con guardia `denominator > 0` y `isFinite`, redondeo solo en la salida.

## Avisos para el humano (no bloquean)
- `quantity` de cada tramo se redondea a 3 decimales en `consumptionBySegment` (no fijado en el design). Solo afecta a la salida; consumo y media usan la suma sin redondear. Razonable para evitar ruido de coma flotante.
- `byDateThenValue` pasa a ser exportado público de `@ikrive/shared` (antes interno).
- R7 se interpreta como «missedPrevious en el lleno de apertura no invalida el tramo que abre», coherente con el texto del requirement y con el test.

## Cambios requeridos
Ninguno.
