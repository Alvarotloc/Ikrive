# Tasks — mobile-local-files

## A. `packages/shared`

- [x] T1 — Crear `packages/shared/src/domain/files.ts` con `detectAttachmentType` y `DetectedType` (sobre `Uint8Array`), `sanitizeFileName`, `MAX_FILE_NAME_LENGTH` y `detectPhotoFormat`/`PhotoFormat`; exportarlo desde `src/index.ts`. Cubre: R1, R2, R11. _(Desde #71, AVIF se detecta como `'avif'`; el `null` es para HEIC.)_
- [x] T2 — Tests en `packages/shared/src/domain/files.test.ts`: `detects PDF, JPEG, PNG and WebP by their signature`, `returns null for other contents`, `detects the photo formats the API accepts` (JPEG, PNG, WebP, GIF, TIFF; `null` para AVIF, BMP y texto), `keeps the base name of the declared file name` (rutas `/` y `\`, espacios, 255 caracteres sin partir pares sustitutos, vacío → `file.<ext>`). Cubre: R1, R2, R11.
- [x] T3 — La API usa el código compartido: borrar `apps/api/src/lib/file-type.ts`; `attachments/service.ts` y `data-import/service.ts` importan `detectAttachmentType` y `sanitizeFileName` de `@ikrive/shared`; `apps/api/test/file-type.test.ts` importa de `@ikrive/shared` sin cambiar aserciones. `attachments.test.ts`, `vehicles.test.ts` y `data-import.test.ts` pasan sin cambiar aserciones. Cubre: R1, R2, R3.

## B. Dependencias de la DataSource local

- [x] T4 — `apps/web/src/lib/data-source/local/files.ts`: interfaces `LocalFileStore`, `LocalImages`, `LocalDeps`; `localPhotoUrl`, `localAttachmentUrl`, `parseLocalUrl`; `assertWebp`; `assertUploadSize`. Cubre: R6, R12, R14, R16.
- [x] T5 — Dobles de test: `apps/web/src/test/memory-file-store.ts` (`createMemoryFileStore`, con `keys()` y opción de fallo) y `apps/web/src/test/fake-images.ts` (`fakeImages`: decodable según firma y marca de corrupto, salida WebP mínima, tamaño pedido registrado, opción de salida no WebP). Cubre: R4, R10, R12, R15.
- [x] T6 — `createLocalDataSource(db, deps)` en `local/index.ts`; actualizar sus llamadas (`local-data-source.test.ts`, `features/mobile/local-mode.ts`). Cubre: R25.

## C. Adjuntos, foto y ficheros en local

- [x] T7 — `local/attachments.ts` (`list`, `upload`, `remove`, replicando `attachments/{service,repository}.ts`) y conexión en `index.ts`. Cubre: R4, R5, R6, R7, R8, R9, R19.
- [x] T8 — Foto en `local/vehicles.ts`: `toDto` con `photoUrl` local, `setPhoto` y `removePhoto`. Cubre: R10, R11, R12, R13, R19.
- [x] T9 — Cascadas: `local/maintenance.ts` › `remove` y `local/vehicles.ts` › `remove` borran filas de adjuntos en la transacción y después los ficheros (y la foto). Cubre: R17, R18.
- [x] T10 — `local/files-get.ts` (`files.get`: foto, original con o sin `?inline=1`, miniatura al vuelo con `assertWebp`; búsqueda en la cola, lectura fuera) y conexión en `index.ts`. Cubre: R14, R15, R16.
- [x] T11 — Tests en `apps/web/src/lib/data-source/local/local-files.test.ts` (Node, base en memoria + `createMemoryFileStore` + `fakeImages`): `uploads an attachment with its detected type, hash and sanitized name` (DTO con `attachmentSchema.parse`, sha256 de los bytes, clave `attachments/<uuid>.pdf` en el almacén, `thumbnailUrl` solo en imágenes), `rejects unsupported or corrupt attachments with 415 and writes nothing`, `rejects files over maxUploadMb with 413 and writes nothing` (adjunto y foto), `lists attachments in upload order`, `deletes an attachment and its file`, `rejects attachments of unknown vehicles, records or ids with 404`. Cubre: R4, R5, R6, R7, R8, R9.
- [x] T12 — Tests en `local-files.test.ts`: `stores the photo as WebP and replaces the previous one` (tamaño pedido 1600, clave `vehicles/<uuid>.webp`, la anterior borrada, `photoUrl` local distinto tras cada foto, `vehicleSchema.parse`), `rejects an unsupported photo with 400 and keeps the current one`, `rejects when the device does not produce WebP` (foto y miniatura, nada guardado), `removes the photo and its file`. Cubre: R10, R11, R12, R13.
- [x] T13 — Tests en `local-files.test.ts`: `files.get returns the photo, the original and the thumbnail` (tipos, `fileName` = `originalName` solo en el original, `?inline=1` ignorado, miniatura pedida a 320), `files.get rejects unknown or foreign urls with 404` (`/api/…`, id inexistente, miniatura de un PDF). Cubre: R14, R15, R16.
- [x] T14 — Tests en `local-files.test.ts`: `deleting a maintenance record deletes its attachments and files`, `deleting a vehicle deletes its attachments, files and photo` (filas de `attachments` vacías y almacén vacío; un fallo del almacén al borrar no rechaza), `removes the stored file when the database write fails` (adjunto y foto, con un insert/update que falla). Cubre: R17, R18, R19.
- [x] T15 — Actualizar `local-data-source.test.ts` › `rejects unsupported operations with 501`: sin foto, adjuntos ni `files.get`; el resto sigue en 501 sin sentencias ni escrituras en el almacén. Cubre: R25.

## D. Adaptadores del dispositivo

- [x] T16 — `local/canvas-images.ts` (`createCanvasImages`, `fitInside`) y test `canvas-images.test.ts`: `fits inside the box without enlarging`, `decodes with the EXIF orientation and encodes WebP` (1600/0,8 y 320/0,7, `imageOrientation: 'from-image'`, `close()` del bitmap), `rejects when the image does not decode`. Cubre: R10, R15, R21.
- [x] T17 — `apps/web/src/lib/native-storage.ts` (`createDeviceFileStore`) y test `native-storage.test.ts` con `@capacitor/filesystem` simulado: `writes under uploads in Directory.Data with a random key`, `reads a file back as a blob of its type`, `ignores removing a missing file`. Añadir `storage` a `NATIVE_ONLY_MODULES` en `features/pwa/config.ts` (`native-only.test.ts` en verde). Cubre: R20.
- [x] T18 — `features/mobile/local-mode.ts` construye la DataSource con `createDeviceFileStore()` y `createCanvasImages()` cargados con `import()`. Cubre: R20, R21.

## E. Web

- [x] T19 — `lib/api-files.ts` › `filesViaDataSource()`; usarla en `useApiFileSrc`, `maintenance-attachments.tsx` y `attachment-viewer.tsx`. Test en `apps/web/src/lib/api-files.test.tsx` › `local mode: loads files through the data source`. Cubre: R24.
- [x] T20 — Quitar las condiciones de modo local de `PhotoPicker` (`edit.tsx`), `AttachmentPicker` (`maintenance-form.tsx`) y `onAttachments` (`maintenance-timeline.tsx`). Cubre: R22, R23.
- [x] T21 — En `apps/web/src/features/mobile/local-mode.test.tsx` (mocks de `native-storage` y `canvas-images`): renombrar y reescribir `vehicle page hides the sale report and the photo picker` → `vehicle page shows the photo picker and hides the sale report` (sube una foto y la ficha la pinta como `blob:` sin peticiones) y `maintenance hides attachments` → `maintenance shows attachments` (sube una factura desde el diálogo, la ve listada y la borra; sin peticiones). Cubre: R22, R23, R24.
- [x] T22 — `src/i18n/locales.test.ts` › `es and en define the same keys` en verde con cualquier texto nuevo. Cubre: R26.

## F. Cierre

- [x] T23 — Documentar en `docs/mobile.md` (foto y adjuntos en local, almacenamiento privado que se borra al desinstalar; quitar «adjuntos y foto» de lo que falta) y en `CONTRIBUTING.md` › DataSource local (`LocalDeps`, dobles de test). Cubre: R20.
- [x] T24 — Escribir en `progress/impl_mobile-local-files.md` la checklist manual para el humano con la APK de depuración antes de Gate 2: foto vertical de la cámara (orientación correcta, se ve en la lista y la ficha), cambiar y quitar la foto, subir PDF y JPG a un mantenimiento, ver la miniatura y el visor, abrir el PDF y descargar, borrar un adjunto, borrar el mantenimiento y el vehículo, reiniciar la app con fotos y facturas; capturas en claro, oscuro y móvil. Cubre: R20, R21.
- [x] T25 — Ejecutar `pnpm harness --full` y documentar trazabilidad en `progress/impl_mobile-local-files.md`. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21, R22, R23, R24, R25, R26.
