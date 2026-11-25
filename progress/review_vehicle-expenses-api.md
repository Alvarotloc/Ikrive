# Review — #87 vehicle-expenses-api

**Veredicto:** APPROVED

Revisado contra `specs/vehicle-expenses-api/` (R1–R37, T1–T32), `CONTRIBUTING.md`, `docs/sdd.md`, `docs/verification.md` y `CHECKPOINTS.md`. Diff completo leído: `git diff main...HEAD` (spec y `feature_list.json`), `git diff` (62 ficheros) y los nuevos sin trackear (`modules/expenses/*`, `test/expenses.test.ts`, `local/expenses.ts`, `schema/expenses.ts`, `0013_expenses.sql` + snapshot, `schemas/expenses{,.test}.ts`, `progress/explore_*`, `progress/impl_*`).

## Trazabilidad requirements ↔ tests

- R1: [x] `apps/api/test/expenses.test.ts` › `creates, lists, reads, updates and deletes an expense`: 201, `toEqual` del DTO completo (texto recortado) y fila en BD. `schemas/expenses.test.ts` › `accepts an expense and turns empty text into null`.
- R2: [x] mismo test: dos gastos del mismo día con `createdAt` forzado a 2020 en el creado después; el orden esperado `[untitled, older, expense, earlier]` solo sale si el desempate es `createdAt desc`.
- R3: [x] mismo test: `GET /:expenseId` → 200 y `toEqual(expense)`.
- R4: [x] mismo test: PATCH `{ cost, description: '' }` → 200, resto de campos intactos en la respuesta y en la fila. Shared › `keeps a partial update partial`.
- R5: [x] mismo test: 204, fila ausente en BD y GET posterior 404.
- R6: [x] `rejects invalid payloads without writing`: los 8 casos del requirement en POST (400 problem+json, `Validation failed`, tabla vacía) y 4 en PATCH (gasto sin cambios). Shared › `rejects an unknown category, a zero or negative cost and long text`.
- R7: [x] `rejects future dates on create and edit`: `detail` exacto en POST y PATCH, sin filas y gasto sin cambios.
- R8: [x] `hides other users' vehicles and expenses`: los 5 métodos con el intruso → 404 problem+json, `Vehicle not found`.
- R9: [x] mismo test: gasto de otro vehículo propio y de otro usuario en GET/PATCH/DELETE → 404 `Expense not found`; el original sigue igual.
- R10: [x] `deletes the expenses with the vehicle` (API, tabla vacía tras 204); local › `archives and deletes a vehicle cascading its data` amplía con `expenses`.
- R11: [x] `local-data-source.test.ts` › `creates, lists, edits and deletes expenses like the API`: DTO validado con `expenseSchema`, mismo orden (incluido desempate por `createdAt`), update y remove.
- R12: [x] `rejects invalid, future and unknown expenses without writing`: 400 validación, 400 con el `detail` de fecha futura, 404 `Vehicle not found` / `Expense not found` con problem idéntico; `writes()` vacío y el listado sigue igual (ver aviso 3).
- R13: [x] shared › `adds expenses to the total cost of ownership` (20.4, redondeo a céntimos con 0.2 + 20.2); API › `includes expenses in the stats` (410.1).
- R14: [x] mismos tests: `total` con y sin precio de compra, y sin gastos.
- R15: [x] shared › `computes the cost per distance of expenses and in total` (0.135) y `returns null cost per distance without distance` (sin lecturas y con distancia 0).
- R16: [x] mismo test (0.21, sin precio de compra) y `never returns NaN or Infinity…`; API (1.03).
- R17: [x] `groups expenses by category without touching maintenance`: orden desc, redondeo, `[]` sin gastos y `byCategory` solo con mantenimiento.
- R18: [x] `spreads expenses by month`: meses solo con gastos amplían el rango por ambos extremos; API añade 2024-12.
- R19: [x] API › `includes expenses in the stats` (respuesta completa con `toEqual`); local › `computes the same stats as computeVehicleStats` con gastos y valores concretos (`expenses: 257.8`, `total: 10_685.3`).
- R20: [x] API › `exports every vehicle with its records` (array completo y `[]` en el otro vehículo); local › `exports expenses` (orden por fecha, esquema válido); builder › `groups expenses by vehicle`.
- R21: [x] `imports the expenses of an export`: 201, `expenses: 1` en el resumen, fila con id nuevo en el vehículo nuevo, timestamps conservados y el gasto de A intacto.
- R22: [x] `imports a v1 zip without expenses` (el `data.json` no contiene `"expenses"`, 201, `expenses: 0`); shared › `defaults expenses to an empty array in a v1 document` (documento parseado = original + `expenses: []`).
- R23: [x] API › `rejects duplicate expense ids` (400, ruta `vehicles.1.expenses.0.id`, nada escrito: `expectRejected` compara snapshot); shared, mismo id en un vehículo y entre vehículos.
- R24: [x] `data-section.test.tsx` › `shows the imported expenses`: «Gastos» tras «Repostajes» con el valor 1250.
- R25: [x] `fuelio.test.ts` › `imports non-maintenance costs as expenses`: fila completa de la fixture (`sourceId`, clave, título, categoría) y título de reserva con el nombre de la categoría.
- R26: [x] `drivvo.test.ts` › `imports expense rows` (fecha, importe, título, descripción) y `imports a translated expense section`.
- R27: [x] `lubelogger.test.ts` › `imports tax records as expenses`: `tax`, `Description`, `Notes`, `Cost` con símbolo.
- R28: [x] `categories.test.ts` › `matches expense categories by word` (es/en, acentos, plurales, `null`); Fuelio (`tolls`, `other`) y Drivvo (`parking`, `tolls`, `other`).
- R29: [x] `generic.test.ts` › `maps expense columns` (exacta, `matchExpenseCategory`, `other`) y `requires date and cost for expenses` (`missing` exacto).
- R30: [x] errores con `field: 'cost'` y fila no importada en los cuatro formatos (Fuelio `missing_field`; Drivvo/LubeLogger/genérico vacío `missing_field` y 0 `out_of_range`).
- R31: [x] `parse.test.ts` › `uses expense cells when detecting decimals`: el gasto prueba el separador, lo vuelve ambiguo y su fecha exige `dateFormat`.
- R32: [x] `keys.test.ts` › `builds the expense key without category`; `apply.test.ts` › `skips expenses already stored or repeated in the file` (guardado con otra caja/categoría, repetido, mismo título otro importe, dos sin título); API › `skips everything on a second import of the same file` (Fuelio con repostajes, mantenimientos y gasto: `duplicates: 5`, BD igual) y `skips rows that match data entered by hand`; local › `imports expenses and skips them on a second import` y el test de segunda importación del Fuelio (`duplicates: 5`).
- R33: [x] `apply.test.ts` › `rejects future expenses`: `{ row, kind: 'expense', reason: 'future_date', conflict: null }`, y el gasto no se compara con lecturas guardadas.
- R34: [x] API › `imports Fuelio costs as expenses without readings` (fila exacta, 3 lecturas, sin la de 11200); local › un solo `BEGIN`, sin lecturas, `created.expense: 1`; `apply.test.ts` › `summarizes created expenses`.
- R35: [x] `CSV_SKIP_REASONS`/`CsvSkippedRow.reason` sin `not_maintenance` (`matches the parser unions`), fixture de Fuelio solo con `template`/`income`; no queda ninguna referencia a `not_maintenance` en `apps/`, `packages/` ni `e2e/` (salvo `dist/` generado).
- R36: [x] `wizard.test.ts` › `counts created expenses` (valid 10 y `created.expense` en el resultado).
- R37: [x] `locales.test.ts` recorre `CSV_ROW_KINDS` y `CSV_SKIP_REASONS` en ambos idiomas; `dataPortability.summary.expenses` en `es`/`en` y visible en `shows the imported expenses`.

## Tasks

- T1..T32: [x]

## Checkpoints

- C1: [x] `pnpm harness` OK; una feature activa (#87 `in_progress`); rama `feat/vehicle-expenses-api`.
- C2: [x] los tres ficheros; EARS con un `DEBE` y tabla de cobertura del acceptance; 32/32 tasks; cada R con test abierto y leído (arriba).
- C3: [x] el diff se ajusta a la tabla «Archivos» del design; `database.test.ts` es consecuencia directa de la migración (el design lo cita en «Base de datos»). Sin refactors ajenos salvo el helper `matchCategory` en `categories.ts`, que es el mínimo para no duplicar la búsqueda (comportamiento de mantenimiento cubierto por sus tests existentes).
- C4: [x] `modules/expenses/{routes,service,repository}.ts` cableado en `app.ts`, rutas con esquemas de `@ikrive/shared`; propiedad → 404; `NotFoundError`/`BadRequestError`; tabla en `db/schema` + `0013_expenses.sql` con snapshot y journal; DataSource `types`/`http`/`local` con `parseInput`, `serialized` y mismos `detail`; textos en `es` y `en`; lógica pura en shared con tests.
- C5: [x] sin `any`, `@ts-ignore`, `console.*` ni TODOs nuevos; fechas `YYYY-MM-DD` (`isoDateSchema`); sin conversiones de km; sin ficheros subidos.
- C6: [x] `pnpm harness --full` en verde ejecutado por mí (shared 313, db 3, web 765, api 401, e2e-unit 6); SQLite en memoria sin mocks de BD; sin capturas, justificado en el impl (solo una etiqueta y un contador más con componentes existentes y cubiertos por tests de componente; la UI es #88).
- C7: [x] `impl_vehicle-expenses-api.md` con archivos, mapa R→test y salida; `current.md` describe la sesión; `PLAN.md` no cambia (no cierra fase ni decisión).

## Hallazgos

Ninguno bloqueante. Comprobado en particular:

- **Desviaciones del impl.** (1) `text({ enum })`: solo tipo TS, SQL idéntico y local/API iguales (`database.test.ts` compara esquemas). (2) Etiqueta en plural: `csvImport.kinds.*` se usa como encabezado de contador en `import-counts.tsx` y como opción del selector en `column-mapping.tsx`; las otras tres están en plural, así que «Gastos»/«Expenses» es lo coherente y R37 solo exige que exista. (3) `database.test.ts`: cambio mínimo (13→14 y `expenses` creada). (4)/(5) R31 dice fecha e importe; no incluir el odómetro descartado es correcto. (6) Importe 0: R30 solo exige `errors` con `field: 'cost'` y no importar; los códigos distintos salen de la semántica previa de Fuelio (0 = sin importe). (7) Caché de Vitest: nota de herramientas, no afecta al código.
- **Zip v1 y huella #44.** `expenses: z.array(...).default([])` con `formatVersion` 1; la huella se calcula con `sha256` sobre los bytes crudos de `data.json` (`data-import/service.ts:70`), así que un documento antiguo conserva su huella. `checkIntegrity` añade `seen.expenses` con unicidad global.
- **Paridad API ↔ local.** CRUD con el mismo orden, validación antes del vehículo (igual que Fastify valida el cuerpo antes del handler), mismas comprobaciones y `detail`. Stats, export (misma query y orden) y CSV (misma transacción, mismo `planCsvImport` con `expenses` existentes). Limitaciones del SQLite nativo: no hay agregados en SQL (stats en JS) y las escrituras con `RETURNING` van por `.returning().get()`, que `native-sqlite.ts` enruta por `query`, como `settings.ts` y `vehicles.ts`.
- **Deduplicación CSV con formatos mixtos.** La clave `expense|…` tiene prefijo propio, así que no colisiona con repostajes ni mantenimientos; el título de reserva de Fuelio (nombre de la categoría) es el que se guarda y se vuelve a calcular igual en la reimportación. La segunda importación del Fuelio mixto da todo duplicado en API y local (`duplicates: 5`, BD sin cambios), que es el test de extremo a extremo que pedía el aviso R7 de `review_csv-import-apply.md` para ficheros que mezclan tipos (las lecturas sueltas siguen sin mezclarse con repostajes en ningún formato).
- **Web mínima.** Solo `wizard.ts` (`totalCreated`), `SUMMARY_KEYS`, i18n y fixtures tipadas, como prevé el design.

## Avisos para el humano (no bloquean)

1. **Etiqueta en plural** (`csvImport.kinds.expense` = «Gastos»/«Expenses») frente al singular del design. Me parece la opción correcta por coherencia con las otras etiquetas; si prefieres el singular, son dos líneas de JSON.
2. **La huella #44 de un zip v1 repetido** no tiene test propio con un documento sin `expenses`. La lógica no cambia (hash de bytes crudos) y el test existente de import repetido sigue en verde.
3. **`rejects invalid, future and unknown expenses without writing` (local)** pone `statements = []` dos veces; el segundo reset (después de crear el otro vehículo) borra las escrituras registradas por las llamadas anteriores. Lo que cubre que no se haya escrito nada es la comprobación final `list(vehicle.id) == [expense]` (y la FK para `'nope'`). Es suficiente para R12, pero conviene endurecerlo en otra ocasión.
4. **Caché de Vitest** (`node_modules/.vitest-cache`): al añadir una migración en local los tests de la web fallan hasta borrarla (impl §7). Si vuelve a pasar con #89, valdría una feature de harness.
5. **Riesgos ya anotados en el design:** la ayuda de la tarjeta de coste total de la web no menciona los gastos hasta #88, y un servidor anterior a #87 importaría un zip nuevo sin los gastos (ya está en el acceptance de `release-v0-4-0` según `current.md`).

## Cambios requeridos

Ninguno.
