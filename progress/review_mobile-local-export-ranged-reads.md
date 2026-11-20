# Review — #80 mobile-local-export-ranged-reads

**Veredicto:** APPROVED

## Trazabilidad requirements ↔ tests
- R1: [x] `packages/shared/src/data-export-zip.test.ts` › `streams each piece of an open file before push returns` (tras cada `push`, el callback ya tiene cabecera + trozo exactos, sin esperar a `final`; el descriptor sale con el `final`).
- R2: [x] `data-export-zip.test.ts` › `streams the same bytes for a file pushed in pieces as with addFile` (1 MiB + 3 en trozos de 256 KiB y fichero vacío; concatenación igual byte a byte a `addFile`).
- R3: [x] `data-export-zip.test.ts` › `throws when an entry is still open` (`openFile`, `addFile` y `finish` lanzan con otra abierta; `received` vacío; después el zip sigue normal).
- R4: [x] `apps/api/test/data-import.test.ts` › `imports a zip built with the shared builder and zip writer` y `builds the same document as GET /api/me/export`, con `clientBuiltZip` por `openFile` en trozos de 64 KiB y aserciones sin cambiar.
- R5: [x] `apps/web/src/lib/native-storage.test.ts` › `reads a file in ranges of at most the chunk size`, `reads the next range only when asked` (ni `stat` ni `readFile` hasta el `next()`; un `readFile` por `next()`); almacén en memoria en `local-export.test.ts` › `reads each file in chunks and never whole`.
- R6: [x] `native-storage.test.ts` › `rejects a missing file before the first range` (`MissingFileError` con `key`, sin `readFile`; otro error se propaga tal cual); memoria indirectamente por `skips files missing from the device`.
- R7: [x] `native-storage.test.ts` › `reads a file in ranges of at most the chunk size` (llamadas exactas con `offset` 0/262144/524288 y `length` en [1, chunkBytes], bytes concatenados iguales).
- R8: [x] `native-storage.test.ts` › `rejects a range of an unexpected size` (mensaje concreto, no `MissingFileError`).
- R9: [x] `native-storage.test.ts` › `reads an empty file without readFile`.
- R10: [x] `apps/web/src/lib/data-source/local/local-export.test.ts` › `reads each file in chunks and never whole` (`store.read` sin llamadas, `readChunks` pedido con `EXPORT_READ_BYTES` 3 veces, 11 trozos ≤ 256 KiB).
- R11: [x] `local-export.test.ts` › `writes the pending pieces before reading the next chunk` (en cada `onChunk`, `received ≥ bytesRead`; 9 trozos con índice > 0). Mutación documentada: sin `flush()` por trozo falla.
- R12: [x] `local-export.test.ts` › `keeps at most two chunks read and not yet written` (3 × 4 MiB, máx. retenido ≤ 512 KiB y > 0).
- R13: [x] `local-export.test.ts` › `skips files missing from the device` (test de #75 sin cambios, ahora por `readChunks`).
- R14: [x] `local-export.test.ts` › `rejects with a 500 when a file cannot be read` / `aborts the sink when a file cannot be read` (antes de abrir, vía `failOn.read` en el primer `next()`) y `rejects with a 500 and aborts the sink when a file fails mid-read` (Problem exacto, `sink.aborted`, sin `close`).
- R15: [x] `local-export.test.ts` › `writes the same zip as one built from whole files` (`Date` simulada; `sink.written()` igual a `createDataExportZip` + `addFile` enteros + mismo documento; 4 adjuntos y 1 foto).
- R16: [x] `local-export.test.ts` › tests con `exportBlob()` (nombre, `dataExportSchema`, bytes de cada fichero) y `apps/web/src/features/mobile/local-mode.test.tsx` en verde sin cambios.

## Tasks
- T1..T12: [x] (T11 documentado con medición en dispositivo, integridad sha256 40/40, import 201 y restauración).

## Checkpoints
- C1: [x] `pnpm harness` verde; una sola feature activa (#80 `in_progress`); rama `feat/mobile-local-export-ranged-reads`.
- C2: [x] `requirements.md`, `design.md`, `tasks.md` presentes; EARS con un `DEBE` por requirement y tabla de acceptance completa; tasks `[x]`; cada R con test leído.
- C3: [x] El diff solo toca los ficheros de `design.md` (escritor zip, test de import, `files.ts`, `native-storage.ts`, almacén en memoria, `data-export.ts` y sus tests) más `progress/`. Sin refactors ajenos.
- C4: [x] Sin API/BD/UI nuevas. Lógica del zip en `packages/shared` con tests unitarios. Errores al cliente como Problem 500 (`problem(...)`); los `Error` del escritor/almacén son internos y se traducen a Problem en `copyFile`.
- C5: [x] Sin `any`, `@ts-ignore`, `console.log`, código comentado ni TODOs. Sin fechas ni kilometraje afectados. Sin ficheros subidos nuevos.
- C6: [x] `pnpm harness --full` en verde (ejecutado por el reviewer: lint, typecheck, test; api 373, web en verde). Tests con resultados concretos; sin mocks de BD (SQLite en memoria; solo se simula el plugin nativo). Sin UI: no aplican capturas.
- C7: [x] `progress/impl_mobile-local-export-ranged-reads.md` con archivos, mapa R → test y salida; `progress/current.md` describe la sesión; `docs/PLAN.md` no cambia (no cierra fase ni cambia decisión).

## Hallazgos
Ninguno bloqueante.

Revisado sin problemas:
- `native-storage.ts` `readChunks`: el `stat` va dentro del generador (perezoso, R5/R6); el `size` sale de `stat` y nunca se pide `length: 0` ni un `offset` fuera de rango; el «does not exist» de `stat` lo produce el mismo `FilesystemErrors.doesNotExist` de Kotlin que usa `isMissingFile`.
- `data-export.ts` `copyFile`: `MissingFileError` solo se omite en el primer `next()`; a mitad se convierte en 500 (como dice el design); el `flush()` va después de cada `push` y del `final`; los errores de escritura del sink siguen con su Problem.
- Fichero vacío existente en memoria: `!data` no es verdadero para un `Uint8Array(0)`, así que se crea la entrada vacía y se cierra con el `push` final (igual que `addFile`).

## Desviación declarada: `push` sobre una entrada ya cerrada lanza
Aceptable. `design.md` no lo prohíbe ni lo exige; no cambia el comportamiento de ningún requirement (todo uso correcto cierra con un único `final`) y es coherente con la Decisión 3 (hacer visibles los usos incorrectos). Además, el `closed` impide que un `push` tardío vuelva a tocar el flag `open` de otra entrada. Las otras dos desviaciones (`copyFile` devuelve `boolean`, sustitución del test de #75) están previstas en `design.md` C.1 y T9.

## Avisos para el humano (no bloquean)
- La salvaguarda de `push` sobre entrada cerrada (`packages/shared/src/data-export-zip.ts`, `Error('The zip entry <path> is already closed')`) no tiene test propio; si se quiere fijar el comportamiento, basta un `expect(() => entry.push(...)).toThrow(...)` en `throws when an entry is still open`.
- Decisión 1 (256 KiB): el export en dispositivo fue ~30 % más lento que #75 (395 s frente a ~5 min) a cambio de bajar el pico del renderer de ~1,07 GB a 284 MB RSS. El design deja al humano decidir si eso es «empeorar claramente» y bajar a 128 KiB.
- El iterador de `readChunks` no se cierra (`return()`) cuando falla la escritura a mitad de fichero; no retiene recursos nativos (cada `readFile` es independiente), así que no tiene consecuencias.
- El comentario de `finish` en `data-export-zip.ts` pasa de la anchura habitual de línea; lint lo acepta.

## Cambios requeridos
Ninguno.
