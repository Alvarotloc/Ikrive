# Implementación: csv-import-parsers (#84)

Estado: T1–T29 completadas, corregidos los «Cambios requeridos» de las dos revisiones de `progress/review_csv-import-parsers.md` (cuatro en la primera, uno en la segunda) y aplicados los cambios de Gate 2. `pnpm harness --full` en verde. Sin commits. Sin dependencias nuevas (`pnpm-lock.yaml` intacto). Sin UI, así que no hay capturas.

## Cambios por archivo

Todo en `packages/shared`.

| Archivo | Cambio |
|---|---|
| `package.json` | Export `./csv-import`. |
| `src/csv-import/index.ts` | API pública: `parseCsvImport`, `detectCsvFormat`, `csvRowKey`, `CSV_REQUIRED_COLUMNS` y tipos. |
| `src/csv-import/types.ts` | Tipos del resultado y las opciones, más los internos del adaptador (no exportados en `index.ts`). |
| `src/csv-import/tokenizer.ts` | Lector tolerante: BOM, LF/CRLF, delimitador, comillas, límite de 4096, línea física y secciones. |
| `src/csv-import/values.ts` | Fechas, decimales, moneda, booleanos, unidad de cabecera y lectura de celdas con error por fila. |
| `src/csv-import/categories.ts` | Texto libre → `MaintenanceCategory`. |
| `src/csv-import/keys.ts` | `csvRowKey`. |
| `src/csv-import/detect.ts` | Detección de formato. |
| `src/csv-import/{fuelio,drivvo,lubelogger}.ts` | Adaptadores con `collectImportedCells` y `normalize`. |
| `src/csv-import/generic.ts` | Mapeo explícito y `CSV_REQUIRED_COLUMNS`. |
| `src/csv-import/parse.ts` | Orquestación: detección, opciones, unidades, adaptador, validación, `key` y `droppedFuelFields`. |
| `src/csv-import/fixtures/*.csv` | Seis fixtures escritos a mano con datos inventados. |
| `src/csv-import/*.test.ts` | 11 ficheros de test. |

## Cambios de Gate 2

Los tests se escribieron antes del cambio: en T25–T27, los 7 casos del comportamiento nuevo fallaron con el código anterior y los de no regresión ya pasaban; en T28, fallaron sus 6 casos; en T29, fallaron los 3 casos de `rejects a merged fuel with an amount but no volume` y los 3 de no regresión de `keeps ignoring padded empty fuel slots` ya pasaban. El límite de tamaño queda para #85 y #86, y los demás avisos de la review no se han tocado.

| Task | Archivo | Cambio | Test |
|---|---|---|---|
| T25 | `values.ts` | `resolveDecimalSeparator` pide `decimalSeparator` con dos o más grupos, y con un solo grupo si ninguna celda importada tiene una parte final de longitud distinta de 3. El odómetro mantiene su regla estricta. | `parse.test.ts › thousands in amounts and quantities › asks for the separator on a lone grouped amount`, `asks on several thousands groups`, `accepts three decimals when another cell proves the separator`, `asks when no cell proves the three decimals`, `keeps asking for a grouped odometer even with a proven separator`, `keeps the Drivvo fixture parsed without asking` |
| T26 | `categories.ts` | Formas `+s`, `+es` e `y` → `ies` generadas desde la tabla, sin recortar la palabra del fichero. | `categories.test.ts › matches plural category names` |
| T27 | `drivvo.ts` | Un combustible combinado con total vacío o 0 y precio vacío o 0 da `missing_field` en `totalPrice`. | `drivvo.test.ts › rejects a merged fuel without total or price (%s)` (precio vacío, precio 0, y total vacío con precio 0) |
| T28 | `drivvo.ts` | `readFuelAmount` valida cada combustible antes de sumar: un volumen, precio o total negativo da `out_of_range` en ese campo y la fila siguiente se procesa. Las filas de un solo combustible no cambian. | `drivvo.test.ts › rejects a negative value in a merged fuel (%s)` (6 casos: total, precio, precio con total 0, total con precio 0, volumen y total del segundo combustible) |
| T29 | `drivvo.ts` | En una fila combinada, un combustible con volumen 0 y total mayor que 0 da `out_of_range` en `quantity` y la fila siguiente se procesa. No cambian los huecos de relleno, el hueco con precio pero con volumen y total a 0, el total 76 con total 0, R39 ni R40. | `drivvo.test.ts › rejects a merged fuel with an amount but no volume (%s)` (primer combustible, segundo y sin precio); `keeps ignoring padded empty fuel slots (%s)` (hueco central, hueco final y hueco con precio sin volumen ni total) |

## Correcciones de la segunda review

| # | Archivo | Corrección | Test |
|---|---|---|---|
| 1 | `drivvo.ts` | `NAMED_SECTIONS` pasa a `Map`: solo resuelven sus claves propias, y `constructor` y `__proto__` siguen la clasificación por forma. | `drivvo.test.ts › a section named %s › is detected as a refuel section by its shape`, `produces the maintenance row of a 6-column service`, `skips a 7-column expense as not maintenance` (con `constructor` y `__proto__`) |

Los tres tests se escribieron antes del arreglo: sus seis casos fallaron con el objeto y pasan con el `Map`. Los «Avisos para el humano» no se han tocado.

## Correcciones de la primera review

Los seis tests nuevos se escribieron antes del arreglo y fallaron con el código anterior (los dos de la racha de espacios, por superar el timeout de 5 s).

| # | Archivo | Corrección | Test |
|---|---|---|---|
| 1 | `values.ts` | `cleanNumber` recorre la celda desde cada extremo, en coste lineal, en lugar de usar la regex anclada al final. | `values.test.ts › cleans a cell with a long inner run of spaces`; `parse.test.ts › reports a long inner run of spaces as an invalid number` (100.000 espacios; afirman el resultado) |
| 2 | `values.ts` | `DECLARED_DATE_FORMATS` pasa a `Map`: solo resuelven sus claves propias. | `values.test.ts › only accepts the declared date formats of its table`; `parse.test.ts › asks for the date format when the file declares an inherited object key` |
| 3 | `drivvo.ts` | En un repostaje combinado, un total a 0 con precio se calcula con precio y volumen. | `drivvo.test.ts › computes a zero fuel total from its price and volume when merging` (`totalPrice: 76`) |
| 4 | `keys.ts` | Un coste 0 se escribe en la `key` como vacío, igual que un coste ausente. `data` no cambia. | `keys.test.ts › builds the same key for a zero-cost maintenance in every format` (Fuelio, Drivvo y LubeLogger) |

Los «Avisos para el humano» de la review no se han tocado.

## Trazabilidad

Rutas relativas a `packages/shared/src/csv-import/`.

| Req | Test |
|---|---|
| R1 | `detect.test.ts › detects Fuelio marker variants`; `fuelio.test.ts › normalizes the Fuelio fixture` |
| R2 | `detect.test.ts › detects Drivvo with translated sections`; `drivvo.test.ts › normalizes the Drivvo fixture`, `a section named %s › is detected as a refuel section by its shape` |
| R3 | `detect.test.ts › detects each LubeLogger record type`; `lubelogger.test.ts › normalizes the LubeLogger fixtures` |
| R4 | `detect.test.ts › returns unknown for empty or foreign text`; `parse.test.ts › returns unknown without throwing` |
| R5 | `tokenizer.test.ts › reads BOM, CRLF and semicolons alike`; `parse.test.ts › gives the same result with BOM, CRLF and semicolons`; `parse.test.ts › reads every fixture alike with BOM and CRLF` |
| R6 | `tokenizer.test.ts › keeps text after a closing quote in the same field` |
| R7 | `tokenizer.test.ts › reports an unclosed quote and resumes on the next line`; `parse.test.ts › reports a malformed row and keeps the next ones` |
| R8 | `values.test.ts › resolves the date format by priority`, `prefers ISO dates over a different declared format`, `lets options.dateFormat override ISO dates`, `does not ask for a date format when no date is imported`; `values.test.ts › only accepts the declared date formats of its table`; `parse.test.ts › uses ymd for ISO dates despite a different declared format` |
| R9 | `values.test.ts › does not guess an ambiguous date`; `parse.test.ts › asks for the date format when it cannot be resolved`, `asks for the date format when the file declares an inherited object key` |
| R10 | `values.test.ts › uses the only decimal separator seen`; `parse.test.ts › ignores Fuelio columns that are not imported when detecting decimals`, `ignores the Drivvo fuel efficiency when detecting decimals`, `ignores skipped rows when detecting decimals`, `thousands in amounts and quantities › accepts three decimals when another cell proves the separator`, `keeps the Drivvo fixture parsed without asking` |
| R11 | `values.test.ts › asks for the separator when it is ambiguous`; `parse.test.ts › still asks for the separator when imported columns mix them`, `thousands in amounts and quantities › asks for the separator on a lone grouped amount`, `asks on several thousands groups`, `asks when no cell proves the three decimals`, `keeps asking for a grouped odometer even with a proven separator` |
| R12 | `values.test.ts › strips currency symbols`, `cleans a cell with a long inner run of spaces`; `parse.test.ts › reports a long inner run of spaces as an invalid number`; `lubelogger.test.ts › normalizes the LubeLogger fixtures` |
| R13 | `parse.test.ts › returns unit_mismatch without rows` |
| R14 | `parse.test.ts › lets sourceUnits override the detected units` |
| R15 | `fuelio.test.ts › normalizes the Fuelio fixture` |
| R16 | `categories.test.ts › maps category names without case or accents`, `matches plural category names`; `fuelio.test.ts › normalizes the Fuelio fixture` |
| R17 | `drivvo.test.ts › normalizes the Drivvo fixture`, `merges several fuels into one refuel` (cabeceras `C0…C20`) |
| R18 | `drivvo.test.ts › merges several fuels into one refuel`, `computes a zero fuel total from its price and volume when merging`, `rejects a merged fuel without total or price (%s)`, `rejects a negative value in a merged fuel (%s)`, `rejects a merged fuel with an amount but no volume (%s)`, `keeps ignoring padded empty fuel slots (%s)` |
| R19 | `drivvo.test.ts › rejects a row mixing electricity and fuel` |
| R20 | `drivvo.test.ts › normalizes the Drivvo fixture`, `a section named %s › produces the maintenance row of a 6-column service` |
| R21 | `lubelogger.test.ts › normalizes the LubeLogger fixtures` |
| R22 | `lubelogger.test.ts › normalizes the LubeLogger fixtures` |
| R23 | `lubelogger.test.ts › normalizes the LubeLogger fixtures` |
| R24 | `fuelio.test.ts › normalizes the Fuelio fixture`; `drivvo.test.ts › normalizes the Drivvo fixture`, `a section named %s › skips a 7-column expense as not maintenance`; `lubelogger.test.ts › normalizes the LubeLogger fixtures` |
| R25 | `fuelio.test.ts › normalizes the Fuelio fixture` |
| R26 | `parse.test.ts › returns schema-valid data for every kind` |
| R27 | `fuelio.test.ts › normalizes the Fuelio fixture` |
| R28 | `parse.test.ts › rounds a decimal odometer with a warning`; `fuelio.test.ts › normalizes the Fuelio fixture` |
| R29 | `fuelio.test.ts › normalizes the Fuelio fixture`; `generic.test.ts › converts a generic CSV with an explicit mapping` |
| R30 | `keys.test.ts › builds the same key across formats`, `builds the same key for a zero-cost maintenance in every format`, `ignores price per unit and category in the key` |
| R31 | `fuelio.test.ts › normalizes the Fuelio fixture` |
| R32 | `generic.test.ts › converts a generic CSV with an explicit mapping` |
| R33 | `generic.test.ts › reports missing or out-of-range columns` |
| R34 | `parse.test.ts › keeps processing after an invalid row` |
| R35 | `no-node-apis.test.ts › uses no Node APIs` |
| R36 | `fuelio.test.ts › normalizes the Fuelio fixture`; `drivvo.test.ts › normalizes the Drivvo fixture`; `lubelogger.test.ts › normalizes the LubeLogger fixtures` |
| R37 | `parse.test.ts › flags dropped fuel notes and station per format`, `ignores blank values and StationID 0`, `ignores notes on maintenance and on rejected fuel rows`, `reports no dropped fields for a generic mapping` |
| R38 | `categories.test.ts › matches plural category names` |
| R39 | `drivvo.test.ts › rejects a merged fuel without total or price (%s)` |
| R40 | `drivvo.test.ts › rejects a negative value in a merged fuel (%s)` |
| R41 | `drivvo.test.ts › rejects a merged fuel with an amount but no volume (%s)`, `keeps ignoring padded empty fuel slots (%s)` |

## Verificación

`pnpm harness --full`, salida 0:

```
[OK]    93 features: 83 done, 9 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #84 csv-import-parsers (in_progress)
[OK]    Rama actual: feat/csv-import-parsers
[OK]    pnpm lint
[OK]    pnpm typecheck
e2e test:       Tests  6 passed (6)
packages/shared test:       Tests  274 passed (274)
packages/db test:       Tests  3 passed (3)
apps/api test:       Tests  373 passed (373)
apps/web test:       Tests  715 passed (715)
[OK]    pnpm test
[OK]    Arnés en verde.
```

**Test intermitente, ajeno a esta feature.** En la vuelta de T25–T27, de tres ejecuciones de `pnpm harness --full`, la segunda falló (salida 1) en `apps/web/src/features/mobile/camera-restore-handler.test.tsx › restores a vehicle photo on the edit page after the app was killed`: no encontró el texto «Foto actualizada». La tercera terminó con salida 0, y la suite web pasó además 3 de 3 veces por separado (715 tests). En las vueltas de T28 y T29 hubo una sola ejecución en cada una, ambas con salida 0; la de arriba es la de T29. `apps/` no importa `csv-import` y esta feature no modifica nada en `apps/`. No he investigado la causa ni he tocado el test.

**No verificado:** ningún export real de Fuelio, Drivvo o LubeLogger. Los fixtures reproducen los formatos descritos en `progress/explore_csv-import-parsers_formatos.md`, así que los tests prueban el parser contra esa descripción. Sigue pendiente la nota del humano de probar un export real antes de v0.4.0.

## Desviaciones del spec

Ninguna en contratos, firmas ni alcance. Tests añadidos a los que pide `tasks.md`: `numbers records by the physical line where they start`, `reads the translated booleans`, `composes day, month and year as an ISO date`, `rejects a refuel row with more than 21 fields`, `gives the same result with BOM, CRLF and semicolons`, `reads every fixture alike with BOM and CRLF`, `returns unknown without throwing`, `asks for the date format when it cannot be resolved` y `reports a malformed row and keeps the next ones`.

Las tasks se marcaron y anotaron en la bitácora en bloque al final, no una a una.

## A tener en cuenta en Gate 2

Consecuencias de aplicar R11 y R38 tal como están escritos. No se han cambiado:

- **Un fichero cuyos decimales tengan todos tres cifras pide `decimalSeparator`.** Por ejemplo, un Drivvo con solo `6.199`, `61.833` y `10.881`, sin ningún `58.89`. También `0.899`, aunque un 0 inicial no pueda ser de miles, porque tiene la forma de R11.
- **`+es` se aplica a todas las palabras de la tabla,** como pide R38. Genera formas sin sentido e inocuas (`oiles`) y una palabra real: `motes` (de `mot`) se categoriza como `inspection`.

## Interpretaciones donde el spec no concreta

- **Tipo de registro de LubeLogger (R3):** la firma de `detectCsvFormat` no lo incluye, así que se obtiene con `lubeLoggerRecordType` (interno, no exportado en `index.ts`).
- **Orden de comprobación:** primero `needs_options` y después `unit_mismatch`, el orden que indican `design.md` y T11.
- **Varios fallos en una fila:** se informa solo del primero.
- **`malformed_row`:** se informa aunque la línea esté en una sección que no se importa.
- **Huecos de combustible en Drivvo:** un hueco cuenta si su precio, total o volumen tiene un valor distinto de 0; un nombre sin importes se ignora.
- **`CostTitle` vacío en Fuelio:** error `missing_field` en `title`, sin usar la categoría como título.
- **Categoría en el genérico:** acepta además el valor exacto del enum (`tires`, `brakes`), que la tabla por palabras no reconocería.
- **Coste 0 en la `key` (R30):** `design.md` dice «coste .2f o vacío» sin concretar el 0. Se escribe vacío porque en Fuelio 0 significa ausente. Así, un mantenimiento con coste 0 y otro sin coste de la misma fecha, odómetro y título comparten `key`.
- **Prueba del separador (R11):** cuenta cualquier celda importada con forma de decimal válida, incluido el odómetro (`10650.6`). Una celda inválida como `1.2.3` no prueba nada.
- **Odómetro de mantenimiento que redondea a 0** (por ejemplo `0.4`): se normaliza a `null`, como un 0.
