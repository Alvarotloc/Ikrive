# Design — mobile-local-export-streaming

Hoy hay tres copias del zip completo en el teléfono: `chunks[]` de `createDataExportZip`, el `new Blob(...)` de `local/data-export.ts` y el base64 de `blobToBase64` + un único `Filesystem.writeFile` en `native-files.ts`. La feature las sustituye por una tubería: **escritor en streaming** (shared) → **cola de trozos pendientes con contrapresión** (`local/data-export.ts`) → **destino del export** inyectado (dispositivo: `appendFile` a `Directory.Cache`; web/tests: `Blob` como en #66) → **hoja de compartir** desde el `file://`.

Sin cambios de BD, de contrato HTTP ni de la API. Sin cambios visibles en la UI.

## A. Escritor de zip (`packages/shared/src/data-export-zip.ts`)

```ts
/** Receives each piece of the zip as soon as fflate produces it (synchronously, in order). */
export type DataExportZipChunk = (chunk: Uint8Array<ArrayBuffer>) => void;
export interface DataExportZipStream {
  addFile(path: string, data: Uint8Array): void;   // ZipPassThrough, como hoy
  finish(document: DataExport): void;              // data.json con ZipDeflate nivel 6 + zip.end()
}
export function streamDataExportZip(onChunk: DataExportZipChunk): DataExportZipStream;
/** Unchanged signature: collects the chunks of streamDataExportZip and returns them in finish. */
export function createDataExportZip(): DataExportZip;
```

- **Callback y no array**: `streamDataExportZip` es el escritor real; `createDataExportZip` pasa a ser un envoltorio de 5 líneas que acumula. Ni la firma ni el comportamiento de `createDataExportZip` cambian, así que `data-export-zip.test.ts` y `data-import.test.ts` siguen compilando y pasando.
- fflate llama al callback de forma síncrona dentro de `push` para `ZipPassThrough`/`ZipDeflate` y, como cada entrada se cierra antes de añadir la siguiente, no retiene nada: el trozo de datos de un `ZipPassThrough` es una vista del propio `data`, no una copia (`ownBuffer` se mantiene).
- `clientBuiltZip()` de `apps/api/test/data-import.test.ts` pasa a usar `streamDataExportZip` con un array local (el código del teléfono), sin tocar aserciones (R3).

## B. Tubería del export local

| Archivo | Cambio |
|---|---|
| `apps/web/src/lib/data-source/local/export-sink.ts` (nuevo) | Tipos `LocalExportSink`, `OpenExportSink` y `openMemoryExportSink` (el `Blob` de #66) |
| `apps/web/src/lib/data-source/local/files.ts` | `LocalDeps.exportSink?: OpenExportSink` (por defecto, el de memoria) |
| `apps/web/src/lib/data-source/local/data-export.ts` | `export()` con `streamDataExportZip`, cola `pending` y `flush()`; `try/catch` con `sink.abort()` |
| `apps/web/src/lib/data-source/types.ts` | `DeviceFile`, `ExportedFile = DownloadedFile \| DeviceFile`; `dataPortability.export(): Promise<ExportedFile>` |
| `apps/web/src/features/mobile/local-mode.ts` | Carga `@/lib/native-export` en el mismo `Promise.all` y pasa `exportSink: openDeviceExportSink` |

```ts
// export-sink.ts
export interface LocalExportSink {
  /** Writes `chunk` after the previous ones; resolves once it is on its target. */
  write(chunk: Uint8Array): Promise<void>;
  /** Ends the zip and returns what the UI saves or shares. */
  close(): Promise<ExportedFile>;
  /** Removes whatever was written. Never rejects. */
  abort(): Promise<void>;
}
export type OpenExportSink = (fileName: string) => Promise<LocalExportSink>;
export const openMemoryExportSink: OpenExportSink; // close → { blob: new Blob(chunks, { type: 'application/zip' }), fileName }

// types.ts
/** The local export left on the device (native app): shared from its file, never loaded in memory. */
export interface DeviceFile { fileName: string; uri: string; /** relative to Directory.Cache */ path: string }
export type ExportedFile = DownloadedFile | DeviceFile;
```

`export()`:

1. Filas y ajustes en `queue.run` (igual que #66). `fileName = ikrive-export-${todayIn(tz)}.zip`; `sink = await (deps.exportSink ?? openMemoryExportSink)(fileName)`.
2. `const pending: Uint8Array[] = []; const zip = streamDataExportZip((c) => pending.push(c));` y `flush = async () => { for (let c; (c = pending.shift()); ) await write(c) }`, donde `write` envuelve `sink.write` y convierte su error en `problem(500, 'Internal Server Error', 'Could not write the export')` (R8).
3. Por cada adjunto y luego cada foto (mismo orden y mismas reglas de `MissingFileError`/500 que #66): `read` → `zip.addFile` → **`await flush()` antes del siguiente `read`** (R4). La variable `bytes` sale de alcance tras el `flush`.
4. `buildDataExport(...)` → `zip.finish(document)` → `await flush()` → `return sink.close()`.
5. Cualquier error en 1–4 (tras abrir el destino): `await sink.abort()` y se relanza (R7).

**Contrapresión.** fflate emite de forma síncrona, los `append` son asíncronos: la cola `pending` desacopla ambos y el bucle no lee el siguiente fichero hasta vaciarla. Pico retenido = un fichero (≤ 20 MB, `LOCAL_MAX_UPLOAD_MB`) + sus cabeceras, o el `data.json` comprimido al final (R5). El `JSON.stringify` del documento sigue existiendo como en #66: crece con el número de filas, no con los ficheros.

**Lectura de ficheros: uno entero a la vez.** El acceptance admite «un fichero leído»; `LocalFileStore.read` no cambia y el máximo es 20 MB. Ver alternativa 2.

## C. Destino del dispositivo (`apps/web/src/lib/native-export.ts`, nuevo)

Solo se carga con `import()` desde `local-mode.ts` y `download.ts`, como `native-files.ts`.

```ts
export const EXPORT_DIR = 'exports';
export const EXPORT_APPEND_BYTES = 512 * 1024;
export const openDeviceExportSink: OpenExportSink;
/** Share sheet from the file; removes it when the sheet is closed without a choice or fails. */
export function shareExportFile(file: DeviceFile): Promise<void>;
```

- **Abrir (R10).** `Filesystem.rmdir({ path: 'exports', directory: Cache, recursive: true })` ignorando «does not exist» (se lleva cualquier export anterior o huérfano de un cierre forzado), y `Filesystem.writeFile({ path: 'exports/<safeFileName(fileName)>', data: '', directory: Cache, recursive: true })`, que crea/trunca y devuelve el `uri`. Carpeta propia `exports/` para no borrar los `files/` de `native-files.ts`; `cache-path .` del `FileProvider` la cubre.
- **write (R11).** Recorre el trozo en `subarray` de ≤ `EXPORT_APPEND_BYTES` y por cada uno, **en serie**, `Filesystem.appendFile({ path, data: bytesToBase64(slice), directory: Cache })`. Cada llamada se decodifica por separado en Kotlin, así que las porciones no tienen que ser múltiplo de 3. 512 KiB ≈ 700 KB de base64 por mensaje del bridge: dentro de la franja de 256 KB–1 MB del explore (memoria acotada sin multiplicar open/close por trozo).
- **close (R12).** Devuelve `{ fileName, uri, path }` sin `readFile` ni `stat`.
- **abort (R13).** `deleteFile({ path, directory: Cache })` dentro de `try/catch` vacío.
- **Tras compartir.** Si `Share.share` resuelve, el fichero **se queda** (la app destino puede leerlo después, como en `native-files.ts`); lo borra el `rmdir` del siguiente export (R10) o Android. Si rechaza con `isShareCanceled` → resuelve **sin borrar** el fichero (R15): en Android (`SharePlugin.java` l.76-87 y 218 de `@capacitor/share` 8.0.3) «Share canceled» también llega cuando la app destino devuelve `RESULT_CANCELED` sin que nuestra actividad llegue a pararse, que es lo que pasa con destinos translúcidos (Quick Share, Bluetooth) que siguen leyendo el fichero en segundo plano; borrarlo rompería la transferencia. Otro error → `deleteFile` y relanza (R16).
- `native-files.ts`: se extrae `bytesToBase64(bytes: Uint8Array): string` de `blobToBase64` (que pasa a usarla); `saveFile`/`openFile` no cambian.

## D. Web

| Archivo | Cambio |
|---|---|
| `apps/web/src/lib/download.ts` | `saveExportedFile(file: ExportedFile, fallbackName: string)`: `'uri' in file` → `import('./native-export')` → `shareExportFile(file)`; si no, `downloadBlob(file.fileName ?? fallbackName, file.blob)` |
| `apps/web/src/features/data-portability/data-section.tsx` | `startExport` usa `saveExportedFile(await exportData.mutateAsync(), EXPORT_FALLBACK_NAME)`; mismos toasts (`dataPortability.errors.export` en local, `common.fileError` en el resto) |
| `apps/web/src/lib/data-source/http.ts` | Sin cambios: sigue devolviendo `DownloadedFile`, asignable a `ExportedFile` |

UI: mismo botón, mismo «Preparando…» (ahora cubre también la escritura a disco) y mismo toast. **Sin textos nuevos**: se reutilizan `dataPortability.errors.export` y `files.shareTitle` (R18 se comprueba con `locales.test.ts`).

## Tests: memoria medida

- `apps/web/src/test/measuring-export-sink.ts` (nuevo): `createMeasuringExportSink()` → `{ open: OpenExportSink, written(): Uint8Array, received: number, aborted: boolean, events }`. Cada `write` resuelve en un macrotask (`setTimeout(0)`) para que una implementación sin contrapresión se adelante; guarda los bytes en su «disco» (no cuentan como memoria) y `close` devuelve un `DeviceFile` `file:///cache/exports/<name>`.
- `createMemoryFileStore` gana `bytesRead` (acumulado de lo que devuelve `read`) y un hook `onRead(key)`.
- Retenido en cada `read` y cada `write` = `bytesRead − received`. Con 8 adjuntos de 1 MiB: máximo ≤ 1 MiB (R5) y, al llamarse `read` del fichero k+1, `received ≥ Σ tamaños 0..k` (R4), mientras el total escrito > 8 MiB. Las cabeceras del zip solo hacen el cálculo más estricto en ~100 B por fichero, insignificante frente a 1 MiB.
- Mock de `@capacitor/filesystem` en `native-export.test.ts` con un disco en memoria (`Map<path, Uint8Array>`) que decodifica cada `appendFile` y registra la longitud de `data` de cada llamada.

## Alternativas descartadas

1. **`finish()` que devuelve `[]` con un parámetro opcional `onChunk` en `createDataExportZip`**: un mismo método con dos contratos según el argumento. Dos funciones con nombres distintos son más claras y no tocan a los usuarios actuales.
2. **Leer adjuntos por rangos (`readFile` con `offset`/`length`)**: el acceptance ya admite un fichero entero; en Android `readFull` concatena Strings de 8 KB, añade un viaje por el bridge por rango, no existe en la web y obligaría a cambiar `LocalFileStore` y el almacén en memoria. Queda como mejora si 20 MB resultan demasiados.
3. **`readFileInChunks`**: sin contrapresión (el nativo inunda el WebView) y no implementado en web.
4. **`export()` que comparte él mismo**: la DataSource solo mueve datos (`types.ts`); compartir es de la UI, como `downloadBlob`.
5. **Seleccionar el destino con `isNativeApp()` dentro de `local/data-export.ts`**: metería Capacitor en el grafo de la DataSource local y en sus tests en Node. La inyección por `LocalDeps` es como `files` e `images`.

## Decisiones a validar (Gate 1)

1. **«Si el export falla o se cancela, el fichero temporal se borra» = un export que no termina borra su fichero** (fallo de generación/escritura → R7/R13; fallo de `Share.share` distinto de la cancelación → R16). No hay botón de cancelar export ni `AbortSignal`; añadirlo sería un requisito nuevo. **Cerrar la hoja de compartir no borra el fichero** (R15): Android no distingue de forma fiable «cerrada sin elegir» de «compartido con un destino translúcido» (Quick Share, Bluetooth), que rechaza igual con «Share canceled» mientras sigue leyendo el fichero en segundo plano (`SharePlugin.java` l.76-87 y 218). Lo limpia el `rmdir` de `exports/` del siguiente export (R10), igual que tras compartir con éxito; como mucho queda un export en caché.
2. **Tras compartir con éxito el fichero no se borra** (la app destino puede leerlo más tarde); el siguiente export vacía `exports/` (R10). Como mucho queda un export en caché.
3. **Un fichero entero a la vez** (≤ 20 MB). En el dispositivo `native-storage.read` sigue costando ~5× el fichero en transitorios (base64 nativo + JS + `atob`): ~100 MB para 20 MB, igual que al abrir hoy un adjunto, pero ya no crece con el total.
4. **Porción de `appendFile` de 512 KiB.**
5. **Fallo de escritura → Problem 500 `Could not write the export`** (p. ej. sin espacio), con el mismo toast que cualquier fallo del export local.

## Riesgos

- **`appendFile` abre y cierra el fichero en cada llamada**: con 512 KiB, ~2000 llamadas para 1 GB. Aceptable; el tiempo queda bajo el «Preparando…».
- **Android puede vaciar `Directory.Cache`** a mitad de export con muy poca memoria: el `appendFile` fallaría → R7/R8.
- **Comportamiento real en el dispositivo** (bridge, OOM) no se prueba en CI: los tests miden la tubería con dobles. Conviene probar a mano un export de varios cientos de MB en la APK.

## Fuera de alcance

- Barra de progreso, botón de cancelar y límite de tamaño del export.
- `downloadBlob`/`openBlob` nativos del resto de descargas (modo servidor, informe de venta): siguen con `writeFile` del blob entero.
- Lectura por rangos de los adjuntos y `android:largeHeap`.
