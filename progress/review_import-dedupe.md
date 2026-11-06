# Review — #44 import-dedupe

**Veredicto:** APPROVED

## Trazabilidad requirements ↔ tests
- R1: [x] `apps/api/test/data-import.test.ts` › `dedupe › records the fingerprint of an import` (201 y exactamente una fila en `data_imports` con `userId` y el SHA-256 de `data.json`)
- R2: [x] `data-import.test.ts` › `dedupe › rejects an export already imported into the account` (zip recomprimido con otros bytes y el mismo `data.json` → 409 `application/problem+json`, `type` = `DUPLICATE_IMPORT_PROBLEM_TYPE`, `detail` con la fecha del primer import, `snapshot` de BD + `uploads/` + `tmp/` idéntico)
- R3: [x] `› rejects concurrent imports of the same export` (`Promise.all` → `[201, 409]`, 409 con `type` repetido, vehículos/adjuntos/`data_imports` de un solo import, `uploads/` solo con los 3 ficheros de uno, `tmp/` vacío) y `› relies on the unique index when the pre-check misses` (`hasImport: () => null` fuerza la vía del `UNIQUE`: 409 repetido y `snapshot` idéntico, es decir, rollback y ficheros borrados)
- R4: [x] `› reports a repeated import before different settings` (cambia `distanceUnit` a `mi` → 409 repetido, no el de ajustes; sin cambios)
- R5: [x] `› imports the same export into another account` (201 en A y B; cada una con su huella)
- R6: [x] `› does not record the fingerprint of a failed import` (415 sin huella; el mismo `data.json` corregido → 201). Además `snapshot` incluye ahora `dataImports`, así que todos los `expectRejected` existentes (400/409/413/415) verifican que no queda huella.
- R7: [x] `apps/api/test/admin-users.test.ts` › `deletes the import fingerprints with the account` (1 huella antes; tras `DELETE` del admin, 204 y tabla vacía)
- R8: [x] `packages/shared/src/domain/vehicle-identifiers.test.ts` › `normalizes plates and VINs` (mayúsculas, espacios, guiones, puntos, `ñ`→`Ñ` sin transliterar, vacío/separadores/`null` → `null`)
- R9: [x] `vehicle-identifiers.test.ts` › `finds vehicles matching by plate or VIN` (solo matrícula, solo VIN, ambos `['plate','vin']`, sin valor no coincide, un importado con dos existentes → dos entradas, orden) y `data-import.test.ts` › `reports vehicles matching by plate or VIN` (pares con ids reales y `matchedBy`; sin coincidencias → `[]`)
- R10: [x] `› reports vehicles matching by plate or VIN` (201; filas de los vehículos existentes idénticas antes/después; 5 vehículos; la matrícula importada se guarda tal cual `1234 abc`)
- R11: [x] `apps/web/src/features/data-portability/import.test.ts` › `maps a repeated import to its own message` (409 repetido → `errors.duplicate`, 409 `about:blank` → `errors.settings`) y `data-section.test.tsx` › `shows a repeated import in a toast` (texto «Este export ya se importó en tu cuenta», `detail`, ausencia del mensaje de ajustes)
- R12: [x] `data-section.test.tsx` › `warns about vehicles matching existing ones` (los tres `listitem` dentro del `role="status"` con nombre importado, existente y «matrícula» / «VIN» / «matrícula y VIN») y `› shows no matching vehicles notice without matches`
- R13: [x] `apps/web/src/i18n/locales.test.ts` (mismas claves en es/en; claves nuevas presentes en ambos `json` del diff)

## Tasks
- T1..T14: [x] (desviaciones justificadas en `impl_import-dedupe.md`: `vehicleTitle` en lugar de `vehicleDisplayName`, que no existe; `hasImport` devuelve `Date | null` para el `detail`)

## Checkpoints
- C1: [x] arnés en verde, una sola feature activa (#44 `in_progress`), rama `feat/import-dedupe`.
- C2: [x] spec completo en EARS con tabla de acceptance; tasks `[x]`; cada R con test leído.
- C3: [x] el diff solo toca los archivos de la tabla de `design.md` (más `progress/` y `tasks.md`); el movimiento de `importWith` a nivel de fichero está justificado (reutilizado en T7).
- C4: [x] lógica en `modules/data-import/{service,repository}.ts`; propiedad por `userId` en `hasImport`/`vehicles`/`insert`; 409 como `ConflictError` con `type` (RFC 7807) vía `plugins/errors.ts`; esquema en `db/schema/data-imports.ts` + migración `0012_data_imports.sql` generada (snapshot `0012` con `prevId` = id del `0011`, solo añade `data_imports`; `tag` del journal coincide con el fichero); web en `features/data-portability/`, textos en es/en; lógica pura en `packages/shared` con tests.
- C5: [x] sin `any`/`@ts-ignore`/`console.log`; `createdAt` como timestamp (no es fecha sin hora); no hay ficheros nuevos subidos.
- C6: [x] `pnpm harness --full` ejecutado por mí: verde (shared 119, web 346, api 321, e2e 1). Tests con SQLite en memoria, sin mocks de BD (el `repo` parcial de T7 solo sustituye `hasImport` para forzar la carrera). Capturas claro/oscuro/móvil referenciadas y existentes.
- C7: [x] `impl_import-dedupe.md` con archivos, mapa R→test y salida; `current.md` al día; `PLAN.md` con `data_imports` en el modelo de datos.

## Hallazgos
Ninguno bloqueante. Puntos de concurrencia comprobados:
- `repository.ts` › `insertPlan`: la fila de `data_imports` es el primer `INSERT` de la misma `db.transaction` síncrona; cualquier fallo posterior hace rollback de la huella (R6).
- La violación del `UNIQUE` se traduce al 409 repetido fuera de la transacción (tras el rollback) y el `catch` del servicio borra los ficheros de `written` antes de relanzar (R3); el test `relies on the unique index…` lo demuestra con `snapshot` idéntico (incluye `uploads/`).
- `repo.vehicles` y `repo.insert` se ejecutan sin `await` entre medias, así que `existing` es exactamente lo que había antes de este import.
- La comprobación previa va tras `parseDocument` (el 400 gana) y antes de `checkSettings` y de abrir ficheros, como fija el design.

## Avisos para el humano (no bloquean)
- `repository.ts` › `isUniqueViolation` reconoce cualquier `SQLITE_CONSTRAINT_UNIQUE`, no solo `data_imports_user_id_data_sha256_idx`. Hoy los demás `UNIQUE` de las tablas importadas no se pueden violar (ids y `storageKey` aleatorios; `data-export.ts` rechaza una lectura enlazada dos veces), pero si en el futuro alguno se pudiera, se respondería «ya importado» con la fecha actual (fallback `?? new Date()`) en lugar de un 500. Se podría acotar comprobando el nombre del índice en el mensaje.
- `service.ts`: `findMatchingVehicles` se calcula después del commit; es pura y no lanza, pero si algún día lanzara, el `catch` borraría ficheros de un import ya confirmado. Calcularla antes de `repo.insert` lo evitaría.
- Observación del implementer (preexistente, fuera de alcance): los toasts de `sonner` salen blancos en modo oscuro.

## Cambios requeridos
Ninguno.
