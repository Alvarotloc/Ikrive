# Design — vehicle-expenses-web

## Idea

Una carpeta `features/expenses/` que copia el patrón de repostajes y mantenimientos de la ficha: `queries.ts` sobre `dataSource().expenses` (ya existe en HTTP y local desde #87), helpers puros de listado y formulario con tests unitarios, `ExpensesSection` (tarjeta con filtro por chips como `MaintenanceSection`) y `ExpenseFormDialog`. Las estadísticas solo cambian de presentación: los campos (`spending.expenses`, `expensesByCategory`, `costPerDistance.expenses`, `spendingByMonth[].expenses`) ya llegan en `VehicleStats`. No hay cambios en `packages/`, `apps/api` ni BD.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| web | `src/lib/query-keys.ts` | `vehicles.expenses(id) = ['vehicles','detail',id,'expenses']` |
| web | `src/features/expenses/queries.ts` (nuevo) | `expensesQuery`, `useCreateExpense`, `useUpdateExpense`, `useDeleteExpense` |
| web | `src/features/expenses/expenses.ts` (nuevo) + `.test.ts` | `sortExpenses`, `availableExpenseCategories`, `resolveExpenseFilter`, `filterExpenses`, `expenseName` |
| web | `src/features/expenses/form.ts` (nuevo) + `.test.ts` | `expenseFormSchema`, `defaultsFrom`, `formErrorFor` |
| web | `src/features/expenses/expense-form.tsx` (nuevo) + `.test.tsx` | `ExpenseFormDialog` |
| web | `src/features/expenses/expenses-section.tsx` (nuevo) + `.test.tsx` | `ExpensesSection` (listado, filtro, borrado) |
| web | `src/routes/_app/vehicles/$vehicleId/index.tsx` | `ensureQueryData(expensesQuery)` en el loader; `<ExpensesSection>` tras `MaintenanceSection` y antes de `VehicleStatsSection` |
| web | `src/features/stats/category-spending.ts` (nuevo) + `.test.ts` | `categorySpendingRows` |
| web | `src/features/stats/stats-charts.tsx` | serie `expenses` en «Gasto por mes»; «Gasto por categoría» con `categorySpendingRows` |
| web | `src/features/stats/vehicle-stats-section.tsx` (+ `.test.tsx`) | métrica «Otros gastos por km», `expenses` en la ayuda del coste total; rejilla de 6 métricas |
| web | `src/i18n/locales/{es,en}.json`, `src/i18n/locales.test.ts` | namespace `expenses`, claves nuevas de `stats` |
| web | `src/features/mobile/camera-restore-handler.test.tsx` | declarar `GET /vehicles/v1/expenses` (la ficha lo pide ahora) |
| web | `src/features/mobile/local-mode.test.tsx` | test de gastos en modo local |
| e2e | `e2e/tests/expenses.spec.ts` (nuevo) | flujo alta → listado → coste total |

## Datos y queries

```ts
// features/expenses/queries.ts
export const expensesQuery = (vehicleId: string) =>
  queryOptions({ queryKey: queryKeys.vehicles.expenses(vehicleId), queryFn: () => dataSource().expenses.list(vehicleId) });
export const useCreateExpense = (vehicleId) => useExpenseMutation((e: CreateExpenseInput) => dataSource().expenses.create(vehicleId, e));
export const useUpdateExpense = (vehicleId) => useExpenseMutation(({ expenseId, changes }: { expenseId: string; changes: UpdateExpenseInput }) => …update(…));
export const useDeleteExpense = (vehicleId) => useExpenseMutation((expenseId: string) => …remove(vehicleId, expenseId));
// onSuccess: invalidateQueries({ queryKey: queryKeys.vehicles.detail(vehicleId) })
```

Un gasto no toca el odómetro ni las reglas, así que basta invalidar el subárbol del vehículo (lista de gastos y estadísticas), no `vehicles.all` como repostajes y mantenimientos.

## Helpers puros

```ts
// features/expenses/expenses.ts
export type ExpenseCategoryFilter = ExpenseCategory | 'all';
export function sortExpenses(expenses: Expense[]): Expense[];               // date desc, createdAt desc
export function availableExpenseCategories(expenses: Expense[]): ExpenseCategory[]; // orden EXPENSE_CATEGORIES
export function resolveExpenseFilter(selected, available): ExpenseCategoryFilter;   // vuelve a 'all'
export function filterExpenses(expenses, filter): Expense[];
export function expenseName(expense, t): string;                          // title ?? t(`expenses.categories.${category}`)

// features/expenses/form.ts
const shape = createExpenseSchema.shape;
export const expenseFormSchema = z.object({
  date: shape.date, category: shape.category, title: shape.title, description: shape.description,
  cost: z.string().transform(parseDecimal).pipe(shape.cost),   // '' → null → «Este campo es obligatorio.»
});
export function defaultsFrom(expense?: Expense): ExpenseFormInput;  // hoy, 'insurance', textos ''
export function formErrorFor(error: unknown): { field: 'date' | 'root'; messageKey: string };
// 400 sin errors → date / expenses.errors.future; resto → root / common.error
```

En edición se envían todos los campos con PATCH (como mantenimientos): `optionalText` convierte `''` en `null`, así que vaciar el título lo borra.

```ts
// features/stats/category-spending.ts
export interface CategorySpendingRow { key: string; name: string; maintenance: number | null; expenses: number | null }
export function categorySpendingRows(spending: VehicleStats['spending'], t: TFunction): CategorySpendingRow[];
// key `maintenance:<cat>` / `expense:<cat>`, nombre de maintenance.categories.* o expenses.categories.*,
// el importe en su serie y null en la otra; orden por importe desc (estable: mantenimiento primero si empatan).
```

## Impacto en UI

- **Sección «Otros gastos»** (`Card`, como `FuelLogsSection`): cabecera con `CardTitle` y botón `accent` «Añadir gasto» solo si `status === 'active'`; chips de filtro con la misma `chipClassName` y `nav aria-label` que mantenimientos; lista `<ol className="divide-y">` con la fila de dos líneas de repostajes (badge `stamp` con la categoría, `<strong>` con `expenseName`, detalle `fecha · importe`) y los botones de editar (`Pencil`) y borrar (`Trash2` + `AlertDialog`), con `aria-label` «Editar «{{name}}» del {{date}}» / «Eliminar …». Vacío: texto `expenses.empty`. Sin estado de carga propio: la ruta precarga la query en el loader y la sección usa `useSuspenseQuery`, como el resto de la ficha; un error del loader lo gestiona la ruta.
- **Formulario** (`Dialog` + `react-hook-form` + `zodResolver`, `FormField`): fecha (`type="date" max={todayIso()}`) e importe (`inputMode="decimal"`, etiqueta con la moneda) en dos columnas, categoría (`Select` con `EXPENSE_CATEGORIES`), título y descripción (`Textarea`). Montado solo mientras está abierto; Guardar deshabilitado mientras envía. Sin adjuntos ni km.
- **Estadísticas**: sexta métrica «Otros gastos por {{unit}}»; la rejilla pasa de `sm:grid-cols-2 xl:grid-cols-5` a `sm:grid-cols-2 xl:grid-cols-3`. Ayuda del total: «Compra X · combustible Y · mantenimiento Z · otros gastos W» (y variante `_noPurchase`). «Gasto por mes»: tercer `Bar` `stackId="spending"` con `COLORS.expenses = 'var(--color-deep)'` (token existente que el modo oscuro ya cambia; sin tocar `index.css`); el `radius` superior pasa a la última serie apilada. «Gasto por categoría»: dos `Bar` apiladas (`stackId="category"`) sobre `categorySpendingRows`; cada fila solo tiene valor en una, el `Tooltip` omite el `null` (`filterNull`, por defecto) y se añade `Legend` como en «Gasto por mes». `YAxis` se queda en 96 px: la etiqueta más larga sigue siendo de mantenimiento («Neumáticos»).
- Móvil y oscuro: solo se reutilizan componentes y tokens existentes; la fila de dos líneas ya está probada en móvil en repostajes.

## i18n

Namespace nuevo `expenses` en `es`/`en`: `title` («Otros gastos» / «Other expenses»), `add`, `edit`, `empty`, `filterLabel`, `all`, `created`, `updated`, `deleted`, `deleteTitle`, `deleteDescription`, `editLabel`, `deleteLabel`, `fields.{date,category,title,cost,description}` (`cost` con `{{currency}}`), `categories.{insurance,tax,tolls,parking,fines,other}` («Seguro», «Impuestos», «Peajes», «Parking», «Multas», «Varios»; en `en`, `other` es «Miscellaneous»), `errors.future`.
En `stats`: `metrics.expensesCostPerDistance`, `series.expenses` («Otros gastos»), y se reescriben `metrics.totalCostHint(_noPurchase)`, `empty.spendingByMonth` y `empty.spendingByCategory`. `locales.test.ts` añade `defines a label for every expense category`.

## Alternativas descartadas

- **Gráfica aparte «Otros gastos por categoría».** Cinco gráficas en una rejilla de dos columnas dejan un hueco, y el acceptance pide los gastos «en el desglose por categoría». Una sola gráfica con dos series compara a la vez lo que cuesta un seguro frente a unos neumáticos.
- **Generalizar `features/maintenance/timeline.ts` con genéricos para reutilizarlo.** Serían cinco funciones con un parámetro de tipo y un array de categorías; ahorra unas 20 líneas a costa de tocar mantenimientos y sus tests en una feature que no los cambia. Se copia el patrón.
- **Agrupar el listado por año como mantenimientos.** Los gastos son pocos y recurrentes (seguro, impuesto anual); una lista plana como repostajes es suficiente y la fecha va en cada fila.
- **Invalidar `vehicles.all`.** Refrescaría la lista de vehículos, odómetro y reglas sin motivo.

## Decisiones a validar (Gate 1)

1. **Título de la sección y de la serie: «Otros gastos» / «Other expenses»**, como `docs/PLAN.md` › Fase 9, para no confundirlo con el gasto total. Se dejan como están `csvImport.kinds.expense` y `dataPortability.summary.expenses` («Gastos» / «Expenses»): son contadores junto a «Repostajes» y «Mantenimientos», en plural como ellos (aviso 1 de `review_vehicle-expenses-api.md`).
2. **Etiqueta de `other`: «Varios» / «Miscellaneous»** (resuelta en Gate 1): no repite el título de la sección en su propio chip y no choca con «Otros» de mantenimiento en la gráfica conjunta.
3. **Métrica «Otros gastos por km»** (R18): no está literal en el acceptance; sale de «incluidos en el coste por km» del PLAN y deja las seis métricas en dos filas de tres. No se añade la de coste total por km (`costPerDistance.total`) para no repetir información.
4. **Categoría por defecto `insurance`** (la primera de `EXPENSE_CATEGORIES`, como `oil_change` en mantenimientos).
5. **Sin métrica de gastos en la cabecera de la ficha** (junto a «Gasto en mantenimiento»): el coste total ya está en estadísticas.
6. **Editar y borrar disponibles también en vehículos archivados o vendidos**; solo el alta se oculta, igual que en repostajes y mantenimientos.

## Riesgos

- **Tests existentes que cambian:** `vehicle-stats-section.test.tsx` (texto de la ayuda del total, textos vacíos y nombres de categoría con la gráfica conjunta) y `camera-restore-handler.test.tsx` (nueva petición de la ficha: sin declararla, `mockApi` falla el test).
- **Recharts con dos series apiladas y huecos `null`:** si el tooltip mostrara la serie vacía, se filtra en su `formatter`; el test del desglose comprueba las etiquetas del eje, no la tooltip.
- **Color de la serie de gastos** (`--color-deep`): si en la revisión visual no contrasta en oscuro, se elige otro token existente sin cambiar `index.css`.

## Fuera de alcance

- Cambios en la API, el DataSource o `computeVehicleStats` (#87).
- Gastos en el informe de venta, en el calendario y en la cabecera de la ficha.
- Total filtrado por categoría o por año en la sección.
- Gastos recurrentes, adjuntos y km en los gastos.
- Regenerar las capturas del README (`pnpm screenshots`).
