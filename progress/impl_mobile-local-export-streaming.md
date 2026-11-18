# Implementación — mobile-local-export-streaming (#75)

Rama `feat/mobile-local-export-streaming`. Tasks T1–T15 marcadas en `specs/mobile-local-export-streaming/tasks.md`. Sin commits.

## Cambios por archivo

### Shared / API
- `packages/shared/src/data-export-zip.ts`: nuevos `DataExportZipChunk`, `DataExportZipStream` y `streamDataExportZip(onChunk)` (fflate `Zip` que entrega cada trozo al callback, sin acumular). `createDataExportZip()` es ahora un envoltorio que acumula los trozos; misma firma y comportamiento.
- `packages/shared/src/data-export-zip.test.ts`: 2 tests nuevos (`streamDataExportZip`).
- `apps/api/test/data-import.test.ts`: `clientBuiltZip()` usa `streamDataExportZip` con un array local; aserciones sin cambios.

### Tubería del export local
- `apps/web/src/lib/data-source/local/export-sink.ts` (nuevo): `LocalExportSink`, `OpenExportSink`, `openMemoryExportSink` (el `Blob` `application/zip` de #66; guarda vistas, no copias).
- `apps/web/src/lib/data-source/types.ts`: `DeviceFile`, `ExportedFile = DownloadedFile | DeviceFile`; `dataPortability.export(): Promise<ExportedFile>`.
- `apps/web/src/lib/data-source/local/files.ts`: `LocalDeps.exportSink?: OpenExportSink`.
- `apps/web/src/lib/data-source/local/data-export.ts`: `export()` abre el destino (`exportSink ?? openMemoryExportSink`) tras leer filas y ajustes; `streamDataExportZip` → cola `pending` → `flush()` después de cada `addFile` (antes del siguiente `read`) y después de `finish`; un fallo de `sink.write` → Problem 500 `Could not write the export`; cualquier fallo tras abrir → `await sink.abort()` y se relanza. Mismo orden y reglas de `MissingFileError`/500 de lectura que #66.
- `apps/web/src/test/measuring-export-sink.ts` (nuevo): `createMeasuringExportSink()` (`open`, `written()`, `received`, `aborted`, `events`, `onWrite` en la entrega de cada trozo, `failWrites`); cada `write` aterriza en un macrotask (`setTimeout(0)`); `close` devuelve `file:///cache/exports/<name>`.
- `apps/web/src/test/memory-file-store.ts`: `bytesRead` (acumulado de `read`) y `onRead(key)`.
- `apps/web/src/lib/data-source/local/local-export.test.ts`: helper `exportBlob()` que exige `blob` (los 5 tests de #66 lo usan) y 5 tests nuevos con el destino medido.

### Destino del dispositivo
- `apps/web/src/lib/native-files.ts`: `bytesToBase64(bytes)` extraída; `blobToBase64` la usa.
- `apps/web/src/lib/native-export.ts` (nuevo): `EXPORT_DIR = 'exports'`, `EXPORT_APPEND_BYTES = 512 KiB`, `openDeviceExportSink` (`rmdir exports/` recursivo ignorando «does not exist» → `writeFile` vacío `recursive` en `exports/<safeFileName>`; `write` en porciones ≤ 512 KiB con `appendFile` en serie; `close` devuelve `{ fileName, uri, path }` sin leer; `abort` = `deleteFile` que nunca rechaza) y `shareExportFile` (`Share.share({ title, files: [uri], dialogTitle })`; «Share canceled» → resuelve sin borrar; otro error → borra y relanza).
- `apps/web/src/lib/native-export.test.ts` (nuevo): mock de `@capacitor/filesystem` con disco en memoria y de `@capacitor/share`; 9 tests.
- `apps/web/src/features/pwa/config.ts`: `native-export` añadido a `NATIVE_ONLY_MODULES` (ver desviaciones).

### Web
- `apps/web/src/lib/download.ts`: `saveExportedFile(file, fallbackName)`: `'uri' in file` → `import('./native-export')` → `shareExportFile`; si no, `downloadBlob(fileName ?? fallbackName, blob)`.
- `apps/web/src/features/data-portability/data-section.tsx`: `startExport` usa `saveExportedFile`; mismos toasts.
- `apps/web/src/features/mobile/local-mode.ts`: carga `@/lib/native-export` en el mismo `Promise.all` y pasa `exportSink: openDeviceExportSink`.
- `apps/web/src/lib/download.test.ts`: 3 tests nuevos.
- `apps/web/src/features/mobile/local-mode.test.tsx`: mock de `@/lib/native-export` (destino medido + `shareExportFile: vi.fn()`); 2 tests actualizados y 1 nuevo.
- `apps/web/src/lib/data-source/http.test.tsx`: solo tipado (ver desviaciones).
- i18n: sin claves nuevas.

## Trazabilidad

| R | Test(s) |
|---|---|
| R1 | `packages/shared/src/data-export-zip.test.ts` › `streamDataExportZip` › `streams the chunks of a file before addFile returns` |
| R2 | `packages/shared/src/data-export-zip.test.ts` › `streams the same bytes as createDataExportZip`; los dos tests de `createDataExportZip` sin cambios |
| R3 | `apps/api/test/data-import.test.ts` › `imports a zip built with the shared builder and zip writer`, `builds the same document as GET /api/me/export` (con `streamDataExportZip`) |
| R4 | `apps/web/src/lib/data-source/local/local-export.test.ts` › `writes each file to the sink before reading the next one` |
| R5 | `local-export.test.ts` › `keeps at most one file read and not yet written` (máx. `bytesRead − received` ≤ 1 MiB con > 8 MiB escritos). Comprobado que R4 y R5 fallan si se quita el `flush()` por fichero |
| R6 | `local-export.test.ts` › `writes the same zip as the in-memory export` |
| R7 | `local-export.test.ts` › `aborts the sink when a file cannot be read`, `rejects with a 500 and aborts the sink when writing fails`; `apps/web/src/features/mobile/local-mode.test.tsx` › `shows a toast when the local export fails` |
| R8 | `local-export.test.ts` › `rejects with a 500 and aborts the sink when writing fails` |
| R9 | `local-export.test.ts` › los 5 tests de #66 con `exportBlob()` (`exports a zip whose data.json satisfies dataExportSchema`, `names the zip after today in the settings time zone`, …) |
| R10 | `apps/web/src/lib/native-export.test.ts` › `clears earlier exports and creates the file empty`, `opens even when there is no earlier export and sanitizes the name` |
| R11 | `native-export.test.ts` › `appends each chunk in base64 slices of at most 512 KiB`; `apps/web/src/lib/native-files.test.ts` › `encodes large blobs to base64 without the data: prefix` |
| R12 | `native-export.test.ts` › `returns the cache file on close without reading it` |
| R13 | `native-export.test.ts` › `removes the file on abort and never rejects` |
| R14 | `native-export.test.ts` › `shares the export from its file uri`; `apps/web/src/lib/download.test.ts` › `native: shares a device file through native-export`; `local-mode.test.tsx` › `exports the local data through the share sheet` |
| R15 | `native-export.test.ts` › `keeps the file and resolves when the share sheet is cancelled`, `keeps the file after it is shared` |
| R16 | `native-export.test.ts` › `removes the file and rejects when sharing fails`; `local-mode.test.tsx` › `shows a toast when sharing the export fails` |
| R17 | `download.test.ts` › `web: saves an exported blob with downloadBlob`, `native: saves an exported blob through native-files`; `data-section.test.tsx` (modo servidor y `native: saves the export zip with its name`) sin cambios |
| R18 | `apps/web/src/i18n/locales.test.ts` › `es and en define the same keys` (sin claves nuevas) |

## `pnpm harness --full`

```
[OK]    79 features: 75 done, 3 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #75 mobile-local-export-streaming (in_progress)
[OK]    Rama actual: feat/mobile-local-export-streaming
[OK]    pnpm lint
[OK]    pnpm typecheck
        e2e 6 · shared 185 · db 3 · web 661 (96 ficheros) · api 371 (38 ficheros) · mobile 30
[OK]    pnpm test
[OK]    Arnés en verde.
```

Además, `pnpm --filter @ikrive/web build` en verde: el chunk `native-export-*.js` sale en `assets/native/`.

## Desviaciones del spec

1. **`apps/web/src/features/pwa/config.ts`** (no aparece en `design.md`): `native-export` añadido a la regex de `NATIVE_ONLY_MODULES`. Lo exige `CONTRIBUTING.md` para todo `lib/native-*.ts` nuevo y `native-only.test.ts › sends every lib/native-*.ts to assets/native/` falla sin ello.
2. **`apps/web/src/lib/data-source/http.test.tsx`**: con `export(): Promise<ExportedFile>` el test `exports through GET /api/me/export with its file name` ya no compila al desestructurar `blob`; se estrecha el tipo con un `'blob' in exported` antes de las mismas aserciones. `http.ts` no cambia.
3. **Tests extra** no listados en tasks: `native-export.test.ts › opens even when there is no earlier export and sanitizes the name` y `download.test.ts › native: saves an exported blob through native-files` (el `Blob` sigue yendo a `saveFile` en la app nativa en modo servidor).
4. `openDeviceExportSink`: si `rmdir` falla por algo distinto de «does not exist», el export rechaza antes de crear el fichero (no hay nada que descartar). El spec no lo detalla.

## Sin verificar

- Sin cambios visibles de UI: no hay capturas.
- El comportamiento real en el dispositivo (bridge, OOM, export de 300–500 MB) no se prueba en CI; queda la prueba manual en la APK de «Notas del humano» antes de Gate 2.
