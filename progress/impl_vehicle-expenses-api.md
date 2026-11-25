# Implementación — vehicle-expenses-api (#87)

Rama `feat/vehicle-expenses-api`. 32/32 tasks marcadas en `specs/vehicle-expenses-api/tasks.md`. Sin commits (los hace el leader tras Gate 2). T1–T19 quedaron en verde (`pnpm harness --full`) antes de empezar el bloque CSV (T20–T31).

## Cambios por archivo

### packages/shared
- `src/enums.ts`: `EXPENSE_CATEGORIES` y `ExpenseCategory`.
- `src/schemas/expenses.ts` (nuevo) y `.test.ts`: `createExpenseSchema`, `updateExpenseSchema`, `expenseSchema`, `expenseParamsSchema` y sus tipos. Se exporta en `src/index.ts`.
- `src/domain/stats.ts`: `StatsExpense`, `VehicleStatsInput.expenses`, `spendingByExpenseCategory` y `spendingByMonth(logs, records, expenses)`. `computeVehicleStats` añade `costPerDistance.expenses`, `costPerDistance.total` (sin el precio de compra), `spending.expenses`, `spending.total` con los gastos y `spending.expensesByCategory`.
- `src/schemas/stats.ts`: los mismos campos en `vehicleStatsSchema`, más `expenses` en cada mes de la serie.
- `src/schemas/data-export.ts`: `expenseExportSchema`, `vehicleExportSchema.expenses` con `.default([])` y `seen.expenses` en `checkIntegrity`.
- `src/domain/data-export-builder.ts`: `DataExportExpenseRow`, `DataExportInputRows.expenses` y el array `expenses` de cada vehículo.
- `src/schemas/data-import.ts`: contador `expenses` en el resumen.
- `src/csv-import/types.ts` y `src/schemas/csv-import.ts`: `expense` en `CsvRowKind`, `CSV_ROW_KINDS` y `CsvRow`. Se quita `not_maintenance` de `CsvSkippedRow.reason` y de `CSV_SKIP_REASONS`. Nuevo `created.expense`.
- `src/csv-import/parse.ts`: rama `expense` en `validateDraft` con `createExpenseSchema`.
- `src/csv-import/keys.ts`: clave `expense|fecha|título|importe`.
- `src/csv-import/categories.ts`: `matchExpenseCategory`. Para no duplicar código, la búsqueda por palabras pasa a un helper genérico que también usa `matchMaintenanceCategory`.
- `src/csv-import/fuelio.ts`: `classify` devuelve `expense` (categoría o `other`, y el nombre de la categoría como título de reserva). `normalize` crea el borrador y descarta `Odo`. `collectImportedCells` incluye la fecha y el coste.
- `src/csv-import/drivvo.ts`: la sección `##Expense`, también traducida, genera filas `expense` y aporta sus celdas de fecha y coste.
- `src/csv-import/lubelogger.ts`: `tax` → `expense` en `KIND_BY_TYPE`. Se leen `Description`, `Notes` y `Cost`, y las celdas de fecha y coste.
- `src/csv-import/generic.ts`: `CSV_REQUIRED_COLUMNS.expense`, `CSV_KIND_COLUMNS.expense` y la rama `expense`, con categoría exacta, si no `matchExpenseCategory`, y si no `other`.
- `src/csv-import/apply.ts`: `CsvImportExisting.expenses`, sus claves guardadas, `rowOdometer` nulo para gastos (solo se comprueba la fecha y no se añade lectura) y `created.expense`.
- Tests: `domain/stats.test.ts`, `schemas/data-export.test.ts`, `domain/data-export-builder.test.ts`, `csv-import/{keys,categories,fuelio,drivvo,lubelogger,generic,parse,apply}.test.ts`.

### packages/db
- `src/schema/expenses.ts` (nuevo) y `src/schema/index.ts`: tabla `expenses` con FK `onDelete: 'cascade'` e índice `(vehicle_id, date)`.
- `migrations/0013_expenses.sql`, `meta/0013_snapshot.json` y `meta/_journal.json`: los genera `pnpm db:generate --name expenses`. Ninguno se escribió a mano.

### apps/api
- `src/modules/expenses/{repository,service,routes}.ts` (nuevo): CRUD con orden `desc(date), desc(createdAt)`. La fecha futura se comprueba con `todayIn` sobre la fecha resultante y los 404 llevan los textos «Vehicle not found» y «Expense not found».
- `src/app.ts`: `expensesRepo` y `expensesService` se registran en las rutas y se pasan a `statsService` y `csvImportService`.
- `src/modules/stats/service.ts`: pasa los gastos a `computeVehicleStats`.
- `src/modules/data-export/repository.ts`: query de gastos (`innerJoin(vehicles)`, filtrada por dueño, ordenada por `date`, `createdAt` y `rowid`).
- `src/modules/data-import/{service,repository}.ts`: `plan.expenses` con ids nuevos, `ImportPlan.expenses` y su inserción tras los vehículos.
- `src/modules/csv-import/{service,repository}.ts`: pasa los gastos existentes e inserta la rama `expense` en la misma transacción, sin lectura.
- Tests: `test/expenses.test.ts` (nuevo), `test/stats.test.ts`, `test/data-export.test.ts`, `test/data-import.test.ts` y `test/csv-import.test.ts`.

### apps/web
- `src/lib/data-source/{types,http}.ts`: grupo `expenses`.
- `src/lib/data-source/local/expenses.ts` (nuevo): `localExpenses` y `listExpenses`. Se registra en `local/index.ts` como `serialized(queue, localExpenses(db))`. Las inserciones y actualizaciones con `RETURNING` van por `.returning().get()`, como en el resto de ficheros locales. No hay columnas agregadas.
- `local/stats.ts`, `local/data-export.ts` y `local/csv-import.ts`: gastos en las estadísticas, en el export y en `applyRows`.
- `src/features/csv-import/wizard.ts`: `totalCreated` suma `created.expense`.
- `src/features/data-portability/data-section.tsx`: `'expenses'` en `SUMMARY_KEYS`.
- `src/i18n/locales/{es,en}.json`: `dataPortability.summary.expenses` y `csvImport.kinds.expense`. Se borra `csvImport.skipReasons.not_maintenance`.
- Fixtures y tests: `local-data-source.test.ts`, `local-export.test.ts`, `local-csv-import.test.ts`, `database.test.ts`, `vehicle-stats-section.test.tsx`, `camera-restore-handler.test.tsx`, `data-section.test.tsx`, `wizard.test.ts` y `csv-import-wizard.test.tsx`.

## Trazabilidad

| R | Test(s) |
|---|---|
| R1 | `apps/api/test/expenses.test.ts` › `creates, lists, reads, updates and deletes an expense`; `packages/shared/src/schemas/expenses.test.ts` › `accepts an expense and turns empty text into null` |
| R2 | `apps/api/test/expenses.test.ts` › `creates, lists, reads, updates and deletes an expense` (dos gastos el mismo día con `createdAt` forzado) |
| R3 | `apps/api/test/expenses.test.ts` › `creates, lists, reads, updates and deletes an expense` |
| R4 | `apps/api/test/expenses.test.ts` › `creates, lists, reads, updates and deletes an expense` (PATCH parcial más fila en BD); `expenses.test.ts` (shared) › `keeps a partial update partial` |
| R5 | `apps/api/test/expenses.test.ts` › `creates, lists, reads, updates and deletes an expense` |
| R6 | `apps/api/test/expenses.test.ts` › `rejects invalid payloads without writing`; `packages/shared/src/schemas/expenses.test.ts` › `rejects an unknown category, a zero or negative cost and long text` |
| R7 | `apps/api/test/expenses.test.ts` › `rejects future dates on create and edit` |
| R8 | `apps/api/test/expenses.test.ts` › `hides other users' vehicles and expenses` (los cinco métodos) |
| R9 | `apps/api/test/expenses.test.ts` › `hides other users' vehicles and expenses` (gasto de otro vehículo propio y de otro usuario) |
| R10 | `apps/api/test/expenses.test.ts` › `deletes the expenses with the vehicle`; `local-data-source.test.ts` › `archives and deletes a vehicle cascading its data` |
| R11 | `apps/web/src/lib/data-source/local/local-data-source.test.ts` › `creates, lists, edits and deletes expenses like the API` |
| R12 | `local-data-source.test.ts` › `rejects invalid, future and unknown expenses without writing` (`writes()` vacío) |
| R13 | `packages/shared/src/domain/stats.test.ts` › `adds expenses to the total cost of ownership`; `apps/api/test/stats.test.ts` › `includes expenses in the stats` |
| R14 | `stats.test.ts` (shared) › `adds expenses to the total cost of ownership`; `apps/api/test/stats.test.ts` › `includes expenses in the stats` |
| R15 | `stats.test.ts` (shared) › `computes the cost per distance of expenses and in total` y `returns null cost per distance without distance` |
| R16 | `stats.test.ts` (shared) › `computes the cost per distance of expenses and in total`, `computes the cost per distance` y `never returns NaN or Infinity with zero quantities or prices` |
| R17 | `stats.test.ts` (shared) › `groups expenses by category without touching maintenance` |
| R18 | `stats.test.ts` (shared) › `spreads expenses by month` y `spreads spending by month`; `apps/api/test/stats.test.ts` › `includes expenses in the stats` |
| R19 | `apps/api/test/stats.test.ts` › `includes expenses in the stats`; `local-data-source.test.ts` › `computes the same stats as computeVehicleStats` |
| R20 | `apps/api/test/data-export.test.ts` › `exports every vehicle with its records`; `local-export.test.ts` › `exports expenses`; `data-export-builder.test.ts` › `groups expenses by vehicle` |
| R21 | `apps/api/test/data-import.test.ts` › `imports the expenses of an export` y `imports an export` (resumen con `expenses: 1`) |
| R22 | `apps/api/test/data-import.test.ts` › `imports a v1 zip without expenses`; `data-export.test.ts` (shared) › `defaults expenses to an empty array in a v1 document` |
| R23 | `apps/api/test/data-import.test.ts` › `rejects duplicate expense ids`; `data-export.test.ts` (shared) › `rejects duplicate expense ids` |
| R24 | `apps/web/src/features/data-portability/data-section.test.tsx` › `shows the imported expenses` y `imports the zip and shows the summary` |
| R25 | `packages/shared/src/csv-import/fuelio.test.ts` › `imports non-maintenance costs as expenses` y `normalizes the Fuelio fixture` |
| R26 | `drivvo.test.ts` › `imports expense rows` y `a section named %s` › `imports a translated expense section` |
| R27 | `lubelogger.test.ts` › `imports tax records as expenses` |
| R28 | `categories.test.ts` › `matches expense categories by word`; `fuelio.test.ts` › `imports non-maintenance costs as expenses` (`tolls`, `other`); `drivvo.test.ts` › `imports expense rows` (`parking`, `tolls`, `other`) |
| R29 | `generic.test.ts` › `maps expense columns` y `requires date and cost for expenses` |
| R30 | `fuelio.test.ts` › `reports an expense without amount as an error`; `drivvo.test.ts` › `imports expense rows`; `lubelogger.test.ts` › `imports tax records as expenses`; `generic.test.ts` › `requires date and cost for expenses` |
| R31 | `parse.test.ts` › `uses expense cells when detecting decimals` (separador y formato de fecha) |
| R32 | `keys.test.ts` › `builds the expense key without category`; `apply.test.ts` › `skips expenses already stored or repeated in the file`; `apps/api/test/csv-import.test.ts` › `skips everything on a second import of the same file` y `skips rows that match data entered by hand`; `local-csv-import.test.ts` › `imports expenses and skips them on a second import` |
| R33 | `apply.test.ts` › `rejects future expenses` |
| R34 | `apply.test.ts` › `summarizes created expenses`; `apps/api/test/csv-import.test.ts` › `imports Fuelio costs as expenses without readings`; `local-csv-import.test.ts` › `imports expenses and skips them on a second import` (un solo `BEGIN`, sin lecturas) |
| R35 | `schemas/csv-import.test.ts` › `matches the parser unions` (tipos); `fuelio.test.ts` › `normalizes the Fuelio fixture` (solo `template` e `income`); `apps/api/test/csv-import.test.ts` › `imports refuels and maintenance with their readings in one request` |
| R36 | `apps/web/src/features/csv-import/wizard.test.ts` › `counts created expenses` |
| R37 | `apps/web/src/i18n/locales.test.ts` (claves de cada `CSV_ROW_KINDS` y `CSV_SKIP_REASONS`); `data-section.test.tsx` › `shows the imported expenses` («Gastos») |

## Verificación

`pnpm harness --full`:

```
[OK]    95 features: 88 done, 6 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #87 vehicle-expenses-api (in_progress)
[OK]    Rama actual: feat/vehicle-expenses-api
[OK]    pnpm lint
[OK]    pnpm typecheck
e2e test:             Test Files  2 passed (2)     Tests  6 passed (6)
packages/shared test: Test Files  41 passed (41)   Tests  313 passed (313)
packages/db test:     Test Files  1 passed (1)     Tests  3 passed (3)
apps/web test:        Test Files  106 passed (106) Tests  765 passed (765)
apps/api test:        Test Files  40 passed (40)   Tests  401 passed (401)
[OK]    pnpm test
[OK]    Arnés en verde.
```

No hay capturas de UI. La feature no añade componentes ni maquetación: solo un contador más en la lista del resumen del zip y una etiqueta de tipo en el CSV, las dos con el componente que ya existía, y las cubren los tests de componente. La UI de gastos llega con #88. No se ha ejecutado `pnpm test:e2e`: ningún E2E usa `not_maintenance` ni la forma de las estadísticas.

## Desviaciones del spec y notas

1. **Columna `category` tipada con `text({ enum: EXPENSE_CATEGORIES })`** en lugar de `text()`. Es la convención de `maintenance.ts` y solo afecta al tipo de TypeScript, así que el DTO no necesita un cast. Tras el cambio, `pnpm db:generate` responde «No schema changes»: el SQL es idéntico.
2. **Etiqueta `csvImport.kinds.expense` en plural** («Gastos» / «Expenses»), no «Gasto» / «Expense» como dice `design.md`. Las demás etiquetas de ese grupo están en plural («Repostajes», «Mantenimientos», «Lecturas de kilometraje») y se usan como encabezado de contador en el resultado. Si se prefiere el singular, basta con cambiar dos líneas de JSON.
3. **`apps/web/src/lib/data-source/local/database.test.ts`** no está en `design.md`, pero se ha tocado. Tenía el número de migraciones fijado a 13, así que pasa a 14 y además comprueba que la migración crea `expenses`. Es consecuencia directa de T3.
4. **`collectImportedCells` no incluye el odómetro de los gastos** en Fuelio, Drivvo ni LubeLogger, porque ese odómetro se descarta. Lo exige R31 y lo anticipa el diseño («fecha y `cost`»).
5. **Detección del formato de fecha (R31):** el formato de fecha no se infiere; solo se acepta ISO o el formato declarado. Por eso una fecha no ISO de un gasto junto a repostajes ISO hace que se pida `dateFormat`, como cualquier otra celda importada. `parse.test.ts` › `uses expense cells when detecting decimals` lo fija.
6. **Importe 0:** en Fuelio, 0 ya significaba «sin importe» (`amount()`) y da `missing_field`. En Drivvo, LubeLogger y el genérico, el 0 llega al esquema y da `out_of_range`. En todos los casos el error va con `field: 'cost'` y la fila no se importa, como pide R30.
7. **Herramientas:** tras generar la migración 0013, los tests de la web fallaban con «Missing migration file 0013_expenses.sql». La causa es la caché de módulos de Vitest en `node_modules/.vitest-cache` (raíz del repo): no invalida el `import.meta.glob` de `local/migrations.ts` cuando aparece un fichero nuevo. Bastó con borrarla en local (`rm -rf node_modules/.vitest-cache apps/web/node_modules/.vitest-cache`). En CI no pasa porque la caché parte vacía, pero le volverá a pasar a quien añada una migración en local. Queda anotado en `progress/current.md`.
