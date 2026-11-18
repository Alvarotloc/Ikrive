# Explore — #75 mobile-local-export-streaming: export local actual (#66)

> Informe de un agente `Explore` (solo lectura), guardado por el leader.

## 1. Generación del zip

**Función:** `localDataPortability(db, {files}, queue).export()` en `apps/web/src/lib/data-source/local/data-export.ts:117-169`. Se conecta en `apps/web/src/lib/data-source/local/index.ts:70` como `dataPortability: { import: reject, ...localDataPortability(db, deps, queue) }`. El import local sigue devolviendo 501.

Pasos que sigue:
1. Dentro de `queue.run` (SerialQueue) lee con `loadLocalExportRows(db)` (`data-export.ts:40-109`) y `localSettings(db).get()`. Hace una consulta por tabla, en el mismo orden que el `data-export/repository.ts` de la API:
   - vehicles: `createdAt`, rowid
   - odometerReadings: `date`, `createdAt`, rowid
   - schedules: `createdAt`, rowid
   - records: `date`, `createdAt`, rowid
   - fuelLogs: `date`, `createdAt`, rowid
   - attachments: `createdAt`, rowid (`entityType='maintenance'` de registros propios)
   - `notificationChannels: []`
   Los ficheros se leen fuera de la cola.
2. Lee los ficheros de uno en uno y en serie:
   - **Primero los adjuntos**, en el orden de `rows.attachments` (l.141-146): `files.read(storageKey, mimeType)`, luego `fileBytes()` (que es `new Uint8Array(await blob.arrayBuffer())`, `apps/web/src/lib/data-source/local/files.ts:108`), y después `zip.addFile(attachmentExportPath(id, mime), bytes)`.
   - **Después las fotos**, en el orden de `rows.vehicles` (l.147-154), con la ruta `photoExportPath(id)` y el mime `image/webp`.
   - Si salta `MissingFileError`, el fichero se omite. Cualquier otro error da `problem(500, 'Internal Server Error', 'Could not read a file of the export')` (l.123-130).
3. `buildDataExport({rows, settings, appVersion: LOCAL_APP_VERSION, exportedAt, present: {attachmentIds, photoVehicleIds}})` (l.156-162).
   - El constructor está en `packages/shared/src/domain/data-export-builder.ts:124`. Devuelve `{document, files}`, quita ownerIds y storage keys, y solo referencia lo que está en `present`.
   - `LOCAL_APP_VERSION` sale de `VITE_IKRIVE_VERSION`, con `'0.0.0-dev'` como valor por defecto.
4. Devuelve `{ blob: new Blob(zip.finish(document), {type:'application/zip'}), fileName: 'ikrive-export-${todayIn(tz)}.zip' }` (l.163-166).

**Librería de zip:** `fflate` `^0.8.3` (la instalada es la 0.8.3).
- Dependencia en `apps/web/package.json:60` y en `packages/shared/package.json:18`.
- El escritor está en `packages/shared/src/data-export-zip.ts` y se exporta solo por el subpath `@ikrive/shared/data-export-zip` (`packages/shared/package.json:8`):
  - `createDataExportZip()` usa `new Zip(cb)` de fflate.
  - `addFile(path, data)` usa `ZipPassThrough`, es decir, sin compresión.
  - `finish(document)` mete `data.json` con `ZipDeflate` nivel 6 y `JSON.stringify(doc, null, 2)`, va al final, llama a `zip.end()` y devuelve el array de chunks.
- **¿Hay streaming?** fflate ya es streaming: el callback `ondata` va entregando chunks según se hace `push`, y en `ZipPassThrough`/`ZipDeflate` lo hace de forma síncrona. El problema es que hoy los chunks se **acumulan en memoria** (`chunks.push(ownBuffer(chunk))`, l.28-34) y solo se devuelven en `finish`.
  - Para la #75 basta con sacar un callback o sink en lugar del array.
  - Cada `entry.push(data, true)` puede trocearse con varios `push(chunk, false)`.
- El diseño de la #66 (`specs/mobile-local-export/design.md`) deja anotado:
  - l.58: pone `data.json` al final por memoria. El pico es aproximadamente el tamaño del zip más un fichero. El import indexa por el directorio central.
  - l.100: por qué se descartaron jszip, client-zip y zip.js.
  - l.116: riesgo de quedarse sin memoria en el WebView por tener el zip entero en memoria más el base64.
  - l.124: barra de progreso, escritura en streaming a disco y límite de tamaño quedan fuera de alcance, que es justo la #75.
- La API no usa este escritor: sigue con `yazl` en streaming.

## 2. Cómo llega el zip al usuario

- **Interfaz:** `apps/web/src/lib/data-source/types.ts`:
  - l.41-45: `DownloadedFile { blob: Blob; fileName: string | null }`.
  - l.137-141: `dataPortability: { import(file); export(): Promise<DownloadedFile> }`.
  - En HTTP es `export: () => api.download('/me/export')` (`apps/web/src/lib/data-source/http.ts:130`).
- **UI:** `startExport` (`apps/web/src/features/data-portability/data-section.tsx:79-86`) hace `exportData.mutateAsync()` y luego `downloadBlob(fileName ?? 'ikrive-export.zip', blob)`. El hook `useExportData` es un `useMutation` sobre `dataSource().dataPortability.export()` (`apps/web/src/features/data-portability/queries.ts:12-16`).
- **`downloadBlob`** (`apps/web/src/lib/download.ts:8-23`):
  - **Nativo** (`isNativeApp()`): `import('./native-files')` y `saveFile(fileName, blob)`.
  - **Web**: `URL.createObjectURL`, un `<a download>` temporal con `click()` y `revokeObjectURL` en el siguiente tick. No hay ningún `await` antes del clic, para conservar el gesto del usuario.
- **`native-files.ts`** (`apps/web/src/lib/native-files.ts`):
  - `blobToBase64` (l.33-40): `blob.arrayBuffer()`, `String.fromCharCode` en trozos de 0x8000 y `btoa`. Eso es el zip entero en memoria, más el string binario, más el base64.
  - `writeToCache` (l.48-56): `Filesystem.writeFile({ path: 'files/<safeFileName>', data: base64, directory: Directory.Cache, recursive: true })` y devuelve el `uri`. Es una sola llamada; no se usa `appendFile`.
  - `saveFile` (l.59-66): `Share.share({ title, files: [uri], dialogTitle: i18n 'files.shareTitle' })`. Si el usuario cancela (`/share canceled/i`), no se trata como error.
  - `openFile` usa `FileOpener`.
- **Web sin plugin:**
  - Modo navegador normal (ni local ni `isServerMode`): es un enlace simple `<a href="/api/me/export" download>` (`data-section.tsx:113-119`, `EXPORT_URL` en `queries.ts:6`). El navegador hace el streaming directamente a disco.
  - Modo local o modo servidor con token: pasa por el botón y `downloadBlob`. En la web eso es un blob en memoria y `<a download>`.
  - El modo local solo existe en la app nativa, así que en la práctica siempre pasa por `Filesystem` y `Share`.

## 3. Tests que cubren el export

**`apps/web/src/lib/data-source/local/local-export.test.ts`**
- Usa la `DataSource` local real sobre `createMemorySqlite` (`@/test/memory-sqlite`), `createMemoryFileStore` (`apps/web/src/test/memory-file-store.ts`, con `keys()`, `bytes()`, `remove()` y `failOn: Set<'save'|'read'|'remove'>`) y `fakeImages()` (`@/test/fake-images`).
- Descomprime con `unzipSync` de fflate.
- Tests:
  - l.83: `data.json` pasa `dataExportSchema`. También comprueba settings, orden de vehículos y lecturas, schedules, records, adjuntos (path, sha256, size), fuel, que no salgan storage keys ni `ownerId`, y `blob.type`.
  - l.152: nombre del fichero según la zona horaria (`vi.useFakeTimers` sobre Date, Pacific/Kiritimati).
  - l.164: entradas y bytes idénticos a los del almacén.
  - l.187: omite ficheros que faltan; el schema sigue siendo válido y `photoPath` es null.
  - l.204: con `failOn.add('read')` devuelve el problem 500.

**`packages/shared/src/data-export-zip.test.ts`**
- l.50: los ficheros van sin comprimir bajo su ruta.
- l.63: `data.json` va en la raíz y formateado. Lo lee con `Unzip`/`UnzipInflate` en streaming.

**`apps/api/test/data-import.test.ts`**
- `clientBuiltZip()` (l.384-413) reproduce el flujo del teléfono con `createDataExportZip` y `buildDataExport`, leyendo de `uploads/`.
- l.827: el zip valida con `dataExportSchema`, tiene las mismas entradas que `GET /api/me/export`, se sube por `POST /api/me/import` con un 201, se reexporta y sale igual con los mismos bytes.
- l.858: el documento coincide con el de `GET /api/me/export` salvo `exportedAt` y `appVersion`.

**`apps/web/src/features/mobile/local-mode.test.tsx`**
- Mocks:
  - `@/lib/native-sqlite` con la SQLite en memoria.
  - `@/lib/native-storage` con `createMemoryFileStore` (l.34-38).
  - `canvas-images`, `native-notifications`, `native-app-state` y `sale-report-pdf`.
  - `nativeFiles = { saveFile, openFile }` con `vi.fn()` (l.119).
- Tests:
  - l.351: la tarjeta solo muestra export.
  - l.366: el export llega a `saveFile` con el nombre `ikrive-export-<hoy>.zip` y `application/zip`, y `data.json` se parsea con `dataExportSchema`.
  - l.384: con `failOn.add('read')` sale el toast «No se ha podido generar el export» y no se llama a `saveFile`.

**`apps/web/src/features/data-portability/data-section.test.tsx`**
- Mock de `@/lib/native-files` en l.23.
- l.285 y l.312: modo servidor, con token y con toast de error.
- l.323: estado en curso (botón deshabilitado y texto «exporting»).
- l.365 y l.386: en nativo llama a `saveFile` con nombre y blob, y hay toast si falla.

**`apps/web/src/lib/native-files.test.ts`**
- Mocks de `@capacitor/filesystem` (`writeFile`), `@capacitor/share` y `@capacitor-community/file-opener` (l.5-10).
- Cubre la ruta en cache saneada (l.28), base64 de blobs grandes sin prefijo `data:` (l.46), share sheet, cancelación, open por MIME y rechazos.

**`apps/web/src/lib/download.test.ts`**
- Web: `<a download>` sin cargar el módulo nativo.
- Nativo: delega en el mock de `./native-files` y propaga los rechazos.

**`apps/web/src/lib/data-source/http.test.tsx:65`**
- Export HTTP, con `fileName` tomado de `Content-Disposition`.

## 4. UI de progreso y cancelación

- Solo hay un indicador indeterminado: con `exportData.isPending` el botón se deshabilita y muestra `Loader2 animate-spin` y el texto `t('dataPortability.exporting')` (`data-section.tsx:100-112`).
- No hay porcentaje, ni barra de progreso, ni botón de cancelar, ni `AbortSignal` en `export()`. La firma `export(): Promise<DownloadedFile>` no recibe parámetros.
- Errores:
  - Local: toast `dataPortability.errors.export`.
  - Resto de modos: `common.fileError`.
- No hay ningún diálogo propio para el export; el `AlertDialog` del componente solo se usa para confirmar el import.

## Para la #75

Hay tres puntos de memoria hoy:
1. `chunks[]` en `createDataExportZip`.
2. `new Blob(...)` en `data-export.ts:164`.
3. `blobToBase64` más un único `Filesystem.writeFile` en `native-files.ts:33-56`.

`fileBytes` también carga cada fichero entero, aunque solo uno a la vez.
