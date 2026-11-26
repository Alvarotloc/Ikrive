# Tasks — vehicle-expenses-web

## Datos y helpers

- [ ] T1 — Añadir `vehicles.expenses(id)` en `apps/web/src/lib/query-keys.ts` y crear `apps/web/src/features/expenses/queries.ts` (`expensesQuery`, `useCreateExpense`, `useUpdateExpense`, `useDeleteExpense`, que invalidan `queryKeys.vehicles.detail(vehicleId)`). Cubre: R1, R9, R11, R14, R16.
- [ ] T2 — Crear `apps/web/src/features/expenses/expenses.ts` (`sortExpenses`, `availableExpenseCategories`, `resolveExpenseFilter`, `filterExpenses`, `expenseName`) y `apps/web/src/features/expenses/form.ts` (`expenseFormSchema`, `defaultsFrom`, `formErrorFor`). Cubre: R1, R2, R4, R5, R6, R8, R10, R12, R13.
- [ ] T3 — Tests unitarios en `apps/web/src/features/expenses/expenses.test.ts` (`sorts by date and creation time, newest first`, `lists present categories in canonical order`, `falls back to all when the category has no expenses`, `names an expense by its title or its category`) y `apps/web/src/features/expenses/form.test.ts` (`parses Spanish and English amounts`, `rejects a blank, zero or malformed cost`, `turns blank texts into null`, `defaults to today and insurance`, `maps a 400 without errors to the date field`). Cubre: R1, R2, R4, R6, R8, R9, R10, R12, R13.

## Formulario y sección

- [ ] T4 — Textos nuevos en `apps/web/src/i18n/locales/es.json` y `en.json`: namespace `expenses` (ver `design.md` › i18n; `categories.other` = «Varios» / «Miscellaneous») y en `stats` `metrics.expensesCostPerDistance`, `series.expenses`, `metrics.totalCostHint(_noPurchase)`, `empty.spendingByMonth` y `empty.spendingByCategory`. Test `defines a label for every expense category` en `apps/web/src/i18n/locales.test.ts`. Cubre: R23.
- [ ] T5 — `ExpenseFormDialog` en `apps/web/src/features/expenses/expense-form.tsx` (alta y edición, errores de la API con `formErrorFor`, toasts). Cubre: R8, R9, R10, R11, R12, R13.
- [ ] T6 — Tests de componente en `apps/web/src/features/expenses/expense-form.test.tsx`: `opens with today, insurance and empty fields`, `creates an expense, closes the dialog and shows a toast` (cuerpo del `POST` exacto con importe `1.234,56`), `shows field errors without calling the API when the form is invalid` (importe vacío y 0, título de 121 caracteres), `prefills the form and sends every field with PATCH when editing` (título vaciado → `null`), `shows the future-date error on the date field on a 400 without errors`, `shows the generic error when saving fails for another reason`. Cubre: R8, R9, R10, R11, R12, R13.
- [ ] T7 — `ExpensesSection` en `apps/web/src/features/expenses/expenses-section.tsx` (listado, filtro por chips, botón de alta, editar y `AlertDialog` de borrado). Cubre: R1, R2, R3, R4, R5, R6, R7, R14, R15.
- [ ] T8 — Tests de componente en `apps/web/src/features/expenses/expenses-section.test.tsx`: `lists the vehicle's expenses newest first`, `shows category, title or category name, date and amount of each expense`, `shows the empty message without filter when there are no expenses`, `offers only the present categories and filters the list`, `falls back to all when the filtered category loses its last expense`, `shows the add button only for active vehicles`, `opens the form prefilled when editing an expense`, `deletes an expense only after confirming`, `shows the generic error when deleting fails`, `refreshes the list and the stats after saving` (las dos queries se vuelven a pedir). Cubre: R1, R2, R3, R4, R5, R6, R7, R11, R14, R15, R16.
- [ ] T9 — Ficha: `ensureQueryData(expensesQuery(vehicleId))` en el loader de `apps/web/src/routes/_app/vehicles/$vehicleId/index.tsx` y `<ExpensesSection vehicle={vehicle} />` entre `MaintenanceSection` y `VehicleStatsSection`; declarar `GET /vehicles/v1/expenses` en `apps/web/src/features/mobile/camera-restore-handler.test.tsx`. Cubre: R1.

## Estadísticas

- [ ] T10 — `categorySpendingRows` en `apps/web/src/features/stats/category-spending.ts` y tests en `category-spending.test.ts`: `merges maintenance and expense categories by total, highest first`, `keys and labels each row in its own namespace` (los dos `other`), `returns no rows without spending`. Cubre: R19, R20.
- [ ] T11 — `stats-charts.tsx`: serie «Otros gastos» apilada en «Gasto por mes» y «Gasto por categoría» con `categorySpendingRows`, dos series y leyenda; `vehicle-stats-section.tsx`: métrica `expensesCostPerDistance`, `expenses` en la ayuda del total y rejilla `xl:grid-cols-3`. Cubre: R17, R18, R19, R20, R21.
- [ ] T12 — Tests en `apps/web/src/features/stats/vehicle-stats-section.test.tsx` con gastos en las fixtures: actualizar `shows the key figures in the user's units and currency` (ayuda con otros gastos y «Otros gastos por mi») y `leaves the purchase out of the total breakdown when there is no purchase price`; ampliar `explains what is missing for each empty figure` («Otros gastos por km») y `explains what is missing for each empty chart` (textos nuevos); nuevos `shows expense categories next to maintenance in the category breakdown` (etiquetas «Seguro» y «Varios» junto a «Neumáticos») y `stacks other expenses in the spending per month` (leyenda «Otros gastos»). Cubre: R17, R18, R19, R20, R21.

## Modo local y E2E

- [ ] T13 — Test `vehicle page adds an expense on the device and counts it in the total cost` en `apps/web/src/features/mobile/local-mode.test.tsx`: alta por la UI, `local.expenses.list` con el gasto, fila visible, «Coste total» con el importe y `fetchMock` sin llamadas. Cubre: R22.
- [ ] T14 — E2E `e2e/tests/expenses.spec.ts` › `adds, filters and deletes an expense from the vehicle page`: alta de dos gastos de categorías distintas, filtro por una, ayuda del coste total con el importe y borrado; ejecutar `pnpm test:e2e`. Cubre: R5, R9, R14, R17.

## Cierre

- [ ] T15 — Revisión visual con `pnpm dev` (sección, formulario y estadísticas en claro, oscuro y móvil) y rutas de las capturas en `progress/impl_vehicle-expenses-web.md`. Cubre: R2, R19, R21.
- [ ] T16 — Ejecutar `pnpm harness --full` y documentar trazabilidad en `progress/impl_vehicle-expenses-web.md`. Cubre: R1, R23.
