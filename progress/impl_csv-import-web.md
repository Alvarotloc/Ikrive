# Implementación — csv-import-web (#86)

Rama `feat/csv-import-web`. Tasks T1–T18 marcadas en `specs/csv-import-web/tasks.md`. Sin commits.

## Cambios por archivo

### packages/shared
- `src/csv-import/generic.ts`: `KIND_COLUMNS` pasa a llamarse `CSV_KIND_COLUMNS` y se exporta, sin cambio de comportamiento.
- `src/csv-import/index.ts`: exporta `CSV_KIND_COLUMNS`.

### apps/web
- `src/features/csv-import/read-file.ts`: `CSV_ACCEPT` (`.csv,text/csv`) y `readCsvFile(file)`. Comprueba el tamaño antes de leer y solo entonces hace `import('@ikrive/shared/csv-import')` y `decodeCsv`. Devuelve `too_large` o `read` (texto, `encodingReplaced` y el módulo del parser).
- `src/features/csv-import/wizard.ts`: lógica pura. Incluye `MappingDraft`, `emptyMapping`, `toMapping`, `importOptions`, `previewCounts`, `resultCounts`, `csvIssues` (límite de 50) y `DECIMAL_SEPARATOR_KEYS`. También deriva los tipos de etiqueta de los arrays `CSV_*`.
- `src/features/csv-import/errors.ts`: `csvImportErrorKey`. 413 da `tooLarge`, 400 da `cannotImport`, 404 da `vehicleNotFound` y cualquier otro error da `common.error`.
- `src/features/csv-import/queries.ts`: `csvImportPreviewQuery` (`dryRun: true`, `staleTime: Infinity`, `gcTime: 0`, `retry: false`) y `useCsvImport`. Este último llama sin `dryRun` e invalida `queryKeys.vehicles.all` en el `onSuccess` de la mutación.
- `src/lib/query-keys.ts`: `csvImport.preview(vehicleId, fileId, options)`.
- `src/features/csv-import/csv-import-wizard.tsx`: `CsvImportWizard`. Tiene tres tarjetas (vehículo y fichero, formato, vista previa).
  - El análisis se hace en `useMemo` con el parser cargado por `readCsvFile`. En modo genérico usa un mapeo de relleno para sacar las cabeceras.
  - La vista previa usa `useQuery` y solo se activa con `parsed`.
  - El botón Importar está desactivado salvo con la vista previa en éxito, más de 0 válidas y sin importación en curso.
  - Muestra `nothingToImport`, los errores en `role="alert"` y el resumen (que sustituye los pasos 2–3) con «Importar otro fichero» y el enlace al vehículo.
  - Cambiar de fichero reinicia todo.
  - Si falta una opción en un formato reconocido, se piden solo las de `missing`, y una opción ya elegida sigue visible para poder cambiarla.
  - `unit_mismatch` se muestra en un `Warning` con enlace a Ajustes.
- `src/features/csv-import/column-mapping.tsx`: formulario del CSV genérico. Orden: tipo, columnas de `CSV_KIND_COLUMNS[kind]`, formato de fecha y separador.
  - Cada columna se elige entre «No importar» y las cabeceras por índice («Columna n» si la cabecera está vacía).
  - Las columnas obligatorias llevan ` *`.
  - Cambiar el tipo vacía las columnas.
- `src/features/csv-import/import-counts.tsx`: `PreviewCounts` (válidas, duplicadas, con error, omitidas, avisos de notas/gasolinera/UTF-8 y lista de filas) y `ResultCounts` (creados por tipo, omitidos, errores y lista de filas). La lista de filas va en un `<details>` con «y N más».
- `src/routes/_app/import.tsx`: ruta `/import`. Su loader carga `vehiclesQuery('all')` y `settingsQuery`, y la página muestra el `PageHeader` y el asistente.
- `src/routeTree.gen.ts`: regenerado por el plugin de Vite.
- `src/routes/_app/settings.tsx`: tarjeta «Importar desde otra app» con `Link` a `/import`. Es visible siempre, también en modo local.
- `src/i18n/locales/{es,en}.json`: namespace `csvImport`.
- Tests: `wizard.test.ts`, `read-file.test.ts`, `errors.test.ts` y `csv-import-wizard.test.tsx` (17 tests) en `features/csv-import/`, más los añadidos a `i18n/locales.test.ts`, `features/settings/settings-page.test.tsx` y `features/mobile/local-mode.test.tsx` (`settings link to the CSV import`: R1 en modo local, pedido en la revisión).

## Trazabilidad

| R | Archivo › test |
|---|---|
| R1 | `features/settings/settings-page.test.tsx` › `links to the CSV import` (con servidor); `features/mobile/local-mode.test.tsx` › `settings link to the CSV import` (modo local) |
| R2 | `csv-import-wizard.test.tsx` › `lets the user pick a vehicle and a CSV file`; `settings-page.test.tsx` › `links to the CSV import` (`status=all`) |
| R3 | `csv-import-wizard.test.tsx` › `asks to add a vehicle when there are none` |
| R4 | `csv-import-wizard.test.tsx` › `rejects a file over the size limit without reading it`; `read-file.test.ts` › `rejects a file over the limit without reading its bytes` |
| R5 | `csv-import-wizard.test.tsx` › `shows the detected format and its preview` |
| R6 | `csv-import-wizard.test.tsx` › `maps the columns of a generic CSV` |
| R7 | `csv-import-wizard.test.tsx` › `asks only for the missing options of a detected file` |
| R8 | `csv-import-wizard.test.tsx` › `explains a unit mismatch without asking for a preview` |
| R9 | `csv-import-wizard.test.tsx` › `maps the columns of a generic CSV` |
| R10 | `csv-import-wizard.test.tsx` › `keeps import disabled until the required columns are mapped`; `wizard.test.ts` › `maps a draft only when every required group is set` |
| R11 | `csv-import-wizard.test.tsx` › `shows the detected format and its preview`; `wizard.test.ts` › `counts valid, duplicate and error rows` |
| R12 | `csv-import-wizard.test.tsx` › `lists the rows with errors, rejections and skips`; `wizard.test.ts` › `lists issues by row up to the limit` |
| R13 | `csv-import-wizard.test.tsx` › `warns that fuel notes and station are not imported`, `local mode: previews and imports into the device database` |
| R14 | `csv-import-wizard.test.tsx` › `warns about a file that may not be UTF-8` |
| R15 | `csv-import-wizard.test.tsx` › `keeps import disabled while the preview loads or fails`, `disables import when the preview has no valid rows`, `keeps import disabled until the required columns are mapped` |
| R16 | `csv-import-wizard.test.tsx` › `imports the file and shows the summary` (segundo POST con las mismas `options` sin `dryRun`, mismo vehículo y mismo `File`) |
| R17 | `csv-import-wizard.test.tsx` › `disables the controls while importing` |
| R18 | `csv-import-wizard.test.tsx` › `imports the file and shows the summary`; `wizard.test.ts` › `counts created, omitted and errors of the result` |
| R19 | `csv-import-wizard.test.tsx` › `imports the file and shows the summary` (`invalidateQueries` con `queryKeys.vehicles.all`) |
| R20 | `csv-import-wizard.test.tsx` › `keeps import disabled while the preview loads or fails` (400), `shows why an import failed` (413, 404); `errors.test.ts` › `maps each problem status to its message` |
| R21 | `csv-import-wizard.test.tsx` › `local mode: previews and imports into the device database` |
| R22 | `i18n/locales.test.ts` › `defines a label for every CSV import value`, `es and en define the same keys` |
| R23 | `csv-import-wizard.test.tsx` › `disables import when the preview has no valid rows` |

## `pnpm harness --full`

```
[OK]    95 features: 86 done, 8 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #86 csv-import-web (in_progress)
[OK]    Rama actual: feat/csv-import-web
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test        (web 106 files / 759 tests, api 39 / 391, shared 40 / 292, db 3, mobile 31)
[OK]    Arnés en verde.
```

## Revisión visual (T17)

La API y Vite (`--port 5199`, porque el 5173 lo ocupaba otro proyecto) arrancaron sobre un `DATA_DIR` temporal, con un usuario y tres vehículos de prueba. Las capturas se sacaron con Playwright y `/usr/bin/google-chrome`. Los servidores ya están parados.

Capturas en `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/2e7b470b-e7ab-4465-ae65-0600b9473e83/scratchpad/shots/`:
- `light-0-settings.png`, `light-1-fuelio-preview.png`, `light-2-generic-mapping.png`, `light-3-summary.png`
- `dark-0-settings.png`, `dark-1-fuelio-preview.png`, `dark-2-generic-mapping.png`, `dark-3-summary.png`
- `mobile-0-settings.png`, `mobile-1-fuelio-preview.png`, `mobile-2-generic-mapping.png`, `mobile-3-summary.png`

La revisión llevó a un cambio: el mapeo se reordenó en tipo, columnas, fecha y separador (antes la fecha y el separador iban junto al tipo). Solo usa utilidades existentes y no añade estilos nuevos. En la captura móvil de página completa, la cabecera fija aparece a media página; es un efecto de la captura de página completa, no de la interfaz.

`apps/web/dist` se generó con `vite build` para regenerar `routeTree.gen.ts` y comprobar que el parser va en un chunk aparte (`csv-import-*.js`, cargado con `import()` desde el chunk de `/import`). Después lo borré; está ignorado por git.

## Desviaciones del spec

1. **`toMapping(draft, required)` e `importOptions(state, required)`** reciben `CSV_REQUIRED_COLUMNS` como segundo parámetro, que el componente toma del módulo cargado por `readCsvFile`. Con un import estático en `wizard.ts`, el parser entraría en el chunk de la ruta y se cargaría antes de elegir fichero, en contra de R4 («sin cargar el parser») y de la idea del design. Así tampoco se duplica la constante.
2. **Claves i18n añadidas** a la lista del design, todas dentro de `csvImport.*`:
   - `steps.{source,format}` (títulos de las tarjetas 1 y 2).
   - `optionsIntro`.
   - `choose` (opción vacía de los selects).
   - `fields.{kind,dateFormat,decimalSeparator}` (etiquetas).
   - `settingsLink` (texto del enlace a Ajustes del aviso de unidades).
   - `decimalSeparators` usa las claves `dot`/`comma` (mapeadas con `DECIMAL_SEPARATOR_KEYS`), porque `.` no puede ser un segmento de clave en i18next. El test de locales recorre `CSV_DECIMAL_SEPARATORS` a través de ese mapa.
3. **Handler de `mockApi`**: jsdom no puede parsear el multipart del `Request` que reconstruye `mockApi` (`request.formData()` falla). Por eso el handler lee el `FormData` de la última llamada a `fetch` (`fetchMock.mock.calls.at(-1)`), como hace `http.test.tsx`. No cambia `mockApi`.
4. **Tests de componente con router en memoria**: el asistente se monta en un `createRouter` mínimo (como `vehicle-card.test.tsx`) porque tiene `Link`s a `/vehicles/new`, `/settings` y `/vehicles/$vehicleId`. Recibe `vehicles` y `settings` como props, según el design. Los ajustes se siembran en la caché con `staleTime: Infinity` para que `useFormat` no los vuelva a pedir y `mockApi({})` pueda afirmar que no hubo ninguna petición.
5. **Test extra** `read-file.test.ts` (unitario de `readCsvFile`), además del test de componente de R4.
