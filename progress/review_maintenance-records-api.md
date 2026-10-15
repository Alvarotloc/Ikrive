# Review — #4 maintenance-records-api

**Veredicto:** APPROVED

## Trazabilidad requirements ↔ tests
- R1: [x] `apps/api/test/maintenance.test.ts:55` › `creates, lists, reads, updates and deletes maintenance records` (la migración `0002_maintenance_records.sql` se aplica en `createTestApp`; `toEqual` sobre todos los campos persistidos, incluidos `cost` real e `includeInReport: false`)
- R2: [x] `packages/shared/src/schemas/maintenance.test.ts:11` › `rejects categories outside MAINTENANCE_CATEGORIES`, `:16` `stores blank optional texts as null`, `:27` `does not default includeInReport on update`; `maintenance.test.ts:128` › `validates the payload` (categoría inválida en alta y PATCH → 400)
- R3: [x] `maintenance.test.ts:128` › `validates the payload` (5 cuerpos inválidos → 400 `application/problem+json`, lista vacía; PATCH inválido no altera el registro)
- R4: [x] `maintenance.test.ts:58-81` (201 y cuerpo completo)
- R5: [x] `maintenance.test.ts:91-106` (orden fecha desc y, a igual fecha, `createdAt` desc, con `createdAt` forzado para que el orden no sea casual)
- R6: [x] `maintenance.test.ts:108-110` (200 y cuerpo igual al creado)
- R7: [x] `maintenance.test.ts:112-119` (PATCH parcial: cambian `title` y `cost`, el resto igual)
- R8: [x] `maintenance.test.ts:121-125` (204, luego 404 en GET/PATCH/DELETE, lista con 3)
- R9: [x] `maintenance.test.ts:152` › `creates a maintenance odometer reading` (lectura con fecha, valor y `source: 'maintenance'`)
- R10: [x] `maintenance.test.ts:161` › `does not create a reading without odometer` (sin campo y con `null` → 0 lecturas)
- R11: [x] `maintenance.test.ts:168` › `updates the linked reading when date or odometer change` (misma `id` de lectura con fecha y valor nuevos; crea la lectura si no existía; `odometer` del registro coincide con la lectura)
- R12: [x] `maintenance.test.ts:214` › `removes the linked reading when odometer is cleared` (0 lecturas, registro conservado)
- R13: [x] `maintenance.test.ts:202` › `ignores its own reading when validating an edit` (05-10/10000 → 05-01/10500: sin el filtro daría 409)
- R14: [x] `maintenance.test.ts:225` › `rejects a conflicting odometer on create and edit` (409 problem+json con el mensaje; ni registro ni lectura nuevos; el editado y las lecturas siguen iguales)
- R15: [x] `maintenance.test.ts:252` › `rejects a future date` (alta con y sin km y edición → 400; nada guardado ni modificado)
- R16: [x] `maintenance.test.ts:268` › `deletes the linked reading with the record` (queda solo la lectura `manual`)
- R17: [x] `maintenance.test.ts:278-298` › `hides other users' vehicles and records` (los 5 endpoints con vehículo ajeno → 404 `Vehicle not found`)
- R18: [x] `maintenance.test.ts:300-323` (recordId de otro vehículo propio y de otro usuario → 404 `Maintenance record not found` en GET/PATCH/DELETE; los registros originales siguen intactos)

## Tasks
- T1..T15: [x]

## Checkpoints
- C1: [x] `pnpm harness` OK; una sola feature activa (#4 `in_progress`); rama `feat/maintenance-records-api`.
- C2: [x] Los tres archivos del spec; EARS con tabla de acceptance; T1–T15 `[x]`; cada R abierto y verificado arriba.
- C3: [x] El diff toca solo los archivos de la tabla de `design.md` (más `progress/`). El cambio en `app.ts` (compartir `vehiclesRepo`) es el cableado que exige el diseño (`vehicles: VehiclesRepository`).
- C4: [x] `modules/maintenance/{routes,service,repository}.ts` cableados en `app.ts`; las rutas validan con esquemas de `@ikrive/shared`; propiedad en el servicio (`findOwned` + `find(vehicleId, id)`) → 404; errores `NotFoundError`/`BadRequestError`/`ConflictError`; esquema en `db/schema/maintenance.ts` con migración drizzle-kit incluida (SQL + snapshot + journal). Sin web. Sin lógica de dominio nueva (se reutiliza `findOdometerConflict`).
- C5: [x] Sin `any`, `@ts-ignore`, `console.log` ni TODOs; `date` como `YYYY-MM-DD` (`isoDateSchema`, columna `text`); `odometer` sin conversión de unidad. No hay ficheros subidos.
- C6: [x] `pnpm harness --full` en verde (lint, typecheck; tests shared 11, api 25, web 15). Tests sobre SQLite en memoria, sin mocks, afirmando estado, cuerpo y filas. Sin UI, sin capturas.
- C7: [x] `progress/impl_maintenance-records-api.md` completo; `progress/current.md` describe la sesión; `docs/PLAN.md` no cambia (la fase 3 no se cierra y no cambia ninguna decisión).

## Hallazgos
Ninguno bloqueante. Lo revisé en concreto:
- Transacciones: `create`/`update`/`delete` del repositorio escriben registro y lectura en una única `db.transaction`. La validación (400/409) se hace antes de escribir, así que no quedan escrituras parciales (R14, R15).
- `update` con `remove`: primero pone `odometerReadingId = null` en el registro y después borra la lectura. El orden es correcto con la FK `set null` y el índice único.
- PATCH con `includeInReport` ausente no lo resetea (esquema de edición sin default, cubierto por un test).

## Avisos para el humano (no bloquean)
- `service.ts:540-542`: un PATCH que solo toca `title` vuelve a validar la fecha y el `odometer` actuales. Si en el futuro aparece una lectura que choca con la del registro por otra vía (p. ej. repostajes en la fase 5), editar solo el título daría 409. Hoy no puede pasar porque `addReading` ya valida contra esa lectura. Lo dejó documentado el implementer como decisión del diseño.
- `service.ts:547`: si un registro tiene `odometer` pero ha perdido su lectura (solo puede ocurrir por `set null`, que hoy no se alcanza), un PATCH con el mismo `odometer` y la misma fecha da `keep` y no recrea la lectura. Es un caso teórico.
- No hay test que borre un vehículo con mantenimientos con km (cascada de `vehicles` sobre `maintenance_records` y `odometer_readings` junto con `set null`). No lo pide ningún R; conviene añadirlo cuando la feature 6 permita borrar vehículos desde la timeline.
- `progress/explore_maintenance-records-api_code.md` está sin trackear; el leader decide si se commitea.

## Cambios requeridos
Ninguno.
