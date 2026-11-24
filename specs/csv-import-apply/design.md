# Design — csv-import-apply

## Idea

Una sola función pura decide qué se guarda (`planCsvImport` en `@ikrive/shared/csv-import`). La API y el modo local solo leen lo que ya existe, la llaman y escriben `accepted` en una transacción. Así «las mismas reglas» no dependen de duplicar lógica, igual que `validateOdometerWrite` hoy.

```
bytes ─▶ límite (413) ─▶ decodeCsv ─▶ parseCsvImport(text, {target, ...options})
      ─▶ planCsvImport(rows, existing, today) ─▶ [dryRun ? nada : transacción] ─▶ csvImportSummary
```

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `src/schemas/csv-import.ts` (+ export en `src/index.ts`) | `CSV_IMPORT_MAX_BYTES`, arrays `as const` de los enums del parser, `csvImportRequestSchema`, `csvImportSummarySchema` y tipos. |
| shared | `src/csv-import/apply.ts` (+ export en `src/csv-import/index.ts`) | `decodeCsv`, `planCsvImport`, `csvImportSummary`, `csvImportProblemErrors`. |
| api | `src/modules/csv-import/{routes,service,repository}.ts` | Endpoint, orquestación y transacción. |
| api | `src/app.ts` | Composición y registro bajo `/api`. |
| web | `src/lib/data-source/types.ts` | Grupo `csvImport`. |
| web | `src/lib/data-source/http.ts` | `csvImport.import` con multipart `options` + `file`. |
| web | `src/lib/data-source/local/csv-import.ts`, `local/index.ts` | `localCsvImport(db)`, envuelto en `serialized`. |
| web | `src/lib/data-source/data-source.test.tsx` | `fakeDataSource` añade el grupo (solo tipos). |

Sin cambios de BD ni migración: la deduplicación usa `csvRowKey` sobre los registros guardados (contrato de #84). Sin i18n ni UI (#86).

## Tipos y firmas

```ts
// packages/shared/src/schemas/csv-import.ts
export const CSV_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const CSV_FORMATS = ['fuelio', 'drivvo', 'lubelogger', 'generic'] as const;      // = CsvFormat
export const CSV_ROW_KINDS = ['odometer', 'fuel', 'maintenance'] as const;               // = CsvRowKind
// también CSV_DATE_FORMATS, CSV_DECIMAL_SEPARATORS, CSV_COLUMNS, CSV_ROW_ERROR_CODES, CSV_SKIP_REASONS

export const csvImportRequestSchema = z.strictObject({
  dryRun: z.boolean().default(false),
  dateFormat: z.enum(CSV_DATE_FORMATS).optional(),
  decimalSeparator: z.enum(CSV_DECIMAL_SEPARATORS).optional(),
  sourceUnits: z.object({ distance: z.enum(DISTANCE_UNITS).nullable(),
                          quantity: z.enum(FUEL_QUANTITY_UNITS).nullable() }).partial().optional(),
  mapping: z.object({ kind: z.enum(CSV_ROW_KINDS),
                      columns: z.partialRecord(z.enum(CSV_COLUMNS), z.number().int().min(0)),
                      dateFormat: z.enum(CSV_DATE_FORMATS),
                      decimalSeparator: z.enum(CSV_DECIMAL_SEPARATORS) }).optional(),
});
export type CsvImportRequest = z.infer<typeof csvImportRequestSchema>;       // ≈ Omit<CsvImportOptions,'target'> & {dryRun}
export type CsvImportRequestInput = z.input<typeof csvImportRequestSchema>;

export const csvImportSummarySchema = z.object({
  dryRun: z.boolean(),
  format: z.enum(CSV_FORMATS),
  /** In a dry run, what would be created. */
  created: z.object({ odometer: count, fuel: count, maintenance: count }),
  duplicates: count,
  rejected: z.array(z.object({
    row: z.number().int().positive(),
    kind: z.enum(CSV_ROW_KINDS),
    reason: z.enum(['odometer_conflict', 'future_date']),
    conflict: z.object({ date: isoDateSchema, value: z.number().int() }).nullable(),
  })),
  errors: z.array(/* CsvRowError */),
  skipped: z.array(/* CsvSkippedRow */),
  droppedFuelFields: z.object({ notes: z.boolean(), station: z.boolean() }),
  /** True when decoding replaced invalid UTF-8 bytes with U+FFFD (the file may not be UTF-8). */
  encodingReplaced: z.boolean(),
});
export type CsvImportSummary = z.infer<typeof csvImportSummarySchema>;
```

Los arrays viven en `schemas/` (barrel raíz, sin arrastrar el parser) y un test de tipos (`expectTypeOf`) comprueba que coinciden con las uniones de `csv-import/types.ts`.

```ts
// packages/shared/src/csv-import/apply.ts
/** Strips the BOM; invalid bytes become U+FFFD and set `replaced`. */
export function decodeCsv(bytes: Uint8Array): { text: string; replaced: boolean };

export interface CsvImportExisting {
  readings: readonly (OdometerPoint & { id: string })[];
  fuelLogs: readonly Pick<CreateFuelLog, 'date' | 'odometer' | 'quantity' | 'totalPrice'>[];
  maintenance: readonly Pick<CreateMaintenanceRecord, 'date' | 'odometer' | 'title' | 'cost'>[];
}
export interface CsvImportPlan { accepted: CsvRow[]; duplicates: number; rejected: CsvImportSummary['rejected'] }
export function planCsvImport(rows: readonly CsvRow[], existing: CsvImportExisting, today: string): CsvImportPlan;
export function csvImportSummary(parsed: Extract<CsvImportResult, { status: 'parsed' }>, plan: CsvImportPlan, flags: { dryRun: boolean; encodingReplaced: boolean }): CsvImportSummary;
/** `errors` of the 400 for a result that is not `parsed`. */
export function csvImportProblemErrors(result: Exclude<CsvImportResult, { status: 'parsed' }>): { path: string; message: string }[];
```

`decodeCsv` intenta primero `new TextDecoder('utf-8', { fatal: true })`; si lanza, decodifica con el decodificador no estricto y devuelve `replaced: true` (R28). Así un `U+FFFD` que ya venía escrito en un fichero UTF-8 válido no da un falso positivo. El servicio y el modo local pasan `replaced` a `csvImportSummary` como `encodingReplaced`, también en `dryRun`.

### `planCsvImport`

1. Orden de proceso: filas `fuel` y `maintenance` por `sourceRow`, luego `odometer` por `sourceRow` (R8). Así una lectura suelta que repite la de un repostaje del mismo fichero es duplicada (R7) sea cual sea su posición.
2. Claves vistas: `csvRowKey` de los repostajes, mantenimientos y lecturas (`odometer|date|value`, cualquier `source`) guardados.
3. Por fila, en este orden: clave vista → `duplicates` (R5, R6); si no, `validateOdometerWrite({ readings: existentes + aceptadas, date, odometer, today })` → `rejected` (R9, R10); si no, `accepted`. Toda fila evaluada añade su clave a las vistas; una aceptada con odómetro añade su lectura (id sintético `csv:<row>`) y su clave `odometer|…` (R7).

`csvImportProblemErrors`:

| Resultado | `errors` |
|---|---|
| `unknown` | `[{ path: 'file', message: 'Unrecognized CSV format' }]` |
| `needs_options` | Un elemento por `missing`: `dateFormat`, `decimalSeparator` o `mapping.columns.<campo>`, `message: 'Required'` |
| `unit_mismatch` | `[{ path: 'sourceUnits', message: 'The file units (<origen>) differ from the vehicle units (<destino>)' }]` |

## Contrato HTTP

`POST /api/vehicles/:id/csv-import` (sesión), `multipart/form-data`:

- `options` (opcional, texto JSON, **antes** de `file`): `csvImportRequestSchema`. Ausente = `{}`.
- `file`: el CSV.

| Respuesta | Cuándo |
|---|---|
| 201 `CsvImportSummary` | Importación aplicada (también con 0 creados). |
| 200 `CsvImportSummary` | `dryRun: true`. |
| 400 | No multipart o sin `file` (R15); `options` no es JSON (`detail`) o no cumple el esquema (`Validation failed`, `errors[].path` relativo a las opciones) (R16); resultado no `parsed` (`detail: 'The CSV cannot be imported'` + `csvImportProblemErrors`) (R17). |
| 404 | Vehículo ajeno o inexistente (R13). |
| 413 | Fichero > `CSV_IMPORT_MAX_BYTES` (R14). |
| 500 | Fallo al escribir: transacción deshecha (R2). |

### Capas

- **routes.ts**: `isMultipart()` → `request.file({ limits: { fileSize: CSV_IMPORT_MAX_BYTES, files: 1 } })` → `fieldname === 'file'` (si no, `resume()` y 400) → `options` desde `file.fields.options` → `receiveToBuffer` (el exceso lanza el 413 `request file too large` de `@fastify/multipart`, que `plugins/errors.ts` ya serializa) → `service.import(userId, vehicleId, bytes, options)`. Mismo patrón que `attachments/routes.ts` y `data-import/routes.ts`.
- **service.ts**: `findOwned` (404) → `settings.get(userId)` → `const { text, replaced } = decodeCsv(bytes)` → `parseCsvImport(text, { ...options, target: { distance, quantity: fuelQuantityUnit(vehicle.fuelType, volumeUnit) } })` → si no es `parsed`, `BadRequestError` → `existing` (`vehicles.listReadings`, `fuelLogs.listByVehicle`, `maintenance.listByVehicle`) → `planCsvImport(…, todayIn(timezone))` → si no es dry run, `repo.apply(vehicleId, plan.accepted)` → `csvImportSummary(parsed, plan, { dryRun, encodingReplaced: replaced })`. Todo síncrono tras leer el buffer: con better-sqlite3 no hay otra petición entre leer `existing` y escribir.
- **repository.ts**: `apply(vehicleId, rows)` en un `db.transaction`: por fila, la lectura (`.returning({ id }).get()`) y su registro con `odometerReadingId`, como `fuel-logs/repository.ts`. Los mantenimientos sin odómetro no crean lectura; `scheduleId` queda `null` y `includeInReport` es el valor por defecto del esquema.

## Modo local

`DataSource.csvImport = { import(vehicleId: string, file: File, options?: CsvImportRequestInput): Promise<CsvImportSummary> }`.

- **http.ts**: `FormData` con `options` (`JSON.stringify`) y después `file`; `api.post('/vehicles/:id/csv-import', body)`.
- **local/csv-import.ts**, en este orden: `file.size > CSV_IMPORT_MAX_BYTES` → `problem(413, 'request file too large')` sin leer el fichero → `parseInput(csvImportRequestSchema, options)` → `requireVehicle` → ajustes y `localToday` → `decodeCsv(bytes)` → `parseCsvImport(text)` → `badRequest('The CSV cannot be imported', csvImportProblemErrors(...))` → `listReadings`, `listFuelLogs` y mantenimientos → `planCsvImport` → `db.transaction(async (tx) => …)` con los mismos inserts → `csvImportSummary` con `encodingReplaced` (R28). Métodos internos, nunca otros métodos serializados (deadlock de `SerialQueue`).
- `local/` ya se carga con `import()` (`features/mobile/local-mode.ts`), así que el parser no entra en el chunk web principal.

## Contrato para #86 y #87

- **#86** ejecuta `parseCsvImport` en el navegador para la detección y el mapeo, llama con `dryRun: true` para la vista previa (válidas = suma de `created`; duplicadas = `duplicates`; con error = `errors.length + rejected.length`) y sin él para importar; el resumen final es la misma forma. Si `encodingReplaced` es `true` (vista previa o importación), avisa de que el fichero puede no estar en UTF-8. Comprueba `CSV_IMPORT_MAX_BYTES` antes de leer el fichero. Los `errors[].path` de R16/R17 indican qué paso del asistente repetir.
- **#87** añade `'expense'` a `CSV_ROW_KINDS` y a la unión `CsvRow`, una clave `expense` en `created`, `expenses` en `CsvImportExisting` y su insert en las dos transacciones. Un gasto no tiene odómetro que validar, así que `planCsvImport` solo lo deduplica. Ninguna forma existente cambia de significado.

## Alternativas descartadas

- **Que el cliente envíe las filas ya parseadas como JSON.** El servidor tendría que fiarse de unas filas que no puede volver a comprobar contra el fichero, y el 413 «antes del parser» del criterio no tendría sentido. Volver a parsear en el servidor es barato y el resultado es el mismo en los dos modos.
- **Una columna `import_key` o tabla de filas importadas.** Duplicaría `csvRowKey`, exigiría una migración y no detectaría los datos introducidos a mano. #84 ya diseñó la clave para comparar con lo guardado.
- **Aplicar las filas con los servicios existentes (`fuelLogs.create`…) una a una.** Cada llamada abre su propia transacción y lanza 409 en el primer conflicto: no cumple ni la atomicidad ni el informe por fila.
- **Un endpoint `…/csv-import/preview` aparte.** Duplicaría ruta, validación y tests para la misma lógica; `dryRun` comparte todo el camino salvo la transacción.

## Decisiones a validar (Gate 1)

1. **Vista previa con `dryRun`** en el mismo endpoint (200, sin escribir). Sale de PLAN.md («Vista previa antes de guardar») y de #86, que necesita contar duplicados y conflictos contra la BD.
2. **Límite fijo de 5 MiB** (`CSV_IMPORT_MAX_BYTES`, compartido por API, modo local y #86), independiente de `MAX_UPLOAD_MB` y sin variable de entorno. Un export de años de Fuelio ocupa unos cientos de KB.
3. **Las lecturas sueltas importadas son `source: 'manual'`**: no hay valor `import` en el enum y así se pueden borrar como cualquier lectura manual.
4. **Una lectura suelta del CSV es duplicada si ya existe una lectura con la misma fecha y valor de cualquier origen**, incluida la de un repostaje del mismo fichero (R5, R7).
5. **Orden de proceso**: repostajes y mantenimientos antes que lecturas sueltas, y dentro de cada grupo por número de fila. Entre dos filas que se contradicen, gana la que se procesa antes.
6. **Fecha futura** se informa por fila (`future_date`) como el conflicto, en lugar de rechazar todo el fichero.
7. **Resultado no `parsed` → 400** con `errors[]` (no 422 ni 200): #86 detecta en el cliente y solo llega aquí con un cliente desfasado.
8. **201 al importar y 200 en `dryRun`**, como `POST /me/import` (201).
9. **UTF-8 sin modo estricto, con aviso** (ajustado en Gate 1): un byte inválido se convierte en `U+FFFD` en lugar de rechazar el fichero, y el resumen lo señala con `encodingReplaced: true` en API y modo local, con y sin `dryRun` (R28), para que #86 avise de que el fichero puede no estar en UTF-8 (p. ej. Latin-1). No se intenta adivinar ni convertir otra codificación.

## Riesgos

- **Rendimiento en el teléfono.** Cada insert cruza el puente de Capacitor; un fichero de miles de filas puede tardar segundos dentro de la cola. Aceptable para una operación puntual; si molesta, se agrupan los inserts por lotes con ids generados antes (`crypto.randomUUID()`).
- **Clave por contenido** (heredado de #84): editar un registro importado y reimportar el original lo vuelve a crear.
- **Sin rate limit propio**: aplica el global (300/min). Parsear 5 MiB es barato frente a ese límite.

## Fuera de alcance

UI del asistente, i18n de códigos y errores (#86), gastos (#87), conversión de unidades, deshacer una importación, adjuntos y vincular mantenimientos a planes (`scheduleId`).
