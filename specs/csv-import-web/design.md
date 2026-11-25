# Design — csv-import-web

## Idea

El navegador analiza el fichero con el mismo parser que el servidor para saber qué preguntar (formato, opciones que faltan, mapeo, unidades). Los recuentos salen siempre de la vista previa (`dryRun: true`), porque los duplicados y los conflictos de odómetro dependen de la BD. Importar es la misma llamada sin `dryRun`. Nada de la lógica de #84/#85 se repite en la web.

```
File ─▶ size > CSV_IMPORT_MAX_BYTES? ─▶ error (R4, ni se lee ni se carga el parser)
     ─▶ import('@ikrive/shared/csv-import') + decodeCsv(bytes)
     ─▶ parseCsvImport(text, { target, ...opciones })     // en cada cambio de vehículo u opciones
          unknown        → modo genérico: mapeo (R6, R9, R10)
          needs_options  → genérico: mapeo incompleto | reconocido: pedir missing (R7)
          unit_mismatch  → aviso de unidades (R8)
          parsed         → useQuery dryRun ─▶ recuentos + avisos (R11–R14) ─▶ Importar (R16) ─▶ resumen (R18)
```

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `src/csv-import/generic.ts`, `src/csv-import/index.ts` | Renombrar `KIND_COLUMNS` a `CSV_KIND_COLUMNS` y exportarlo. Sin cambio de comportamiento. |
| web | `src/features/csv-import/read-file.ts` | `readCsvFile(file)`: límite, `import()` del parser y `decodeCsv`. |
| web | `src/features/csv-import/wizard.ts` | Lógica pura: borrador de mapeo, opciones, recuentos y filas de detalle. |
| web | `src/features/csv-import/errors.ts` | `csvImportErrorKey(error)`. |
| web | `src/features/csv-import/queries.ts` | `csvImportPreviewQuery` y `useCsvImport`. |
| web | `src/features/csv-import/csv-import-wizard.tsx` | Componente principal (estado, pasos, botón Importar). |
| web | `src/features/csv-import/column-mapping.tsx` | Formulario de mapeo del genérico. |
| web | `src/features/csv-import/import-counts.tsx` | Recuentos, avisos y lista de filas (vista previa y resumen). |
| web | `src/lib/query-keys.ts` | `csvImport.preview(...)`. |
| web | `src/routes/_app/import.tsx` | Ruta `/import`: loader de `vehiclesQuery('all')` y `settingsQuery`. |
| web | `src/routes/_app/settings.tsx` | Tarjeta «Importar desde otra app» con `Link` a `/import` (R1). |
| web | `src/i18n/locales/{es,en}.json` | Namespace `csvImport`. |

Sin cambios de BD, API, `DataSource` ni dependencias: `csvImport.import` (HTTP y local) ya existe (#85).

## Tipos y firmas

```ts
// read-file.ts
type CsvImportModule = typeof import('@ikrive/shared/csv-import');
export type CsvFileRead =
  | { status: 'too_large'; name: string }
  | { status: 'read'; name: string; text: string; encodingReplaced: boolean; csv: CsvImportModule };
/** Checks the size before touching the bytes; only then loads the parser chunk and decodes. */
export async function readCsvFile(file: File): Promise<CsvFileRead>;

// wizard.ts
export interface MappingDraft {
  kind: CsvRowKind | '';
  columns: Partial<Record<CsvColumn, number>>;
  dateFormat: CsvDateFormat | '';
  decimalSeparator: CsvDecimalSeparator | '';
}
export const emptyMapping: MappingDraft;
/** `null` until the kind, the date format, the separator and every group of CSV_REQUIRED_COLUMNS are set. */
export function toMapping(draft: MappingDraft): CsvGenericMapping | null;
/** Options sent to the parser and to the API (never `target`, never `dryRun`). */
export function importOptions(state: { generic: boolean; mapping: MappingDraft;
  dateFormat?: CsvDateFormat; decimalSeparator?: CsvDecimalSeparator }): Omit<CsvImportRequestInput, 'dryRun'> | null;
export function previewCounts(s: CsvImportSummary): { valid: number; duplicates: number; errors: number; skipped: number };
export function resultCounts(s: CsvImportSummary): { created: CsvImportSummary['created']; omitted: number; errors: number };
export type CsvIssue =
  | { row: number; type: 'error'; code: CsvRowErrorCode; field: string | null }
  | { row: number; type: 'rejected'; reason: CsvRejectReason; conflict: { date: string; value: number } | null }
  | { row: number; type: 'skipped'; reason: CsvSkipReason; label: string | null };
/** errors + rejected + skipped sorted by row, cut to `limit` (50), with the total. */
export function csvIssues(s: CsvImportSummary, limit?: number): { items: CsvIssue[]; total: number };

// errors.ts
export type CsvImportErrorKey = 'csvImport.errors.tooLarge' | 'csvImport.errors.cannotImport'
  | 'csvImport.errors.vehicleNotFound' | 'common.error';
export function csvImportErrorKey(error: unknown): CsvImportErrorKey;   // 413 / 400 / 404 / resto

// queries.ts
export const csvImportPreviewQuery = (vehicleId: string, file: File, fileId: number,
  options: Omit<CsvImportRequestInput, 'dryRun'>) => queryOptions({
    queryKey: queryKeys.csvImport.preview(vehicleId, fileId, options),
    queryFn: () => dataSource().csvImport.import(vehicleId, file, { ...options, dryRun: true }),
    staleTime: Infinity, gcTime: 0, retry: false });
/** Real import; `onSuccess` (on the mutation) invalidates `queryKeys.vehicles.all`. */
export function useCsvImport(): UseMutationResult<CsvImportSummary, unknown,
  { vehicleId: string; file: File; options: Omit<CsvImportRequestInput, 'dryRun'> }>;

// csv-import-wizard.tsx
export function CsvImportWizard(props: { vehicles: Vehicle[]; settings: UserSettings }): JSX.Element;
```

`fileId` es un contador que sube en cada selección: un `File` no sirve de query key (se serializa como `{}`). Los enums de etiqueta (`CsvRowErrorCode`…) se derivan de los arrays `CSV_*` de `@ikrive/shared`.

## Comportamiento del asistente

- **Datos**: la ruta carga `vehiclesQuery('all')` y `settingsQuery` y pasa ambos como props, así los tests montan el componente sin router. `target = { distance: settings.distanceUnit, quantity: fuelQuantityUnit(vehicle.fuelType, settings.volumeUnit) }`.
- **Análisis**: `useMemo` sobre `(read, vehicle, opciones)`. Para el genérico se analiza con `mapping: toMapping(draft)`; si aún es `null`, con un mapeo vacío de relleno (`kind: 'odometer'`, `columns: {}`) para obtener `headers` = `genericHeaders(doc)`, que son las que indexa el mapeo (las de `unknown` pueden venir de otra fila en ficheros con secciones).
- **Genérico**: se entra cuando el análisis sin mapeo da `unknown`. El selector de cada campo ofrece «No importar» y las cabeceras por índice (`Columna {{n}}` si está vacía). Cambiar el tipo vacía las columnas. Fecha y separador empiezan vacíos: no se adivinan (como #84).
- **Formato reconocido con `needs_options`**: selects solo de lo que falta, vacíos al principio.
- **Vista previa**: `useQuery(csvImportPreviewQuery(...))` con `enabled` solo si el análisis da `parsed`. Cambiar vehículo, fichero u opciones cambia la key y repite la vista previa.
- **Botón Importar**: `disabled` salvo con la vista previa en `success`, con suma de `created` > 0 y sin importación en curso. Si la vista previa da 0 filas válidas, la tarjeta 3 muestra `preview.nothingToImport` junto al botón desactivado (R15, R23). Al terminar, el resumen sustituye los pasos 2–3; «Importar otro fichero» reinicia el estado y hay enlace a la ficha del vehículo.
- **Cambiar de fichero** reinicia mapeo, opciones, vista previa y resumen.

## Impacto en UI

- `PageHeader` (eyebrow «Importar», título «Importar desde otra app»), `Card` por paso: 1 vehículo y fichero, 2 formato (detectado / opciones / mapeo / aviso de unidades), 3 vista previa e Importar. Una columna en móvil; el mapeo en `sm:grid-cols-2`.
- Reutiliza `FormField`, `Select`, `Input type="file"` (`accept=".csv,text/csv"`), `Button` con `Loader2`, `Warning` (notas/gasolinera, UTF-8, unidades) y el patrón de `dl` de recuentos de `DataPortabilitySection`. Números con `useFormat().number`.
- Estados: sin vehículos (R3), leyendo el fichero (spinner), cargando vista previa (spinner en la tarjeta 3, botón desactivado), error (`role="alert"`, R20). La lista de filas va en `<details>` con «Ver filas (n)» y «y {{count}} más» pasado el límite.
- Solo tokens existentes: claro, oscuro y móvil sin estilos nuevos.

## i18n (`csvImport.*`)

`eyebrow`, `title`, `description`, `settingsCard.{title,description,link}`, `vehicle`, `file`, `noVehicles`, `reading`, `tooLarge` (con `{{max}}`), `detected` (`{{format}}`), `genericIntro`, `formats.<CSV_FORMATS>`, `kinds.<CSV_ROW_KINDS>`, `columns.<CSV_COLUMNS>`, `dateFormats.<…>`, `decimalSeparators.<…>`, `noColumn`, `columnN`, `unitMismatch` (`{{source}}`, `{{target}}`), `preview.{title,valid,duplicates,errors,skipped,loading,nothingToImport}`, `droppedNotes`, `droppedStation`, `droppedBoth`, `encoding`, `import`, `importing`, `result.{title,created,omitted,errors,again,vehicle}`, `issues.{show,more,row}`, `errorCodes.<…>`, `rejectReasons.<…>` (`odometer_conflict` con `{{date}}` y `{{value}}`), `skipReasons.<…>`, `errors.{tooLarge,cannotImport,vehicleNotFound}`. Las unidades reutilizan `units.*` y `fuel.units.*`. `locales.test.ts` añade un test por cada array `CSV_*`.

## Alternativas descartadas

- **Pedir la vista previa al servidor sin analizar en el navegador** (y deducir el paso de los `errors[].path` del 400). No da las cabeceras para el mapeo ni el formato detectado antes de llamar, y cada cambio de mapeo sería un viaje con un 400. El parser ya es puro y se carga solo en esta pantalla.
- **Calcular los recuentos con `planCsvImport` en el cliente.** Exigiría bajar todas las lecturas, repostajes y mantenimientos del vehículo y duplicaría el orquestador de #85; `dryRun` ya da el mismo resumen en los dos modos.
- **Asistente en un diálogo de Ajustes o de la ficha.** El mapeo de hasta 7 campos más la lista de filas no cabe bien en un diálogo en móvil, y una ruta propia sale del chunk principal con `autoCodeSplitting`.
- **Previsualizar con `useMutation` lanzada en un efecto.** Repite la petición en StrictMode y no cancela al cambiar de opciones; `useQuery` con key por opciones lo resuelve.

## Decisiones a validar (Gate 1)

1. **Acceso solo desde Ajustes** (tarjeta propia, visible también en local), sin entrada en la navegación ni botón en la ficha del vehículo. El vehículo se elige en el asistente.
2. **Todos los vehículos** (`vehiclesQuery('all')`), también archivados y vendidos: la API no impide escribir en ellos y traer el historial de un coche vendido tiene sentido.
3. **`unit_mismatch` solo se informa** con enlace a Ajustes; el asistente no ofrece sobrescribir `sourceUnits` (el parser lo permite, pero confirmar unas unidades falsas corrompería los datos).
4. **No se puede forzar el genérico** con un formato reconocido.
5. **Fecha y separador del mapeo empiezan vacíos** y son obligatorios para activar Importar, como las columnas obligatorias.
6. **Omitidos del resumen** = `duplicates` + `skipped`; **errores** = `errors` + `rejected`. En la vista previa, `skipped` se muestra aparte (no es válida, ni duplicada, ni error).
7. **Importar con 0 filas válidas se bloquea**: si la suma de `created` de la vista previa es 0, el botón Importar queda desactivado y el asistente indica que no hay nada que importar (`preview.nothingToImport`). Cambiado en Gate 1 a petición del humano.
8. **Lista de filas limitada a 50** para no pintar miles de elementos con un fichero roto.

## Riesgos

- **Memoria/tiempo en el teléfono**: 5 MiB de texto se analizan en el hilo principal en cada cambio de opciones. Aceptable para el tamaño máximo; si molesta, se mueve el análisis a un worker.
- **Análisis cliente y servidor divergentes** (ajustes cambiados en otra pestaña, cliente desfasado): el servidor responde 400 y R20 lo muestra; no se pierde nada.
- **`accept` en Android**: algunos gestores de ficheros no asocian `text/csv`; la extensión `.csv` sigue en `accept`. Probar en el APK antes de v0.4.0.
- **Ficheros con muchas filas idénticas al guardado** muestran recuentos grandes de duplicadas sin detalle: es lo esperado.

## Fuera de alcance

Gastos (#87), conversión de unidades, deshacer una importación, guardar mapeos, ver el contenido de cada fila, E2E y capturas del README (se regeneran en la release).
