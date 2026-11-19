# Explore — #75 mobile-local-export-streaming: Filesystem/Share en Android y modo local

> Informe de un agente `Explore` (solo lectura), guardado por el leader.

No modifiqué nada. La lógica nativa del plugin Filesystem no está en `node_modules`: vive en la librería Maven `io.ionic.libs:ionfilesystem-android:1.1.1`. La leí desensamblando con `javap` el jar de la caché de Gradle: `~/.gradle/caches/8.14.3/transforms/c95ba56d3389ea09447571ce2521d790/transformed/ionfilesystem-android-1.1.1/jars/classes.jar`.

## 1. Plugins instalados y qué hacen de verdad en Android

**Versiones.** `@capacitor/filesystem` 8.1.5 y `@capacitor/share` 8.0.3, iguales en `apps/web/package.json:19,21` y `apps/mobile/package.json:17,19`. La versión de `@capacitor/core` y `@capacitor/android` es 8.6.0.

Rutas base:
- Filesystem: `FS = node_modules/.pnpm/@capacitor+filesystem@8.1.5_@capacitor+core@8.6.0/node_modules/@capacitor/filesystem`
- Kotlin del plugin: `$FS/android/src/main/kotlin/com/capacitorjs/plugins/filesystem/FilesystemPlugin.kt` (en adelante, `FilesystemPlugin.kt`)
- Parseo de opciones: `$FS/android/src/main/kotlin/com/capacitorjs/plugins/filesystem/FilesystemMethodOptions.kt` (en adelante, `FilesystemMethodOptions.kt`)
- La dependencia Maven se declara en `$FS/android/build.gradle:85`.

**appendFile**
- En `FilesystemPlugin.kt` (~l.125) solo añade `append=true` a la llamada y delega en `writeFile`.
- `getWriteFileOptions` (`FilesystemMethodOptions.kt` ~l.92) exige que `data` sea un String.
  - Sin `encoding`, el dato se trata como base64 binario. Antes de decodificar quita cualquier prefijo `data:...,`.
  - Con `encoding`, se escribe como texto con `BufferedWriter`.
- Implementación nativa (`IONFILELocalFilesHelper$saveFile$2`), en cada llamada:
  1. `File.exists()`, y si no existe `createFile` (con `recursive`).
  2. `new FileOutputStream(file, append)`.
  3. `Base64.decode(data)` del trozo entero a un `byte[]`.
  4. Escritura con `BufferedOutputStream.write(bytes)`.
  5. `closeFinally`.
- **Abre y cierra el fichero en cada append.** No hay handle persistente ni `fsync` explícito.
- Coste por trozo de N bytes:
  - JS: `btoa` (N×1,33) dentro del mensaje JSON del bridge.
  - Java: String de unos 2,66N bytes (UTF-16) más el `byte[]` de N.
  - Además, open/close y resolución de URI (`runWithPermission` → `getFileUri`).
- Conclusión: con trozos de 256 KB–1 MB la memoria queda acotada. Trozos muy pequeños multiplican el overhead.

**readFile por rangos.** Sí existe: `offset`/`length` desde la 8.1.0.
- Definición: `$FS/dist/esm/definitions.d.ts:211-228`. Parseo: `getOffsetAndLength` en `FilesystemMethodOptions.kt` ~l.140.
- Los dos se leen con `getInt`, así que son Int: el límite práctico es menos de 2 GiB.
- Implementación: `IONFILEInputStreamExtensionsKt.readFull`.
  - Aplica el offset (`applyOffset`, un skip sobre `FileInputStream`).
  - Con `length` > 0 lee en buffers de como mucho 8192 bytes y concatena Strings.
  - Sin `length`, carga todo con `readBytes()` + `Base64.encodeToString`: el fichero entero en memoria más su base64.
- En web no está soportado.

**readFileInChunks.** Existe desde la 7.1.0 (`definitions.d.ts:236,556`; `FilesystemPlugin.kt` ~l.82).
- Es un callback con `keepCallback`. Cada trozo llega como `ReadFileResult` y un `data: ""` final marca el EOF.
- Acepta también `offset`/`length`.
- No hay contrapresión: el lado nativo emite los trozos todo lo rápido que puede y se encolan en el WebView.
- En web lanza «Method not implemented» (`$FS/dist/plugin.js:213`).
- Para leer los adjuntos de forma controlada encaja mejor `readFile` con `offset`/`length` en bucle.

**stat.** `controller.getMetadata` (`FilesystemPlugin.kt` ~l.205) usa `File.length()` y `Uri.fromFile`: devuelve size, type, mtime y uri sin leer el contenido. Es barato.

**deleteFile.** `controller.delete(uri, recursive=false)` (~l.140), que acaba en `File.delete()`. Si el fichero no existe falla con `DoesNotExist` («does not exist»). Hay `rmdir` con `recursive` y `readdir` disponibles.

**getUri.** `controller.getFileUri` (~l.193) devuelve `{ uri }` `file://` sin tocar el disco. `writeFile`/`appendFile` también devuelven `uri`.

**Directory.Cache.** Se resuelve a `context.cacheDir`, sin permisos. El README avisa de que Android puede borrarlo cuando hay poca memoria (`$FS/README.md:772`).

**Límites de memoria conocidos**
- `$FS/README.md:125`: «Working with large files may require you to add `android:largeHeap="true"`». La app no lo tiene puesto en `apps/mobile/android/app/src/main/AndroidManifest.xml`.
- El bridge de Capacitor pasa JSON como String: de JS a nativo por `addJavascriptInterface` → `postMessage(String jsonStr)`, y de vuelta por `evaluateJavascript` / `postMessage`. Ver `node_modules/.pnpm/@capacitor+android@8.6.0_@capacitor+core@8.6.0/node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/MessageHandler.java:38,52,126`.
- Un write o read de X MB supone a la vez varios String de ~1,33X (más copias UTF-16 en Java y en JS). Es la fuente clásica de OOM con ficheros grandes; con escrituras y lecturas por trozos se evita.

## 2. Share con `file://` de Cache, y uso actual

**Share Android.** `node_modules/.pnpm/@capacitor+share@8.0.3_@capacitor+core@8.6.0/node_modules/@capacitor/share/android/src/main/java/com/capacitorjs/plugins/share/SharePlugin.java`:
- Acepta `url` con `file:` (l.110 y 127-130, la reenvía a `shareFiles`) o `files: string[]` (l.137-138).
- `shareFiles` (l.167-200) convierte cada ruta con `FileProvider.getUriForFile(activity, pkg + ".fileprovider", new File(Uri.parse(file).getPath()))`.
- Pone `EXTRA_STREAM` + `ClipData` y `FLAG_GRANT_READ_URI_PERMISSION`.
- El intent es `ACTION_SEND`, o `ACTION_SEND_MULTIPLE` si hay más de un fichero. Rutas que no son `file:` se rechazan.
- Comparte el fichero por URI y no lo carga en memoria.

**FileProvider de la app**
- Declarado en `apps/mobile/android/app/src/main/AndroidManifest.xml:31-39`.
- Rutas en `apps/mobile/android/app/src/main/res/xml/file_paths.xml`: `external-path .` y `cache-path .`.
- **No hay `files-path`**, así que compartir algo de `Directory.Data` fallaría con `IllegalArgumentException`. Directory.Cache sí está cubierto.

**Uso actual**
- `apps/web/src/lib/native-files.ts`:
  - `writeToCache` (l.48-56): un único `Filesystem.writeFile` con todo el blob en base64, en `files/<safeFileName>`, `Directory.Cache`, `recursive: true`. Devuelve `uri`.
  - `saveFile` (l.59-66): llama a `Share.share({ title, files: [uri], dialogTitle })` e ignora «Share canceled» (`isShareCanceled`, l.43).
  - `openFile` (l.69-72): usa `FileOpener.open`.
  - `blobToBase64` (l.33-40) hace `blob.arrayBuffer()` completo, construye un string binario por bloques de 0x8000 y aplica `btoa`. Pico de memoria: bytes + string binario + base64.
- `apps/web/src/lib/download.ts:8-12`: en nativo, `downloadBlob` hace `import('./native-files')` → `saveFile`.
- `apps/web/src/lib/api-files.ts:5,56,65`: usa `downloadBlob` / `openBlob`.
- El export se lanza desde `apps/web/src/features/data-portability/queries.ts:14` (`dataSource().dataPortability.export()`) y `apps/web/src/features/data-portability/data-section.tsx:82` (`downloadBlob(fileName ?? EXPORT_FALLBACK_NAME, blob)`).

## 3. Cómo guarda y lee ficheros el modo local

No existe `apps/web/src/local`; el código está en `apps/web/src/lib/data-source/local/` y `apps/web/src/lib/native-storage.ts`.

**Interfaz.** `apps/web/src/lib/data-source/local/files.ts:7-14` define `LocalFileStore`: `save(folder, Uint8Array, ext)`, `read(key, mime) → Blob` y `remove`. `MissingFileError` está en l.20. `LOCAL_MAX_UPLOAD_MB = 20` en l.51. `fileBytes(blob)` (l.108) hace `new Uint8Array(await blob.arrayBuffer())`.

**Implementación en el dispositivo.** `apps/web/src/lib/native-storage.ts`:
- Ruta: `Directory.Data`, `uploads/<folder>/<uuid>.<ext>`.
- `save` (l.27-35): `writeFile` con el base64 entero (`blobToBase64`). El fichero en disco es binario, no base64.
- `read` (l.38-46): `Filesystem.readFile` sin offset/length, es decir, el fichero entero.
  - En nativo devuelve un string base64 que se convierte con `atob` + `Uint8Array.from` (l.16-19) y se envuelve en un `Blob`.
  - Coste de leer un adjunto de N bytes: base64 nativo (~1,33N, más UTF-16 en Java), String en JS (~1,33N), string binario de `atob` (N, o 2N si es UTF-16) y `Uint8Array` (N). Después, la copia del `Blob` y otra más con `fileBytes`.
  - Para un adjunto de 20 MB son del orden de 100 MB transitorios.
- `remove` (l.48-55): `deleteFile`, ignorando «does not exist».

**Export local.** `apps/web/src/lib/data-source/local/data-export.ts:117-168`:
- Lee los adjuntos (l.141-146) y las fotos (l.148-154) uno a uno y los pasa a `zip.addFile`.
- Al final devuelve `new Blob(zip.finish(document))`.
- El writer `packages/shared/src/data-export-zip.ts:27-55` (fflate `Zip`, `ZipPassThrough` para ficheros y `ZipDeflate` para `data.json`) **acumula todos los chunks en un array `chunks` en memoria** (l.28,33) y los devuelve en `finish`.
- Resultado: hoy el zip entero vive en memoria, luego se convierte en Blob, luego en base64 completo, y cruza el bridge en un solo `writeFile`. Ese es el punto que la #75 tiene que convertir en append por trozos.

## 4. Cómo se simula Filesystem en los tests

**`local-mode.test.tsx`** (`apps/web/src/features/mobile/local-mode.test.tsx`):
- No mockea `@capacitor/filesystem`. Mockea el módulo entero `@/lib/native-storage` (l.33-42): `createDeviceFileStore` devuelve un `createMemoryFileStore()` guardado en `storage.store` (vi.hoisted).
- Mockea `@/lib/native-files` con `saveFile`/`openFile` como `vi.fn()` (l.119-120). El Blob del export llega entero a `saveFile`.
- Usa `storage.store?.failOn.add('read')` (l.397) y `storage.store?.keys()` (l.452, 555...).

**Almacén en memoria.** `apps/web/src/test/memory-file-store.ts`:
- Un `Map<key, Uint8Array>` con `keys()`, `bytes(key)` y `failOn: Set<'save'|'read'|'remove'>`.
- **No mide bytes retenidos ni picos de memoria**, ni simula el base64 ni el bridge. Solo almacena copias (`data.slice()`).
- Para medir lo retenido haría falta un fake nuevo: por ejemplo un `Filesystem` falso con `appendFile` que registre el tamaño de cada trozo, el máximo de `data.length` por llamada y el total escrito, o un writer inyectable que cuente bytes vivos.

**Tests unitarios del plugin.** Mockean `@capacitor/filesystem` con `vi.fn()` sueltos:
- `apps/web/src/lib/native-files.test.ts:4-10`: `writeFile`, `Share.share`, `FileOpener.open`. `Directory` se mockea en la l.6.
- `apps/web/src/lib/native-storage.test.ts:5-9`: `{ Directory: { Data: 'DATA' }, Filesystem: { writeFile, readFile, deleteFile } }`. `readFile` devuelve base64 (`Buffer...toString('base64')`) o un Blob.
- No hay `appendFile`, `stat`, `getUri` ni `readFileInChunks` mockeados en ningún sitio.

**Otros tests de la zona.** `apps/web/src/lib/data-source/local/local-export.test.ts`, `packages/shared/src/data-export-zip.test.ts` (concatena los chunks y los descomprime) y `apps/web/src/features/data-portability/data-section.test.tsx`.

## 5. Limpieza de Directory.Cache al arrancar

**No hay ninguna.**
- `apps/mobile/android/app/src/main/java/com/ikrive/app/MainActivity.java` no tiene limpieza: solo registra `CameraPermissionPlugin`.
- No hay llamadas a `rmdir`/`readdir`/`deleteFile` sobre Cache en `apps/web/src`.
- El comentario de `apps/web/src/lib/native-files.ts:6-9` lo deja explícito: los ficheros no se borran porque la app destino puede leerlos más tarde, se sobrescriben por nombre y Android limpia la caché cuando le falta espacio.
- Si el export escribe por trozos a `Cache/files/ikrive-export-<fecha>.zip`, hay que empezar con `writeFile` (truncar) o con un `deleteFile` previo antes de los `appendFile`. Un export a medias quedaría huérfano si no se borra en el `catch`.
