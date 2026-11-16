# Design — mobile-local-export

Cuatro bloques: **A** el mapeo filas → `data.json` sale de `data-export/service.ts` a una función pura de `@ikrive/shared` (la API no cambia de comportamiento); **B** un escritor de zip isomórfico en `@ikrive/shared/data-export-zip`, el que usa el teléfono y el que prueba la API; **C** `dataPortability.export()` en la DataSource (HTTP y local); **D** la tarjeta «Tus datos» vuelve a Ajustes en modo local, solo con export.

Sin cambios de BD ni de contrato HTTP (la API sigue sirviendo `GET /api/me/export` con `yazl` en streaming).

## A. Constructor compartido

| Archivo | Cambio |
|---|---|
| `packages/shared/src/domain/data-export-builder.ts` (nuevo) | `buildDataExport` + tipos de entrada; `groupBy`, `channelOf`, `attachmentOf`, `vehicleOf` movidos tal cual de `data-export/service.ts`; mantiene el `dataExportSchema.parse` final |
| `packages/shared/src/domain/data-export-builder.test.ts` (nuevo) | Unitarios con filas escritas a mano |
| `packages/shared/src/index.ts` | `export * from './domain/data-export-builder'` |
| `apps/api/src/modules/data-export/service.ts` | `build()` = `repo.load` + `settings.get` + `presentFiles` (se queda: `storage.exists` + `log.warn`) + `buildDataExport({ …, appVersion: APP_VERSION, exportedAt: new Date() })`. `export()` y `yazl` sin cambios |

```ts
// Tipos estructurales: shared NO importa @ikrive/db (@ikrive/db ya depende de shared → ciclo).
// Se derivan de los tipos del documento: mismos campos, timestamps como Date y claves de almacenamiento.
export interface DataExportInputRows {
  vehicles: VehicleRow[];            // campos del vehículo + photo: string | null, archivedAt/createdAt/updatedAt: Date
  odometerReadings: ReadingRow[];    // + vehicleId
  maintenanceSchedules: ScheduleRow[];
  maintenanceRecords: RecordRow[];
  fuelLogs: FuelLogRow[];
  attachments: AttachmentRow[];      // + entityId, storageKey
  notificationChannels: ChannelRow[]; // config: Record<string, unknown> (puede traer token)
}
export interface DataExportFile { key: string; path: string }
export function buildDataExport(input: {
  rows: DataExportInputRows;
  settings: UserSettings;
  appVersion: string;
  exportedAt: Date;
  present: { attachmentIds: ReadonlySet<string>; photoVehicleIds: ReadonlySet<string> };
}): { document: DataExport; files: DataExportFile[] };
```

La API pasa `DataExportRows` (inferido de Drizzle) directamente: si deja de ser asignable a `DataExportInputRows`, `pnpm typecheck` falla.

## B. Escritor de zip compartido

| Archivo | Cambio |
|---|---|
| `packages/shared/src/data-export-zip.ts` (nuevo) | `createDataExportZip()` sobre `fflate` (`Zip`, `ZipPassThrough` para ficheros, `ZipDeflate` para `data.json`) |
| `packages/shared/src/data-export-zip.test.ts` (nuevo) | Lee el zip con `fflate` (`Unzip`, para ver el método de compresión) |
| `packages/shared/package.json` | Dependencia `fflate` (`^0.8.3`, ya en el lockfile como transitiva); `exports["./data-export-zip"] = "./src/data-export-zip.ts"`. **No** se reexporta desde `index.ts` |

```ts
export interface DataExportZip {
  /** Adds `data` stored (no compression: PDFs and images are already compressed) under `path`. */
  addFile(path: string, data: Uint8Array): void;
  /** Adds `data.json` (deflated, `JSON.stringify(document, null, 2)`) and closes the zip. */
  finish(document: DataExport): Uint8Array[];
}
export function createDataExportZip(): DataExportZip;
```

Los ficheros se añaden según se leen y `data.json` va al final: así el teléfono nunca tiene a la vez todos los ficheros sueltos y el zip (pico ≈ tamaño del zip + un fichero). El import indexa por el directorio central, el orden le da igual. Comprobado en el scratchpad: `yauzl` con `strictFileNames` y `validateEntrySizes` (el `openZip` de la API) lee las entradas en streaming de `fflate` (con data descriptor).

### Test cruzado (R7) — dónde vive

En `apps/api/test/data-import.test.ts`, nuevo `describe('client-built zip')`, reutilizando `setup`, `seedUser`, `upload`, `download`, `readZip` y `normalize`. El zip se hace con **el mismo código que el teléfono** (`buildDataExport` + `createDataExportZip`) a partir de `createDataExportRepository(db).load(a.userId)`, los ajustes y los bytes de `dataDir/uploads/<key>`; después se lee con `readZip`, se valida `data.json` con `dataExportSchema` y se sube con `POST /api/me/import` a la cuenta B. Las filas son las de la API, pero el esquema Drizzle es el mismo que el del dispositivo (`packages/db`).

- Por qué en la API: solo ella tiene el import real (yauzl, `sharp`, magic bytes, sha256). `apps/api` depende de `@ikrive/shared`, no de `apps/web`, así que no se cruza ninguna frontera.
- Por qué no basta con la web: `fakeImages` produce «WebP» que `sharp` no decodifica, y la web no puede arrancar la API.
- La mitad web (`local-export.test.ts`) prueba que el modo local llama a ese mismo constructor y escritor con sus filas y ficheros, y valida su `data.json` con `dataExportSchema`.

## C. DataSource

| Archivo | Cambio |
|---|---|
| `apps/web/src/lib/data-source/types.ts` | `dataPortability.export(): Promise<DownloadedFile>` |
| `apps/web/src/lib/data-source/http.ts` | `export: () => api.download('/me/export')` |
| `apps/web/src/lib/data-source/local/data-export.ts` (nuevo) | `loadLocalExportRows(db)`, `localDataPortability(db, deps, queue)`, `LOCAL_APP_VERSION` |
| `apps/web/src/lib/data-source/local/index.ts` | `dataPortability: { import: reject, export: … }`; JSDoc: el import sigue en 501 |
| `apps/web/package.json` | `fflate` como devDependency (solo para leer el zip en los tests) |

`export()` local:

1. En la cola serie (`queue.run`, como `files-get.ts`): `loadLocalExportRows(db)` (una consulta por tabla, mismo orden que `data-export/repository.ts`: `createdAt`/`date` + `rowid`; `notificationChannels: []`, el modo local no tiene canales) y los ajustes (`localSettings(db).get()`).
2. Fuera de la cola, de uno en uno: `deps.files.read(storageKey, mimeType)` de cada adjunto y `read(photo, 'image/webp')` de cada foto. Si está → `zip.addFile(attachmentExportPath(...)/photoExportPath(...), bytes)` y su id al conjunto de presentes. `MissingFileError` → se omite. Otro error → `problem(500, 'Internal Server Error', 'Could not read a file of the export')`.
3. `buildDataExport({ rows, settings, appVersion: LOCAL_APP_VERSION, exportedAt: new Date(), present })` → `zip.finish(document)` → `{ blob: new Blob(chunks, { type: 'application/zip' }), fileName: \`ikrive-export-${todayIn(settings.timezone)}.zip\` }`.

`fflate` entra solo en el chunk del modo local (cargado con `import()` en `features/mobile/local-mode.ts`), no en el bundle de la web ni en el de la API.

## D. Web

| Archivo | Cambio |
|---|---|
| `apps/web/src/features/data-portability/queries.ts` | `useExportData()` (`useMutation` → `dataSource().dataPortability.export()`) |
| `apps/web/src/features/data-portability/data-section.tsx` | Modo servidor y local: botón → `useExportData().mutateAsync()` + `downloadBlob(fileName ?? 'ikrive-export.zip', blob)`, deshabilitado con `Loader2` y `dataPortability.exporting` mientras tanto; error → `common.fileError` (servidor, como hoy) o `dataPortability.errors.export` (local). Navegador: el `<a href="/api/me/export" download>` de siempre. En local: `localDescription`/`localExportHint` y sin input ni botón de import |
| `apps/web/src/routes/_app/settings.tsx` | `<DataPortabilitySection />` siempre (fuera el `!local` y su comentario) |
| `apps/web/src/i18n/locales/{es,en}.json` | `dataPortability.localDescription`, `localExportHint`, `exporting`, `errors.export` |

Textos: `localDescription` «Descarga una copia de todo lo que guardas en este teléfono para llevarla a un servidor de Ikrive.»; `localExportHint` «Un zip con tus vehículos, su historial, facturas, fotos y ajustes. Impórtalo en «Tus datos» de tu cuenta: la moneda y las unidades deben coincidir.»; `exporting` «Preparando…»; `errors.export` «No se ha podido generar el export». En el móvil `downloadBlob` abre la hoja de compartir (`native-files.ts`), igual que el resto de descargas. Sin cambios de diseño: mismos `Card`/`Button` y estados de carga y error.

## Alternativas descartadas

1. **Escritor de zip en `apps/web` y test cruzado en la web importando la API** (`buildApp`): mete `sharp`, `better-auth` y las fuentes de la API en el grafo de tests y en el `typecheck` de la web, y crea una dependencia web → API. Descartado.
2. **Otra librería de zip.** `jszip`: ~100 kB, solo API con promesas, sin mantenimiento activo. `client-zip`: necesita `ReadableStream`/`Response` (DOM), y `packages/shared` compila sin DOM. `@zip.js/zip.js`: más grande y orientada a workers. `fflate`: sin dependencias, ESM isomórfico, ~8 kB para lo que se usa, API síncrona que funciona igual en Node (test de la API) y en el WebView.
3. **La API usa también el escritor compartido**: perdería el streaming (todo el zip en memoria) y los tests de `data-export.test.ts` que lo comprueban. La API sigue con `yazl`.
4. **Cargador de filas compartido en `packages/db`** para API y local: obligaría a reescribir el repositorio síncrono de la API (better-sqlite3) en asíncrono. Fuera de alcance; el modo local tiene su cargador.
5. **Zip de referencia versionado** que genera la web y consume la API: se queda obsoleto en silencio. Descartado.

## Decisiones a validar (Gate 1)

1. **`fflate` en `packages/shared`**: primera dependencia de shared además de `zod`. Aislada en el subpath `@ikrive/shared/data-export-zip` para que no llegue al bundle de la API ni a la web en modo servidor.
2. **El test cruzado usa filas de la API, no el cargador local.** Prueba constructor + escritor + import; el cargador local queda cubierto por su test con `dataExportSchema`, no por un import real. Es el hueco más visible del plan.
3. **`data.json` al final del zip local** (en la API va el primero), por memoria.
4. **`appVersion` del modo local** = `import.meta.env.VITE_IKRIVE_VERSION || '0.0.0-dev'`, el mismo respaldo que `APP_VERSION` de la API. Nadie define aún esa variable al compilar la app; el import solo exige que no esté vacía.
5. **El modo servidor pasa a `dataPortability.export()`** en lugar de `saveApiFile(EXPORT_URL)`: misma petición, mismo nombre y mismo toast; solo añade el estado «Preparando…».
6. **Un fallo de lectura que no sea `MissingFileError` aborta todo el export (500)** en lugar de omitir el fichero: la API, en el caso análogo, corta el zip.

## Riesgos

- **Memoria en el teléfono**: el zip entero vive en memoria y `downloadBlob` nativo lo pasa a base64. Con cientos de MB de facturas, el WebView puede quedarse sin memoria. Se acepta para esta fase.
- **Tipos de Drizzle frente a los tipos estructurales** (columnas `enum` y JSON): si no son asignables hay que ajustar `DataExportInputRows`, sin castings en la API.
- **Regresión en la API al mover el constructor**: la cubren `data-export.test.ts` (690 líneas) y el round-trip de `data-import.test.ts` sin cambiar aserciones.
- **Ajustes distintos**: el servidor rechaza con 409 si la moneda o las unidades no coinciden; el texto de ayuda lo avisa.

## Fuera de alcance

- Importar en modo local (sigue 501) y el paso servidor → teléfono (`docs/PLAN.md`).
- Barra de progreso, escritura en streaming a disco y límite de tamaño del export local.
- Definir `VITE_IKRIVE_VERSION` en CI o en la build móvil.
