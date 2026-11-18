# Tasks — mobile-local-export-streaming

## A. Escritor de zip compartido

- [ ] T1 — `packages/shared/src/data-export-zip.ts`: `DataExportZipChunk`, `DataExportZipStream` y `streamDataExportZip(onChunk)`; `createDataExportZip()` reimplementado sobre él con la misma firma. Cubre: R1, R2.
- [ ] T2 — Tests en `packages/shared/src/data-export-zip.test.ts`: `streams the chunks of a file before addFile returns` (tras `addFile` de 4 KiB el callback ya ha recibido ≥ 4 KiB y nada antes de `finish` queda retenido) y `streams the same bytes as createDataExportZip` (concatenación byte a byte igual con dos ficheros y un documento). Los dos tests existentes pasan sin cambios. Cubre: R1, R2.
- [ ] T3 — `clientBuiltZip()` de `apps/api/test/data-import.test.ts` con `streamDataExportZip` y un array local; `imports a zip built with the shared builder and zip writer` y `builds the same document as GET /api/me/export` pasan sin cambiar aserciones. Cubre: R3.

## B. Tubería del export local

- [ ] T4 — `apps/web/src/lib/data-source/local/export-sink.ts` (`LocalExportSink`, `OpenExportSink`, `openMemoryExportSink`); `DeviceFile` y `ExportedFile` en `apps/web/src/lib/data-source/types.ts` y `dataPortability.export(): Promise<ExportedFile>`; `LocalDeps.exportSink?` en `local/files.ts`. Cubre: R9.
- [ ] T5 — `apps/web/src/lib/data-source/local/data-export.ts`: `streamDataExportZip` + cola `pending` + `await flush()` tras cada `addFile` y tras `finish`; errores de `sink.write` → Problem 500 `Could not write the export`; `sink.abort()` en cualquier fallo. Cubre: R4, R5, R7, R8.
- [ ] T6 — Helper `apps/web/src/test/measuring-export-sink.ts` (`createMeasuringExportSink`, escrituras que resuelven en un macrotask) y `bytesRead`/`onRead` en `apps/web/src/test/memory-file-store.ts`. Cubre: R4, R5.
- [ ] T7 — Tests en `apps/web/src/lib/data-source/local/local-export.test.ts`: `writes each file to the sink before reading the next one` (8 adjuntos de 1 MiB), `keeps at most one file read and not yet written` (máximo de `bytesRead − received` ≤ 1 MiB con > 8 MiB escritos), `writes the same zip as the in-memory export` (fake timers; bytes iguales y `data.json` válido con `dataExportSchema`), `aborts the sink when a file cannot be read` (`failOn.add('read')` → 500 y `aborted`), `rejects with a 500 and aborts the sink when writing fails` (`Could not write the export`). Los cinco tests de #66 pasan con un helper que exige `blob` en el resultado. Cubre: R4, R5, R6, R7, R8, R9.

## C. Destino del dispositivo

- [ ] T8 — `apps/web/src/lib/native-files.ts`: extraer `bytesToBase64(bytes)` y usarla en `blobToBase64`. `encodes large blobs to base64 without the data: prefix` de `native-files.test.ts` sigue en verde. Cubre: R11.
- [ ] T9 — `apps/web/src/lib/native-export.ts`: `EXPORT_DIR`, `EXPORT_APPEND_BYTES`, `openDeviceExportSink` (rmdir + `writeFile` vacío, `appendFile` en serie por porciones, `close` sin leer, `abort` que no rechaza) y `shareExportFile`. Cubre: R10, R11, R12, R13, R14, R15, R16.
- [ ] T10 — Tests en `apps/web/src/lib/native-export.test.ts` (mock de `@capacitor/filesystem` con disco en memoria y de `@capacitor/share`): `clears earlier exports and creates the file empty`, `appends each chunk in base64 slices of at most 512 KiB` (trozo de 1,2 MiB → 3 `appendFile`, ninguna `data` mayor que el base64 de 512 KiB, contenido decodificado igual, ningún `writeFile` con datos), `returns the cache file on close without reading it`, `removes the file on abort and never rejects`, `shares the export from its file uri`, `keeps the file and resolves when the share sheet is cancelled` (rechazo «Share canceled» → resuelve y el fichero sigue en el disco, ningún `deleteFile`), `removes the file and rejects when sharing fails`, `keeps the file after it is shared`. Cubre: R10, R11, R12, R13, R14, R15, R16.

## D. Web

- [ ] T11 — `saveExportedFile` en `apps/web/src/lib/download.ts`; `data-section.tsx` lo usa en `startExport`; `local-mode.ts` pasa `exportSink: openDeviceExportSink` cargando `@/lib/native-export`. Cubre: R14, R17.
- [ ] T12 — Tests en `apps/web/src/lib/download.test.ts`: `web: saves an exported blob with downloadBlob` y `native: shares a device file through native-export`. `native: saves the export zip with its name` y los tests de modo servidor de `apps/web/src/features/data-portability/data-section.test.tsx` pasan sin cambiar aserciones. Cubre: R14, R17.
- [ ] T13 — Tests en `apps/web/src/features/mobile/local-mode.test.tsx` (mock de `@/lib/native-export` con `createMeasuringExportSink` y `shareExportFile: vi.fn()`): `exports the local data through the share sheet` pasa a comprobar que `shareExportFile` recibe `ikrive-export-<hoy>.zip`, que el zip del «disco» valida con `dataExportSchema` y que no se llama a `saveFile`; `shows a toast when the local export fails` comprueba además `aborted` y que no se comparte; nuevo `shows a toast when sharing the export fails` (`shareExportFile` rechaza → «No se ha podido generar el export»). Cubre: R7, R14, R16.
- [ ] T14 — Sin claves nuevas en `apps/web/src/i18n/locales/{es,en}.json` (si el implementer añade alguna, en los dos); `es and en define the same keys` de `apps/web/src/i18n/locales.test.ts` en verde. Cubre: R18.

## E. Cierre

- [ ] T15 — Ejecutar `pnpm harness --full` y documentar trazabilidad en `progress/impl_mobile-local-export-streaming.md`. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18.
