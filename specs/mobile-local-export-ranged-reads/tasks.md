# Tasks — mobile-local-export-ranged-reads

## A. Escritor de zip compartido

- [ ] T1 — `packages/shared/src/data-export-zip.ts`: `DataExportZipEntry` y `openFile(path)` en `streamDataExportZip` (ZipPassThrough, `push(data, final)`); `addFile` sobre `openFile`; contador de entrada abierta que hace lanzar a `openFile`/`addFile`/`finish`. Cubre: R1, R2, R3.
- [ ] T2 — Tests en `packages/shared/src/data-export-zip.test.ts`: `streams each piece of an open file before push returns`, `streams the same bytes for a file pushed in pieces as with addFile` (1 MiB + 3 bytes en trozos de 256 KiB y un fichero vacío; concatenación igual byte a byte) y `throws when an entry is still open` (`openFile`, `addFile` y `finish` con otra abierta; el callback no recibe nada). Los tests existentes pasan sin cambios. Cubre: R1, R2, R3.
- [ ] T3 — `clientBuiltZip()` de `apps/api/test/data-import.test.ts` con `openFile` y trozos de 64 KiB; `imports a zip built with the shared builder and zip writer` y `builds the same document as GET /api/me/export` pasan sin cambiar aserciones. Cubre: R4.

## B. Almacén local

- [ ] T4 — `readChunks(key, chunkBytes): AsyncIterable<Uint8Array>` en `LocalFileStore` (`apps/web/src/lib/data-source/local/files.ts`). Cubre: R5, R6.
- [ ] T5 — `readChunks` y hook `onChunk` en `apps/web/src/test/memory-file-store.ts` (`onRead` una vez, `bytesRead` por trozo, `failOn.read`, `MissingFileError` en el primer `next()`). Cubre: R5, R6.
- [ ] T6 — `readChunks` en `apps/web/src/lib/native-storage.ts` con `Filesystem.stat` + `Filesystem.readFile({ offset, length })`, sin `readFile` para 0 bytes y con error si el trozo no mide lo pedido. Cubre: R6, R7, R8, R9.
- [ ] T7 — Tests en `apps/web/src/lib/native-storage.test.ts` (mock con `stat` y `readFile` que sirve el rango): `reads a file in ranges of at most the chunk size` (600 KiB + 1 con trozos de 256 KiB → 3 llamadas con offsets 0/262144/524288, todas con `length` ≥ 1, bytes iguales), `reads the next range only when asked`, `rejects a missing file before the first range` (`stat` «does not exist» → `MissingFileError`, sin `readFile`), `rejects a range of an unexpected size` (`readFile` devuelve el fichero entero) y `reads an empty file without readFile`. Los cuatro tests existentes pasan sin cambios. Cubre: R5, R6, R7, R8, R9.

## C. Export local

- [ ] T8 — `apps/web/src/lib/data-source/local/data-export.ts`: `EXPORT_READ_BYTES`, `copyFile` con `readChunks` + `openFile` + `await flush()` por trozo, omisión de `MissingFileError` en el primer trozo y Problem 500 `Could not read a file of the export` en cualquier otro fallo de lectura. Cubre: R10, R11, R13, R14, R16.
- [ ] T9 — Tests en `apps/web/src/lib/data-source/local/local-export.test.ts`: `reads each file in chunks and never whole` (espía de `store.read` sin llamadas; cada trozo ≤ `EXPORT_READ_BYTES`), `writes the pending pieces before reading the next chunk`, `keeps at most two chunks read and not yet written` (3 adjuntos de 4 MiB: máximo de `bytesRead − received` ≤ 2 × `EXPORT_READ_BYTES`), `writes the same zip as one built from whole files` (`Date` simulada, bytes iguales a `createDataExportZip` + `addFile` enteros) y `rejects with a 500 and aborts the sink when a file fails mid-read` (`onChunk` lanza en el trozo 1). `skips files missing from the device`, `rejects with a 500 when a file cannot be read`, `exports a zip whose data.json satisfies dataExportSchema` y el resto de tests de #66/#75 pasan sin cambiar aserciones (`keeps at most one file read and not yet written` puede sustituirse por el nuevo). Cubre: R10, R11, R12, R13, R14, R15, R16.
- [ ] T10 — `exports the local data through the share sheet` y `shows a toast when the local export fails` de `apps/web/src/features/mobile/local-mode.test.tsx` en verde con el almacén en memoria nuevo. Cubre: R16.

## D. Dispositivo y cierre

- [ ] T11 — Prueba manual en el móvil (APK debug, modo local, copia de seguridad previa como en #75): ~400 MB en adjuntos de 15–20 MB; pico del renderer del WebView (`adb shell dumpsys meminfo` del proceso `sandboxed_process` durante el export), memoria de la app, tiempo total, sha256 de todas las entradas frente a los originales e import con 201 en una API local. Resultado frente a ~1,07 GB / ~5 min de #75 documentado en `progress/impl_mobile-local-export-ranged-reads.md`; datos restaurados al terminar. Cubre: R7, R10, R12.
- [ ] T12 — Ejecutar `pnpm harness --full` y documentar trazabilidad en `progress/impl_mobile-local-export-ranged-reads.md`. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16.
