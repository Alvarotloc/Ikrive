# Design — mobile-local-files

Cuatro bloques: **A** la detección por bytes mágicos y `sanitizeFileName` pasan a `@ikrive/shared` (la API no cambia de comportamiento), **B** la DataSource local recibe dos dependencias inyectables, un almacén de ficheros y un procesador de imágenes, y con ellas implementa foto, adjuntos y `files.get`, **C** los adaptadores del dispositivo (`@capacitor/filesystem` y canvas), **D** la web vuelve a mostrar foto y adjuntos en modo local y los carga por `files.get`.

Sin cambios de BD (la tabla `attachments` y `vehicles.photo` ya existen en el esquema compartido) ni de contrato HTTP.

## A. `packages/shared`

| Archivo | Cambio |
|---|---|
| `packages/shared/src/domain/files.ts` (nuevo) | `detectAttachmentType(data: Uint8Array): DetectedType \| null` y `DetectedType` (movidos de `apps/api/src/lib/file-type.ts`, `Buffer` → `Uint8Array`); `sanitizeFileName(filename, extension)` y `MAX_FILE_NAME_LENGTH = 255` (movidos de `attachments/service.ts`); `detectPhotoFormat(data: Uint8Array): PhotoFormat \| null` (nuevo, solo lo usa el modo local, ver «Decisiones a validar» 1) |
| `packages/shared/src/domain/files.test.ts` (nuevo) | Firmas con bytes escritos a mano (sin `sharp`) y casos de `sanitizeFileName` |
| `packages/shared/src/index.ts` | `export * from './domain/files'` |
| `apps/api/src/lib/file-type.ts` | Se borra |
| `apps/api/src/modules/attachments/service.ts` | Importa `detectAttachmentType` y `sanitizeFileName` de `@ikrive/shared`; deja de exportar `sanitizeFileName` |
| `apps/api/src/modules/data-import/service.ts` | Ídem (antes importaba `sanitizeFileName` de `attachments/service`) |
| `apps/api/test/file-type.test.ts` | Importa de `@ikrive/shared`; mismas aserciones (sigue generando imágenes reales con `sharp`) |

```ts
export type PhotoFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'tiff';
export interface DetectedType { mimeType: AttachmentMimeType; extension: 'pdf' | 'jpg' | 'png' | 'webp' }
```

Firmas de `detectPhotoFormat`: JPEG/PNG/WebP como `detectAttachmentType`, GIF `GIF87a`/`GIF89a`, TIFF `II*\0`/`MM\0*`.

## B. DataSource local

### Dependencias inyectables

```ts
// apps/web/src/lib/data-source/local/files.ts
export interface LocalFileStore {
  /** Writes `data` under a new random key `<folder>/<uuid>.<extension>` and returns the key. */
  save(folder: 'attachments' | 'vehicles', data: Uint8Array, extension: string): Promise<string>;
  read(key: string, mimeType: string): Promise<Blob>;
  /** No-op when the file does not exist. */
  remove(key: string): Promise<void>;
}
export interface LocalImages {
  /** Rejects when `data` does not decode as an image. */
  assertDecodable(data: Uint8Array): Promise<void>;
  /** Oriented, ≤ 1600 px, WebP q 0.8. Rejects when it does not decode. */
  toWebpPhoto(data: Uint8Array): Promise<Uint8Array>;
  /** Oriented, ≤ 320 px, WebP q 0.7. */
  toWebpThumbnail(data: Uint8Array): Promise<Uint8Array>;
}
export interface LocalDeps { files: LocalFileStore; images: LocalImages }

// apps/web/src/lib/data-source/local/index.ts
export function createLocalDataSource(db: LocalDb, deps: LocalDeps): DataSource;
```

Las claves tienen el mismo formato que las de la API (`attachments/<uuid>.<ext>`, `vehicles/<uuid>.webp`) y se guardan en las mismas columnas (`attachments.storage_key`, `vehicles.photo`). Así #66 (export: `attachments/<id>.<ext>` y `photos/<vehicleId>.webp`, fotos siempre WebP, sha256 ya calculado) y #68 (facturas como anexos) solo necesitan `files.read(key, mimeType)`.

### Archivos (`apps/web/src/lib/data-source/local/`)

| Archivo | Contenido |
|---|---|
| `files.ts` (nuevo) | `LocalFileStore`, `LocalImages`, `LocalDeps`; URLs locales (`localPhotoUrl`, `localAttachmentUrl`, `parseLocalUrl`); `assertWebp(data)` (R12: `detectAttachmentType(data)?.mimeType === 'image/webp'` o Problem 500 `This device cannot encode WebP images`); `assertUploadSize(file)` (R6) |
| `attachments.ts` (nuevo) | `localAttachments(db, deps): DataSource['attachments']`, réplica de `attachments/{service,repository}.ts`: `requireRecord` (404 `Vehicle not found` / `Maintenance record not found`), `requireAttachment` (404 `Attachment not found`), `list` por `createdAt, rowid`, `upload` (R4–R6, R19), `remove` (fila y después fichero, R8) |
| `vehicles.ts` | `toDto` con `photoUrl: row.photo ? localPhotoUrl(row) : null`; `setPhoto`/`removePhoto` (R10–R13, R19); `remove` borra en una transacción las filas de adjuntos de sus mantenimientos y el vehículo, y después los ficheros de esos adjuntos y la foto (R18) |
| `maintenance.ts` | `remove` borra las filas de adjuntos en la misma transacción y después sus ficheros (R17) |
| `files-get.ts` (nuevo) | `localFiles(db, deps, queue): DataSource['files']` (R14–R16): la búsqueda de la fila pasa por la cola; la lectura del fichero y la miniatura, fuera de ella |
| `index.ts` | `createLocalDataSource(db, deps)`; `vehicles.setPhoto/removePhoto`, `attachments.*` y `files.get` dejan de ser `reject` |
| `canvas-images.ts` (nuevo) | `createCanvasImages(env?)`: implementación de `LocalImages` con `createImageBitmap(blob, { imageOrientation: 'from-image' })` y `<canvas>.toBlob('image/webp', q)` (R21). `env` (`decode`, `createCanvas`) inyectable para testearla en Node con dobles; `fitInside(w, h, max)` pura |

### Flujos

- **Subir adjunto** (dentro de la cola): `requireRecord` → `assertUploadSize` (antes de leer el `File`) → `new Uint8Array(await file.arrayBuffer())` → `detectAttachmentType` (415) → si es imagen, `images.assertDecodable` (415) → `sha256` con `crypto.subtle.digest` → `files.save` → `insert … returning`; si el insert falla, `files.remove(key)` y se relanza (R19).
- **Foto**: `requireVehicle` → tamaño (413) → `detectPhotoFormat` (400) → `images.toWebpPhoto` (400 si no decodifica) → `assertWebp` (500) → `files.save('vehicles', …, 'webp')` → `update vehicles set photo` → borrar la anterior. Si el update falla, se borra la nueva (R19).
- **Borrados**: filas en la transacción; ficheros después, uno a uno, y un fallo al borrar un fichero no rechaza la operación (ver «Decisiones a validar» 3).

### URLs locales

| Fichero | URL | `files.get` devuelve |
|---|---|---|
| Foto | `local://vehicles/<vehicleId>/photo?v=<8 caracteres de la clave>` (misma versión que la API) | `image/webp`, `fileName: null` |
| Adjunto | `local://vehicles/<vehicleId>/maintenance/<recordId>/attachments/<id>` (la UI añade `?inline=1`, que se ignora) | su `mimeType`, `fileName: originalName` |
| Miniatura | `…/attachments/<id>/thumbnail` | `image/webp` generado al vuelo, `fileName: null`; 404 `Only images have a thumbnail` para PDF |

Copian las rutas de la API, así `files.get` recorre la misma cadena vehículo → registro → adjunto. Cualquier otra URL (incluida `/api/…`) → 404 `Not Found` (R16).

### Errores (mismos textos que la API)

| Caso | Problem |
|---|---|
| Fichero > `maxUploadMb` | 413 `request file too large` (el título que da `@fastify/multipart`) |
| Adjunto de tipo no admitido o imagen corrupta | 415 `Unsupported Media Type`, `Only PDF, JPEG, PNG and WebP files are allowed` |
| Foto no admitida o no decodificable | 400 `Bad Request`, `The file is not a supported image (JPEG, PNG, WebP, AVIF, GIF or TIFF)` |
| El dispositivo no produce WebP | 500 `Internal Server Error`, `This device cannot encode WebP images` (la UI muestra `common.error`) |
| Cadena inexistente | 404 con los `detail` de la API |

## C. Adaptadores del dispositivo

| Archivo | Cambio |
|---|---|
| `apps/web/src/lib/native-storage.ts` (nuevo, solo nativo) | `createDeviceFileStore(): LocalFileStore` sobre `Filesystem` (`Directory.Data`, ruta `uploads/<clave>`): `save` con `writeFile({ data: base64, recursive: true })` (reutiliza `blobToBase64` de `native-files.ts` o su lógica sobre `Uint8Array`), `read` con `readFile` → `Blob` con el tipo, `remove` con `deleteFile` ignorando «does not exist» (R20) |
| `apps/web/src/features/pwa/config.ts` | `NATIVE_ONLY_MODULES`: `native-(files\|calendar\|notifications\|sqlite\|storage)` |
| `apps/web/src/features/mobile/local-mode.ts` | `openLocalDataSource()` carga también `@/lib/native-storage` y `@/lib/data-source/local/canvas-images` y llama a `createLocalDataSource(db, { files: createDeviceFileStore(), images: createCanvasImages() })` |

Sin plugins nuevos: `@capacitor/filesystem` 8.1.5 ya está en `apps/mobile` y `apps/web`. `Directory.Data` es privado de la app, no necesita permisos y se borra al desinstalarla.

## D. Web

| Archivo | Cambio |
|---|---|
| `src/lib/api-files.ts` | `filesViaDataSource()` = `isServerMode() \|\| isLocalMode()`; `useApiFileSrc` la usa en lugar de `isServerMode()` (R24) |
| `src/features/maintenance/maintenance-attachments.tsx`, `attachment-viewer.tsx` | `filesViaDataSource()` en lugar de `isServerMode()`: en local, abrir y descargar pasan por `openApiFile`/`saveApiFile` (R24) |
| `src/routes/_app/vehicles/$vehicleId/edit.tsx` | `PhotoPicker` sin la condición `!isLocalMode()` (R22) |
| `src/features/maintenance/maintenance-form.tsx`, `maintenance-timeline.tsx` | `AttachmentPicker` y `onAttachments` sin la condición de modo local (R23) |
| `src/features/vehicles/photo-picker.tsx` | Comentario: quien redimensiona es la DataSource (API o local) |
| `src/i18n/locales/{es,en}.json` | No se prevén textos nuevos (se reutilizan `vehicles.photo.*`, `maintenance.attachments.*`, `common.fileError`); si el implementer añade alguno, va en ambos (R26) |
| `docs/mobile.md`, `CONTRIBUTING.md` | En local ya hay foto y adjuntos, guardados en el almacenamiento privado de la app (se pierden al desinstalarla); `LocalDeps` en «DataSource local» |

UI: mismos componentes y estados que en modo servidor (placeholder `bg-muted` mientras carga la imagen, `viewerError`, toasts de `uploadErrorKey`). En la app nativa, abrir un PDF usa el visor del sistema y descargar, la hoja de compartir (`mobile-native-files`), igual que en modo servidor.

## Tests sin dispositivo

- **Unidad (Node):** `createLocalDataSource(db, deps)` con `createMemorySqlite()`, `createMemoryFileStore()` (`src/test/memory-file-store.ts`, un `Map<clave, bytes>` con `keys()` para afirmar lo que hay en disco) y `fakeImages()` (`src/test/fake-images.ts`: decodifica lo que lleva una firma de imagen y no está marcado como corrupto; devuelve un WebP mínimo con firma `RIFF….WEBP` y registra el tamaño pedido; opción `output` para simular un dispositivo que no produce WebP; opción `failOn` para hacer fallar el store o el insert).
- **`canvas-images.ts`:** dobles de `decode`/`createCanvas` que registran el tamaño del canvas, el tipo y la calidad de `toBlob`, y `close()` del bitmap.
- **`native-storage.ts`:** `vi.mock('@capacitor/filesystem')` como `native-files.test.ts`.
- **Componentes (jsdom):** `local-mode.test.tsx` y un test nuevo mockean `@/lib/native-sqlite`, `@/lib/native-storage` (almacén en memoria) y `@/lib/data-source/local/canvas-images` (`fakeImages`); `mockApi({})` asegura que no sale ninguna petición y `mockObjectUrls()` da `blob:` a las imágenes.
- **Dispositivo:** checklist manual en `progress/impl_mobile-local-files.md` que el humano ejecuta con la APK de depuración antes de Gate 2.

## Alternativas descartadas

- **Guardar los ficheros como BLOB en SQLite:** una sola transacción y sin huérfanos, pero cambia el esquema compartido (prohibido tener columnas solo del móvil, `CONTRIBUTING.md`), pasa megas en base64 por el puente del plugin en cada consulta y obliga a #66 a reconvertirlos.
- **Generar y guardar la miniatura al subir:** evita decodificar al abrir la galería, pero añade un segundo fichero por imagen que hay que borrar en cascada y exportar (o excluir) en #66. La API la genera al vuelo; aquí se hace igual y TanStack Query la cachea (`staleTime: Infinity`) durante la sesión.
- **OPFS / IndexedDB del WebView:** sin plugin, pero Android puede desalojar el almacenamiento del WebView (el mismo motivo por el que #54 descartó SQLite WASM) y el almacenamiento quedaría lejos de `Directory.Data`, donde #66/#68 leen.
- **`sharp` compilado para Android o WASM (`wasm-vips`):** varios MB en la APK y sin soporte oficial; canvas ya está en el WebView.

## Decisiones a validar

1. **Tipos de foto en local: JPEG, PNG, WebP y GIF (primer fotograma).** La API declara JPEG, PNG, WebP, AVIF, GIF y TIFF, pero en la práctica rechaza AVIF (`sharp` lo reporta como `heif`, que no está en `SUPPORTED_FORMATS` de `apps/api/src/lib/images.ts`; comprobado con el `sharp` instalado). El modo local detecta por bytes mágicos los mismos formatos que la API acepta de verdad (`detectPhotoFormat`: JPEG, PNG, WebP, GIF, TIFF); TIFF no lo decodifica el WebView y termina en el mismo 400. El texto del 400 es el de la API, que menciona AVIF. Corregir AVIF en la API queda fuera de alcance (sería otra feature `sdd: false`).
   > **Actualizado en #71 `api-photo-avif`:** la API acepta ya AVIF (`heif` con compresión `av1`) y sigue rechazando HEIC. El modo local detecta AVIF por las marcas de la caja `ftyp` y el texto del 400 es una constante compartida, `UNSUPPORTED_PHOTO_MESSAGE` (`packages/shared/src/domain/files.ts`).
2. **Miniatura al vuelo** (no se guarda), igual que la API (ver alternativas).
3. **Fallo al borrar un fichero tras confirmar la transacción:** no rechaza la operación (la fila ya no existe y la UI debe reflejarlo); el fichero queda huérfano. La API, en cambio, respondería 500 tras borrar la fila.
4. **`detectPhotoFormat` en `@ikrive/shared` sin que la API lo use:** la API sigue validando con `sharp.metadata()` para no cambiar su comportamiento.
5. **El modo local también aplica el límite de 20 MB a la foto** (la API lo aplica a cualquier multipart), aunque `PhotoPicker` no filtra antes de subir.

## Riesgos

- **WebP y `createImageBitmap` en el WebView de Android:** el WebView (Chromium, actualizable desde Play) codifica WebP con `toBlob` y aplica EXIF con `imageOrientation: 'from-image'`. Un WebView muy antiguo podría devolver PNG en silencio: R12 lo convierte en error en vez de guardar una «foto WebP» que no lo es (que rompería el import de #66). Se comprueba en la checklist del dispositivo.
- **Memoria al decodificar:** una foto de 50 MP decodificada ocupa ~200 MB RGBA. El límite de 20 MB y `bitmap.close()` tras dibujar lo acotan; si el dispositivo se queda sin memoria, `createImageBitmap` rechaza y el usuario ve el 400.
- **Ficheros huérfanos:** si la app muere entre guardar el fichero y el insert, o tras borrar filas y antes de borrar ficheros, quedan ficheros sin fila en `uploads/`. No se ven ni se exportan (el export parte de las filas); solo ocupan espacio. Un barrido al abrir la base queda fuera de alcance.
- **Base64 por el puente de Capacitor:** `writeFile`/`readFile` pasan el fichero en base64 (≈ +33 %). Para 20 MB es asumible; si fuese lento, `readFile` puede sustituirse por `fetch(Capacitor.convertFileSrc(uri))` sin cambiar `LocalFileStore`.
- **Sin dispositivo en CI:** el plugin y canvas solo se prueban con dobles; el comportamiento real (orientación, WebP, rutas en `Directory.Data`, borrado en cascada, reinicio de la app con fotos) lo cubre la checklist manual antes de Gate 2. Si falla, vuelve a `in_progress`.

## Fuera de alcance

Export del zip con adjuntos y fotos (#66), PDF del informe con anexos (#68), barrido de ficheros huérfanos, copia de seguridad del dispositivo, app iOS. _(Corregir AVIF en la API se hizo en #71.)_
