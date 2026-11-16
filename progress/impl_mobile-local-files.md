# Implementación — mobile-local-files (#65)

Rama `feat/mobile-local-files`. Sin commits (los hace el leader tras Gate 2). Sin cambios de BD ni de contrato HTTP.

## Cambios por archivo

### A. `packages/shared` y API

| Archivo | Cambio |
|---|---|
| `packages/shared/src/domain/files.ts` (nuevo) | `detectAttachmentType` y `DetectedType` (sobre `Uint8Array`), `detectPhotoFormat`/`PhotoFormat` (JPEG, PNG, WebP, GIF87a/89a, TIFF II/MM), `sanitizeFileName` y `MAX_FILE_NAME_LENGTH = 255` |
| `packages/shared/src/domain/files.test.ts` (nuevo) | 4 tests con firmas escritas a mano |
| `packages/shared/src/index.ts` | `export * from './domain/files'` |
| `apps/api/src/lib/file-type.ts` | Borrado |
| `apps/api/src/modules/attachments/service.ts` | Importa `detectAttachmentType` y `sanitizeFileName` de `@ikrive/shared`; ya no exporta `sanitizeFileName` |
| `apps/api/src/modules/data-import/service.ts` | Ídem |
| `apps/api/test/file-type.test.ts` | Solo cambia el import (mismas aserciones, sigue usando `sharp`) |

### B/C. DataSource local (`apps/web/src/lib/data-source/local/`)

| Archivo | Cambio |
|---|---|
| `files.ts` (nuevo) | `LocalFileStore`, `LocalImages`, `LocalDeps`; `LOCAL_MAX_UPLOAD_MB = 20`; `localPhotoUrl`, `localAttachmentUrl`, `parseLocalUrl`; `assertWebp` (500 `This device cannot encode WebP images`); `assertUploadSize` (413 `request file too large`); `fileBytes`; `removeFiles` (borra uno a uno e ignora fallos, decisión 3) |
| `attachments.ts` (nuevo) | `localAttachments(db, deps)`: `list` (orden `createdAt, rowid`), `upload` (tamaño → bytes → tipo 415 → decodificable 415 → sha256 con `crypto.subtle` → `files.save` → insert; si el insert falla, borra el fichero), `remove` (fila y después fichero). `requireAttachment` y `deleteMaintenanceAttachments(tx, recordIds)` exportados |
| `vehicles.ts` | `localVehicles(db, deps)` devuelve el grupo completo: `photoUrl` local en `toDto`, `setPhoto` (tamaño 413 → `detectPhotoFormat` 400 → `toWebpPhoto` 400 → `assertWebp` 500 → save → update; si el update falla, borra la nueva; después borra la anterior), `removePhoto`; `remove` borra las filas de adjuntos de sus mantenimientos (subconsulta) y el vehículo en una transacción y después los ficheros y la foto |
| `maintenance.ts` | `localMaintenance(db, { files })`: `remove` borra las filas de adjuntos en la transacción y después sus ficheros |
| `files-get.ts` (nuevo) | `localFiles(db, deps, queue)`: foto (`image/webp`, `fileName: null`), original (su tipo, `fileName: originalName`, `?inline=1` ignorado), miniatura al vuelo (`toWebpThumbnail` + `assertWebp`, 404 `Only images have a thumbnail` para PDF). La búsqueda de la fila va por la cola; la lectura y la miniatura, fuera. Cualquier otra URL → 404 `Not Found` |
| `index.ts` | `createLocalDataSource(db, deps)`; foto, adjuntos y `files.get` ya no son `reject`; `LOCAL_CLIENT_CONFIG.maxUploadMb` usa `LOCAL_MAX_UPLOAD_MB`; reexporta los tipos de `files.ts` |
| `canvas-images.ts` (nuevo) | `createCanvasImages(env?)` con `createImageBitmap(blob, { imageOrientation: 'from-image' })` y `<canvas>.toBlob('image/webp', q)`; `fitInside` pura; `env` (`decode`, `createCanvas`) inyectable; `close()` del bitmap tras dibujar |
| `local-data-source.test.ts` | Construye con `createMemoryFileStore()` + `fakeImages()`; el test de 501 ya no incluye foto, adjuntos ni `files.get` y además afirma que el almacén queda vacío |
| `local-files.test.ts` (nuevo) | 15 tests (ver trazabilidad) |
| `canvas-images.test.ts` (nuevo) | 3 tests |

### Adaptadores, web y dobles

| Archivo | Cambio |
|---|---|
| `apps/web/src/lib/native-storage.ts` (nuevo) | `createDeviceFileStore()` sobre `@capacitor/filesystem` en `Directory.Data`, `uploads/<clave>`; `save` reutiliza `blobToBase64` de `native-files.ts`; `read` acepta base64 (dispositivo) o `Blob` (web del plugin); `remove` ignora «does not exist» y relanza cualquier otro error |
| `apps/web/src/lib/native-storage.test.ts` (nuevo) | 3 tests con el plugin simulado |
| `apps/web/src/features/pwa/config.ts` | `storage` en `NATIVE_ONLY_MODULES` (el build lo manda a `assets/native/native-storage-*.js`, comprobado con `pnpm --filter @ikrive/web build`) |
| `apps/web/src/features/mobile/local-mode.ts` | Carga con `import()` `native-storage` y `canvas-images` y construye la DataSource con ellos |
| `apps/web/src/lib/api-files.ts` | `filesViaDataSource() = isServerMode() \|\| isLocalMode()`; `useApiFileSrc` la usa |
| `apps/web/src/lib/api-files.test.tsx` | Test nuevo `local mode: loads files through the data source` |
| `apps/web/src/features/maintenance/maintenance-attachments.tsx`, `attachment-viewer.tsx` | `filesViaDataSource()` en lugar de `isServerMode()` |
| `apps/web/src/routes/_app/vehicles/$vehicleId/edit.tsx` | `PhotoPicker` siempre visible |
| `apps/web/src/features/maintenance/maintenance-form.tsx` | `AttachmentPicker` en el alta también en local |
| `apps/web/src/features/maintenance/maintenance-timeline.tsx` | `onAttachments` siempre definido; `MaintenanceRow` vuelve a recibirlo como `() => void` obligatorio (estado previo a #54) |
| `apps/web/src/features/vehicles/photo-picker.tsx` | Comentario: quien redimensiona es la DataSource |
| `apps/web/src/features/mobile/local-mode.test.tsx` | Mocks de `native-storage` (almacén en memoria) y `canvas-images` (`fakeImages`); tests reescritos y renombrados (ver trazabilidad) |
| `apps/web/src/test/memory-file-store.ts` (nuevo) | `createMemoryFileStore()`: `Map<clave, bytes>`, `keys()`, `bytes(key)`, `failOn` (`save`/`read`/`remove`) |
| `apps/web/src/test/fake-images.ts` (nuevo) | `fakeImages({ output? })`: decodifica lo que tiene firma de foto y no contiene `CORRUPT`, devuelve un WebP mínimo y registra el tamaño pedido en `requested` (1600/320); `webpBytes`, `CORRUPT` |

### Docs

- `docs/mobile.md`: en local ya hay foto y facturas, en el almacenamiento privado de la app (se borran al desinstalar); fuera de «Qué no está todavía» y de «Limitaciones conocidas».
- `CONTRIBUTING.md` › DataSource local: `LocalDeps`, adaptadores del dispositivo, dobles de test y `filesViaDataSource()`.

## Trazabilidad

| R | Archivo › test |
|---|---|
| R1 | `packages/shared/src/domain/files.test.ts` › `detects PDF, JPEG, PNG and WebP by their signature`, `returns null for other contents`; `apps/api/test/file-type.test.ts` (importa de `@ikrive/shared`); `local-files.test.ts` › `uploads an attachment with its detected type, hash and sanitized name` |
| R2 | `files.test.ts` › `keeps the base name of the declared file name`; `local-files.test.ts` › `uploads an attachment with its detected type, hash and sanitized name` |
| R3 | `apps/api/test/{file-type,attachments,vehicles,data-import}.test.ts` sin cambiar aserciones (solo el import de `file-type.test.ts`) |
| R4 | `local-files.test.ts` › `uploads an attachment with its detected type, hash and sanitized name` |
| R5 | `local-files.test.ts` › `rejects unsupported or corrupt attachments with 415 and writes nothing` |
| R6 | `local-files.test.ts` › `rejects files over maxUploadMb with 413 and writes nothing` |
| R7 | `local-files.test.ts` › `lists attachments in upload order` |
| R8 | `local-files.test.ts` › `deletes an attachment and its file`; `local-mode.test.tsx` › `maintenance shows attachments` |
| R9 | `local-files.test.ts` › `rejects attachments of unknown vehicles, records or ids with 404` |
| R10 | `local-files.test.ts` › `stores the photo as WebP and replaces the previous one`; `canvas-images.test.ts` › `fits inside the box without enlarging`, `decodes with the EXIF orientation and encodes WebP` |
| R11 | `files.test.ts` › `detects the photo formats the API accepts`; `local-files.test.ts` › `rejects an unsupported photo with 400 and keeps the current one` |
| R12 | `local-files.test.ts` › `rejects when the device does not produce WebP` |
| R13 | `local-files.test.ts` › `removes the photo and its file` |
| R14 | `local-files.test.ts` › `files.get returns the photo, the original and the thumbnail` |
| R15 | `local-files.test.ts` › `files.get returns the photo, the original and the thumbnail` (miniatura a 320); `canvas-images.test.ts` › `decodes with the EXIF orientation and encodes WebP` |
| R16 | `local-files.test.ts` › `files.get rejects unknown or foreign urls with 404` |
| R17 | `local-files.test.ts` › `deleting a maintenance record deletes its attachments and files` |
| R18 | `local-files.test.ts` › `deleting a vehicle deletes its attachments, files and photo` |
| R19 | `local-files.test.ts` › `removes the stored file when the database write fails` |
| R20 | `native-storage.test.ts` › `writes under uploads in Directory.Data with a random key`, `reads a file back as a blob of its type`, `ignores removing a missing file`; `features/pwa/native-only.test.ts`; checklist del dispositivo |
| R21 | `canvas-images.test.ts` › `decodes with the EXIF orientation and encodes WebP`, `rejects when the image does not decode`; checklist del dispositivo |
| R22 | `local-mode.test.tsx` › `vehicle page shows the photo picker and hides the sale report` |
| R23 | `local-mode.test.tsx` › `maintenance shows attachments` |
| R24 | `api-files.test.tsx` › `local mode: loads files through the data source`; `local-mode.test.tsx` › `vehicle page shows the photo picker and hides the sale report` (la ficha pinta `blob:`, nunca `local:`), `maintenance shows attachments` (sin peticiones) |
| R25 | `local-data-source.test.ts` › `rejects unsupported operations with 501` (sin sentencias ni ficheros) |
| R26 | `src/i18n/locales.test.ts` › `es and en define the same keys` (no hay textos nuevos: se reutilizan `vehicles.photo.*`, `maintenance.attachments.*`, `common.*`) |

## `pnpm harness --full`

```
apps/web test:  Test Files  83 passed (83)
apps/web test:       Tests  542 passed (542)
apps/api test:  Test Files  38 passed (38)
apps/api test:       Tests  368 passed (368)
packages/shared test:  Test Files  23 passed (23)
packages/shared test:       Tests  169 passed (169)
packages/db test:  Tests  3 passed (3)
apps/mobile test: pass 27, fail 0
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test
[OK]    Arnés en verde.
```

Además, `pnpm --filter @ikrive/web build` coloca `native-storage` en `assets/native/` (fuera del precache).

## Desviaciones y notas

- **Capturas (verificación visual):** no se han sacado con `pnpm dev`. El modo local solo existe en el build nativo (`isNativeApp()` es el flag de build `MODE === 'native'`) y necesita el plugin de SQLite del dispositivo, así que no se puede abrir en el navegador de escritorio. La UI no cambia: son los mismos componentes que en modo servidor (`PhotoPicker`, diálogo de facturas, visor). Las capturas en claro, oscuro y móvil quedan en la checklist del dispositivo (abajo).
- **`MaintenanceRow.onAttachments`** vuelve a ser obligatorio (`() => void`) y el botón se pinta siempre, igual que antes de #54. El diseño solo pedía quitar la condición del modo local; dejar el tipo opcional sin ningún llamador que pase `undefined` habría sido código muerto.
- **`LOCAL_MAX_UPLOAD_MB`** se define en `files.ts` y `LOCAL_CLIENT_CONFIG` lo usa, para que `assertUploadSize` y la config compartan el límite sin un import circular con `index.ts`.
- **Cascada del vehículo:** se hace en `vehicles.ts` con una subconsulta sobre `maintenance_records` en vez de importar `deleteMaintenanceAttachments` de `attachments.ts`, porque `attachments.ts` ya importa `requireVehicle` de `vehicles.ts` (se evita el ciclo).
- **Foto anterior y borrados:** un fallo al borrar el fichero de la foto anterior tampoco rechaza la operación (misma regla que la decisión 3; la foto nueva ya está guardada).
- **Errores de BD en R19:** la DataSource relanza el error de drizzle (`Failed query: …`), no un Problem; el test afirma ese mensaje y que el almacén queda como estaba. La UI muestra `common.error` como con cualquier error no 4xx.

## Checklist manual del dispositivo (antes de Gate 2)

Con la APK de depuración (`apps/mobile`, `pnpm --filter @ikrive/mobile …` / Android Studio), en un móvil real, modo «En este teléfono»:

1. [ ] **Foto vertical de la cámara:** editar un vehículo › «Añadir foto» › hacer o elegir una foto en vertical. Se ve derecha (orientación EXIF aplicada) en la edición, en la ficha y en la lista de vehículos y en `/odometer`.
2. [ ] **Cambiar la foto** por otra (horizontal): la ficha y la lista muestran la nueva, no la anterior.
3. [ ] **Quitar la foto:** vuelve el icono del tipo de vehículo.
4. [ ] **Imagen no admitida** (p. ej. un HEIC o un fichero que no sea imagen, si el selector lo permite): aparece el toast «No se pudo usar esa imagen…» y la foto no cambia.
5. [ ] **Subir un PDF y un JPG** a un mantenimiento desde «Facturas de «…»» y también al crear un mantenimiento nuevo (sección «Facturas» del formulario).
6. [ ] **Miniatura y visor:** el JPG muestra su miniatura (bloque gris mientras carga) y al tocarlo se abre el visor con la imagen completa y bien orientada; «Descargar» abre la hoja de compartir.
7. [ ] **Abrir el PDF:** se abre con el visor de PDF del sistema; al volver, la app sigue en el diálogo. «Descargar» abre la hoja de compartir con el nombre original.
8. [ ] **Borrar un adjunto:** desaparece de la lista tras confirmar.
9. [ ] **Borrar un mantenimiento con facturas** y **borrar un vehículo con foto y facturas:** desaparecen sin errores.
10. [ ] **Reiniciar la app** (cerrarla del todo y abrirla) con fotos y facturas: siguen viéndose (miniaturas, visor, PDF).
11. [ ] **Ficheros en disco (opcional, con `adb`):** `adb shell run-as <applicationId> ls -R files/uploads` muestra `vehicles/<uuid>.webp` y `attachments/<uuid>.<ext>`, y tras los borrados del punto 9 ya no están esos ficheros.
12. [ ] **Capturas** en claro, oscuro y tamaño móvil de: edición del vehículo con foto, ficha con foto, diálogo de facturas con un PDF y una imagen, y el visor. Anota sus rutas aquí.

Si algo falla, la feature vuelve a `in_progress`.
