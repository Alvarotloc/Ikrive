# Review — #85 csv-import-apply

**Veredicto:** APPROVED

Diff revisado: `git diff main...HEAD` (spec y `feature_list.json` → `in_progress`), `git diff` (app.ts, data-source types/http/local index, tests web, barrels de shared, progress, tasks) y los ficheros nuevos sin trackear (módulo `csv-import` de la API, `apply.ts`, `schemas/csv-import.ts`, fixture Latin-1, `local/csv-import.ts` y los cuatro ficheros de test).

## Trazabilidad requirements ↔ tests
- R1: [x] `apps/api/test/csv-import.test.ts` › `imports refuels and maintenance with their readings in one request`: 201, resumen y filas en BD (3 lecturas, 2 repostajes, 2 mantenimientos). En local, `local-csv-import.test.ts` › `imports a Fuelio file in one transaction` afirma un solo `BEGIN`.
- R2: [x] `csv-import.test.ts` › `rolls back the whole import when a write fails`: trigger `RAISE(ABORT)` en `maintenance_records`, 500 problem+json y BD vacía (los repostajes escritos antes se deshacen).
- R3: [x] mismo test de R1: cada `odometerReadingId` apunta a una lectura con la misma fecha y valor y `source` `fuel`/`maintenance`, y el mantenimiento sin odómetro tiene `odometerReadingId` null.
- R4: [x] `csv-import.test.ts` › `imports odometer rows as manual readings`: lecturas con `source: 'manual'`.
- R5: [x] `apply.test.ts` › `skips rows whose key is already stored` (repostaje, mantenimiento con título normalizado, lectura y lectura vinculada `fuel`). En la API, `skips everything on a second import of the same file` (duplicates 4, BD igual) y `skips rows that match data entered by hand`.
- R6: [x] `apply.test.ts` › `keeps only the first of repeated rows` (acepta las filas [2, 4] y cuenta 2 duplicadas). En la API, `counts repeated rows of a file as duplicates`.
- R7: [x] `apply.test.ts` › `treats an odometer row matching an accepted refuel as a duplicate`: la lectura va antes en el fichero, solo se acepta la fila 3 y se cuenta 1 duplicada. En API y local se prueba entre dos importaciones; la desviación está justificada en impl §1 (ver avisos).
- R8: [x] `apply.test.ts` › `plans refuels and maintenance before odometer rows` (orden [3, 4, 2, 5]). En la API, `reports odometer conflicts per row without saving them`: la fila 2 gana a la 3 aunque la 3 sea más antigua.
- R9: [x] `apply.test.ts` › `rejects conflicts against stored and accepted readings`: afirma `row`, `kind`, `reason` y `conflict` contra lecturas guardadas y aceptadas. En la API, el test de R8 también afirma los `rejected` y que no se guardan.
- R10: [x] `apply.test.ts` › `rejects future dates` (hoy se acepta, mañana no; `conflict: null`). En la API, `reports future dates per row`.
- R11: [x] `apply.test.ts` › `summarizes created rows by kind` (pasa `csvImportSummarySchema.parse` y compara el objeto completo). En la API, el test de R1 afirma el 201, `format`, `created`, `droppedFuelFields` y `skipped`.
- R12: [x] `csv-import.test.ts` › `previews an import without writing`: 200, BD vacía y el resumen es igual al de la importación posterior salvo `dryRun`.
- R13: [x] `csv-import.test.ts` › `hides other users' vehicles`: intruso e id inexistente, con y sin `dryRun`; 404 problem+json, `detail` y BD sin cambios.
- R14: [x] `csv-import.test.ts` › `rejects a CSV over the size limit before parsing`: con `MAX+1` bytes da 413 `request file too large` sin llamar al spy del parser y con la BD vacía; un fichero justo en el límite sí llega al spy, así que el control no pasa en vacío.
- R15: [x] `csv-import.test.ts` › `rejects a request without a CSV file`: un cuerpo JSON da 400 y un campo `csv` da 400 con `detail`; BD vacía.
- R16: [x] `csv-import.test.ts` › `rejects invalid options`: con JSON roto, `detail`; con enum e índice inválidos, paths `dateFormat` y `mapping.columns.date`; parser no llamado. También `schemas/csv-import.test.ts` › `rejects unknown options`.
- R17: [x] `apply.test.ts` › `maps unparsed results to problem errors` (los tres estados). En la API, `rejects a CSV that cannot be parsed` (`unknown`, `needs_options` → `mapping.columns.date`), y `sourceUnits` en el test de R18.
- R18: [x] `csv-import.test.ts` › `uses the units of the vehicle and the settings`: con `distanceUnit: 'mi'` da 400 `sourceUnits` con «(mi, l)», y `target` en la petición da `Validation failed`.
- R19: [x] `apply.test.ts` › `decodes UTF-8 with and without BOM`. En la API, `decodes a UTF-8 file with a BOM` (el test contiene un BOM literal, comprobado) y el título acentuado queda guardado bien en BD.
- R20: [x] `http.test.tsx` › `sends a CSV import as multipart with options before the file`: URL, método, orden `['options','file']`, JSON de `options` y `{}` por defecto.
- R21: [x] `local-csv-import.test.ts` › `imports a Fuelio file in one transaction`: esquema, un `BEGIN`, lecturas con `source` y vínculos.
- R22: [x] `local-csv-import.test.ts` › `skips everything on a second import`, `counts repeated rows and odometer rows matching a refuel as duplicates` y `reports odometer conflicts and future dates per row`.
- R23: [x] `local-csv-import.test.ts` › `rejects a missing vehicle with 404`: problem exacto, con y sin `dryRun`, y `writes()` vacío.
- R24: [x] `local-csv-import.test.ts` › `rejects a CSV over the size limit before reading or parsing`: 413 exacto, sin llamar a `arrayBuffer` ni al parser, y `writes()` vacío; también hay control positivo.
- R25: [x] `local-csv-import.test.ts` › `previews without writing`: `writes()` vacío y el resumen es igual al de la importación.
- R26: [x] `local-csv-import.test.ts` › `rolls back when a write fails`: trigger, rechazo y snapshot vacío.
- R27: [x] `local-csv-import.test.ts` › `rejects invalid options and unparseable files with the API errors`: `Validation failed` con paths, `unknown`, `needs_options` y `sourceUnits`, y `writes()` vacío.
- R28: [x] `apply.test.ts` › `flags replaced bytes of a Latin-1 file` y `decodes UTF-8…` (un U+FFFD válido no da falso positivo). En la API y en local, `flags a file that is not UTF-8`: `true` en dryRun y al importar, `false` con UTF-8. La fixture contiene el byte `0xF3`, comprobado con `xxd`.

## Tasks
- T1–T25: [x] (T24/T25 añadidas en Gate 1 por R28).

## Checkpoints
- C1: [x] `pnpm harness` en verde; una sola feature activa (#85 `in_progress`); rama `feat/csv-import-apply`.
- C2: [x] Están los tres ficheros del spec; EARS con un `DEBE` por requirement; la tabla cubre los 7 criterios de `feature_list.json`; todas las tasks `[x]`; cada R tiene un test que he leído.
- C3: [x] El diff coincide con la tabla de archivos de `design.md` (más la fixture de T3, los tests, `progress/` y `feature_list.json` → `in_progress`). No hay refactors ajenos.
- C4: [x] `modules/csv-import/{routes,service,repository}.ts` cableado en `app.ts`; `params: idParamSchema`, `options` con `csvImportRequestSchema` y respuesta con `csvImportSummarySchema`; `findOwned` → `NotFoundError`; errores con `AppError`/`BadRequestError`. Sin cambios de BD ni migración (lo justifica design). No hay UI ni i18n (fuera de alcance, #86). La lógica pura (`planCsvImport`, `decodeCsv`…) está en `packages/shared` con tests unitarios.
- C5: [x] Sin `any`, `@ts-ignore`, `console.log` ni TODOs; las fechas son `YYYY-MM-DD` del parser y «hoy» sale de `todayIn(timezone)`; el kilometraje no se convierte. No hay ficheros guardados (el CSV no se persiste).
- C6: [x] `pnpm harness --full` en verde, ejecutado por mí: shared 292, db 3, web 731, api 391 y e2e. Los tests usan SQLite en memoria; el parser solo se espía y llama al real. No hace falta capturas porque la feature no tiene UI.
- C7: [x] `impl_csv-import-apply.md` incluye archivos, mapa R→test y la salida del arnés; `current.md` describe la sesión; PLAN.md no cambia porque #86 y #87 siguen pendientes y la fase 9 no se cierra.

## Hallazgos
Ninguno bloqueante. He revisado:
- la atomicidad (`db.transaction` síncrono en la API y async en local);
- el orden 413 → validación → 404 → parser;
- la deduplicación de filas rechazadas (su clave se marca como vista y una repetición posterior cuenta como duplicada, tal como dice el design §planCsvImport.3);
- los mantenimientos sin odómetro: no crean lectura y solo se valida su fecha;
- la propiedad del vehículo con y sin `dryRun`;
- que el cliente no pueda enviar `target`.

## Avisos para el humano (no bloquean)
- **R7 en API y local:** ningún formato soportado mezcla lecturas sueltas con repostajes en un mismo fichero, así que el caso «del mismo fichero» solo se prueba de verdad en `planCsvImport`. Los tests de API y local con ese nombre usan dos importaciones (impl §1). La lógica es la misma función compartida, así que me parece aceptable. Cuando #87 o algún formato nuevo mezcle tipos, conviene añadir el test de extremo a extremo.
- **`options` después de `file`:** si un cliente manda `options` después de `file`, la API lo ignora en silencio y usa `{}` (`routes.ts`, `file.fields.options`). Es el contrato documentado y el `DataSource` HTTP lo respeta, pero un cliente externo no recibe ningún aviso.
- **Fallo de escritura en local:** se rechaza con el error del motor, no con un `ApiError` (impl §6). R26 solo exige el rollback; #86 tendrá que mostrar un error genérico en ese caso.
- **`rejected` sigue el orden de proceso (R8), no el número de fila (impl §5).** #86 debería ordenarlo si lo muestra en una tabla.
- **Mensaje de `unit_mismatch`:** omite las unidades nulas del origen, por ejemplo «(km) … (mi, l)». Es coherente con la tabla del design.

## Cambios requeridos
Ninguno.
