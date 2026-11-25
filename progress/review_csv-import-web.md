# Review — #86 csv-import-web

**Veredicto:** APPROVED

> Segunda revisión. El cambio requerido de la primera (R1 en modo local) está resuelto. El resto del diff no ha cambiado.

## Trazabilidad requirements ↔ tests
Rutas relativas a `apps/web/src/`.

- R1: [x] Con servidor: `features/settings/settings-page.test.tsx` › `links to the CSV import`. Comprueba el título de la tarjeta, `href="/import"`, que la navegación llega a `/import` y que pide `status=all`. En modo local: `features/mobile/local-mode.test.tsx` › `settings link to the CSV import`. El `beforeEach` hace `setLocalMode(true)`, usa SQLite en memoria y `mockApi({})`, así que cualquier petición haría fallar el test. Comprueba el heading «Importar desde otra app» y que el enlace «Importar un CSV» lleva `href="/import"`.
- R2: [x] `csv-import-wizard.test.tsx` › `lets the user pick a vehicle and a CSV file`. Comprueba `v1` preseleccionado, las opciones, `accept=".csv,text/csv"` y que el POST va a `v2` con el mismo `File`. `status=all` se comprueba en `settings-page.test.tsx`.
- R3: [x] `asks to add a vehicle when there are none`. Comprueba el aviso, el enlace a `/vehicles/new` y que no hay selector de fichero.
- R4: [x] `rejects a file over the size limit without reading it`. Comprueba la alerta «5 MB», que no se llama a `arrayBuffer`, `text`, `parseCsvImport` ni `fetch`, y que no aparece la tarjeta de formato. El test `read-file.test.ts` cubre lo mismo en la función.
- R5: [x] `shows the detected format and its preview`. Comprueba «Formato detectado: Fuelio».
- R6: [x] `maps the columns of a generic CSV`. Comprueba el aviso de genérico y las cabeceras por índice, con «Columna 6» para la cabecera vacía.
- R7: [x] `asks only for the missing options of a detected file`. Solo pide el formato de fecha (ni separador ni tipo) y no hay POST hasta elegirlo. Después, `options` con `dateFormat: 'dmy'` y `parseCsvImport` relanzado con esa opción.
- R8: [x] `explains a unit mismatch without asking for a preview`. Comprueba las unidades de origen y destino, el enlace a `/settings`, que no hay spinner y que no hay ningún POST.
- R9: [x] `maps the columns of a generic CSV`. Comprueba los campos de `fuel` y de `maintenance`, el formato de fecha, el separador y que cambiar el tipo vacía las columnas.
- R10: [x] `keeps import disabled until the required columns are mapped` (botón desactivado y 0 POST en cada paso, luego el `mapping` con índices exactos) y `wizard.test.ts` › `maps a draft only when every required group is set`.
- R11: [x] `shows the detected format and its preview` (válidas 4, duplicadas 1, con error 2 = errors + rejected, `options` = `{ dryRun: true }`) y `counts valid, duplicate and error rows`.
- R12: [x] `lists the rows with errors, rejections and skips`. Comprueba los textos exactos de error con campo, el conflicto con fecha y km, la etiqueta de omisión y la fecha futura, y con 55 filas lista 50 más «y 5 más». También `lists issues by row up to the limit`.
- R13: [x] `warns that fuel notes and station are not imported` (los 4 casos, también la ausencia con `false/false`) y `local mode: …`.
- R14: [x] `warns about a file that may not be UTF-8`.
- R15: [x] `keeps import disabled while the preview loads or fails`, `disables import when the preview has no valid rows` y `keeps import disabled until the required columns are mapped`.
- R16: [x] `imports the file and shows the summary`. El segundo POST lleva `{ dateFormat: 'dmy' }` sin `dryRun`, el vehículo `v1` y el mismo `File`.
- R17: [x] `disables the controls while importing`. Comprueba «Importando…» desactivado y el vehículo, el fichero y la opción de fecha desactivados.
- R18: [x] `imports the file and shows the summary` (creados por tipo, omitidos 3 = 2 + 1, errores 2) y `counts created, omitted and errors of the result`.
- R19: [x] `imports the file and shows the summary`. `invalidateQueries` se llama con `{ queryKey: queryKeys.vehicles.all }`.
- R20: [x] Preview 400 en `keeps import disabled while the preview loads or fails`, importación 413 y 404 en `shows why an import failed`, y `errors.test.ts` (413/400/404/500/no ApiError).
- R21: [x] `local mode: previews and imports into the device database`. Usa un DataSource local sobre SQLite en memoria. Comprueba los recuentos, 0 repostajes tras la vista previa, 2 tras importar y `fetch` sin llamadas.
- R22: [x] `i18n/locales.test.ts` › `defines a label for every CSV import value` (los 8 arrays en es y en) y `es and en define the same keys`.
- R23: [x] `disables import when the preview has no valid rows`. Comprueba el texto «No hay nada que importar», el botón desactivado y ningún POST sin `dryRun`.

## Tasks
- T1..T18: [x]. Las desviaciones están justificadas en `impl_csv-import-web.md`: `required` se pasa como parámetro para no cargar el parser, hay claves i18n extra dentro de `csvImport.*` y `dot`/`comma` en lugar de `.`/`,`.

## Checkpoints
- C1: [x] `pnpm harness` en verde, una sola feature activa (#86) y la rama es `feat/csv-import-web`.
- C2: [x] Spec completo, tasks `[x]` y todos los R<n> tienen test, también R1 en modo local.
- C3: [x] El diff se ciñe a `design.md`: el renombre en shared, `features/csv-import/`, la ruta, la tarjeta, `query-keys`, i18n y `routeTree.gen.ts` regenerado. No hay cambios de API, BD ni DataSource.
- C4: [x] El código vive en `features/csv-import/` y los datos se piden con `queryOptions` sobre `dataSource()` (sin `api` directo). Textos en es y en. Usa `PageHeader`, `Card`, `FormField`, `Select` y `Warning`. El parser se carga con `import()` (solo `import type` estáticos).
- C5: [x] Sin `any`, sin `@ts-ignore` y sin `console.log`. Las fechas del conflicto llegan como ISO y se formatean con `useFormat`. No hay conversión de unidades.
- C6: [x] `pnpm harness --full` en verde (lo he vuelto a ejecutar en la segunda revisión: web 106 ficheros / 759 tests, api 39 / 391). Los tests afirman resultados concretos y el modo local usa SQLite en memoria. Las 12 capturas (claro, oscuro y móvil) existen en el scratchpad y están referenciadas.
- C7: [x] `impl_csv-import-web.md` completo y `current.md` al día. `PLAN.md`: la feature no cierra fase (quedan #87 y siguientes de la fase 9).

## Hallazgos
1. (Resuelto en la segunda revisión) Faltaba el test de R1 en modo local. Se ha añadido `local-mode.test.tsx` › `settings link to the CSV import`, que también figura en el mapa de `impl_csv-import-web.md`.

## Avisos para el humano (no bloquean)
- `features/csv-import/import-counts.tsx:187`: la `key` de cada fila es `${type}:${row}`. Si el parser llegara a dar dos errores para la misma fila, React avisaría de keys duplicadas. Hoy da uno por fila.
- `csvImport.columns.value` y `columns.odometer` son «Kilometraje» también con `distanceUnit: 'mi'`. Es coherente con el resto de la app ("Kilómetros" en la navegación).
- En la captura móvil o de página completa la barra lateral no ocupa toda la altura. Es un efecto de la captura, como ya indica el implementer.

## Cambios requeridos
Ninguno.
