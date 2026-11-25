# Exploración #87 vehicle-expenses-api — importación CSV y filas «no mantenimiento»

> Informe de un agente `Explore` (solo lectura), guardado por el leader.

Hoy los tres formatos ya leen estas filas, pero ninguno las convierte en fila importable: se van todas a `skipped` con `reason: 'not_maintenance'` y nunca llegan al plan ni a la base de datos. Además, `CsvRowKind` se usa en varios sitios a la vez, así que añadir un tipo `expense` cambia el contrato de la API y obliga a tocar la web.

## 1. Parsers de #84 (`packages/shared/src/csv-import/`)

**Detección** (`detect.ts`, `detectDocument`):
- **Con secciones:**
  - Es Fuelio si la sección `log` tiene una cabecera con `Data`/`Date` y `Odo` (`isFuelioLogHeader`).
  - Si no, es Drivvo si alguna sección cumple `isDrivvoRefuelSection`, es decir, sección de repostajes con 21 columnas.
  - En otro caso es `unknown`.
- **Sin secciones:** es LubeLogger si `lubeLoggerRecordType(headers)` no devuelve null.
- **Consecuencia:** un Drivvo que solo trae `##Expense`, o un Fuelio que solo trae `## Costs` sin `## Log`, se detecta como `unknown`. Si se quiere importar ficheros solo de gastos, hay que tocar la detección.

**Fuelio** (`fuelio.ts`):
- `costCategories()` lee `## CostCategories` (CostTypeID → Name).
- `costsTable()` busca las columnas `CostTitle, Date, Odo, CostTypeID, Notes, Cost, isTemplate, isIncome, UniqueId`.
- Clasificación de cada fila:
  ```ts
  const label = names.get(cell(record, columns.typeId)) || cell(record, columns.title) || null;
  // isTemplate=1 → skip 'template'; isIncome=1 → skip 'income'; valor no booleano → invalid (error invalid_boolean)
  const category = matchMaintenanceCategory(names.get(cell(record, columns.typeId)) ?? '');
  return category ? { type: 'maintenance', category } : { type: 'skip', reason: 'not_maintenance', label };
  ```
- La categoría se decide solo por el *nombre de la categoría* de Fuelio, usando `categories.ts`, que compara palabras de una tabla (oil/aceite, itv, freno…). «Seguro» no coincide con nada y por eso se omite.
- En `normalize`, una fila `skip` hace `output.skipped.push({ row: record.line, reason, label })` y `continue`. No se lee la fecha ni el importe.
- `collectImportedCells` solo tiene en cuenta los costes de mantenimiento. Las celdas de las filas omitidas no participan en la detección del formato de fecha ni del separador decimal (hay un test: `parse.test.ts` › «ignores skipped rows when detecting decimals»). Si pasan a importarse como gastos, hay que añadirlas aquí.
- Campos de la fila de mantenimiento que sirven de modelo para un gasto:
  - `date` vía `readDate`.
  - `odometer` vía `readMaintenanceOdometer`; 0 o vacío da null.
  - `title` (CostTitle).
  - `description` (Notes).
  - `cost` vía `amount()`, que trata 0 como no registrado.
  - `sourceId` (UniqueId).
  - El tipo de gasto saldría de la etiqueta de CostTypeID.

**Drivvo** (`drivvo.ts`):
- Secciones por nombre: `NAMED_SECTIONS` (`expense` → `'expense'`). Si están traducidas, se reconocen por número de columnas (`EXPENSE_COLUMNS = 7`) y por una fecha ISO en la columna 1.
- Hoy todas las filas de gasto se omiten:
  ```ts
  for (const section of sectionsOf(doc, 'expense')) {
    for (const record of section.records.slice(1)) {
      output.skipped.push({ row: record.line, reason: 'not_maintenance', label: cell(record, 3) || null });
    }
  }
  ```
- Columnas de `##Expense`, según la fixture: 0 Odometer, 1 Date (`"2025-02-20 11:00:00"`), 2 Total cost, 3 Type of expense, 4 Local expense, 5 Reason, 6 Notes.
- `collectImportedCells` no incluye los gastos.
- `sourceId` siempre es null.

**LubeLogger** (`lubelogger.ts`):
- `lubeLoggerRecordType` devuelve `'tax'` cuando hay `description && cost && !odometer`.
- Solo hay un tipo por fichero.
- Para `tax`, `collectImportedCells` devuelve vacío y `normalize` omite todas las filas:
  ```ts
  if (type === 'tax') { output.skipped.push({ row: record.line, reason: 'not_maintenance', label: cell(record, columns.description) || null }); continue; }
  ```
- `KIND_BY_TYPE: Record<Exclude<LubeLoggerRecordType,'tax'>, CsvRowKind>`.
- Campos de un `tax`: fecha (`date`, o day/month/year compuesta), `Description` y `Cost` (alias `COST`, puede llevar `$`). Hay índice `notes`; no hay km.

**Cómo se informa de lo omitido:**
- Tipo: `CsvSkippedRow { row; reason: 'not_maintenance'|'template'|'income'; label }` (`types.ts`).
- `buildParsed` lo ordena por fila en `parse.ts`.
- En el esquema: `CSV_SKIP_REASONS` y `summary.skipped` (`schemas/csv-import.ts`).
- No hay warnings por fila. `CsvRowWarning` solo tiene `odometer_rounded | merged_fuels`.

**Fixtures** (`csv-import/fixtures/`):
- `fuelio.csv`:
  - Costs en las filas 15–19: aceite (mantenimiento), ITV (mantenimiento, odo 0), «Seguro anual» (CostTypeID 2 «Seguro», línea 17, omitida), plantilla (línea 18, template) e ingreso (línea 19, income).
  - Test: `fuelio.test.ts:87`.
- `drivvo.csv`:
  - Fila `##Expense` en la línea 10: `20600,"2025-02-20 11:00:00",300,"Insurance","Aseguradora Ejemplo","","Poliza inventada"`.
  - Tests: `drivvo.test.ts:60`, y `:215` para la sección traducida de 7 columnas.
- `lubelogger-tax.csv`:
  - Contenido: `Date,Description,Cost` / `2025-01-15,Impuesto de circulacion,110.00`.
  - Tests: `lubelogger.test.ts:76-78` y `detect.test.ts:29`.
- Otras fixtures: `lubelogger-{fuel,service,service-latin1,odometer}.csv`.
- Test de API: `apps/api/test/csv-import.test.ts:135` comprueba que `skipped` sea `['not_maintenance','template','income']` para Fuelio. **Habrá que cambiar este test.**

## 2. Tipo normalizado de fila y `planCsvImport` (#85)

**Tipos** (`types.ts`):
- `CsvRowKind = 'odometer' | 'fuel' | 'maintenance'`.
- `CsvRow` es una unión discriminada por `kind`, con `data` de tipo `CreateOdometerReading | CreateFuelLog | CreateMaintenanceRecord`, más `sourceRow`, `sourceId`, `key` y `warnings`.
- `CsvDraftRow { kind; input; dropped }`.
- `validateDraft` (`parse.ts`) valida cada fila con el esquema de creación de su tipo y calcula `key`. Para un gasto haría falta una rama con un `createExpenseSchema`.

**Mismo `CsvRowKind` en varios sitios** (`schemas/csv-import.ts`):
- `CSV_ROW_KINDS` alimenta tres cosas:
  - `mapping.kind` del CSV genérico;
  - `rejected[].kind`;
  - la UI de mapeo de columnas.
- `generic.ts` tiene `CSV_REQUIRED_COLUMNS` / `CSV_KIND_COLUMNS: Record<CsvRowKind,…>`.
- `schemas/csv-import.test.ts:29` exige que `CSV_ROW_KINDS` coincida con `CsvRowKind`.
- Si se añade `expense` a `CsvRowKind`, el genérico tiene que soportarlo o hay que separar los tipos.

**`csvRowKey`** (`keys.ts`):
```ts
odometer|${date}|${value}
fuel|${date}|${odometer}|${quantity.toFixed(3)}|${totalPrice.toFixed(2)}
maintenance|${date}|${odometer ?? ''}|${title.trim().toLowerCase()}|${cost ? cost.toFixed(2) : ''}
```
Para `expense` habría que añadir una rama, por ejemplo con fecha, categoría o título e importe.

**`planCsvImport`** (`apply.ts`):
- `CsvImportExisting { readings; fuelLogs; maintenance }`. Habría que añadir `expenses`, y `storedKeys()` genera claves a partir de lo guardado.
- Orden de proceso (`processingOrder`): primero repostajes y mantenimiento, después lecturas sueltas; dentro de cada grupo, por `sourceRow`.
- Para cada fila:
  1. Si la clave está en `seen` (lo guardado o una fila ya vista del fichero), suma a `duplicates++`.
  2. Si no, se añade a `seen`.
  3. Se ejecuta `validateOdometerWrite({readings, date, odometer, today})`. Si falla, va a `rejected` como `future_date` o `odometer_conflict`.
  4. Si pasa, va a `accepted`. Si tiene km, se añade una lectura virtual y la clave de odómetro correspondiente.
- Las filas rechazadas también marcan su clave como vista.
- Un gasto sin km solo validaría la fecha. Decisión pendiente: ¿un gasto con km crea lectura, como el mantenimiento?

**`csvImportSummary`:**
- `created = { odometer, fuel, maintenance }`, contado por `row.kind`.
- `csvImportSummarySchema.created` es un `z.object` con esas tres claves fijas, así que añadir `expense` cambia el contrato.
- El resto del resumen: `duplicates`, `rejected`, `errors`, `skipped`, `droppedFuelFields`, `encodingReplaced`, `dryRun`, `format`.

**API** (`apps/api/src/modules/csv-import/`):
- `routes.ts`: `POST /vehicles/:id/csv-import` en multipart, con `options` antes de `file`, límite `CSV_IMPORT_MAX_BYTES` (413) y respuesta 201, o 200 si es dryRun.
- `service.ts`: `findOwned` (404) → `decodeCsv` → `parseCsvImport` con `target` del vehículo y los ajustes → `planCsvImport(result.rows, {readings: vehicles.listReadings, fuelLogs: fuelLogs.listByVehicle, maintenance: maintenance.listByVehicle}, todayIn(tz))` → `repo.apply` si no es dryRun.
  - El servicio inyecta repos. Habría que añadir un `expenses` repo para pasar los existentes.
- `repository.ts`: `apply` es un `db.transaction` síncrono que inserta las lecturas (`manual`/`fuel`/`maintenance`), `fuelLogs` y `maintenanceRecords`. Haría falta una rama `expense` y, si se decide así, un nuevo valor de `source` para las lecturas de odómetro, lo que afectaría a la BD.

**Local:**
- `apps/web/src/lib/data-source/local/csv-import.ts` replica la API: `applyRows(tx, …)` dentro de `db.transaction`, y `listReadings`/`listFuelLogs`/`listMaintenanceRecords` para lo existente.
- Habría que añadir `listExpenses` y una rama `expense` en `applyRows`.
- Tests: `apps/web/src/lib/data-source/local/local-csv-import.test.ts`.
- Tests de la API: `apps/api/test/csv-import.test.ts`.
- Tests del plan: `packages/shared/src/csv-import/apply.test.ts`.

## 3. UI de #86 (`apps/web/src/features/csv-import/`)

- **`wizard.ts`:**
  - `totalCreated = s.created.odometer + s.created.fuel + s.created.maintenance`. Hay que añadir `expense`, o la vista previa contará de menos.
  - `previewCounts` devuelve `{valid, duplicates, errors, skipped: s.skipped.length}`.
  - `resultCounts` calcula `omitted = duplicates + skipped.length`.
  - `csvIssues` combina errors, rejected y skipped ordenados por fila, con un máximo de 50.
- **`import-counts.tsx`:**
  - `PreviewCounts` muestra cuatro contadores (válidas, duplicadas, con error, omitidas), los avisos `droppedFuelFields` y `encodingReplaced`, y la lista `IssueList`.
  - `ResultCounts` recorre `CSV_ROW_KINDS.map(kind => t('csvImport.kinds.'+kind), counts.created[kind])`. Al añadir `expense` aparecería solo, pero necesita la traducción.
  - Los motivos de las filas omitidas salen de `t('csvImport.skipReasons.'+reason)` más la etiqueta.
- **`column-mapping.tsx`:** usa `CSV_ROW_KINDS` en el selector de tipo del CSV genérico.
- **i18n:** `apps/web/src/i18n/locales/{es,en}.json` tiene `csvImport.kinds` (en.json:694) y `skipReasons` (en.json:769: `not_maintenance` = «no es un mantenimiento»).
- **Test de locales:** `apps/web/src/i18n/locales.test.ts:62,71` exige claves para cada `CSV_ROW_KINDS` y cada `CSV_SKIP_REASONS`. Si se añade un tipo o se quita un motivo, hay que tocar la web (aunque sea solo textos) en #87, o el arnés falla.
- **Ruta:** `apps/web/src/routes/_app/import.tsx`.
- **Tests de componente:** `csv-import-wizard.test.tsx`, `wizard.test.ts`.

**Contrato:** cambia si hay `created.expense` y/o un `expense` en `CSV_ROW_KINDS`. Si `not_maintenance` deja de usarse, puede quedar sin uso o eliminarse; `template` e `income` de Fuelio siguen omitiéndose. El texto «no es un mantenimiento» deja de tener sentido para estas filas.

## 4. Avisos de `progress/review_csv-import-apply.md` relacionados con #87

- **R7:** ningún formato mezcla lecturas sueltas con repostajes en el mismo fichero, así que la deduplicación «del mismo fichero» solo se prueba en `planCsvImport`. Texto literal: «Cuando #87 o algún formato nuevo mezcle tipos, conviene añadir el test de extremo a extremo». Con los gastos, Fuelio y Drivvo mezclarán repostajes, mantenimiento y gastos.
- **Fallo de escritura en local:** se rechaza con el error del motor, no con un `ApiError`.
- **`rejected`:** va en orden de proceso, no por número de fila. Si los gastos se añaden a un grupo nuevo del orden, eso afecta.
- **`options` después de `file`:** se ignora en silencio.
- **`unit_mismatch`:** el mensaje omite las unidades nulas.

## Decisiones abiertas para el spec

1. ¿`expense` entra en `CsvRowKind` (y por tanto en el genérico, `mapping.kind` y `rejected.kind`), o va en un tipo aparte?
2. ¿Cómo se pasa la etiqueta de la app de origen (Seguro, Insurance, Impuesto) a las categorías de gasto (insurance, tax, tolls, parking, fines, other)? Habría que crear algo como un `matchExpenseCategory` análogo a `categories.ts`.
3. ¿Un gasto con km crea lectura de odómetro (Drivvo trae Odometer, Fuelio trae Odo)?
4. Qué clave usar en `csvRowKey` para `expense`.
5. Si se incluyen las celdas de los gastos en `collectImportedCells`. Puede cambiar el formato de fecha o el separador que se deduce del fichero.
6. Si se cambia la detección para aceptar ficheros que solo traen gastos.
7. Qué tests de skipped actuales hay que cambiar: `fuelio.test.ts:87`, `drivvo.test.ts:60,215`, `lubelogger.test.ts:78`, `parse.test.ts:179`, `apps/api/test/csv-import.test.ts:135`, más `apply.test.ts:170-174`.
