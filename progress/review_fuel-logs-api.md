# Review — #22 fuel-logs-api

**Veredicto:** APPROVED

## Trazabilidad requirements ↔ tests
- R1: [x] `apps/api/test/fuel-logs.test.ts:56` › `creates, lists, reads, updates and deletes fuel logs` (lee la fila de `fuel_logs` en BD con todos los campos y `odometerReadingId`; la migración `0009_fuel_logs.sql` se aplica en `createTestApp`)
- R2: [x] `apps/api/test/fuel-logs.test.ts:349` › `deletes fuel logs with the vehicle` (2 filas → 0 tras `DELETE /api/vehicles/:id`)
- R3: [x] `packages/shared/src/schemas/fuel-logs.test.ts:73,88` (0, negativos, >10 000, odómetro ausente/null/decimal) + `apps/api/test/fuel-logs.test.ts:126` › `validates the payload`
- R4: [x] `packages/shared/src/domain/fuel.test.ts:16` (50/3 → 16.667) + `apps/api/test/fuel-logs.test.ts:157` (201 con `pricePerUnit: 16.667`)
- R5: [x] `packages/shared/src/domain/fuel.test.ts:28` (35.27 × 1.549 → 54.63; 3 × 0.1 → 0.3) + `apps/api/test/fuel-logs.test.ts:164-172`
- R6: [x] `packages/shared/src/domain/fuel.test.ts:44` + `apps/api/test/fuel-logs.test.ts:174-183` (60 y 1.459 con 40 L se guardan tal cual)
- R7: [x] `packages/shared/src/schemas/fuel-logs.test.ts:61` (path `totalPrice`) + `apps/api/test/fuel-logs.test.ts:136` (400 problem+json)
- R8: [x] `apps/api/test/fuel-logs.test.ts:126` (alta y PATCH → 400 `application/problem+json`; lista y lecturas vacías; repostaje intacto tras PATCH inválidos)
- R9: [x] `apps/api/test/fuel-logs.test.ts:89-90` (`fullTank: true`, `missedPrevious: false`) + `packages/shared/src/schemas/fuel-logs.test.ts:96`
- R10: [x] `apps/api/test/fuel-logs.test.ts:59-79` (201 y cuerpo completo con ambos precios)
- R11: [x] `apps/api/test/fuel-logs.test.ts:91-108` (desempate por fecha, `odometer` y `createdAt` con `createdAt` forzado en BD)
- R12: [x] `apps/api/test/fuel-logs.test.ts:110-112`
- R13: [x] `apps/api/test/fuel-logs.test.ts:114-117` (PATCH de `missedPrevious` conserva `fullTank: false`)
- R14: [x] `apps/api/test/fuel-logs.test.ts:186` › `recomputes prices on edit` (solo `quantity`, solo `pricePerUnit`, `quantity` + `totalPrice`, ambos)
- R15: [x] `apps/api/test/fuel-logs.test.ts:208-217` (PATCH de `date` + `fullTank`: precios intactos)
- R16: [x] `apps/api/test/fuel-logs.test.ts:119-123` (204 y luego 404 y lista con 4)
- R17: [x] `apps/api/test/fuel-logs.test.ts:220` › `creates a fuel odometer reading` (fecha, valor, `source: 'fuel'` y enlace en BD)
- R18: [x] `apps/api/test/fuel-logs.test.ts:232` (misma lectura actualizada por fecha y por km; recreación con FK a null; odómetro = lectura)
- R19: [x] `apps/api/test/fuel-logs.test.ts:272` (mover fecha atrás y km arriba sobre su propia lectura → 200)
- R20: [x] `apps/api/test/fuel-logs.test.ts:282` (409 en alta y edición; sin repostaje ni lectura nuevos; repostaje y lecturas sin cambios)
- R21: [x] `apps/api/test/fuel-logs.test.ts:309` (400 con detalle exacto, nada guardado en alta ni en edición)
- R22: [x] `apps/api/test/fuel-logs.test.ts:327` (solo queda la lectura manual)
- R23: [x] `apps/api/test/fuel-logs.test.ts:337` (409 problem+json, lectura y repostaje siguen) + `apps/api/test/vehicles.test.ts:158`
- R24: [x] `apps/api/test/fuel-logs.test.ts:364` (los 5 endpoints con vehículo ajeno → 404 `Vehicle not found`)
- R25: [x] `apps/api/test/fuel-logs.test.ts:387-410` (`logId` de otro vehículo propio y de otro usuario → 404 `Fuel log not found` en GET/PATCH/DELETE; nada alterado)
- R26: [x] `packages/shared/src/domain/fuel.test.ts:5` (incluye `plugin_hybrid` → volumeUnit)

## Tasks
- T1..T16: [x]

## Checkpoints
- C1: [x] Arnés en verde; única feature activa #22; rama `feat/fuel-logs-api`.
- C2: [x] Spec completo, EARS, tabla de acceptance; tasks `[x]`; cada R con test leído.
- C3: [x] El diff solo toca los archivos de la tabla de `design.md` (+ `progress/`). Sin refactors ajenos.
- C4: [x] `modules/fuel-logs/{routes,service,repository}.ts` cableado en `app.ts`; validación con esquemas de `@ikrive/shared`; propiedad → 404; `NotFoundError`/`BadRequestError`/`ConflictError`; esquema en `db/schema/fuel.ts` + migración drizzle-kit `0009`; lógica pura en `packages/shared` con tests. Sin web (N/A).
- C5: [x] Sin `any`/`@ts-ignore`; fechas `YYYY-MM-DD` (`isoDateSchema`); km sin conversión; sin `console.log` ni TODOs. Sin ficheros subidos (N/A).
- C6: [x] `pnpm harness --full` en verde (ejecutado por el reviewer: shared 60, api 190, web 183). SQLite en memoria, sin mocks. Sin UI → sin capturas (N/A).
- C7: [x] `progress/impl_fuel-logs-api.md` con archivos, mapa R→test y salida; `progress/current.md` actualizado. `docs/PLAN.md` no requiere cambio (la fase 5 no se cierra con esta feature).

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- `packages/shared/src/domain/fuel.ts:35-36` — Con entradas extremas el precio calculado puede redondearse a 0 (p. ej. `pricePerUnit: 0.001`, `quantity: 1` → `totalPrice: 0`; o `totalPrice: 0.01`, `quantity: 100` → `pricePerUnit: 0`). Se guardaría un precio 0, aunque el esquema exige precios positivos en la entrada. Es un caso irreal; conviene tenerlo en cuenta para el consumo/coste de la feature 24.
- Un `PATCH` con cuerpo `{}` responde 200 y solo actualiza `updatedAt`. Es coherente con R13 y hace lo mismo que otros módulos.
- La unidad de `quantity` (L/gal/kWh) es solo una etiqueta: si cambia el `fuelType` del vehículo, los repostajes antiguos se reinterpretan. Es un riesgo ya asumido en la decisión 1 del design.

## Cambios requeridos
Ninguno.
