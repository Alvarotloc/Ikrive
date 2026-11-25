# Tasks — vehicle-expenses-api

## Modelo y CRUD

- [x] T1 — Añadir `EXPENSE_CATEGORIES` y `ExpenseCategory` en `packages/shared/src/enums.ts`; crear `packages/shared/src/schemas/expenses.ts` (`createExpenseSchema`, `updateExpenseSchema`, `expenseSchema`, `expenseParamsSchema` y tipos) y exportarlo en `src/index.ts`. Cubre: R1, R6.
- [x] T2 — Tests en `packages/shared/src/schemas/expenses.test.ts`: `accepts an expense and turns empty text into null`, `rejects an unknown category, a zero or negative cost and long text` y `keeps a partial update partial`. Cubre: R6.
- [x] T3 — Tabla `expenses` en `packages/db/src/schema/expenses.ts` (FK `onDelete: 'cascade'`, índice `(vehicle_id, date)`), reexportarla en `schema/index.ts` y generar `0013_expenses` con `pnpm db:generate`. Cubre: R1, R10.
- [x] T4 — Módulo `apps/api/src/modules/expenses/{repository,service,routes}.ts` (orden `desc(date), desc(createdAt)`, fecha futura con `todayIn`, 404 `Vehicle not found` / `Expense not found`) y registro en `apps/api/src/app.ts`. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9.
- [x] T5 — Tests en `apps/api/test/expenses.test.ts`: `creates, lists, reads, updates and deletes an expense` (respuesta con `toEqual` y filas en BD, orden con dos gastos del mismo día), `rejects invalid payloads without writing`, `rejects future dates on create and edit`, `hides other users' vehicles and expenses` (todos los métodos y un gasto de otro vehículo) y `deletes the expenses with the vehicle`. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10.
- [x] T6 — Grupo `expenses` en `apps/web/src/lib/data-source/types.ts` y `http.ts`; `apps/web/src/lib/data-source/local/expenses.ts` (con `listExpenses`) y registro en `local/index.ts`. Cubre: R11, R12.
- [x] T7 — Tests en `apps/web/src/lib/data-source/local/local-data-source.test.ts`: `creates, lists, edits and deletes expenses like the API` y `rejects invalid, future and unknown expenses without writing`; ampliar `archives and deletes a vehicle cascading its data` con la tabla `expenses`. Cubre: R10, R11, R12.

## Estadísticas

- [x] T8 — `StatsExpense`, `VehicleStatsInput.expenses`, `spendingByExpenseCategory` y `spendingByMonth(logs, records, expenses)` en `packages/shared/src/domain/stats.ts`; campos nuevos en `packages/shared/src/schemas/stats.ts`. Cubre: R13, R14, R15, R16, R17, R18.
- [x] T9 — Tests en `packages/shared/src/domain/stats.test.ts`: `adds expenses to the total cost of ownership`, `computes the cost per distance of expenses and in total` (también `null` sin distancia), `groups expenses by category without touching maintenance` y `spreads expenses by month` (un mes solo con gastos amplía el rango); ampliar `never returns NaN or Infinity` con gastos. Cubre: R13, R14, R15, R16, R17, R18.
- [x] T10 — Pasar los gastos a `computeVehicleStats` en `apps/api/src/modules/stats/service.ts` (con `expensesRepo` desde `app.ts`) y en `apps/web/src/lib/data-source/local/stats.ts`. Cubre: R19.
- [x] T11 — Test `includes expenses in the stats` en `apps/api/test/stats.test.ts` y gastos en el test local `computes the same stats as computeVehicleStats`; actualizar las fixtures `VehicleStats` de `apps/web/src/features/stats/vehicle-stats-section.test.tsx` y `apps/web/src/features/mobile/camera-restore-handler.test.tsx`. Cubre: R13, R14, R19.

## Export e import

- [x] T12 — `expenseExportSchema`, `vehicleExportSchema.expenses` con `.default([])` y `seen.expenses` en `packages/shared/src/schemas/data-export.ts`; `DataExportExpenseRow` y `DataExportInputRows.expenses` en `packages/shared/src/domain/data-export-builder.ts`; `expenses` en `dataImportSummarySchema`. Cubre: R20, R21, R22, R23.
- [x] T13 — Tests `defaults expenses to an empty array in a v1 document` y `rejects duplicate expense ids` en `packages/shared/src/schemas/data-export.test.ts`, y `groups expenses by vehicle` en `packages/shared/src/domain/data-export-builder.test.ts`. Cubre: R20, R22, R23.
- [x] T14 — Query de gastos en `apps/api/src/modules/data-export/repository.ts` y en `loadLocalExportRows` de `apps/web/src/lib/data-source/local/data-export.ts`. Cubre: R20.
- [x] T15 — Ampliar `exports every vehicle with its records` en `apps/api/test/data-export.test.ts` con un gasto y añadir `exports expenses` en `apps/web/src/lib/data-source/local/local-export.test.ts`. Cubre: R20.
- [x] T16 — `plan.expenses` en `apps/api/src/modules/data-import/service.ts` y `ImportPlan.expenses` en `repository.ts`. Cubre: R21, R22.
- [x] T17 — Tests en `apps/api/test/data-import.test.ts`: `imports the expenses of an export` (ids nuevos, vehículo nuevo y `expenses` en el resumen), `imports a v1 zip without expenses` (`data.json` sin la clave) y `rejects duplicate expense ids`. Cubre: R21, R22, R23.
- [x] T18 — `'expenses'` en `SUMMARY_KEYS` de `apps/web/src/features/data-portability/data-section.tsx` y `dataPortability.summary.expenses` en `es.json` y `en.json`; actualizar la fixture `DataImportSummary`. Cubre: R24, R37.
- [x] T19 — Test `shows the imported expenses` en `apps/web/src/features/data-portability/data-section.test.tsx`. Cubre: R24.

## Importación CSV

- [x] T20 — `expense` en `CsvRowKind`, `CSV_ROW_KINDS` y `CsvRow`; `CsvSkippedRow.reason` y `CSV_SKIP_REASONS` sin `not_maintenance`; `created.expense` en `csvImportSummarySchema`; rama `expense` en `validateDraft` (`parse.ts`) y en `csvRowKey` (`keys.ts`). Cubre: R30, R32, R34, R35.
- [x] T21 — Test `builds the expense key without category` en `packages/shared/src/csv-import/keys.test.ts`; `matches the parser unions` de `packages/shared/src/schemas/csv-import.test.ts` sigue en verde con las uniones nuevas. Cubre: R32, R35.
- [x] T22 — `matchExpenseCategory` en `packages/shared/src/csv-import/categories.ts` y test `matches expense categories by word` (es/en, acentos, plurales, `null` sin coincidencia) en `categories.test.ts`. Cubre: R28.
- [x] T23 — Fuelio (`fuelio.ts`): `classify` devuelve `expense`, `normalize` crea el borrador y `collectImportedCells` incluye fecha y coste. Tests en `fuelio.test.ts`: `imports non-maintenance costs as expenses` (fila «Seguro anual» de la fixture, `insurance`, `sourceId`) y `reports an expense without amount as an error`; actualizar el test de `skipped` (solo `template` e `income`). Cubre: R25, R28, R30, R31, R35.
- [x] T24 — Drivvo (`drivvo.ts`): filas `##Expense` como `expense` y sus celdas en `collectImportedCells`. Tests en `drivvo.test.ts`: `imports expense rows` (fixture, `insurance`) y `imports a translated expense section`. Cubre: R26, R28, R31.
- [x] T25 — LubeLogger (`lubelogger.ts`): `tax` en `KIND_BY_TYPE` como `expense` y sus celdas en `collectImportedCells`. Test `imports tax records as expenses` en `lubelogger.test.ts` (fixture `lubelogger-tax.csv`). Cubre: R27, R31.
- [x] T26 — Genérico (`generic.ts`): `CSV_REQUIRED_COLUMNS.expense`, `CSV_KIND_COLUMNS.expense` y rama `expense` en `normalizeGeneric`. Tests `maps expense columns` y `requires date and cost for expenses` en `generic.test.ts`. Cubre: R29.
- [x] T27 — En `packages/shared/src/csv-import/parse.test.ts`, sustituir `ignores skipped rows when detecting decimals` por `uses expense cells when detecting decimals` y añadir la fila `expense` a `returns schema-valid data for every kind`. Cubre: R31, R35.
- [x] T28 — `planCsvImport` y `csvImportSummary` (`apply.ts`): `CsvImportExisting.expenses`, claves guardadas, gastos en el primer grupo del orden, solo comprobación de fecha, `created.expense`. Tests en `apply.test.ts`: `skips expenses already stored or repeated in the file`, `rejects future expenses` y `summarizes created expenses`. Cubre: R32, R33, R34.
- [x] T29 — API: `expenses` existentes en `apps/api/src/modules/csv-import/service.ts` y rama `expense` en `repository.ts`. Tests en `apps/api/test/csv-import.test.ts`: `imports Fuelio costs as expenses without readings`, ampliar `skips everything on a second import of the same file` para que el Fuelio con repostajes, mantenimientos y gastos dé todo duplicado, y ajustar los `skipped` esperados. Cubre: R32, R34, R35.
- [x] T30 — Local: `listExpenses` y rama `expense` en `applyRows` de `apps/web/src/lib/data-source/local/csv-import.ts`. Test `imports expenses and skips them on a second import` en `local-csv-import.test.ts`. Cubre: R32, R34.
- [x] T31 — Web: `totalCreated` con `created.expense` en `apps/web/src/features/csv-import/wizard.ts`; `csvImport.kinds.expense` en `es.json` y `en.json` y borrar `csvImport.skipReasons.not_maintenance`; actualizar las fixtures `CsvImportSummary` de `wizard.test.ts` y `csv-import-wizard.test.tsx` (el `not_maintenance` pasa a `template`). Test `counts created expenses` en `wizard.test.ts`; `apps/web/src/i18n/locales.test.ts` sigue en verde. Cubre: R36, R37.

## Cierre

- [x] T32 — Ejecutar `pnpm harness --full` y documentar trazabilidad en `progress/impl_vehicle-expenses-api.md`. Cubre: R1, R37.
