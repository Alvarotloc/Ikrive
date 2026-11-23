# Design — csv-import-parsers

## Archivos

Todo en `packages/shared`. Sin cambios en BD, HTTP, UI, i18n ni dependencias.

| Archivo | Cambio |
|---|---|
| `package.json` | Export `"./csv-import": "./src/csv-import/index.ts"`. |
| `src/csv-import/index.ts` | API pública: `parseCsvImport`, `detectCsvFormat`, `csvRowKey`, `CSV_REQUIRED_COLUMNS` y tipos. |
| `src/csv-import/types.ts` | Tipos del resultado y de las opciones. |
| `src/csv-import/tokenizer.ts` | Lector CSV tolerante y división en secciones. |
| `src/csv-import/values.ts` | Fechas, números, booleanos y unidades de cabecera. |
| `src/csv-import/categories.ts` | Texto libre → `MaintenanceCategory`. |
| `src/csv-import/keys.ts` | `csvRowKey`. |
| `src/csv-import/detect.ts` | Detección de formato. |
| `src/csv-import/{fuelio,drivvo,lubelogger,generic}.ts` | Un adaptador por formato. |
| `src/csv-import/parse.ts` | Orquesta detección, opciones, unidades, adaptador y validación. |
| `src/csv-import/fixtures/*.csv` | Escritos a mano con datos inventados; solo los leen los tests. |

Subpath y no barrel raíz, como `data-export-zip`: la web lo cargará con `import()` en #86 y no entra en el chunk principal. Reutiliza `createOdometerReadingSchema`, `createFuelLogSchema` (que ya completa el precio con `resolveFuelPrices`), `createMaintenanceRecordSchema`, `resolveFuelPrices` y los enums.

**Dependencia CSV:** no hay ninguna en los `package.json` ni en `pnpm-lock.yaml`, y no se añade (decisión 1).

## Tipos y firmas

```ts
export type CsvFormat = 'fuelio' | 'drivvo' | 'lubelogger' | 'generic';
export type CsvDateFormat = 'ymd' | 'dmy' | 'mdy';
export type CsvDecimalSeparator = '.' | ',';
export type CsvRowKind = 'odometer' | 'fuel' | 'maintenance';
export type CsvColumn =
  | 'date' | 'value' | 'odometer' | 'quantity' | 'totalPrice' | 'pricePerUnit' | 'fullTank'
  | 'missedPrevious' | 'title' | 'category' | 'description' | 'workshop' | 'cost';

export interface CsvImportOptions {
  /** Units of the vehicle: `quantity` comes from `fuelQuantityUnit(fuelType, volumeUnit)`. */
  target: { distance: DistanceUnit; quantity: FuelQuantityUnit };
  dateFormat?: CsvDateFormat;
  decimalSeparator?: CsvDecimalSeparator;
  /** Overrides the units detected in the file. */
  sourceUnits?: Partial<CsvSourceUnits>;
  /** When present, the file is read as generic and detection is skipped. */
  mapping?: CsvGenericMapping;
}

export interface CsvSourceUnits { distance: DistanceUnit | null; quantity: FuelQuantityUnit | null }

export type CsvGenericMapping = {
  kind: CsvRowKind;
  /** 0-based indexes: headers may be repeated or empty. */
  columns: Partial<Record<CsvColumn, number>>;
  dateFormat: CsvDateFormat;
  decimalSeparator: CsvDecimalSeparator;
};

interface CsvRowBase {
  sourceRow: number;
  /** The source app's own id, when it has one. */
  sourceId: string | null;
  key: string;
  warnings: ('odometer_rounded' | 'merged_fuels')[];
}
export type CsvRow =
  | (CsvRowBase & { kind: 'odometer'; data: CreateOdometerReading })
  | (CsvRowBase & { kind: 'fuel'; data: CreateFuelLog })
  | (CsvRowBase & { kind: 'maintenance'; data: CreateMaintenanceRecord });

export interface CsvRowError {
  row: number;
  code: 'malformed_row' | 'missing_field' | 'invalid_date' | 'invalid_number' | 'invalid_boolean'
      | 'out_of_range' | 'mixed_fuel_units';
  field: string | null;
}
export interface CsvSkippedRow { row: number; reason: 'not_maintenance' | 'template' | 'income'; label: string | null }

export type CsvImportResult =
  | { status: 'unknown'; headers: string[] }
  | { status: 'needs_options'; format: CsvFormat; headers: string[];
      missing: ('dateFormat' | 'decimalSeparator' | `columns.${CsvColumn}`)[] }
  | { status: 'unit_mismatch'; format: CsvFormat; source: CsvSourceUnits; target: CsvImportOptions['target'] }
  | { status: 'parsed'; format: CsvFormat; dateFormat: CsvDateFormat; decimalSeparator: CsvDecimalSeparator;
      sourceUnits: CsvSourceUnits; rows: CsvRow[]; errors: CsvRowError[]; skipped: CsvSkippedRow[];
      /** The source had these fuel fields, which Ikrive cannot store (#86 warns about it). */
      droppedFuelFields: { notes: boolean; station: boolean } };

export function parseCsvImport(text: string, options: CsvImportOptions): CsvImportResult;
export function detectCsvFormat(text: string): { format: Exclude<CsvFormat, 'generic'> | 'unknown'; headers: string[] };
export function csvRowKey(row: Pick<CsvRow, 'kind' | 'data'>): string;
```

Entrada: `string` ya decodificado (BOM incluido o no). Decodificar los bytes corresponde a #85/#86. El resultado es JSON puro, para que #86 lo muestre y #85 lo reciba o lo recalcule.

## Decisiones de las «Implicaciones para el spec»

### 1. Parser CSV propio y tolerante

Tokenizador de estados, sin dependencias:

- Quita el BOM; admite LF y CRLF; el delimitador es el que más aparece fuera de comillas en las 10 primeras líneas no vacías (`,` si empatan).
- Una comilla solo abre al inicio del campo; `""` es una comilla literal; el texto tras la comilla de cierre se añade al campo (`"Filled tank completely" 2` → `Filled tank completely 2`).
- Una comilla sin cerrar en 4096 caracteres genera `malformed_row` y la lectura sigue en la línea siguiente. El límite evita que una comilla suelta se trague el resto del fichero y acota el coste.

**Descartado: `papaparse` o `csv-parse`.** Añaden una dependencia al bundle web y móvil para una parte pequeña del problema: los ficheros de Fuelio y Drivvo no son rectangulares, hay que partirlos antes en secciones, y la recuperación exacta de la cabecera malformada de Drivvo tendría que comprobarse y fijarse igualmente con tests.

### 2. Fechas y decimales: sin adivinar

- **Fecha:** `options.dateFormat` → `ymd` si todas las fechas importadas son ISO (`^\d{4}-\d{2}-\d{2}(?!\d)`) → `ImportCSVDateFormat` reconocido (`yyyy-MM-dd`, `dd.MM.yyyy`, `dd/MM/yyyy`, `MM/dd/yyyy`, sin distinguir mayúsculas) → `needs_options`. Una fecha ISO no es ambigua, así que gana a lo declarado; `options.dateFormat` gana a todo, y si no encaja con las fechas cada fila da `invalid_date`. Las celdas vacías no cuentan; una sola fecha no ISO hace pasar al formato declarado. `day`+`month`+`year` de LubeLogger se compone como ISO. Admite `/`, `-` o `.` y día o mes de un dígito. La hora se descarta sin convertir zona. Año de dos dígitos o fecha imposible → `invalid_date`.
- **Decimal:** `options.decimalSeparator` → separador único observado en las celdas importadas → `.` si no hay ninguno → `needs_options` si se mezclan o si un odómetro importado parece agrupado en miles (`12.345`). Con separador explícito, el otro solo vale como separador de miles en grupos de 3. Los números se validan con regex: nada de `Number()` directo, que aceptaría `1e5` o `0x10`.
- **Muestra:** cada adaptador expone `collectImportedCells(sections): { dates: string[]; numbers: { column: 'odometer' | 'quantity' | 'totalPrice' | 'pricePerUnit' | 'cost'; raw: string }[] }`, con la misma clasificación de filas que usa al normalizar. `parse.ts` resuelve fecha y decimal solo con esa muestra. Las filas que van a `skipped` no aportan celdas.

| Origen | Columnas que entran en la muestra | Ejemplos que no entran |
|---|---|---|
| Fuelio `## Log` | `Data`, `Odo`, `Fuel`, `Price`, `VolumePrice` | `l/100km`, `latitude`, `longitude`, `TankNumber`, `StationID` |
| Fuelio `## Costs` (mantenimiento) | `Date`, `Odo`, `Cost` | `RemindOdo`, `RepeatOdo` |
| Drivvo repostaje | 0 odómetro, 1 fecha, 3-5, 8-10 y 13-15 (precio, total, volumen) | 17 `Fuel efficiency` (`25.158 km/L`) |
| Drivvo `##Service` | 0 odómetro, 1 fecha, 2 total | — |
| LubeLogger | Alias de fecha, odómetro, volumen y coste según el tipo de registro | `initialodometer` |
| Genérico | No aplica: el mapeo trae fecha y separador | — |

**Descartado: inferir día/mes por valores mayores que 12.** Un fichero parcial con solo días ≤ 12 se interpretaría al revés que el completo, y las fechas cambiadas romperían además la deduplicación de #85.

**Descartado: analizar todas las columnas numéricas.** Las coordenadas o `25.158 km/L` no se importan, pero provocarían un `needs_options` falso en ficheros con coma decimal.

### 3. Unidades: no se convierte

Se comparan las unidades conocidas del fichero con `target`. Si difieren → `unit_mismatch`, sin filas. La persona puede cambiar sus ajustes o confirmar las unidades reales con `sourceUnits`.

| Formato | Distancia | Cantidad |
|---|---|---|
| Fuelio | `(km)`/`(mi)` en la cabecera de `Odo` | `null` |
| Drivvo | `(km)`/`(mi)` en la cabecera del odómetro | `null` |
| LubeLogger | `null` | `liters`/`litres` → `l`, `gallons` → `gal`; otro alias → `null` |
| Genérico | `null` | `null` |

Una unidad `null` no se compara. Los códigos `DistUnit`/`FuelUnit` de Fuelio no se interpretan: su significado no está documentado. Tampoco la cabecera `Fuel (litres)`, que podría ser fija.

**Descartado: convertir.** Redondear km convertidos a enteros altera los valores y la `key`, el galón puede ser US o imperial, y Ikrive guarda los valores en la unidad del usuario sin convertir.

### 4. Gastos que no son mantenimiento: se omiten y se informan

Van a `skipped` con fila, motivo y etiqueta. Una fila de Fuelio se trata como mantenimiento solo si el nombre de su categoría coincide con la tabla; si no, se omite. En `##Service` de Drivvo y en servicio de LubeLogger la fila ya es mantenimiento: sin coincidencia, la categoría es `other`.

Tabla (sin mayúsculas ni acentos, por palabra, gana la primera):

| Categoría | Palabras |
|---|---|
| `oil_change` | oil, aceite |
| `tires` | tire, tyre, neumatico, rueda |
| `brakes` | brake, freno, pastilla |
| `inspection` | inspection, itv, mot |
| `filters` | filter, filtro |
| `battery` | battery, bateria |
| `repair` | repair, reparacion, averia |
| `other` | service, maintenance, mantenimiento, revision, taller |

**Descartado: guardarlos ya como `kind: 'expense'`.** Crearía un contrato sin consumidor ni tabla hasta #87. **Descartado también: conservar en `skipped` las celdas en bruto.** #87 tendría que reinterpretarlas fuera del adaptador, y el parser es puro: puede volver a leer el mismo texto. **Descartado también: importarlos como mantenimiento `other`:** un seguro o una multa inflarían el historial y entrarían en el informe de venta.

### 5. Varios combustibles en Drivvo: un solo repostaje

Se suman cantidades y totales; `pricePerUnit` sale de `resolveFuelPrices({ quantity, totalPrice })`, es decir, la media ponderada. `fullTank` es verdadero si alguno lo es. El total de cada combustible, si falta, se calcula con su precio y su volumen. La fila lleva `merged_fuels`. Si un nombre contiene `electr`, `eletr` o `kwh` y otro no → `mixed_fuel_units`, porque sumar kWh y litros no tiene sentido.

**Descartado: una fila por combustible.** Crearía varios repostajes con la misma fecha y km, con distancia 0 entre ellos, y falsearía el consumo.

## Adaptadores

- **Fuelio:** columnas por nombre normalizado (sin espacios ni `(optional)`), para admitir las versiones de 14 y 18 columnas. Importe vacío o 0 = ausente.
- **Drivvo:** secciones por nombre conocido (`refuelling`, `reabastecimiento`, `expense`, `service`, `servicio`) y, si está traducido a otro idioma, por forma: 21, 7 o 6 columnas y fecha ISO en la segunda columna de la primera fila de datos. Filas de repostaje: entre 7 y 21 campos; más → `malformed_row`. Booleanos: `yes/si/sí/tak/ja`, `no/nie/nein`, `1/0`, `true/false`.
- **LubeLogger**, por columnas, sin distinguir mayúsculas:
  - Fecha: `date`, `fuelup_date` o `day`+`month`+`year`. Odómetro: `odometer`, `odo`. `initialodometer` se ignora.
  - Volumen: `fuelconsumed`, `gallons`, `liters`, `litres`, `consumption`, `quantity`, `qty`.
  - Coste: `cost`, `total cost`, `totalcost`, `total price`, `price` (siempre total).
  - Lleno: `isfilltofull`, `filled up`. Parcial: `partial_fuelup`, `partial tank`, `partial_fill`. Omitido: `missed_fuelup`, `missedfuelup`, `missed fill up`, `missed_fill`.
  - Tipo: con volumen → combustible; con odómetro, descripción y coste → servicio; fecha y odómetro sin coste → odómetro; fecha, descripción y coste sin odómetro → impuesto (`not_maintenance`).
- **Genérico:** la primera fila no vacía es la cabecera. `CSV_REQUIRED_COLUMNS`: `odometer` → `date`, `value`; `fuel` → `date`, `odometer`, `quantity` y `totalPrice` o `pricePerUnit`; `maintenance` → `date`, `title`. #86 lo usa para desactivar el botón.

## Contrato para #85

- `rows[].data` ya es la entrada de los servicios de creación: #85 no vuelve a mapear.
- **Lecturas:** los repostajes y mantenimientos no generan fila `odometer`; #85 crea su lectura vinculada como siempre (`source: 'fuel' | 'maintenance'`).
- **Fuera del parser:** fecha futura y conflicto de odómetro (`validateOdometerWrite`), porque dependen de hoy y de las lecturas del vehículo.
- **`key`:**
  - `odometer|<date>|<value>`
  - `fuel|<date>|<odometer>|<quantity .3f>|<total .2f>`
  - `maintenance|<date>|<odometer o vacío>|<título trim+minúsculas>|<coste .2f o vacío>`
- `csvRowKey` también acepta los campos de un registro ya guardado: #85 puede deduplicar contra la BD **sin columna nueva**, incluidos los datos introducidos a mano.
- El precio por unidad y la categoría quedan fuera de la `key`: uno se redondea según el origen y la otra se puede recategorizar.

## Contrato para #86 y #87

- **#87 amplía el contrato con `kind: 'expense'`.** `skipped` no guarda importe, fecha ni odómetro: es solo un informe. #87 añade el `kind`, su `data` y su `key`, y mueve a `rows` las filas `not_maintenance` (`## Costs` de Fuelio, `##Expense` de Drivvo e impuestos de LubeLogger). `template` e `income` siguen en `skipped`.
- **Efecto en la muestra:** al importarse, las fechas y los costes de esos gastos entrarán en `collectImportedCells`. Un fichero que hoy se resuelve solo podría pedir entonces `dateFormat` o `decimalSeparator`, y es correcto porque esos valores pasarán a guardarse.
- **#86 avisa con `droppedFuelFields`.** `fuel_logs` y `createFuelLogSchema` no tienen notas ni gasolinera, así que `data` no permite saber si existían. Solo cuentan las filas que acaban como `fuel` en `rows`, con el valor no vacío tras `trim`:

| Formato | `notes` | `station` |
|---|---|---|
| Fuelio | `Notes` | `City`, o `StationID` distinto de vacío y `0` |
| Drivvo | Posición 20 | Posición 18 |
| LubeLogger | `notes`, `note` | Siempre `false`: no tiene esa columna |
| Genérico | Siempre `false`: el mapeo no tiene esa columna | Siempre `false` |

## Decisiones a validar (Gate 1)

1. Un fichero con unidades distintas se **bloquea entero** (`unit_mismatch`) en lugar de importar con aviso.
2. Las categorías de Fuelio sin correspondencia se **omiten**: mejor un gasto sin importar y visible que un seguro contado como mantenimiento.
3. LubeLogger sin columna de odómetro se trata como **impuesto**; servicio, reparación y mejora no se distinguen por columnas y se categorizan por palabras.
4. Las notas y la gasolinera de los repostajes **no se importan**: `fuel_logs` no tiene esos campos y añadirlos queda fuera de esta feature. El parser lo indica en `droppedFuelFields` y #86 avisa.
5. Los mantenimientos importados usan `includeInReport: true`, el valor por defecto del esquema, así que entran en el informe de venta.
6. Dos filas idénticas del mismo fichero comparten `key`. El parser conserva ambas; #85 decide, y lo previsible es contar la segunda como duplicada.
7. Un fichero **sin ninguna fecha importada** (por ejemplo, solo filas en `skipped`) resuelve `ymd` en lugar de pedir `needs_options`: no hay fecha que interpretar y así se puede mostrar lo omitido.
8. `City` de Fuelio cuenta como **gasolinera** para el aviso: es el único texto de ubicación del repostaje y `StationID` es solo un id. Como mucho, provoca un aviso de más.

## Riesgos

- **Formatos no verificados con un export reciente.** Proceden de código y ejemplos públicos (`progress/explore_csv-import-parsers_formatos.md`), no de una especificación. Una versión nueva puede cambiar columnas o marcadores. Mitigación: un cambio de columnas suele acabar en `unknown` o en errores por fila, y queda el genérico como salida. Conviene probar un export real de cada app antes de la release v0.4.0.
- **Lectura por posición en Drivvo.** Si añade columnas, la sección deja de tener 21 y el fichero no se reconoce. Si las **reordena** manteniendo 21, los valores se leerían mal y solo los detectaría la validación de tipos: es el caso que más justifica probar un export real.
- **Idiomas.** Solo se admiten los marcadores y booleanos observados. Otro idioma puede acabar en `unknown` o `invalid_boolean`, de forma visible.
- **Comilla suelta.** Dos comillas sueltas a menos de 4096 caracteres pueden unir varias líneas en un campo. Lo normal es que la fila resultante falle por columnas o por valor y se informe, pero las líneas absorbidas no se recuperan.
- **Clave por contenido.** Si se edita un registro tras importarlo, reimportar el original lo crea de nuevo.

## Fuera de alcance

Persistencia, deduplicación efectiva, reglas de odómetro contra la BD, endpoints, UI, i18n de los códigos de error, decodificación de bytes, conversión de unidades y gastos (#85, #86, #87).
