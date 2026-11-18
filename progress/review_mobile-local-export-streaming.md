# Review — #75 mobile-local-export-streaming

**Veredicto:** APPROVED

Revisado sobre `git diff main...HEAD` (spec, explores, `feature_list.json`) + cambios sin commitear + ficheros nuevos sin trackear (`export-sink.ts`, `native-export.ts`, `native-export.test.ts`, `measuring-export-sink.ts`, `impl_*.md`).

## Trazabilidad requirements ↔ tests

- R1: [x] `packages/shared/src/data-export-zip.test.ts` › `streams the chunks of a file before addFile returns`: justo tras `addFile` (antes de `finish`) el callback ya tiene ≥ 4 KiB y los bytes en `30 + path.length` son exactamente `data`; tras `finish` la entrada es `{ compression: 0, data }`.
- R2: [x] `data-export-zip.test.ts` › `streams the same bytes as createDataExportZip`: concatenación byte a byte igual con dos ficheros y el documento. Los dos tests previos de `createDataExportZip` no cambian.
- R3: [x] `apps/api/test/data-import.test.ts`: solo cambia `clientBuiltZip()` (ahora `streamDataExportZip` + array local); las aserciones de `imports a zip built with the shared builder and zip writer` y `builds the same document as GET /api/me/export` no cambian y pasan. La API sigue validando el zip del cliente.
- R4: [x] `apps/web/src/lib/data-source/local/local-export.test.ts` › `writes each file to the sink before reading the next one`: en cada `onRead` comprueba `received ≥ Σ tamaños anteriores` con 8 ficheros de 1 MiB y > 8 MiB escritos. Con un `flush` solo al final, la segunda lectura vería `received = 0` y fallaría.
- R5: [x] `local-export.test.ts` › `keeps at most one file read and not yet written`: máximo de `bytesRead − received` medido en cada `read` y en cada entrega a `write` (antes de que aterrice, en un macrotask) ≤ 1 MiB, con `held > 0` (la medida corre de verdad) y `bytesRead = 8 MiB`. Sin contrapresión, el valor retenido llegaría a ~8 MiB y el test fallaría.
- R6: [x] `local-export.test.ts` › `writes the same zip as the in-memory export`: con la fecha fijada, `sink.written()` es igual byte a byte al `Blob` del destino en memoria, `data.json` valida con `dataExportSchema`, el resultado es el `DeviceFile` esperado y el último evento es `close`.
- R7: [x] `local-export.test.ts` › `aborts the sink when a file cannot be read` (500 + `aborted` + sin `close`) y `rejects with a 500 and aborts the sink when writing fails`; `local-mode.test.tsx` › `shows a toast when the local export fails` (`aborted` y no se comparte).
- R8: [x] `local-export.test.ts` › `rejects with a 500 and aborts the sink when writing fails`: Problem exacto `{ type, title, status: 500, detail: 'Could not write the export' }`.
- R9: [x] Los 5 tests de #66 en `local-export.test.ts` pasan por `exportBlob()`, que exige `blob` (tipo `application/zip` y nombre `ikrive-export-<hoy>.zip` afirmados).
- R10: [x] `apps/web/src/lib/native-export.test.ts` › `clears earlier exports and creates the file empty` (`rmdir` recursivo de `exports` antes de `writeFile` con `data: ''`, el export antiguo desaparece y `files/` se conserva) y `opens even when there is no earlier export and sanitizes the name`.
- R11: [x] `native-export.test.ts` › `appends each chunk in base64 slices of at most 512 KiB`: 1,2 MiB dan 3 `appendFile`, ninguna `data` supera el base64 de 512 KiB, el contenido decodificado coincide y el único `writeFile` va vacío.
- R12: [x] `native-export.test.ts` › `returns the cache file on close without reading it`: `close` da `{ fileName, uri, path }` y no se llama a `readFile` ni a `stat`.
- R13: [x] `native-export.test.ts` › `removes the file on abort and never rejects`: el fichero se borra y `abort` resuelve tanto si el fichero ya no existe como si `deleteFile` rechaza.
- R14: [x] `native-export.test.ts` › `shares the export from its file uri` (`Share.share({ files: [URI] })`, sin `readFile`); `download.test.ts` › `native: shares a device file through native-export`; `local-mode.test.tsx` › `exports the local data through the share sheet`.
- R15: [x] `native-export.test.ts` › `keeps the file and resolves when the share sheet is cancelled`: con «Share canceled» la promesa resuelve, no hay ningún `deleteFile` y el fichero sigue en el disco simulado.
- R16: [x] `native-export.test.ts` › `removes the file and rejects when sharing fails` (`deleteFile` y relanza); `local-mode.test.tsx` › `shows a toast when sharing the export fails` (aparece el toast «No se ha podido generar el export»).
- R17: [x] `download.test.ts` › `web: saves an exported blob with downloadBlob` (con nombre y con el nombre de reserva; no carga ningún módulo nativo) y `native: saves an exported blob through native-files`; los tests de `data-section.test.tsx` no cambian.
- R18: [x] No hay claves nuevas (no se tocan `apps/web/src/i18n/`). `locales.test.ts` está en verde. `files.shareTitle` ya existía; el test afirma «Guardar o compartir».

## Tasks

- T1..T15: [x]

## Checkpoints

- C1: [x] El arnés está en verde, hay una sola feature activa (#75 `in_progress`) y la rama es `feat/mobile-local-export-streaming`.
- C2: [x] El spec está completo y en EARS, su tabla cubre los acceptance y cada R<n> tiene un test leído y concreto.
- C3: [x] El diff se ciñe a `design.md`. Dos desviaciones están justificadas: `NATIVE_ONLY_MODULES` en `pwa/config.ts`, que exige CONTRIBUTING.md l.42, y el estrechamiento de tipo en `http.test.tsx`, que es solo de tipos (no cambian las aserciones ni `http.ts`).
- C4: [x] Sin cambios de API ni de BD. La web carga `native-export` solo con `import()` (`local-mode.ts`, `download.ts`) y en `export-sink.ts` usa `import type`. La lógica pura (`streamDataExportZip`) está en `packages/shared` con tests. Errores como Problem 500.
- C5: [x] Sin `any`, `@ts-ignore`, `console.log` ni TODOs.
- C6: [x] `pnpm harness --full` en verde (web 661, api 371). Los tests afirman resultados concretos y la API usa SQLite en memoria. Sin cambios de UI, así que no hacen falta capturas (justificado en impl).
- C7: [x] El informe `impl_*.md` tiene los archivos, el mapa R→test y la salida. `current.md` está al día. `PLAN.md` no necesita cambios, porque la fase 8 sigue abierta con #71, #77 y #79 pendientes.

## Hallazgos

Ninguno bloqueante. Lo comprobado sobre los puntos pedidos:

1. **El zip completo nunca está en memoria en el nativo.**
   - `data-export.ts` ya no crea ningún `Blob`. Los trozos van de `pending` a `sink.write` y se descartan con `shift()`.
   - `native-export.ts` codifica en base64 solo porciones `subarray` de ≤ 512 KiB, y `close` no lee el fichero.
   - El único `Blob` que queda es el de `openMemoryExportSink`, que en la app nativa no se usa porque `local-mode.ts` inyecta `openDeviceExportSink`.
2. **La contrapresión es real.** `await flush()` va justo después de cada `addFile` y antes del siguiente `read` (`data-export.ts`, bucles de adjuntos y fotos), y también después de `finish`. `sink.write` del dispositivo espera cada `appendFile` en serie. `measuring-export-sink.ts` registra un trozo como recibido solo en un macrotask posterior, así que una implementación que no espere sus escrituras no puede aparentar haberlas terminado.
3. **Borrado del fichero.**
   - Un fallo de lectura, escritura o construcción del documento después de abrir el destino lleva a `sink.abort()`, que borra el fichero sin rechazar (R7, R13).
   - Un fallo de `Share.share` que no sea una cancelación borra el fichero y relanza (R16).
   - «Share canceled» resuelve sin borrar (R15).
   - Al compartir con éxito, el fichero se queda.

## Avisos para el humano (no bloquean)

- R4/R5 detectan con claridad una implementación que no vacía la cola por fichero. Una variante que lanzara los `write` sin esperarlos («fire-and-forget») también acabaría reteniendo varios MiB. Que el test la detecte depende de que `Blob.arrayBuffer()` del almacén en memoria resuelva antes que el `setTimeout(0)` del destino medido. Es lo esperable en Node, pero no lo he comprobado modificando código, porque está prohibido tocar `apps/`.
- Desviación 4 del impl: si `rmdir` falla por otra causa o falla el `writeFile` inicial, el error sube como `Error` y no como Problem. La UI muestra igualmente el toast del export local y todavía no hay nada que borrar.
- En el dispositivo, leer cada adjunto sigue costando ~5× su tamaño en memoria transitoria (decisión 3 de Gate 1). Conviene medirlo en la prueba manual con la APK y un export de 300–500 MB que ya figura en «Notas del humano».

## Cambios requeridos

Ninguno.
