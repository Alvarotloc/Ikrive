# Design — vehicle-expenses-api

## Idea

Una tabla `expenses` hija de `vehicles`, con el mismo patrón de capas que `maintenance_records` pero sin odómetro, sin adjuntos y sin programación. Los gastos entran en `computeVehicleStats` como un tercer bloque de coste junto a combustible y mantenimiento, viajan en el zip v1 como un array más de cada vehículo y aparecen como un cuarto `CsvRowKind` (`expense`) en el pipeline de importación CSV de #84/#85.

## Tamaño y posible partición

El spec toca cuatro subsistemas (CRUD, estadísticas, zip, CSV) y unos 60 ficheros, muchos de ellos tests. **Recomendación: un solo spec.** El acceptance lo fijó el humano con el CSV dentro, todo cuelga de la misma tabla y el mismo enum, y cada bloque es un delta pequeño sobre un patrón que ya existe. Las tasks van en orden: el CRUD, las estadísticas y el zip (T1–T19) quedan completos y en verde antes de empezar el CSV (T20–T31); T32 cierra.

Si en Gate 1 se prefiere partir, el corte limpio es:

- `vehicle-expenses-api` (#87): R1–R24, la parte de R37 del resumen del zip y T1–T19, quitando del acceptance el criterio del CSV.
- `csv-import-expenses` (nueva, después de #87 y antes de #88): R25–R37 y T20–T31 tal cual, con ese criterio como acceptance. Mientras no se integre, las filas de gastos siguen saliendo en `skipped` como `not_maintenance`.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `src/enums.ts` | `EXPENSE_CATEGORIES = ['insurance','tax','tolls','parking','fines','other']` y `ExpenseCategory` |
| shared | `src/schemas/expenses.ts` (nuevo) + `.test.ts` | `createExpenseSchema`, `updateExpenseSchema`, `expenseSchema`, `expenseParamsSchema` y tipos; exportar en `src/index.ts` |
| shared | `src/domain/stats.ts`, `src/schemas/stats.ts` | `StatsExpense`, `VehicleStatsInput.expenses`, campos nuevos (ver Estadísticas) |
| shared | `src/schemas/data-export.ts`, `src/domain/data-export-builder.ts` | `expenseExportSchema`, `vehicleExportSchema.expenses` con `.default([])`, `seen.expenses`, `DataExportExpenseRow`, `DataExportInputRows.expenses` |
| shared | `src/schemas/data-import.ts` | `expenses` en `dataImportSummarySchema` |
| shared | `src/csv-import/{types,keys,parse,generic,categories,fuelio,drivvo,lubelogger,apply}.ts`, `src/schemas/csv-import.ts` | `expense` como `CsvRowKind` (ver CSV) |
| db | `packages/db/src/schema/expenses.ts` (nuevo), `schema/index.ts` | tabla `expenses`; `pnpm db:generate` → `migrations/0013_expenses.sql` + snapshot + journal |
| api | `src/modules/expenses/{routes,service,repository}.ts` (nuevo), `src/app.ts` | CRUD; `statsService` y `csvImportService` reciben `expensesRepo` |
| api | `src/modules/stats/service.ts` | pasa `expenses` a `computeVehicleStats` |
| api | `src/modules/data-export/repository.ts`, `src/modules/data-import/{service,repository}.ts` | query de gastos, `plan.expenses`, `ImportPlan.expenses` |
| api | `src/modules/csv-import/{service,repository}.ts` | existentes `expenses` y rama `expense` en `apply` |
| web | `src/lib/data-source/{types,http}.ts`, `local/expenses.ts` (nuevo), `local/index.ts` | grupo `expenses` del DataSource |
| web | `local/stats.ts`, `local/data-export.ts`, `local/csv-import.ts` | gastos en stats, export y CSV local |
| web | `features/csv-import/wizard.ts`, `features/data-portability/data-section.tsx`, `i18n/locales/{es,en}.json` | cambios mínimos de contrato (ver Web) |

`vehicles/repository.ts` y `local/vehicles.ts` no cambian: el borrado en cascada sale del FK.

## Base de datos

```ts
export const expenses = sqliteTable('expenses', {
  id: id(),
  vehicleId: text().notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  date: text().notNull(),            // YYYY-MM-DD
  category: text().notNull(),        // EXPENSE_CATEGORIES, validado en zod
  title: text(),                     // nullable
  description: text(),               // nullable
  cost: real().notNull(),            // moneda del usuario
  createdAt, updatedAt,              // como fuel_logs
}, (t) => [index('expenses_vehicle_id_date_idx').on(t.vehicleId, t.date)]);
```

Migración `0013_expenses` generada con `pnpm db:generate`; la aplican la API al arrancar y `migrateLocal` en el teléfono (`database.test.ts` ya compara ambos esquemas).

## Contrato HTTP

Todas bajo `authenticate`, con `idParamSchema` / `expenseParamsSchema` (`{ id, expenseId }`).

| Método y ruta | Cuerpo | Respuesta | Errores |
|---|---|---|---|
| `GET /api/vehicles/:id/expenses` | — | 200 `Expense[]` (fecha desc, `createdAt` desc) | 404 Vehicle not found |
| `POST /api/vehicles/:id/expenses` | `createExpenseSchema` | 201 `Expense` | 400 validación, 400 fecha futura, 404 |
| `GET /api/vehicles/:id/expenses/:expenseId` | — | 200 `Expense` | 404 Vehicle / Expense not found |
| `PATCH /api/vehicles/:id/expenses/:expenseId` | `updateExpenseSchema` | 200 `Expense` | 400, 404 |
| `DELETE /api/vehicles/:id/expenses/:expenseId` | — | 204 | 404 |

Fecha futura: `BadRequestError('The expense date cannot be in the future')` comparando con `todayIn(settings.get(userId).timezone)`; en PATCH se compara la fecha resultante.

## Tipos y firmas

```ts
// packages/shared/src/schemas/expenses.ts
const expenseFieldsSchema = z.object({
  date: isoDateSchema,
  category: z.enum(EXPENSE_CATEGORIES),
  title: optionalText(120),
  description: optionalText(2000),
  cost: moneySchema.positive(),
});
export const createExpenseSchema = expenseFieldsSchema;
export const updateExpenseSchema = expenseFieldsSchema.partial();
export const expenseSchema = z.object({ id, vehicleId, date, category, title: z.string().nullable(),
  description: z.string().nullable(), cost: z.number(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() });
export const expenseParamsSchema = z.object({ id: z.string().min(1), expenseId: z.string().min(1) });
// tipos: CreateExpense, CreateExpenseInput, UpdateExpense, UpdateExpenseInput, Expense

// apps/web/src/lib/data-source/types.ts
expenses: {
  list(vehicleId: string): Promise<Expense[]>;
  create(vehicleId: string, expense: CreateExpenseInput): Promise<Expense>;
  update(vehicleId: string, expenseId: string, changes: UpdateExpenseInput): Promise<Expense>;
  remove(vehicleId: string, expenseId: string): Promise<void>;
};
```

Los nombres `cost` y `description` son los de `maintenance_records` a propósito: coinciden con las columnas `cost` y `description` de `CSV_COLUMNS`, así los `errors[].field` del CSV y las etiquetas de la web ya existen.

`local/expenses.ts` copia `local/maintenance.ts`: `parseInput`, `requireVehicle`, `localToday(db)` y los mismos `detail`; exporta `listExpenses(db, vehicleId)` para `stats.ts`, `data-export.ts` y `csv-import.ts`. Se registra como `expenses: serialized(queue, localExpenses(db))`.

## Estadísticas

```ts
export interface StatsExpense { date: string; category: ExpenseCategory; cost: number }
VehicleStatsInput.expenses: readonly StatsExpense[]
export function spendingByExpenseCategory(expenses): { category: ExpenseCategory; total: number }[]
export function spendingByMonth(logs, records, expenses): { month; fuel; maintenance; expenses }[]
```

Cambios en `vehicleStatsSchema` (todos aditivos salvo el campo nuevo de cada mes):

- `costPerDistance`: `{ fuel, maintenance, expenses, total }`; `total = (fuel + maintenance + expenses) / driven`.
- `spending`: `{ purchase, fuel, maintenance, expenses, total, byCategory, expensesByCategory }`; `total = purchase + fuel + maintenance + expenses`.
- `series.spendingByMonth[]`: `{ month, fuel, maintenance, expenses }`.

`byCategory` sigue siendo solo de mantenimiento con `MAINTENANCE_CATEGORIES`. #88 pinta `expensesByCategory` con las etiquetas de `expenses.categories` y decide si las junta en una gráfica.

## Export e import

- `expenseExportSchema`: `id` (`exportIdSchema`), `date`, `category` (`z.enum(EXPENSE_CATEGORIES)`), `title`, `description`, `cost` (`moneySchema`), `createdAt`, `updatedAt`. Sin los `max` de los formularios, como el resto del esquema de export.
- `vehicleExportSchema.expenses: z.array(expenseExportSchema).default([])`; `formatVersion` sigue en 1. `checkIntegrity` añade `seen.expenses`.
- Export API y local: misma query (`innerJoin(vehicles)`, dueño, orden `date`, `createdAt`, `rowid`).
- Import API: bucle `for (const expense of vehicle.expenses) plan.expenses.push({ ...campos, id: randomUUID(), vehicleId: nuevo })`; `insertPlan` las inserta tras los vehículos; `ImportCounts` da `expenses` al resumen.
- Un `data.json` antiguo conserva sus bytes, así que su huella `data_sha256` no cambia y la deduplicación de #44 sigue funcionando.

## Importación CSV

- `CsvRowKind = 'odometer' | 'fuel' | 'maintenance' | 'expense'`, `CSV_ROW_KINDS` igual, `CsvRow` con `{ kind: 'expense'; data: CreateExpense }`, rama en `validateDraft` con `createExpenseSchema`.
- `csvRowKey`: `expense|${date}|${(title ?? '').trim().toLowerCase()}|${cost.toFixed(2)}`. Sin categoría, por la misma razón que en mantenimiento: si el usuario la corrige tras importar, la reimportación no debe duplicar el gasto.
- `matchExpenseCategory(name): ExpenseCategory | null` en `categories.ts`, misma técnica por palabras sin acentos y con plurales: `insurance` (insurance, seguro, poliza, policy), `tax` (tax, impuesto, ivtm), `tolls` (toll, peaje, autopista, motorway), `parking` (parking, aparcamiento, estacionamiento), `fines` (fine, multa, sancion). Lo que no coincide → `other`.
- **Fuelio**: `classify` devuelve `{ type: 'expense', category, label }` donde hoy devuelve `not_maintenance`. Plantilla e ingreso se siguen omitiendo. El `Odo` de la fila se descarta.
- **Drivvo**: `##Expense` → columnas 1 (fecha), 2 (importe), 3 (título y etiqueta de categoría), 6 (descripción). Odómetro, «Local expense» y «Reason» se descartan. `sourceId` sigue en null.
- **LubeLogger**: `tax` pasa a `KIND_BY_TYPE` como `expense`; `KIND_BY_TYPE` deja de excluir `tax`.
- **Genérico**: `CSV_REQUIRED_COLUMNS.expense = [['date'], ['cost']]`, `CSV_KIND_COLUMNS.expense = ['date','category','title','description','cost']`.
- `collectImportedCells`: fecha y `cost` de las filas `expense` en los tres formatos.
- `CSV_SKIP_REASONS = ['template', 'income']` y `CsvSkippedRow.reason` igual: `not_maintenance` ya no lo produce nadie.
- `planCsvImport`: `CsvImportExisting.expenses: Pick<Expense,'date'|'title'|'cost'>[]` entra en `storedKeys`. Las filas `expense` van en el primer grupo del orden de proceso (con repostajes y mantenimientos, por `sourceRow`) y solo comprueban la fecha (`validateOdometerWrite` con `odometer: null`); no añaden lectura aceptada.
- `csvImportSummarySchema.created.expense`; `csvImportSummary` lo cuenta.
- API (`csv-import/repository.ts`) y local (`applyRows`) insertan los gastos en la misma transacción; el servicio y `local/csv-import.ts` pasan `expenses` existentes.
- La detección no cambia: un fichero que solo trae gastos sigue saliendo como `unknown` (ver Riesgos).

## Web (cambios mínimos)

- `wizard.ts`: `totalCreated` suma `created.expense`.
- `data-section.tsx`: `'expenses'` en `SUMMARY_KEYS`.
- i18n `es`/`en`: `csvImport.kinds.expense` («Gasto» / «Expense»), `dataPortability.summary.expenses` («Gastos» / «Expenses»); se borra `csvImport.skipReasons.not_maintenance`.
- Fixtures tipadas que dejan de compilar (`VehicleStats` en `vehicle-stats-section.test.tsx` y `camera-restore-handler.test.tsx`, `CsvImportSummary` en `wizard.test.ts` y `csv-import-wizard.test.tsx`, `DataImportSummary` en `data-section.test.tsx`) reciben los campos nuevos; el `skipped` `not_maintenance` del wizard pasa a `template`.
- El selector de tipo del mapeo genérico (`column-mapping.tsx`) muestra «Gasto» solo, porque recorre `CSV_ROW_KINDS` y `CSV_KIND_COLUMNS`.
- Sin componentes nuevos: listado, formulario y desglose en estadísticas son #88.

## Alternativas descartadas

- **Odómetro opcional que crea lectura `source: 'expense'`.** Habría que añadir un valor a `ODOMETER_SOURCES`, tocar `canDeleteOdometerReading`, el export de lecturas y la validación de conflictos. Además, el km que Drivvo y Fuelio guardan en un seguro o una multa suele ser aproximado, y rechazar el gasto por un conflicto de odómetro sería peor que no guardarlo. El backlog no pide km en los gastos.
- **Adjuntos en gastos.** El backlog no los pide, y obligarían a ampliar `ATTACHMENT_ENTITY_TYPES`, los dos borrados de vehículo, las queries de adjuntos del export y `ImportPlan.attachments`. Los justificantes con caducidad llegan con #89 (documentos).
- **Subir `formatVersion` a 2.** Un servidor antiguo rechazaría de forma explícita un zip nuevo, pero habría que aceptar 1 y 2 en `parseDocument`, migrar documentos v1 y cambiar el test de versión no soportada, y #89 tendría que decidir de nuevo. `.default([])` cumple el acceptance con un cambio aditivo.
- **Un solo `byCategory` con categorías mezcladas.** `other` existe en los dos enums y colisionaría; un enum unión rompería el consumidor actual de la web y sus etiquetas viven en namespaces distintos. Un campo aparte es aditivo.
- **`expense` fuera de `CsvRowKind` (tipo propio solo para formatos con secciones).** Duplicaría `validateDraft`, `rejected.kind`, el resumen y `applyRows`, y el CSV genérico no podría importar gastos de una hoja de cálculo. Entrar en la unión reutiliza todo el pipeline.

## Decisiones a validar (Gate 1)

1. **Modelo:** `date`, `category`, `title?`, `description?`, `cost` obligatorio y mayor que 0. Sin km ni adjuntos.
2. **Fecha futura rechazada** (400) como en repostajes y mantenimientos, aunque un seguro se pague por adelantado: se registra en la fecha del pago.
3. **`costPerDistance.total` sin el precio de compra**: es el coste de uso por km. El coste total de propiedad (`spending.total`) sí lo incluye.
4. **CSV genérico con `kind: 'expense'`** (R29), que el acceptance no pide de forma explícita pero sale gratis al entrar en `CsvRowKind`.
5. **Clave de deduplicación sin categoría ni odómetro**: dos gastos el mismo día con el mismo título e importe (dos tickets de parking iguales sin título) cuentan como duplicado.
6. **Se elimina `not_maintenance`** del contrato del resumen; toda fila de coste de Fuelio que no es mantenimiento ni plantilla ni ingreso es un gasto (`other` si no se reconoce, p. ej. «Lavado»).
7. **Un solo spec** en vez de partir (ver «Tamaño y posible partición»).

## Riesgos

- **Total sin desglose hasta #88:** la tarjeta de coste total de la web ya sumará los gastos, pero su texto de ayuda solo enumera compra, combustible y mantenimiento. Queda así entre #87 y #88; ambas cierran antes de la v0.4.0.
- **Zip nuevo en un servidor antiguo:** `vehicleExportSchema` es `z.object` y descarta claves desconocidas, así que un servidor anterior a #87 importaría el zip sin los gastos y sin avisar. Es un *downgrade* que no se soporta; conviene mencionarlo en las notas de la v0.4.0.
- **Ficheros solo de gastos:** un Drivvo sin sección de repostajes o un Fuelio sin `## Log` se siguen detectando como `unknown`. Las exportaciones reales de esas apps traen siempre la cabecera de esas secciones; si no es así, se abrirá una feature aparte.
- **Detección de separador:** al entrar las celdas de gastos en `collectImportedCells`, un fichero que hoy se deduce solo puede pasar a pedir `decimalSeparator` (o al revés). Los tests de `parse.test.ts` y las fixtures lo fijan.
- **Tests existentes que cambian:** `fuelio.test.ts`, `drivvo.test.ts`, `lubelogger.test.ts`, `parse.test.ts` (`ignores skipped rows when detecting decimals`), `apply.test.ts`, `apps/api/test/csv-import.test.ts` (los `skipped` de Fuelio y los `created`), `stats.test.ts` de shared y API, y los de export/import que comparan documentos completos.

## Fuera de alcance

- UI de gastos (listado, formulario, filtro por categoría, desglose en estadísticas): #88.
- Filtro por categoría en la API: el listado es corto y #88 filtra en el cliente.
- Gastos en el informe de venta y en el feed iCal.
- Import del zip en modo local (sigue en 501).
- Detección de ficheros de Fuelio o Drivvo que solo traen gastos.
- Gastos recurrentes o programados.
