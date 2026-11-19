# Design — mobile-local-export-ranged-reads

Hoy (#75) el export no lee el siguiente fichero hasta escribir el anterior, pero cada adjunto se lee **entero**: `native-storage.read` → `readFile` sin rango → un base64 de ~27 MB por un PDF de 20 MB en Kotlin y en JS, `atob`, `Uint8Array.from`, `Blob` y `fileBytes`. La feature cambia solo la lectura: el almacén entrega el fichero en trozos de 256 KiB (`readFile` con `offset`/`length`) y cada trozo pasa al zip y al destino antes de leer el siguiente, con la misma cola `pending` y `flush()` de #75.

Sin cambios de BD, de contrato HTTP, de UI ni de textos. El destino del export (`native-export.ts`) y la hoja de compartir no cambian.

## Verificación de `@capacitor/filesystem` 8.1.5 (instalado)

- `ReadFileOptions.offset`/`length` existen desde 8.1.0 (`dist/esm/definitions.d.ts` l.210-228): «Native only (not available in web)»; `length` no positivo = hasta el final.
- Android (`FilesystemMethodOptions.kt` l.143-146 → `ionfilesystem-android` 1.1.1, `IONFILEInputStreamExtensionsKt.readFull`, desensamblado del AAR de la caché de Gradle): `applyOffset` hace `InputStream.skipNBytes(offset)` (API ≥ 34; `skip` en bucle antes), que en `FileInputStream` es un `lseek`, no una lectura. Con `length` lee bloques de 8193 bytes (múltiplo de 3, así que el base64 concatenado es válido) **hasta `length`**; sin `length` hace `readBytes()` del fichero entero. **El rango es real.**
- Dos trampas que el diseño evita: (1) `length: 0` lee el fichero entero, así que nunca se pide un rango vacío (R7, R9); (2) un `offset` más allá del final hace fallar `skipNBytes` con `EOFException`, así que el tamaño sale de `Filesystem.stat` y nunca se pide más allá.
- Coste nativo: con `length`, `readFull` concatena `String`s (`str = str + chunk`), cuadrático en el tamaño del rango: con 256 KiB son 32 bloques y ~5,6 M caracteres copiados por llamada (~10 GB en total para 442 MB, en el heap de la app, no en el renderer). Ver Riesgos y Decisión 1.
- La web del plugin ignora `offset`/`length` y devuelve el fichero entero: el almacén del dispositivo es solo nativo, pero R8 lo detecta si ocurriera.

## A. Escritor de zip (`packages/shared/src/data-export-zip.ts`)

```ts
/** An entry of the zip fed piece by piece; closed by the `push` with `final`. */
export interface DataExportZipEntry {
  /** Hands `data` (and the entry's header, on the first push) to the callback before returning. */
  push(data: Uint8Array, final?: boolean): void;
}
export interface DataExportZipStream {
  /** Opens `path` stored (ZipPassThrough). Throws while another entry is open. */
  openFile(path: string): DataExportZipEntry;
  addFile(path: string, data: Uint8Array): void;   // = openFile(path).push(data, true)
  finish(document: DataExport): void;              // throws while an entry is open
}
```

- Comprobado con `fflate` 0.8.3 del repo (script en el scratchpad): `Zip` siempre escribe la entrada con *data descriptor* (CRC y tamaños al final), así que un fichero en trozos de 256 KiB más un `push(new Uint8Array(0), true)` produce **byte a byte** el mismo zip que `push(data, true)`, también con un fichero vacío (R2, R15). Cada `push` emite de forma síncrona (la cabecera sale con el primero; el descriptor, con el `final`) (R1).
- **Una entrada abierta a la vez (R3).** fflate encolaría en memoria los trozos de una segunda entrada hasta cerrar la primera; un contador `open` lanza `Error('Another zip entry is still open')` antes de llamar a fflate.
- `createDataExportZip` no cambia. `clientBuiltZip()` de `apps/api/test/data-import.test.ts` pasa a usar `openFile` con trozos de 64 KiB (el código del teléfono), sin tocar aserciones (R4).

## B. Almacén local

`apps/web/src/lib/data-source/local/files.ts`:

```ts
export interface LocalFileStore {
  // save, read, remove: sin cambios (`read` sigue sirviendo a files.get y al informe de venta)
  /**
   * The file of `key` in order, in pieces of at most `chunkBytes`, each read only when asked for.
   * The first `next()` rejects with `MissingFileError` when there is no file.
   */
  readChunks(key: string, chunkBytes: number): AsyncIterable<Uint8Array>;
}
```

Método obligatorio: solo hay dos implementaciones y las dos lo tienen. `fileBytes` deja de usarse en el export (se mantiene si lo usa otro sitio).

**Dispositivo (`apps/web/src/lib/native-storage.ts`)**, `async function*`:

1. `const { size } = await Filesystem.stat({ path, directory: Data })`; «does not exist» → `MissingFileError(key)` (mismo `isMissingFile`) (R6). `size === 0` → termina (R9).
2. `for (offset = 0; offset < size; offset += length)`: `length = Math.min(chunkBytes, size - offset)`; `readFile({ path, directory: Data, offset, length })`; `data` string → `base64ToBytes`, `Blob` → `arrayBuffer` (R7).
3. `bytes.length !== length` → `Error('Unexpected read of <key>: <n> bytes instead of <length>')` (R8). Un «does not exist» a mitad (fichero borrado durante el export) se propaga tal cual; el export lo trata como cualquier fallo tras abrir la entrada (R14).

**Memoria (`apps/web/src/test/memory-file-store.ts`)**: `readChunks` con `check('read')` y `onRead(key)` una vez al empezar, `MissingFileError` en el primer `next()`, `slice` de ≤ `chunkBytes` por iteración; `bytesRead` suma cada trozo al entregarlo. Hook nuevo `onChunk: ((key: string, index: number) => void) | null`, llamado antes de servir cada trozo (un `throw` simula un fallo a mitad). Los tests de #66/#75 que usan `onRead`/`bytesRead` siguen valiendo.

## C. Export (`apps/web/src/lib/data-source/local/data-export.ts`)

```ts
export const EXPORT_READ_BYTES = 256 * 1024;
```

`writeZip` sustituye `read` + `addFile` por `copyFile(path, key)`:

1. `const chunks = files.readChunks(key, EXPORT_READ_BYTES)[Symbol.asyncIterator]()`; `first = await chunks.next()`. `MissingFileError` → se omite (devuelve `false`, R13); otro error → Problem 500 `Could not read a file of the export` (R14).
2. `entry = zip.openFile(path)`; para cada trozo: `entry.push(chunk)` → `await flush()` → `await chunks.next()` (R11). Al acabar, `entry.push(new Uint8Array(0), true)` → `await flush()`.
3. Cualquier error de lectura tras abrir la entrada → mismo Problem 500 (la entrada queda a medias, pero el destino se descarta con el `sink.abort()` de #75) (R14).

Orden, `attachmentIds`/`photoVehicleIds`, `data.json` al final, `sink.close()`/`abort()` y el Problem de escritura no cambian (R16). Pico retenido: el trozo leído (≤ 256 KiB) y sus piezas pendientes; `2 × EXPORT_READ_BYTES` en R12 deja margen a una lectura anticipada que no se implementa.

## Tests

- **Bytes retenidos (R12).** Mismo cálculo que #75 (`store.bytesRead − sink.received` en `onRead`, `onChunk` y `onWrite`) con 3 adjuntos de 4 MiB: máximo ≤ 512 KiB, muy por debajo del mayor fichero; con lecturas enteras saldría ≥ 4 MiB.
- **Orden (R11).** En `onChunk(key, i)` con `i > 0`, `sink.received` ≥ bytes servidos hasta el trozo `i − 1`.
- **Mismo zip (R15).** Con `Date` simulada: el export por trozos y un zip montado en el test con `createDataExportZip` + `addFile` de `store.bytes(key)` enteros + el mismo documento tienen los mismos bytes (sha256 incluido por construcción).
- **Dispositivo (R7–R9).** Mock de `@capacitor/filesystem` con `stat` y un `readFile` que sirve `subarray(offset, offset + length)` de un buffer y registra cada llamada.

## Alternativas descartadas

1. **`readFileInChunks`**: el nativo empuja los trozos sin contrapresión (inunda el WebView, igual que en #75 alt. 3) y no tiene versión web.
2. **`fetch(Capacitor.convertFileSrc(uri))` y `response.body.getReader()`**: bytes sin base64 y contrapresión de streams, pero depende de cómo `WebViewLocalServer` sirve `_capacitor_file_` (no verificado aquí), cambia el modelo de errores (HTTP en vez de «does not exist») y abre una vía de lectura distinta del resto del almacén. Candidata si el coste cuadrático de `readFull` resultara lento.
3. **Trozos del tamaño de `appendFile` (512 KiB)**: menos llamadas al bridge, pero duplica el coste cuadrático por byte de `readFull` (~32 copias por byte frente a ~16).
4. **`readChunks` opcional con *fallback* a `read`**: dos caminos en el export y el del almacén en memoria no mediría lo mismo que el del dispositivo.
5. **Zip en código nativo**: fuera de alcance por la descripción de la feature.

## Decisiones a validar (Gate 1)

1. **`EXPORT_READ_BYTES` = 256 KiB.** Balance entre llamadas al bridge (~1800 para 442 MB) y el coste cuadrático de `readFull` (~10 GB de copias de `String` en Kotlin). La prueba en dispositivo (T11) mide también el tiempo frente a los ~5 min de #75; si empeora claramente, bajar a 128 KiB es cambiar la constante.
2. **R12 con cota de 2 trozos** (no 1), para no atar la implementación a no anticipar lecturas.
3. **R3 (una entrada abierta a la vez) lanza error** en vez de encolar: un uso incorrecto se ve en los tests en lugar de retener memoria en silencio.

## Riesgos

- **Coste de CPU/GC en la app** por la concatenación de `readFull`: puede alargar el export; se mide en T11.
- **El pico del renderer no se prueba en CI**: los tests miden la tubería con dobles; la mejora real (acceptance 5) depende de la prueba en dispositivo de T11. El `JSON.stringify` de `data.json` sigue siendo entero, como en #75.
- **Fichero borrado durante el export**: con lecturas por trozos se detecta a mitad de entrada y el export falla con 500 en vez de omitirlo; solo ocurre si el usuario borra mientras se exporta.
- **Versión del plugin**: requiere `@capacitor/filesystem` ≥ 8.1.0 (fijado a 8.1.5). Una versión que ignorase el rango la detecta R8 en vez de producir un zip corrupto.

## Fuera de alcance

- Zip en código nativo, barra de progreso, cancelar y lectura anticipada.
- `files.get`, informe de venta y `saveFile`/`openFile` nativos siguen leyendo el fichero entero.
