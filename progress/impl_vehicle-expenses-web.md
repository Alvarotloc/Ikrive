# Implementación — vehicle-expenses-web (#88)

Rama `feat/vehicle-expenses-web`. T1–T16 hechas y marcadas en `specs/vehicle-expenses-web/tasks.md`. Sin commits.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `apps/web/src/lib/query-keys.ts` | `vehicles.expenses(id)` bajo `detail(id)`; comentario de `stats` actualizado. |
| `apps/web/src/features/expenses/queries.ts` (nuevo) | `expensesQuery`, `useCreateExpense`, `useUpdateExpense`, `useDeleteExpense`; invalidan `queryKeys.vehicles.detail(vehicleId)`. |
| `apps/web/src/features/expenses/expenses.ts` (nuevo) | `sortExpenses`, `availableExpenseCategories`, `resolveExpenseFilter`, `filterExpenses`, `expenseName`. |
| `apps/web/src/features/expenses/form.ts` (nuevo) | `expenseFormSchema` (shape compartido + `cost` como texto con `parseDecimal`), `defaultsFrom` (hoy, `insurance`, textos vacíos), `formErrorFor` (400 sin `errors` → fecha; resto → root). |
| `apps/web/src/features/expenses/expense-form.tsx` (nuevo) | `ExpenseFormDialog`: fecha (`max` = hoy) e importe en dos columnas, categoría, título y descripción. Bloquea el cierre mientras guarda y muestra los toasts. |
| `apps/web/src/features/expenses/expenses-section.tsx` (nuevo) | `ExpensesSection`: tarjeta «Otros gastos», chips de filtro (`aria-pressed`), vuelta a «Todas», lista de dos líneas, editar y borrar con `AlertDialog`, alta solo en vehículos activos. |
| `apps/web/src/routes/_app/vehicles/$vehicleId/index.tsx` | `ensureQueryData(expensesQuery)` en el loader y `<ExpensesSection>` entre mantenimientos y estadísticas. |
| `apps/web/src/features/stats/category-spending.ts` (nuevo) | `categorySpendingRows`: une mantenimiento y gastos, con claves `maintenance:*` / `expense:*`, ordenados de mayor a menor total (si empatan, va primero el mantenimiento). |
| `apps/web/src/features/stats/stats-charts.tsx` | Serie «Otros gastos» apilada en «Gasto por mes» (el radio superior pasa a esta serie). «Gasto por categoría» con dos series apiladas, `filterNull`, leyenda, `interval={0}` en el eje Y y altura que crece con las filas. Prop opcional `height` en `ChartFigure`. Color `COLORS.expenses = var(--color-warning)`. |
| `apps/web/src/features/stats/vehicle-stats-section.tsx` | Métrica «Otros gastos por {{unit}}», `expenses` en la ayuda del coste total y rejilla `xl:grid-cols-3`. |
| `apps/web/src/i18n/locales/{es,en}.json` | Namespace `expenses` (`other` = «Varios» / «Miscellaneous») y en `stats`: `metrics.expensesCostPerDistance`, `series.expenses`, ayudas del total y textos vacíos reescritos. |
| `apps/web/src/i18n/locales.test.ts` | `defines a label for every expense category`. |
| `apps/web/src/features/mobile/camera-restore-handler.test.tsx` | Declara `GET /vehicles/v1/expenses`. |
| `apps/web/src/features/mobile/local-mode.test.tsx` | Test de gastos en modo local. |
| `e2e/tests/expenses.spec.ts` (nuevo) | Flujo alta ×2 → filtro → coste total → borrado. |
| Tests nuevos | `features/expenses/{expenses,form}.test.ts`, `features/expenses/{expense-form,expenses-section}.test.tsx` y `features/stats/category-spending.test.ts`. |

## Trazabilidad

Abreviaturas: EX = `features/expenses/expenses.test.ts`, EF = `features/expenses/form.test.ts`, FD = `features/expenses/expense-form.test.tsx`, ES = `features/expenses/expenses-section.test.tsx`, CS = `features/stats/category-spending.test.ts`, VS = `features/stats/vehicle-stats-section.test.tsx`, LM = `features/mobile/local-mode.test.tsx`, LO = `i18n/locales.test.ts`, E2E = `e2e/tests/expenses.spec.ts`.

| R | Tests |
|---|---|
| R1 | EX › sorts by date and creation time, newest first · ES › lists the vehicle's expenses newest first · montaje en la ficha: `camera-restore-handler.test.tsx` (pide `GET /vehicles/v1/expenses`) + LM |
| R2 | EX › names an expense by its title or its category · ES › shows category, title or category name, date and amount of each expense · capturas `*-section.png` |
| R3 | ES › shows the empty message without filter when there are no expenses |
| R4 | EX › lists present categories in canonical order · ES › offers only the present categories and filters the list |
| R5 | ES › offers only the present categories and filters the list · E2E |
| R6 | EX › falls back to all when the category has no expenses · ES › falls back to all when the filtered category loses its last expense |
| R7 | ES › shows the add button only for active vehicles |
| R8 | EF › defaults to today and insurance · FD › opens with today, insurance and empty fields (incluye `max` = hoy) |
| R9 | EF › parses Spanish and English amounts · EF › turns blank texts into null · FD › creates an expense, closes the dialog and shows a toast (cuerpo exacto del `POST` con `1.234,56`) · E2E |
| R10 | EF › rejects a blank, zero or malformed cost · EF › rejects a title or description that is too long · FD › shows field errors without calling the API when the form is invalid |
| R11 | FD › prefills the form and sends every field with PATCH when editing (título vaciado → `null`) · ES › opens the form prefilled when editing an expense |
| R12 | EF › maps a 400 without errors to the date field · FD › shows the future-date error on the date field on a 400 without errors |
| R13 | EF › maps any other error to the generic message · FD › shows the generic error when saving fails for another reason |
| R14 | ES › deletes an expense only after confirming · E2E |
| R15 | ES › shows the generic error when deleting fails |
| R16 | ES › refreshes the list and the stats after saving (`GET …/expenses` y `GET …/stats` se vuelven a pedir) · ES › deletes an expense only after confirming |
| R17 | VS › shows the key figures in the user's units and currency · VS › leaves the purchase out of the total breakdown when there is no purchase price · E2E |
| R18 | VS › shows the key figures… («Otros gastos por mi») · VS › explains what is missing for each empty figure («Otros gastos por km» con «—» y su ayuda) |
| R19 | CS › merges maintenance and expense categories by total, highest first · CS › keys and labels each row in its own namespace · VS › shows expense categories next to maintenance in the category breakdown · VS › shows the expense categories even without maintenance spending · capturas `*-chart-category*.png` |
| R20 | CS › returns no rows without spending · VS › explains what is missing for each empty chart |
| R21 | VS › stacks other expenses in the spending per month · VS › explains what is missing for each empty chart · capturas `*-chart-month*.png` |
| R22 | LM › vehicle page adds an expense on the device and counts it in the total cost (alta por la UI, `local.expenses.list`, fila visible, «Coste total» y `fetchMock` sin llamadas) |
| R23 | LO › es and en define the same keys · LO › defines a label for every expense category (incluye «Varios» / «Miscellaneous») |

## Verificación

`pnpm harness --full`:

```
[OK]    96 features: 90 done, 5 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #88 vehicle-expenses-web (in_progress)
[OK]    Rama actual: feat/vehicle-expenses-web
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test        (web 112 ficheros / 803 tests · api 40 / 401 · shared 41 / 313 · db 1 / 3 · mobile 31)
[OK]    Arnés en verde.
```

`pnpm test:e2e`, repetido tras los cambios de T15: 7 de 7 en verde, incluido `expenses.spec.ts › adds, filters and deletes an expense from the vehicle page`.

## Revisión visual (T15)

Monté un stack aislado sin tocar el `pnpm dev` del humano (`:3000`/`:5173`). La API de `apps/api/dist` servía la SPA compilada en el scratchpad, en `127.0.0.1:3419` y con `DATA_DIR` también en el scratchpad. Sembré los datos por API: un Seat León con precio de compra, 10 repostajes, 3 mantenimientos con coste y 7 gastos de las 6 categorías (uno sin título y dos el mismo día). Las capturas se hicieron con playwright-core contra `/usr/bin/google-chrome`, en `es-ES`, en claro y oscuro a 1280 px y en móvil a 375 px (claro y oscuro). El servidor ya está parado.

Directorio: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/7244f005-ff0e-4807-8abd-a19fb5981aa6/scratchpad/shots/`

- Versión final (`final-<variante>-<vista>.png`, variantes `light`, `dark`, `mobile`, `mobile-dark`). Vistas: `section`, `section-filter-tolls`, `stats`, `chart-month`, `chart-month-tooltip`, `chart-category`, `chart-category-tooltip-expense`, `chart-category-tooltip-maintenance`, `form`, `form-error`, `form-edit` y `delete-confirm`. Ejemplos:
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/7244f005-ff0e-4807-8abd-a19fb5981aa6/scratchpad/shots/final-dark-stats.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/7244f005-ff0e-4807-8abd-a19fb5981aa6/scratchpad/shots/final-light-stats.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/7244f005-ff0e-4807-8abd-a19fb5981aa6/scratchpad/shots/final-dark-chart-category-tooltip-expense.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/7244f005-ff0e-4807-8abd-a19fb5981aa6/scratchpad/shots/final-light-section.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/7244f005-ff0e-4807-8abd-a19fb5981aa6/scratchpad/shots/final-mobile-section.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/7244f005-ff0e-4807-8abd-a19fb5981aa6/scratchpad/shots/final-mobile-dark-form-error.png`
- Versión con `--color-deep` como evidencia (`deep-*.png`), sobre todo `deep-dark-stats.png` y `deep-light-chart-month.png`.
- Scripts: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/7244f005-ff0e-4807-8abd-a19fb5981aa6/scratchpad/pw/seed.mjs` y `shots.mjs`.

Comprobaciones medidas en el navegador (las cuatro variantes):

- Desbordamiento horizontal: 0 px en la página y en el diálogo.
- **Tooltip de «Gasto por categoría»:** no muestra la serie vacía. Sobre «Seguro» solo sale `["Otros gastos : 512,30 €"]`; sobre «Neumáticos», solo `["Mantenimiento : 480,00 €"]`. Basta con `filterNull`; no hizo falta tocar el `formatter`.
- **Contraste de `--color-deep`:** no vale. En oscuro (`#0e1616` sobre la tarjeta `#1a2424`) tiene 1,15:1 y la serie casi desaparece. En claro (`#1a3638` junto a combustible `#2d3a3a`) tiene 1,09:1 y no se distingue de la serie apilada al lado (se ve en `deep-*.png`). Como prevé el diseño (Riesgos), cambié a otro token que ya existía, sin tocar `index.css`: `--color-warning` (ámbar `#8a6100` / `#f0cf7a`). Frente a la tarjeta da 5,54:1 en claro y 10,52:1 en oscuro, y su tono se distingue de las dos series verdes en ambos temas (`final-*-stats.png`).

## Desviaciones del spec

1. **Color de la serie «Otros gastos»: `var(--color-warning)` en lugar de `var(--color-deep)`.** El propio `design.md` (Riesgos) prevé este cambio si `--color-deep` no contrasta. Es un token existente e `index.css` no se toca. El motivo y los contrastes están en la sección anterior y en un comentario junto a `COLORS`.
2. **«Gasto por categoría»: `interval={0}` en el eje Y y altura dinámica.** Con el gráfico conjunto hay hasta 14 filas (8 + 6). Con 9 filas y los 240 px fijos, Recharts se saltaba una etiqueta de cada dos (`deep-dark-stats.png`), y R19 pide la etiqueta de cada categoría. El eje ya no omite ninguna. La figura mide `max(240, filas × 22 + 70)` px gracias a una prop opcional `height` en `ChartFigure`; con 8 filas o menos sigue a 240 px. El diseño no fija la altura y el cambio no sale de `stats-charts.tsx`.
3. **Tests añadidos además de los que lista `tasks.md`:** `EF › rejects a title or description that is too long`, `EF › maps any other error to the generic message` y `VS › shows the expense categories even without maintenance spending`. Cubren R10, R13 y R19/R20 con más detalle. No quité ninguno de los pedidos.

## Observaciones (fuera de alcance, sin cambiar)

- **Mensaje de importe 0:** `moneySchema.positive()` produce un `too_small` exclusivo, y `i18n/zod.ts` solo traduce el inclusivo. Sale el genérico «El valor no es válido.». R10 se cumple (campo marcado y mensaje en `role="alert"`), pero un «Debe ser mayor que 0» sería más claro. Ya pasaba con otros campos `positive()` (cantidad de repostaje).
- **Tooltip en oscuro:** el texto de «Mantenimiento» toma el color de su serie (`--color-accent-strong`, `#2e524b`) y contrasta poco (`final-dark-chart-month-tooltip.png`). Ya existía antes de esta feature.
- **Badge ancho:** la columna del badge se ajusta en cada fila. «IMPUESTOS» supera el `min-w-20` y desplaza su texto unos px frente al resto (`final-light-section.png`). Es el mismo patrón que repostajes y mantenimientos.
- **Cabecera en móvil:** en las capturas por elemento a 375 px se ve la cabecera fija de la app encima de la tarjeta. Es un artefacto de la captura.
