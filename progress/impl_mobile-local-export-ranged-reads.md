# Implementación — mobile-local-export-ranged-reads (#80)

Rama `feat/mobile-local-export-ranged-reads`. Tasks T1–T12 marcadas en `specs/mobile-local-export-ranged-reads/tasks.md`. Sin commits.

## Cambios por archivo

### Escritor de zip compartido
- `packages/shared/src/data-export-zip.ts`: `DataExportZipEntry` (`push(data, final?)`) y `openFile(path)` en `DataExportZipStream` (ZipPassThrough). `addFile` = `openFile(path).push(data, true)`. Un flag `open` hace que `openFile`, `addFile` y `finish` lancen `Error('Another zip entry is still open')` antes de llamar a fflate. `push` sobre una entrada ya cerrada también lanza (ver desviaciones). `createDataExportZip` no cambia.
- `packages/shared/src/data-export-zip.test.ts`: nuevo `describe('streamDataExportZip openFile')` con 3 tests. Los 4 tests anteriores no cambian.
- `apps/api/test/data-import.test.ts`: `clientBuiltZip()` copia cada fichero con `openFile` en trozos de 64 KiB (`CLIENT_PIECE_BYTES`) y un `push(new Uint8Array(0), true)` final. No cambia ninguna aserción.

### Almacén local
- `apps/web/src/lib/data-source/local/files.ts`: `readChunks(key, chunkBytes): AsyncIterable<Uint8Array>`, obligatorio en `LocalFileStore`. `fileBytes` se mantiene porque lo usan `vehicles.ts`, `attachments.ts` y `sale-report.ts`.
- `apps/web/src/test/memory-file-store.ts`: `readChunks` es un `async function*` con `check('read')` y una sola llamada a `onRead(key)` al empezar. Lanza `MissingFileError` en el primer `next()`, entrega `slice`s de como mucho `chunkBytes` y suma cada trozo a `bytesRead` al entregarlo. Hook nuevo `onChunk(key, index)`, que se llama antes de servir cada trozo.
- `apps/web/src/lib/native-storage.ts`: `readChunks` es un `async function*`. Primero hace `Filesystem.stat`; un «does not exist» da `MissingFileError`. Luego un bucle `offset < size` con `length = min(chunkBytes, size − offset)` y `readFile({ path, directory, offset, length })`, que acepta un string base64 o un `Blob`. Un trozo de tamaño distinto al pedido lanza `Error('Unexpected read of <key>: <n> bytes instead of <length>')`. Con 0 bytes no llama a `readFile`.
- `apps/web/src/lib/native-storage.test.ts`: mock ampliado con `stat`, `serveRanges(file)` (sirve `subarray(offset, offset + length)` en base64) y 5 tests nuevos. Los 4 tests anteriores no cambian.

### Export local
- `apps/web/src/lib/data-source/local/data-export.ts`: `EXPORT_READ_BYTES = 256 * 1024`. `copyFile(path, key)` sustituye a `read` + `addFile` y funciona así:
  1. Pide el primer `next()` de `readChunks`. Un `MissingFileError` devuelve `false` y el fichero se omite; cualquier otro error da el Problem 500 `Could not read a file of the export`.
  2. Abre `openFile(path)` y, por cada trozo, hace `push` → `await flush()` → `next()`. Un fallo de lectura a mitad da el mismo Problem 500.
  3. Cierra con `push(new Uint8Array(0), true)` → `await flush()`.

  No cambian el orden, `attachmentIds`/`photoVehicleIds`, `data.json` al final, `sink.close()`/`abort()` ni el Problem de escritura. Se quita el import de `fileBytes`.
- `apps/web/src/lib/data-source/local/local-export.test.ts`: helper `seedPdfs(count, size)`, que sustituye a `seedBigFiles` y devuelve el vehículo, y 5 tests nuevos. `keeps at most one file read and not yet written` se sustituye por `keeps at most two chunks read and not yet written`, como permite T9. El resto de tests de #66/#75 no cambian.
- `apps/web/src/features/mobile/local-mode.test.tsx`: sin cambios, en verde (T10).

## Trazabilidad

| R | Test(s) |
|---|---|
| R1 | `packages/shared/src/data-export-zip.test.ts` › `streams each piece of an open file before push returns` |
| R2 | `data-export-zip.test.ts` › `streams the same bytes for a file pushed in pieces as with addFile` (1 MiB + 3 en trozos de 256 KiB y un fichero vacío) |
| R3 | `data-export-zip.test.ts` › `throws when an entry is still open` |
| R4 | `apps/api/test/data-import.test.ts` › `imports a zip built with the shared builder and zip writer`, `builds the same document as GET /api/me/export` (con `clientBuiltZip` por trozos) |
| R5 | `apps/web/src/lib/native-storage.test.ts` › `reads a file in ranges of at most the chunk size`, `reads the next range only when asked`; almacén en memoria: `local-export.test.ts` › `reads each file in chunks and never whole` |
| R6 | `native-storage.test.ts` › `rejects a missing file before the first range`; `local-export.test.ts` › `skips files missing from the device` (almacén en memoria) |
| R7 | `native-storage.test.ts` › `reads a file in ranges of at most the chunk size` (offsets 0/262144/524288, `length` entre 1 y 256 KiB) |
| R8 | `native-storage.test.ts` › `rejects a range of an unexpected size` |
| R9 | `native-storage.test.ts` › `reads an empty file without readFile` |
| R10 | `local-export.test.ts` › `reads each file in chunks and never whole` (`store.read` sin llamadas; `readChunks` con `EXPORT_READ_BYTES`; trozos ≤ 256 KiB) |
| R11 | `local-export.test.ts` › `writes the pending pieces before reading the next chunk` |
| R12 | `local-export.test.ts` › `keeps at most two chunks read and not yet written` (3 × 4 MiB; máx. `bytesRead − received` ≤ 512 KiB) |
| R13 | `local-export.test.ts` › `skips files missing from the device` |
| R14 | `local-export.test.ts` › `rejects with a 500 when a file cannot be read`, `aborts the sink when a file cannot be read` (antes de abrir) y `rejects with a 500 and aborts the sink when a file fails mid-read` (`onChunk` lanza en el trozo 1) |
| R15 | `local-export.test.ts` › `writes the same zip as one built from whole files` (`Date` simulada; bytes iguales a `createDataExportZip` + `addFile` enteros) |
| R16 | `local-export.test.ts` › tests con `exportBlob()` (`exports a zip whose data.json satisfies dataExportSchema`, `names the zip after today…`, `copies every stored file with its bytes`) y `writes the same zip as the in-memory export`; `apps/web/src/features/mobile/local-mode.test.tsx` › `exports the local data through the share sheet`, `shows a toast when the local export fails` |

Mutación: si se quita el `await flush()` por trozo de `copyFile`, fallan `writes the pending pieces before reading the next chunk` (R11) y `keeps at most two chunks read and not yet written` (R12). Después se restauró el código.

## T11 — Prueba en dispositivo

- **Dispositivo:** HONOR ABR-NX1 por `adb`, APK debug compilada en local con JDK 21 desde esta rama (`build:web` → `cap sync` → `assembleDebug`) e instalada con `adb install -r`. Antes de instalar se comprobó que el bundle contiene `Unexpected read of`. App en modo local.
- **Copia de seguridad previa:** `~/ikrive-backups/2026-11-19-pre-80/` (`data.tar` con `databases`, `files`, `shared_prefs`, `app_webview` y `no_backup`; `manifest.sha256` con 23 ficheros).
- **Datos sembrados:** vehículo `test-export-80` con 1 mantenimiento y 24 PDF de 15–20 MB (contenido aleatorio tras `%PDF-1.7`), 450 MB en total. Con los datos previos, el export tiene 37 adjuntos y 3 fotos (~488 MB). Las filas se insertaron en una copia de la BD y se subieron con `run-as cp`.
- **Medición:** export lanzado por CDP sobre la WebView (clic en «Descargar mis datos»). Durante el export, `dumpsys meminfo` de la app (pid 8474) y del renderer `sandboxed_process0` de la app (pid 17787, el que `dumpsys activity processes com.ikrive.app` asocia a la app), con 1376 muestras. Datos en bruto: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/ead82f02-7c32-414c-8707-0e47aef88176/scratchpad/mem1.txt`.

| | Antes | Durante (máx.) | Después |
|---|---|---|---|
| Renderer del WebView, PSS | 69 MB | **205 MB** | 137 MB |
| Renderer del WebView, RSS | 153 MB | **284 MB** | 217 MB |
| App, PSS | 193 MB | 225 MB | 171 MB |
| App, RSS | 343 MB | 379 MB | 304 MB |

- **Frente a #75:** el pico del renderer baja de ~1,07 GB a 284 MB RSS / 205 MB PSS, unas 4–5 veces menos. La app pasa de ≤ 405 MB a ≤ 379 MB RSS.
- **Tiempo:** 395 s para un zip de 488 MB (~1,2 MB/s). #75 tardó ~5 min con 496 MB, así que es un **~30 % más lento**, probablemente por la concatenación cuadrática de `readFull` (Riesgo y Decisión 1 de `design.md`). La UI no mostró ningún toast de error.
- **Integridad:** zip extraído con `run-as cat` de `cache/exports/ikrive-export-2026-11-19.zip`: 41 entradas, `testzip` sin errores de CRC y 40/40 ficheros referenciados (37 adjuntos y 3 fotos). Cada uno coincide en sha256 y `size` con `data.json` y byte a byte con el original. No hay entradas sin referenciar.
- **Import:** `POST /api/me/import` con una cuenta nueva en una API local (build de producción, `DATA_DIR` temporal) → **201**: 6 vehículos, 22 lecturas, 5 planes, 10 mantenimientos, 37 adjuntos y 3 fotos.
- **Restauración:** app parada, borrados los 24 PDF sembrados y `cache/exports`, BD original repuesta. Un nuevo `tar` de `databases`, `files` y `shared_prefs` coincide con el manifiesto salvo `files/profileInstalled`, el marcador de perfil ART que Android reescribe al reinstalar la APK (no son datos del usuario). BD y `uploads` son idénticos. Se borraron los temporales grandes (zip, PDF y `DATA_DIR` de la API).

## `pnpm harness --full`

```
[OK]    82 features: 81 done, 0 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #80 mobile-local-export-ranged-reads (in_progress)
[OK]    Rama actual: feat/mobile-local-export-ranged-reads
[OK]    pnpm lint
[OK]    pnpm typecheck
        e2e 6 · shared 190 · db 3 · api 373 · web 715 (100 ficheros)
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones del spec

1. **`push` sobre una entrada ya cerrada lanza** `Error('The zip entry <path> is already closed')`. `design.md` no lo menciona. Es una salvaguarda de uso incorrecto en la misma línea que R3; sin ella, fflate fallaría de forma menos clara.
2. **`copyFile` devuelve `boolean`**, como el `false` de `design.md` C.1, y los bucles añaden el id solo si es `true`.
3. **Test sustituido:** `keeps at most one file read and not yet written` pasa a ser `keeps at most two chunks read and not yet written`, como permite T9. `seedBigFiles` se sustituye por `seedPdfs(count, size)` y el test de #75 que la usaba sigue con 8 × 1 MiB.

## Para el leader / Gate 2

- **Decisión 1 (256 KiB):** el export es ~30 % más lento que en #75 (395 s frente a ~5 min) y la memoria del renderer baja 4–5 veces. `design.md` dice que, «si empeora claramente, bajar a 128 KiB es cambiar la constante». No lo he cambiado: decidir si un 30 % es «claramente» le toca al humano.
- Sin cambios de UI: no hay capturas.
