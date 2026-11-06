# Implementación — import-dedupe (#44)

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `packages/shared/src/domain/vehicle-identifiers.ts` | **Nuevo.** `VehicleIdentity`, `normalizeVehicleIdentifier` (mayúsculas, solo `\p{L}\p{N}`, vacío → `null`) y `findMatchingVehicles` (una entrada por par, orden de `imported` y luego de `existing`, `matchedBy` en orden `plate`, `vin`). |
| `packages/shared/src/domain/vehicle-identifiers.test.ts` | **Nuevo.** Tests unitarios (ver trazabilidad). |
| `packages/shared/src/index.ts` | Re-export del módulo nuevo. |
| `packages/shared/src/schemas/data-import.ts` | `DUPLICATE_IMPORT_PROBLEM_TYPE = 'urn:ikrive:problem:duplicate-import'`, `importedVehicleMatchSchema` (+ tipo `ImportedVehicleMatch`) y `matchingVehicles` en `dataImportSummarySchema`. |
| `apps/api/src/db/schema/data-imports.ts` | **Nuevo.** Tabla `data_imports` (`user_id` → `user.id` `ON DELETE CASCADE`, `data_sha256`, `created_at`) con `UNIQUE (user_id, data_sha256)`. Export en `schema/index.ts`. |
| `apps/api/src/db/migrations/0012_data_imports.sql`, `meta/0012_snapshot.json`, `meta/_journal.json` | Generados con `pnpm db:generate`; renombrada `0012_clammy_mephistopheles` → `0012_data_imports` (fichero y `tag` del journal). |
| `apps/api/src/lib/errors.ts` | `AppError` con `type` opcional (por defecto `about:blank`) como 5º parámetro; `ConflictError(detail?, { type? })`. |
| `apps/api/src/plugins/errors.ts` | El problem usa `error.type`. |
| `apps/api/src/modules/data-import/repository.ts` | `duplicateImportError(importedAt)` (409 repetido); `hasImport(userId, sha256)` → fecha del import anterior o `null`; `vehicles(userId)` (todos, también archivados y vendidos); `insert(userId, plan, sha256)` inserta primero la fila de `data_imports` dentro de la misma transacción y traduce `SQLITE_CONSTRAINT_UNIQUE` (en el error o su cadena de `cause`) al 409 repetido. `ImportPlan.vehicles` tipa `id` como obligatorio. |
| `apps/api/src/modules/data-import/service.ts` | Huella de los bytes de `data.json` tras leerlo; `parseDocument` (el 400 gana); `repo.hasImport` antes de `checkSettings` y de leer/guardar ficheros; `repo.vehicles` antes de insertar y `findMatchingVehicles(plan.vehicles, existing)` en la respuesta. El `catch` existente borra los ficheros guardados si el `UNIQUE` salta. |
| `apps/api/test/data-import.test.ts` | `snapshot` cuenta también `data_imports`; `importWith` subido a nivel de fichero con un `repo` parcial opcional; fixture de `imports an export` con `matchingVehicles: []`; nuevo `describe('dedupe')` con 8 tests. |
| `apps/api/test/admin-users.test.ts` | Test `deletes the import fingerprints with the account`. |
| `apps/web/src/features/data-portability/import.ts` | `importErrorKey`: 409 con `type === DUPLICATE_IMPORT_PROBLEM_TYPE` → `dataPortability.errors.duplicate`; el resto de 409 sigue en `errors.settings`. |
| `apps/web/src/features/data-portability/data-section.tsx` | Con `matchingVehicles` no vacío, bajo el resumen, `<div role="status">` (`rounded-lg border bg-muted p-3 text-sm`) con título y lista `«{{imported}} coincide con {{existing}} por {{fields}}»`. |
| `apps/web/src/features/data-portability/{import.test.ts,data-section.test.tsx}` | Tests nuevos y fixture con `matchingVehicles: []`. |
| `apps/web/src/i18n/locales/{es,en}.json` | `dataPortability.errors.duplicate` y `dataPortability.matchingVehicles.{title,item,fields.{plate,vin,both}}`. |
| `docs/PLAN.md` | `data_imports` en el modelo de datos. |
| `specs/import-dedupe/tasks.md` | T1–T14 marcadas. |
| `progress/current.md` | Bitácora. |

## Trazabilidad

| R | Test |
|---|---|
| R1 | `apps/api/test/data-import.test.ts › dedupe › records the fingerprint of an import` |
| R2 | `data-import.test.ts › dedupe › rejects an export already imported into the account` (re-zip con otros bytes y el mismo `data.json` → 409 `type` repetido, `detail` con la fecha, `snapshot` sin cambios) |
| R3 | `data-import.test.ts › dedupe › rejects concurrent imports of the same export`; `› relies on the unique index when the pre-check misses` (`hasImport: () => null`) |
| R4 | `data-import.test.ts › dedupe › reports a repeated import before different settings` |
| R5 | `data-import.test.ts › dedupe › imports the same export into another account` |
| R6 | `data-import.test.ts › dedupe › does not record the fingerprint of a failed import`; además, todos los tests de rechazo con `expectRejected` comprueban ahora `dataImports` en el `snapshot` |
| R7 | `apps/api/test/admin-users.test.ts › DELETE /api/admin/users/:id › deletes the import fingerprints with the account` |
| R8 | `packages/shared/src/domain/vehicle-identifiers.test.ts › normalizeVehicleIdentifier › normalizes plates and VINs` |
| R9 | `vehicle-identifiers.test.ts › findMatchingVehicles › finds vehicles matching by plate or VIN`; `data-import.test.ts › dedupe › reports vehicles matching by plate or VIN`; `› POST /api/me/import › imports an export` (`matchingVehicles: []`) |
| R10 | `data-import.test.ts › dedupe › reports vehicles matching by plate or VIN` (vehículos existentes iguales, 5 vehículos, matrícula importada tal cual) |
| R11 | `apps/web/src/features/data-portability/import.test.ts › maps a repeated import to its own message`; `data-section.test.tsx › shows a repeated import in a toast` |
| R12 | `data-section.test.tsx › warns about vehicles matching existing ones` (matrícula, VIN y ambos); `› shows no matching vehicles notice without matches` |
| R13 | `apps/web/src/i18n/locales.test.ts` (mismas claves en es/en) |

## Revisión visual

SPA de producción (`pnpm --filter @ikrive/web build`) servida por la API (`WEB_DIST_DIR`, puerto 3197, `DATA_DIR` temporal). Cada usuario crea 3 vehículos (matrícula, VIN, ambos), exporta e importa su propio export (coinciden consigo mismos) y lo vuelve a importar (409 repetido). Capturas:

- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/e954de68-c5f6-4df3-8cbb-8a91d6eddf83/scratchpad/shots/matches-light.png`
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/e954de68-c5f6-4df3-8cbb-8a91d6eddf83/scratchpad/shots/matches-dark.png`
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/e954de68-c5f6-4df3-8cbb-8a91d6eddf83/scratchpad/shots/matches-mobile.png`
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/e954de68-c5f6-4df3-8cbb-8a91d6eddf83/scratchpad/shots/duplicate-light.png`, `duplicate-dark.png`, `duplicate-mobile.png` (página con el toast)
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/e954de68-c5f6-4df3-8cbb-8a91d6eddf83/scratchpad/shots/duplicate-toast-light.png`, `duplicate-toast-dark.png`, `duplicate-toast-mobile.png` (solo el toast)

Observación fuera de alcance: en modo oscuro los toasts de `sonner` son blancos (ya pasaba con el de éxito antes de esta feature).

## `pnpm harness --full`

```
[OK]    47 features: 44 done, 2 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #44 import-dedupe (in_progress)
[OK]    Rama actual: feat/import-dedupe
[OK]    pnpm lint
[OK]    pnpm typecheck
e2e              Tests 1 passed (1)
packages/shared  Tests 119 passed (119)
apps/web         Tests 346 passed (346)
apps/api         Tests 321 passed (321)
[OK]    pnpm test
[OK]    Arnés en verde.
```

Además `pnpm test:e2e`: 6 passed (incluido `data-portability.spec.ts`, que importa una vez un export recién generado).

## Desviaciones del spec

- **`vehicleTitle` en vez de `vehicleDisplayName`**: el design cita `vehicleDisplayName` de `features/vehicles/display.ts`, pero ahí el helper es `vehicleTitle` (alias o marca + modelo), el que usa el resto de la web. Mismo comportamiento.
- **`hasImport` devuelve `Date | null`, no un booleano**: el `detail` del 409 lleva la fecha del primer import (design › Contrato HTTP), así que la comprobación previa devuelve esa fecha. En T7 el test sustituye `hasImport: () => null` en vez de `() => false`. En la vía del `UNIQUE`, la fecha se lee tras el rollback (la fila de la otra transacción ya está confirmada).
- **`ImportPlan.vehicles` con `id: string` obligatorio** (solo el tipo): `buildPlan` ya lo rellenaba siempre; así `findMatchingVehicles` recibe los ids nuevos sin casts.
- **`importWith` subido a nivel de fichero** en `data-import.test.ts`, con un `repo` parcial opcional, para reutilizarlo en T7 sin duplicar el montaje del servicio.
