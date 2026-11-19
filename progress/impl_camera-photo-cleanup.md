# Implementación — #79 camera-photo-cleanup (`sdd: false`)

## Qué hace Capacitor (verificado en el código)

- `@capacitor/android` 8.6.0, `BridgeWebChromeClient.createImageFile` (l. 460–467): `File.createTempFile("JPEG_" + yyyyMMdd_HHmmss + "_", ".jpg", activity.getExternalFilesDir(DIRECTORY_PICTURES))` → `Android/data/com.ikrive.app/files/Pictures/JPEG_20261119_101530_<n>.jpg`. Nunca lo borra.
- `showImageCapturePicker` devuelve a la página un `content://` del `FileProvider` (`${applicationId}.fileprovider`) que apunta a ese fichero. El `File` que recibe la web lo lee Chromium del proveedor cuando se usa (subida HTTP o WebP por canvas en local), no hace una copia: **borrarlo mientras la página tiene ese `File` rompe la subida o un reintento.**
- Si Android mata el proceso con la cámara abierta, el `BridgeWebChromeClient` nuevo tiene `activityListener == null` (l. 70–74) y el resultado se descarta: esa foto ya no puede llegar a la página.
- `@capacitor/filesystem` 8.1.5 (ya dependencia de web y mobile): `Directory.External` = `getExternalFilesDir(null)` (`IONFILEFolderType.EXTERNAL_FILES`, `inExternalStorage = false`), así que `readdir`/`deleteFile` en `Pictures` no piden permisos de almacenamiento en ninguna versión de Android (minSdk 24).

## Enfoque elegido: barrido al arrancar la app

Al arrancar (una vez por carga del JS, desde `main.tsx`), solo en la app nativa: listar `Pictures` en `Directory.External` y borrar los ficheros que se llamen como los de Capacitor (`^JPEG_\d{8}_\d{6}_\d+\.jpg$`).

Por qué este y no otro:
- **Más simple:** sin código Java nuevo ni plugin propio (Filesystem ya alcanza la ruta), sin tocar los flujos de subida (`PhotoPicker`, `AttachmentPicker`, `maintenance-form`, `maintenance-attachments`, las dos `DataSource`). Sirve igual para modo servidor y modo local.
- **Nunca borra una foto en uso:** al arrancar no hay ninguna página con un `File` pendiente (subir, reintentar o descartar); esos estados solo viven en memoria. Una subida fallida conserva su foto mientras la app siga abierta; la única foto que puede borrarse "en curso" es la de un proceso que Android mató con la cámara abierta, y esa ya estaba perdida (punto anterior).
- **Por qué no al volver a la app (`resume`):** volver de la cámara es también un `resume` (de la Activity y del plugin `App`); se borraría la foto recién hecha antes de que la página la lea.
- **Por qué no borrar cada foto tras subirla bien:** habría que enganchar todos los caminos de subida y saber cuándo deja de hacer falta el `File` (el alta de mantenimiento sube después de crear, y se puede reintentar). Más superficie para el mismo resultado; el barrido al arrancar además limpia las fotos de subidas fallidas o descartadas, y las anteriores a esta versión.
- Coste aceptado: las fotos de la sesión actual se quedan hasta el siguiente arranque (Android cierra la app en segundo plano con frecuencia; en todo caso, nunca se acumulan más que las de una sesión).

## Cambios por archivo

- `apps/web/src/lib/native-camera.ts`: `CAMERA_PHOTOS_DIR = 'Pictures'`, `CAMERA_PHOTO_NAME` y `removeCameraPhotos(): Promise<number>` (`readdir` + `deleteFile` con `Promise.allSettled`; solo entradas `type === 'file'` con el nombre de Capacitor; un fichero que no se puede borrar no corta el resto; rechaza si no se puede listar la carpeta, p. ej. si aún no existe). Sigue siendo native-only (`camera` ya está en `NATIVE_ONLY_MODULES`); el chunk queda en `assets/native/` (comprobado con `pnpm build`).
- `apps/web/src/features/mobile/camera-photo-cleanup.ts` (nuevo): `cleanUpCameraPhotos()`; si `!isNativeApp()` no hace nada ni carga nada; si no, `import('@/lib/native-camera')` → `removeCameraPhotos()` y se traga cualquier error (la app arranca igual).
- `apps/web/src/main.tsx`: `void cleanUpCameraPhotos();` tras el registro del service worker.
- `apps/web/src/lib/native-camera.test.ts`: 5 tests del barrido (Filesystem simulado).
- `apps/web/src/features/mobile/camera-photo-cleanup.test.ts` (nuevo): 3 tests.
- `docs/mobile.md`: viñeta «Cámara», la frase de las fotos en `files/Pictures` explica que se conservan mientras la app está abierta (para reintentar) y se borran al arrancar de nuevo.
- `apps/mobile/test/docs.test.mjs`: aserciones de esa frase.
- `progress/current.md`: bitácora.

Sin cambios en Java, manifest, API, `packages/`, ni en la web/PWA salvo una llamada que en la web vuelve al instante.

## Trazabilidad (acceptance → test)

| Acceptance | Test |
|---|---|
| A1 Se borran las fotos de `files/Pictures` (al arrancar, servidor y local) | `native-camera.test.ts` › `camera photos clean-up` › `deletes the camera photos in Pictures of the external files dir`, `matches the names Capacitor gives the photos and nothing else`, `keeps deleting when one photo cannot be deleted`, `deletes nothing when there are no photos`, `rejects when the folder cannot be listed (no photo taken yet)`; `camera-photo-cleanup.test.ts` › `deletes the camera photos in the native app`, `swallows a failed clean-up so the app starts anyway`. Independiente del modo: se llama desde `main.tsx` antes de montar nada. |
| A2 Una subida fallida no borra la foto antes de reintentar/descartar | Por diseño: solo se borra al arrancar, nunca con la app abierta (no hay ningún borrado en los caminos de subida). Documentado en `cleanUpCameraPhotos` y comprobable en dispositivo (checklist 3). |
| A3 Web y PWA sin cambios | `camera-photo-cleanup.test.ts` › `does nothing on the web`; `features/pwa/native-only.test.ts` (módulo en `assets/native/`) sigue en verde. |
| A4 Tests de la limpieza | Los 8 anteriores + `apps/mobile/test/docs.test.mjs` › `documents the camera permission`. No hay Java nuevo, así que no hay test JUnit. |
| A5 Harness | Abajo. |

## `pnpm harness --full`

```
[OK]    80 features: 78 done, 1 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #79 camera-photo-cleanup (in_progress)
[OK]    Rama actual: feat/camera-photo-cleanup
[OK]    pnpm lint
[OK]    pnpm typecheck
e2e 6 · shared 187 · db 3 · web 672 · api 373
[OK]    pnpm test
[OK]    Arnés en verde.
```
`pnpm --filter @ikrive/mobile test`: 30/30.

## Desviaciones

Ninguna respecto a la description/acceptance (se usa la opción «al arrancar la app»). No hay capturas: no cambia ninguna UI.

## Checklist en dispositivo (APK debug, `adb`)

Variable: `D=/sdcard/Android/data/com.ikrive.app/files/Pictures`.

1. Instalar la APK nueva. `adb shell ls $D`: si vienen fotos de versiones anteriores, tras abrir la app la carpeta queda sin `JPEG_*.jpg`.
2. **Servidor:** hacer foto del vehículo y una factura con «Hacer foto». `adb shell ls $D` → aparecen 2 `JPEG_*.jpg` (se suben bien). Cerrar la app del todo (quitarla de recientes o `adb shell am force-stop com.ikrive.app`) y abrirla → la carpeta queda vacía; foto y factura siguen viéndose (están en el servidor).
3. **Subida fallida:** en el alta de un mantenimiento, añadir una factura con «Hacer foto», cortar la red (modo avión) y guardar → falla la subida. Mandar la app a segundo plano y volver (sin cerrarla): la foto sigue en `$D`. Reactivar la red y reintentar (o volver a la factura) → se sube bien.
4. **Volver de la cámara no borra:** abrir «Hacer foto», hacer la foto y aceptar → la foto llega a la página y se sube (la vuelta de la cámara no la borra).
5. **Local:** repetir 2 en modo «En este teléfono»: tras cerrar y abrir, `$D` vacío y la foto/factura se siguen viendo (están en `files/uploads` de `Directory.Data`, no se tocan).
6. Ficheros ajenos: `adb shell touch $D/otro.jpg`, cerrar y abrir → `otro.jpg` sigue ahí (solo se borran los `JPEG_<fecha>_<hora>_<n>.jpg`). Borrarlo después.
7. Sin carpeta: `adb shell rm -r $D`, cerrar y abrir → la app arranca normal (sin errores visibles).
8. Web y PWA: abrir la web en el navegador del móvil; sin cambios (no pide nada ni da errores en consola).
9. **Foto posterior al arranque (ronda 2):** `adb shell touch -d 2030-01-01T00:00:00 $D/JPEG_20300101_000000_1.jpg` (mtime en el futuro, simula una foto creada mientras corre el barrido), cerrar y abrir → el fichero sigue ahí; `adb shell touch $D/JPEG_20300101_000000_1.jpg` (mtime = ahora), cerrar, esperar 2 s y abrir → se borra.

## Ronda 2 (Gate 2: aviso 1 del reviewer)

Petición del humano: el barrido de arranque solo borra fotos con `mtime` anterior al momento del arranque, para no borrar una foto que la cámara cree mientras el barrido aún corre.

### Qué devuelve `@capacitor/filesystem` (verificado)

- `dist/esm/definitions.d.ts`: `FileInfo.mtime: number`, «Time of last modification in milliseconds» (obligatorio en el tipo); `ctime?` opcional (no existe en Android ≤ 7). `readdir` devuelve `FileInfo[]` y `stat` el mismo tipo.
- Android: `FilesystemMethodResults.kt` › `IONFILEMetadataResult.toResultObject()` pone `mtime = lastModifiedTimestamp`; desensamblando `ionfilesystem-android-1.1.1` (`IONFILECommonKt`), ese valor es `java.io.File.lastModified()`: epoch en ms, y 0 si no se puede leer. Mismo reloj de pared que `Date.now()`.

### Cambios

- `apps/web/src/lib/native-camera.ts`: `removeCameraPhotos(startedAt: number)`. Solo borra entradas `file` con el nombre de Capacitor y `mtime` finito, `> 0` y `< floor(startedAt / 1000) * 1000`. Conservador en dos puntos:
  - sin `mtime` utilizable (ausente, 0 = `lastModified()` fallido, `NaN`, no numérico) → se conserva;
  - se compara con el inicio del segundo del arranque, no con el ms exacto: hay sistemas de ficheros que guardan el `mtime` en segundos enteros, y una foto creada en el mismo segundo que el arranque (pero después) tendría un `mtime` truncado anterior a `startedAt`. Coste: una foto de la sesión anterior hecha en el mismo segundo del arranque se queda hasta el siguiente arranque (inalcanzable en la práctica).
- `apps/web/src/features/mobile/camera-photo-cleanup.ts`: captura `startedAt = Date.now()` justo tras la comprobación `isNativeApp()`, antes del `import()` del plugin (y por tanto antes del `readdir`), y lo pasa a `removeCameraPhotos`.
- `apps/web/src/lib/native-camera.test.ts`: las entradas llevan `mtime` anterior al arranque por defecto; tests nuevos `deletes only the photos older than the start of the app` (anterior se borra, incluso a 501 ms; inicio del segundo del arranque, igual al arranque y posterior se conservan) y `keeps the photos without a usable modification time` (`undefined`, 0, `NaN`, cadena).
- `apps/web/src/features/mobile/camera-photo-cleanup.test.ts`: `deletes the camera photos older than its call in the native app` comprueba, con reloj simulado que avanza mientras se carga el plugin, que se pasa el instante de la llamada.
- Checklist en dispositivo: paso 9 nuevo.
- `docs/mobile.md` no cambia (sigue siendo cierto que se borran al arrancar de nuevo).

### Trazabilidad añadida

| Requisito ronda 2 | Test |
|---|---|
| Foto anterior al arranque se borra | `native-camera.test.ts` › `deletes only the photos older than the start of the app` (y el resto de tests del barrido) |
| Foto posterior o igual al arranque se conserva | `native-camera.test.ts` › `deletes only the photos older than the start of the app` |
| Sin `mtime` se conserva | `native-camera.test.ts` › `keeps the photos without a usable modification time` |
| Instante capturado antes de cargar el plugin / `readdir` | `camera-photo-cleanup.test.ts` › `deletes the camera photos older than its call in the native app` |

### `pnpm harness --full`

```
[OK]    pnpm lint
[OK]    pnpm typecheck
e2e 6 · shared 187 · db 3 · web 674 · api 373
[OK]    pnpm test
[OK]    Arnés en verde.
```
`pnpm --filter @ikrive/mobile test`: 30/30.

### Desviaciones

Ninguna. Único matiz de diseño: el redondeo al segundo del arranque, para ser conservador con sistemas de ficheros de resolución de segundos (ver arriba).
