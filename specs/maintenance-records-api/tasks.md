# Tasks — maintenance-records-api

- [ ] T1 — Mover `optionalText`, `odometerValueSchema` y `moneySchema` a `packages/shared/src/schemas/common.ts` (exportados) e importarlos en `schemas/vehicles.ts`. Cubre: R2.
- [ ] T2 — Crear `packages/shared/src/schemas/maintenance.ts` (alta, edición sin default en `includeInReport`, respuesta, params y tipos) y exportarlo en `src/index.ts`. Cubre: R2, R3.
- [ ] T3 — Tests en `packages/shared/src/schemas/maintenance.test.ts`: `rejects categories outside MAINTENANCE_CATEGORIES`, `stores blank optional texts as null`, `does not default includeInReport on update`. Cubre: R2.
- [ ] T4 — Tabla `maintenanceRecords` en `apps/api/src/db/schema/maintenance.ts` (FK `vehicleId` cascade, `odometerReadingId` set null + índice único, índice `vehicle_id, date`), reexportarla en `schema/index.ts` y ejecutar `pnpm --filter api db:generate`. Cubre: R1.
- [ ] T5 — `apps/api/src/modules/maintenance/repository.ts`: `listByVehicle` (fecha desc, `createdAt` desc), `find`, y `create`/`update`/`delete` transaccionales que escriben también la lectura `source: 'maintenance'` según `ReadingChange`. Cubre: R1, R5, R9, R11, R12, R16.
- [ ] T6 — `apps/api/src/modules/maintenance/service.ts`: propiedad (404 vehículo y registro), fecha futura (400), `findOdometerConflict` excluyendo la lectura propia (409), cálculo de `ReadingChange` y DTO. Cubre: R6, R7, R8, R10, R13, R14, R15, R17, R18.
- [ ] T7 — `apps/api/src/modules/maintenance/routes.ts` con los cinco endpoints (201 en alta, 204 en borrado) y cableado en `apps/api/src/app.ts`. Cubre: R4, R5, R6, R7, R8.
- [ ] T8 — Test `creates, lists, reads, updates and deletes maintenance records` en `apps/api/test/maintenance.test.ts` (comprueba todos los campos persistidos, orden más reciente primero, PATCH parcial y 404 tras borrar). Cubre: R1, R4, R5, R6, R7, R8.
- [ ] T9 — Test `validates the payload` en `apps/api/test/maintenance.test.ts` (categoría inválida, título vacío, coste negativo → 400 problem+json y lista vacía). Cubre: R2, R3.
- [ ] T10 — Tests en `apps/api/test/maintenance.test.ts`: `creates a maintenance odometer reading` y `does not create a reading without odometer`. Cubre: R9, R10.
- [ ] T11 — Tests en `apps/api/test/maintenance.test.ts`: `updates the linked reading when date or odometer change` (incluye crear la lectura si no existía y que `odometer` coincide con la lectura), `ignores its own reading when validating an edit` (registro 2026-05-10/10000 movido a 2026-05-01/10500 sin otras lecturas → 200) y `removes the linked reading when odometer is cleared`. Cubre: R11, R12, R13.
- [ ] T12 — Tests en `apps/api/test/maintenance.test.ts`: `rejects a conflicting odometer on create and edit` (409 problem+json; ni registro ni lectura nuevos, ni cambios en el editado) y `rejects a future date` (400, nada guardado). Cubre: R14, R15.
- [ ] T13 — Test `deletes the linked reading with the record` en `apps/api/test/maintenance.test.ts`. Cubre: R16.
- [ ] T14 — Test `hides other users' vehicles and records` en `apps/api/test/maintenance.test.ts` (los cinco endpoints con vehículo ajeno → 404; `recordId` de otro vehículo propio y de otro usuario → 404). Cubre: R17, R18.
- [ ] T15 — Ejecutar `pnpm harness --full` y documentar trazabilidad en `progress/impl_maintenance-records-api.md`. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18.
