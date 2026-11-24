# Implementación — csv-import-apply (#85)

Rama `feat/csv-import-apply`. Tasks T1–T25 marcadas en `specs/csv-import-apply/tasks.md`. No hay cambios de BD ni de UI, así que no hay migración ni capturas.

## Cambios por archivo

### packages/shared
- `src/schemas/csv-import.ts` (nuevo): `CSV_IMPORT_MAX_BYTES` (5 MiB); los arrays `CSV_FORMATS`, `CSV_ROW_KINDS`, `CSV_DATE_FORMATS`, `CSV_DECIMAL_SEPARATORS`, `CSV_COLUMNS`, `CSV_ROW_ERROR_CODES`, `CSV_SKIP_REASONS` y `CSV_REJECT_REASONS`; `csvImportRequestSchema` (strict, `dryRun` por defecto `false`) y `csvImportSummarySchema` (incluye `encodingReplaced`), con sus tipos `CsvImportRequest`, `CsvImportRequestInput` y `CsvImportSummary`. Se exporta en `src/index.ts`.
- `src/schemas/csv-import.test.ts` (nuevo): comprueba con `expectTypeOf` que los arrays y las formas de `mapping`, `sourceUnits`, `errors` y `skipped` coinciden con las uniones del parser. También que se aceptan las opciones válidas y se rechazan las desconocidas.
- `src/csv-import/apply.ts` (nuevo):
  - `decodeCsv`: primero intenta UTF-8 estricto y, si falla, decodifica con sustitución y devuelve `replaced: true`. Quita el BOM.
  - `planCsvImport`: aplica el orden de R8, deduplica por clave contra lo guardado y contra lo ya visto en el fichero, y valida con `validateOdometerWrite` contra las lecturas guardadas más las aceptadas.
  - `csvImportSummary` y `csvImportProblemErrors`.
  - Se exporta en `src/csv-import/index.ts`.
- `src/csv-import/apply.test.ts` (nuevo): 10 tests.
- `src/csv-import/fixtures/lubelogger-service-latin1.csv` (nuevo): el servicio de LubeLogger con «Revisión general» guardado en ISO-8859-1 (byte `0xF3`).

### apps/api
- `src/modules/csv-import/repository.ts` (nuevo): `apply(vehicleId, rows)` en un `db.transaction`. Crea la lectura `manual`, `fuel` o `maintenance` y luego el registro con `odometerReadingId`. Un mantenimiento sin odómetro va sin lectura, y `scheduleId` es siempre `null`.
- `src/modules/csv-import/service.ts` (nuevo): orquestación síncrona en este orden:
  1. `findOwned` (404).
  2. Ajustes.
  3. `decodeCsv`.
  4. `parseCsvImport` con `target` del servidor.
  5. 400 con `csvImportProblemErrors` si el resultado no es `parsed`.
  6. `planCsvImport`.
  7. `repo.apply` (salvo con `dryRun`).
  8. Resumen.
- `src/modules/csv-import/routes.ts` (nuevo): `POST /vehicles/:id/csv-import`.
  - Comprueba `isMultipart` y hace `request.file` con `fileSize: CSV_IMPORT_MAX_BYTES`. Si el campo no es `file`, da 400.
  - Lee el fichero con `receiveToBuffer`; el 413 de multipart salta antes de llegar al parser.
  - `options` sale de `file.fields.options`. Si no es JSON da 400 con `detail`; si no cumple el esquema, 400 `Validation failed` con `errors[].path` relativo.
  - Responde 201, o 200 con `dryRun`.
- `src/app.ts`: compone `createCsvImportService` y registra `csvImportRoutes` bajo `/api`.
- `test/csv-import.test.ts` (nuevo): 18 tests.

### apps/web
- `src/lib/data-source/types.ts`: grupo `csvImport.import(vehicleId, file, options?)`.
- `src/lib/data-source/http.ts`: `csvImportBody` monta el `FormData` con `options` (JSON, `{}` por defecto) antes de `file`.
- `src/lib/data-source/data-source.test.tsx`: `fakeDataSource` admite overrides de `csvImport`.
- `src/lib/data-source/http.test.tsx`: test del multipart.
- `src/lib/data-source/local/csv-import.ts` (nuevo): `localCsvImport(db)`, que replica el servicio en este orden:
  1. Límite de tamaño, antes de leer el fichero.
  2. `parseInput`.
  3. `requireVehicle`.
  4. `settingsRow`.
  5. `decodeCsv`.
  6. Parser.
  7. Plan.
  8. `db.transaction(async …)` con los mismos inserts.
  9. Resumen.
  
  Solo usa helpers internos, nunca métodos serializados.
- `src/lib/data-source/local/index.ts`: `csvImport: serialized(queue, localCsvImport(db))`.
- `src/lib/data-source/local/local-csv-import.test.ts` (nuevo): 10 tests.

## Trazabilidad

| R | Tests |
|---|---|
| R1 | `apps/api/test/csv-import.test.ts` › imports refuels and maintenance with their readings in one request; `local-csv-import.test.ts` › imports a Fuelio file in one transaction |
| R2 | `csv-import.test.ts` › rolls back the whole import when a write fails |
| R3 | `csv-import.test.ts` › imports refuels and maintenance with their readings in one request |
| R4 | `csv-import.test.ts` › imports odometer rows as manual readings |
| R5 | `packages/shared/src/csv-import/apply.test.ts` › skips rows whose key is already stored; `csv-import.test.ts` › skips everything on a second import of the same file, skips rows that match data entered by hand |
| R6 | `apply.test.ts` › keeps only the first of repeated rows; `csv-import.test.ts` › counts repeated rows of a file as duplicates |
| R7 | `apply.test.ts` › treats an odometer row matching an accepted refuel as a duplicate; `csv-import.test.ts` › treats an odometer row matching a refuel of the same file as a duplicate (ver desviaciones) |
| R8 | `apply.test.ts` › plans refuels and maintenance before odometer rows; `csv-import.test.ts` › reports odometer conflicts per row without saving them |
| R9 | `apply.test.ts` › rejects conflicts against stored and accepted readings; `csv-import.test.ts` › reports odometer conflicts per row without saving them |
| R10 | `apply.test.ts` › rejects future dates; `csv-import.test.ts` › reports future dates per row |
| R11 | `apply.test.ts` › summarizes created rows by kind; `schemas/csv-import.test.ts` › matches the parser unions; `csv-import.test.ts` › imports refuels and maintenance… |
| R12 | `csv-import.test.ts` › previews an import without writing |
| R13 | `csv-import.test.ts` › hides other users' vehicles |
| R14 | `csv-import.test.ts` › rejects a CSV over the size limit before parsing |
| R15 | `csv-import.test.ts` › rejects a request without a CSV file |
| R16 | `schemas/csv-import.test.ts` › rejects unknown options; `csv-import.test.ts` › rejects invalid options |
| R17 | `apply.test.ts` › maps unparsed results to problem errors; `csv-import.test.ts` › rejects a CSV that cannot be parsed |
| R18 | `csv-import.test.ts` › uses the units of the vehicle and the settings |
| R19 | `apply.test.ts` › decodes UTF-8 with and without BOM; `csv-import.test.ts` › decodes a UTF-8 file with a BOM |
| R20 | `apps/web/src/lib/data-source/http.test.tsx` › sends a CSV import as multipart with options before the file |
| R21 | `local-csv-import.test.ts` › imports a Fuelio file in one transaction |
| R22 | `local-csv-import.test.ts` › skips everything on a second import, counts repeated rows and odometer rows matching a refuel as duplicates, reports odometer conflicts and future dates per row |
| R23 | `local-csv-import.test.ts` › rejects a missing vehicle with 404 |
| R24 | `local-csv-import.test.ts` › rejects a CSV over the size limit before reading or parsing |
| R25 | `local-csv-import.test.ts` › previews without writing |
| R26 | `local-csv-import.test.ts` › rolls back when a write fails |
| R27 | `local-csv-import.test.ts` › rejects invalid options and unparseable files with the API errors |
| R28 | `apply.test.ts` › flags replaced bytes of a Latin-1 file, decodes UTF-8 with and without BOM; `csv-import.test.ts` › flags a file that is not UTF-8, decodes a UTF-8 file with a BOM; `local-csv-import.test.ts` › flags a file that is not UTF-8 |

## `pnpm harness --full`

```
[OK]    95 features: 85 done, 9 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #85 csv-import-apply (in_progress)
[OK]    Rama actual: feat/csv-import-apply
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared test:  Test Files 40 passed (40) · Tests 292 passed (292)
packages/db test:      Test Files 1 passed (1)   · Tests 3 passed (3)
apps/web test:         Test Files 102 passed (102) · Tests 731 passed (731)
apps/api test:         Test Files 39 passed (39) · Tests 391 passed (391)
e2e test:              Test Files 2 passed (2)   · Tests 6 passed (6)
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones y notas

1. **R7 «del mismo fichero» en los tests de API y local.** Ningún formato soportado mezcla lecturas sueltas con repostajes en un mismo fichero:
   - Fuelio y Drivvo solo dan `fuel` y `maintenance`.
   - LubeLogger y el genérico dan un solo `kind` por fichero.
   
   Por eso el parser no puede producir este caso. Se prueba de verdad en `planCsvImport` (`apply.test.ts`, con la lectura antes que el repostaje en el fichero). En la API y en local, el test con ese nombre importa primero un fichero de repostajes y luego una lectura que repite la lectura vinculada de uno de ellos. Así comprueba la misma regla de clave a través de la BD, y el comentario del test lo explica.
2. **Validación de `options` en la API.** El error handler no convierte un `ZodError` lanzado a mano. La ruta lanza `AppError(400, 'Validation failed', 'Invalid import options', errors)`: mismo título y mismas `errors` que `parseInput` del modo local (este no lleva `detail`).
3. **Orden en la ruta.** El fichero se lee con `receiveToBuffer` antes de parsear `options`, así no queda un stream sin consumir cuando las opciones son inválidas. Un fichero de más de 5 MiB da 413 aunque las opciones también sean inválidas.
4. **Mensaje de `unit_mismatch`.** Solo lista las unidades no nulas. Por ejemplo, Fuelio en km frente a un vehículo en mi/l da `The file units (km) differ from the vehicle units (mi, l)`.
5. **`rejected`** sale en orden de proceso (R8), no por número de fila.
6. **Fallo de escritura en local.** El rechazo es el error del motor (no un `ApiError`), igual que en el resto de operaciones locales. R26 solo exige el rollback, y el test lo comprueba.
7. **Spies del parser.** Los tests de 413 hacen `vi.mock('@ikrive/shared/csv-import')` y envuelven el parser real. Además afirman que una importación dentro del límite sí llama al spy, para que el `not.toHaveBeenCalled()` no pase en vacío.
