# Tasks — csv-import-web

Rutas web relativas a `apps/web/src/`. Los tests de componente montan `CsvImportWizard` con `renderWithProviders`, `vehicles` y `settings` como props y `mockApi` para `POST /vehicles/:id/csv-import` (el handler lee `options` del `FormData` para distinguir `dryRun`). Fixtures: `packages/shared/src/csv-import/fixtures/` leídas con `readFileSync`, como `local-csv-import.test.ts`.

## packages/shared

- [ ] T1 — Renombrar `KIND_COLUMNS` a `CSV_KIND_COLUMNS` en `packages/shared/src/csv-import/generic.ts` y exportarlo en `csv-import/index.ts`. Cubre: R9.

## Lógica pura

- [ ] T2 — Crear `features/csv-import/read-file.ts` (`readCsvFile`: tamaño antes de leer, `import('@ikrive/shared/csv-import')`, `decodeCsv`). Cubre: R4.
- [ ] T3 — Crear `features/csv-import/wizard.ts` (`emptyMapping`, `toMapping`, `importOptions`, `previewCounts`, `resultCounts`, `csvIssues`). Cubre: R9, R10, R11, R12, R18.
- [ ] T4 — Tests en `features/csv-import/wizard.test.ts`: `maps a draft only when every required group is set` (cada tipo, `totalPrice` o `pricePerUnit`, sin fecha o separador → `null`), `builds the options of a detected and of a generic file`, `counts valid, duplicate and error rows`, `counts created, omitted and errors of the result` y `lists issues by row up to the limit`. Cubre: R10, R11, R12, R18.
- [ ] T5 — Crear `features/csv-import/errors.ts` y test `maps each problem status to its message` en `features/csv-import/errors.test.ts` (413, 400, 404, 500 y error que no es `ApiError`). Cubre: R20.
- [ ] T6 — Añadir `queryKeys.csvImport.preview` en `lib/query-keys.ts` y crear `features/csv-import/queries.ts` (`csvImportPreviewQuery`, `useCsvImport` con invalidación de `queryKeys.vehicles.all` en la mutación). Cubre: R11, R16, R19.

## UI

- [ ] T7 — Crear `features/csv-import/column-mapping.tsx` e `import-counts.tsx`, y `csv-import-wizard.tsx` con los pasos, el análisis en `useMemo`, la vista previa con `useQuery` y el botón Importar. Cubre: R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R20, R21, R23.
- [ ] T8 — Crear la ruta `routes/_app/import.tsx` (loader de `vehiclesQuery('all')` y `settingsQuery`, `PageHeader`) y la tarjeta con `Link` a `/import` en `routes/_app/settings.tsx`. Cubre: R1, R2.
- [ ] T9 — Textos `csvImport.*` en `i18n/locales/es.json` y `en.json`, y test `defines a label for every CSV import value` en `i18n/locales.test.ts` (recorre `CSV_FORMATS`, `CSV_ROW_KINDS`, `CSV_COLUMNS`, `CSV_DATE_FORMATS`, `CSV_DECIMAL_SEPARATORS`, `CSV_ROW_ERROR_CODES`, `CSV_REJECT_REASONS` y `CSV_SKIP_REASONS` en ambos idiomas). Cubre: R22, R23.

## Tests de componente (`features/csv-import/csv-import-wizard.test.tsx`)

- [ ] T10 — Tests de entrada: `lets the user pick a vehicle and a CSV file` (primer vehículo preseleccionado, el `POST` va al vehículo elegido), `asks to add a vehicle when there are none` y `rejects a file over the size limit without reading it` (`CSV_IMPORT_MAX_BYTES + 1`; alerta con «5 MB»; `Blob.prototype.arrayBuffer` y `text` espiados sin llamadas; `parseCsvImport` espiado con `vi.mock` de `@ikrive/shared/csv-import` sin llamadas; `mockApi({})` sin peticiones). Cubre: R2, R3, R4.
- [ ] T11 — Tests de detección: `shows the detected format and its preview` (fixture `fuelio.csv`: «Fuelio» y recuentos válidas/duplicadas/con error del resumen simulado; `options` del `POST` con `dryRun: true`), `asks only for the missing options of a detected file` (LubeLogger con fechas `dd/MM/yyyy` sin declarar → solo formato de fecha; la vista previa se pide tras elegirlo, con `dateFormat` en `options`) y `explains a unit mismatch without asking for a preview` (Fuelio en km con `distanceUnit: 'mi'`; unidades visibles, enlace a Ajustes, ningún `POST`). Cubre: R5, R7, R8, R11.
- [ ] T12 — Tests de mapeo: `maps the columns of a generic CSV` (CSV desconocido: aviso de genérico, cabeceras en los selects, campos de `CSV_KIND_COLUMNS` del tipo elegido) y `keeps import disabled until the required columns are mapped` (botón desactivado y ningún `POST` hasta tipo, columnas obligatorias, fecha y separador; después `POST` con `mapping` de índices correctos y botón activo). Cubre: R6, R9, R10, R15.
- [ ] T13 — Tests de vista previa: `warns that fuel notes and station are not imported` (`droppedFuelFields` `notes`, `station` y ambos; sin aviso con los dos a `false`), `warns about a file that may not be UTF-8`, `lists the rows with errors, rejections and skips` (código y campo traducidos, conflicto con fecha y km, etiqueta de omisión; «y N más» pasado 50), `keeps import disabled while the preview loads or fails` (handler retenido; 400 → alerta «no se puede importar») y `disables import when the preview has no valid rows` (vista previa con suma de `created` = 0: botón desactivado, texto «no hay nada que importar» visible y ningún `POST` sin `dryRun`). Cubre: R11, R12, R13, R14, R15, R20, R23.
- [ ] T14 — Tests de importación: `imports the file and shows the summary` (segundo `POST` sin `dryRun` con las mismas `options` y fichero; creados por tipo, omitidos = `duplicates` + `skipped`, errores = `errors` + `rejected`; `invalidateQueries` espiado con `queryKeys.vehicles.all`), `disables the controls while importing` (handler retenido; «Importando…», selects, fichero y botón desactivados) y `shows why an import failed` (413 y 404 en la importación). Cubre: R16, R17, R18, R19, R20.
- [ ] T15 — Test `local mode: previews and imports into the device database` (`vi.stubEnv('MODE', 'native')`, `setLocalMode(true)`, `createLocalDataSource` sobre `createMemorySqlite`, `setDataSource`, `mockApi({})`; fixture `lubelogger-fuel.csv`: recuentos, aviso de notas, resumen y repostajes en `local.fuelLogs.list`). Cubre: R13, R21.
- [ ] T16 — Test `links to the CSV import` en `features/settings/settings-page.test.tsx` (con `renderApp('/settings')`: el enlace lleva a `/import` y se ve el título del asistente; `GET /vehicles` simulado). Cubre: R1.

## Cierre

- [ ] T17 — Revisión visual con `pnpm dev` en claro, oscuro y móvil (Fuelio detectado con vista previa, genérico con mapeo y resumen), con las rutas de las capturas en `progress/impl_csv-import-web.md`. Cubre: R5, R9, R11, R18.
- [ ] T18 — Ejecutar `pnpm harness --full` y documentar trazabilidad en `progress/impl_csv-import-web.md`. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21, R22, R23.
