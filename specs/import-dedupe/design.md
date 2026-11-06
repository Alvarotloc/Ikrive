# Design — import-dedupe

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `packages/shared/src/domain/vehicle-identifiers.ts` | **Nuevo.** `normalizeVehicleIdentifier` y `findMatchingVehicles` (puras). Re-export en `index.ts`. |
| shared | `packages/shared/src/schemas/data-import.ts` | `DUPLICATE_IMPORT_PROBLEM_TYPE`, `importedVehicleMatchSchema` y `matchingVehicles` en `dataImportSummarySchema`. |
| api | `apps/api/src/db/schema/data-imports.ts` | **Nuevo.** Tabla `data_imports`; export en `schema/index.ts`. |
| api | `apps/api/src/db/migrations/0012_data_imports.sql` | Generada con `pnpm db:generate` (renombrada como las anteriores, `meta/_journal.json` incluido). |
| api | `apps/api/src/lib/errors.ts` | `AppError` admite `type` opcional (por defecto `about:blank`); `ConflictError(detail?, { type? })`. |
| api | `apps/api/src/plugins/errors.ts` | Usa `error.type` en el problem. |
| api | `apps/api/src/modules/data-import/repository.ts` | `hasImport(userId, sha256)`, `vehicles(userId)` y `insert(userId, plan, sha256)` con la fila de `data_imports` dentro de la transacción. |
| api | `apps/api/src/modules/data-import/service.ts` | Huella, comprobación previa, coincidencias en el resumen. |
| web | `apps/web/src/features/data-portability/import.ts` | `importErrorKey` distingue el 409 repetido por `type`. |
| web | `apps/web/src/features/data-portability/data-section.tsx` | Aviso de vehículos coincidentes bajo el resumen. |
| web | `apps/web/src/i18n/locales/{es,en}.json` | `dataPortability.errors.duplicate`, `dataPortability.matchingVehicles.*`. |
| docs | `docs/PLAN.md` | Modelo de datos: `data_imports`. |
| tests | `packages/shared/src/domain/vehicle-identifiers.test.ts`, `apps/api/test/data-import.test.ts`, `apps/api/test/admin-users.test.ts`, `apps/web/src/features/data-portability/{import.test.ts,data-section.test.tsx}` | Ver `tasks.md`. |

## Base de datos

```ts
// apps/api/src/db/schema/data-imports.ts
export const dataImports = sqliteTable('data_imports', {
  id: text().primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text().notNull().references(() => user.id, { onDelete: 'cascade' }),
  /** Hex SHA-256 of the bytes of the imported `data.json`. */
  dataSha256: text().notNull(),
  createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => [uniqueIndex('data_imports_user_id_data_sha256_idx').on(t.userId, t.dataSha256)]);
```

- `ON DELETE CASCADE` desde `user`: el borrado de cuenta del admin (`admin-users` › `repo.delete`) limpia las huellas sin código nuevo (R7). Es el único borrado de cuenta que existe; no hay «borrar mis datos».
- Las huellas **no** se exportan (no son datos del usuario) y la migración no rellena nada (ver «Imports anteriores»).

## Contrato HTTP

`POST /api/me/import` — sin cambios en la petición. Cambios en las respuestas:

| Respuesta | Cuándo | R |
|---|---|---|
| 201 `DataImportSummary` + `matchingVehicles` | Import completo (con o sin coincidencias) | R1, R5, R9, R10 |
| 409 `type: DUPLICATE_IMPORT_PROBLEM_TYPE` | Huella ya registrada para el usuario (comprobación previa o `UNIQUE`) | R2, R3, R4 |
| 409 `type: about:blank` | Moneda/unidades distintas (sin cambios, #35 R7) | — |

```ts
// packages/shared/src/schemas/data-import.ts
export const DUPLICATE_IMPORT_PROBLEM_TYPE = 'urn:ikrive:problem:duplicate-import';
const vehicleRefSchema = z.object({ id: z.string(), name: z.string().nullable(), make: z.string(), model: z.string() });
export const importedVehicleMatchSchema = z.object({
  imported: vehicleRefSchema,          // id nuevo del vehículo creado
  existing: vehicleRefSchema,          // vehículo que la cuenta ya tenía
  matchedBy: z.array(z.enum(['plate', 'vin'])).min(1),
});
// dataImportSummarySchema: + matchingVehicles: z.array(importedVehicleMatchSchema)
```

Detail del 409 repetido (inglés, como el resto): `This export was already imported into your account on <ISO date>`.

```ts
// packages/shared/src/domain/vehicle-identifiers.ts
normalizeVehicleIdentifier(value: string | null): string | null
// value.toUpperCase().replace(/[^\p{L}\p{N}]/gu, '') || null   →  '1234-abc ' y '1234 ABC' → '1234ABC'
findMatchingVehicles(imported: VehicleIdentity[], existing: VehicleIdentity[]): ImportedVehicleMatch[]
// VehicleIdentity = { id, name, make, model, plate, vin }; orden: el de `imported`, luego el de `existing`
```

## Flujo (cambios sobre #35)

1. Tras `zip.read(data.json)`: `hash = sha256(buffer)`; luego `parseDocument` (un 400 sigue ganando a todo).
2. `repo.hasImport(userId, hash)` → `ConflictError(…, { type: DUPLICATE_IMPORT_PROBLEM_TYPE })` **antes** de `checkSettings` (R4: si el usuario cambió sus unidades desde el primer import, lo útil es saber que ya está importado) y antes de leer o guardar ningún fichero. Es un atajo: la garantía es el paso 4.
3. `existing = repo.vehicles(userId)` (todos, también archivados y vendidos) antes de insertar; tras `buildPlan`, `findMatchingVehicles(plan.vehicles, existing)`. Las coincidencias entre vehículos del propio export no se señalan.
4. `repo.insert(userId, plan, hash)`: dentro de la misma `db.transaction` síncrona inserta **primero** la fila de `data_imports` y después el resto. Si el `INSERT` viola el `UNIQUE (user_id, data_sha256)` (`SQLITE_CONSTRAINT_UNIQUE` en el error o en su `cause`, según cómo lo envuelva drizzle), lanza el mismo `ConflictError`; la transacción hace rollback y el `catch` existente del servicio borra los ficheros ya guardados (R3, R6).
5. Respuesta: `{ ...counts, photos, skipped, matchingVehicles }`.

**Concurrencia.** better-sqlite3 ejecuta cada transacción de forma síncrona en un único proceso (la imagen es un solo proceso con un solo `Db`), así que dos imports simultáneos pasan ambos el paso 2, pero sus transacciones se serializan y el segundo choca con el `UNIQUE`. Aunque hubiera varios procesos sobre el mismo fichero, el índice único lo garantiza igualmente.

## Web

- `importErrorKey`: `status === 409 && problem.type === DUPLICATE_IMPORT_PROBLEM_TYPE` → `dataPortability.errors.duplicate`; el resto de 409 sigue en `errors.settings`. El toast mantiene `detail` como descripción.
- `data-section.tsx`: si `summary.matchingVehicles.length > 0`, bajo el resumen (y junto al aviso de canales omitidos) un `<div role="status">` con el título `dataPortability.matchingVehicles.title` y una lista: `dataPortability.matchingVehicles.item` con `{{imported}}`, `{{existing}}` y `{{fields}}` (`fields.plate` / `fields.vin` / `fields.both`). Nombres con `vehicleDisplayName` (`features/vehicles/display.ts`). Mismo estilo que el aviso de canales (`rounded-lg border bg-muted p-3 text-sm`), válido en claro/oscuro y móvil.
- Textos de ejemplo (es): «Este export ya se importó en tu cuenta» · «Revisa estos vehículos: puede que ya los tuvieras» · «{{imported}} coincide con {{existing}} por {{fields}}».

## Imports anteriores a esta feature

Los imports hechos antes no tienen huella y no se puede calcular (el zip no se guarda). El primer reimport de un zip antiguo tras actualizar **se acepta** y registra la huella; desde ahí, R2 aplica. Ese caso queda cubierto por el aviso de R9: los vehículos duplicados coincidirán por matrícula/VIN si los tienen.

## Alternativas descartadas

- **Solo `SELECT` previo, sin `UNIQUE`**: dos peticiones simultáneas pasarían ambas la comprobación (el guardado de ficheros es asíncrono entre medias) y duplicarían todo.
- **Huella del zip entero**: recomprimir el mismo export (o un zip con `__MACOSX/`) cambia los bytes sin cambiar los datos. `data.json` es lo que se importa.
- **Huella de un JSON canónico sin `exportedAt`**: detectaría dos exports distintos de la misma cuenta sin cambios, pero exige canonicalizar (orden de claves, números) y el acceptance pide el SHA-256 de `data.json`. Las coincidencias de R9 ya cubren ese caso con un aviso.
- **Bloquear (o fusionar) vehículos con la misma matrícula/VIN**: el acceptance pide avisar sin bloquear; un coche vendido y recomprado o una matrícula reasignada son casos legítimos.
- **Guardar la huella en `vehicles`**: un export sin vehículos (solo canales) no tendría dónde, y no permite un `UNIQUE` por usuario.

## Decisiones a validar (Gate 1)

1. **`type` del problem** `urn:ikrive:problem:duplicate-import` para distinguir los dos 409 (RFC 7807 lo prevé; hoy todos son `about:blank`).
2. **Borrar los vehículos importados no libera la huella**: para volver a importar ese zip habría que hacerlo en otra cuenta. Alternativa (fuera de alcance): enlazar la huella con los vehículos creados y liberarla cuando no quede ninguno.
3. **Orden**: 400 de documento > 409 repetido > 409 de ajustes > resto.
4. **Normalización** (R8): mayúsculas y solo letras/dígitos Unicode, sin transliterar (`Ñ` ≠ `N`). Se compara contra todos los vehículos de la cuenta, incluidos archivados y vendidos; una entrada por par.
5. **Imports anteriores sin huella**: se aceptan una vez (ver sección).

## Riesgos

- Las huellas crecen con cada import (una fila de ~100 B): despreciable.
- Un mismo `data.json` editado a mano (un byte) ya no es repetido: es intencionado, la huella detecta accidentes, no manipulaciones.

## Fuera de alcance

- Liberar huellas al borrar vehículos, listar o borrar huellas desde la UI.
- Deduplicar registros individuales (mantenimientos, repostajes) o fusionar vehículos.
