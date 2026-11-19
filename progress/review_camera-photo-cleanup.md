# Review — #79 camera-photo-cleanup

**Veredicto:** APPROVED (ronda 2: APPROVED, ver al final)

Feature `"sdd": false`: no hay `specs/`; la reviso contra `description` y `acceptance` de `feature_list.json`, `CONTRIBUTING.md`, `docs/` y `CHECKPOINTS.md`.

## Trazabilidad acceptance ↔ tests
- A1 (se borran las fotos de `files/Pictures`, al arrancar, modo servidor y local): [x]
  - `apps/web/src/lib/native-camera.test.ts` › `deletes the camera photos in Pictures of the external files dir`: comprueba `readdir({ path: 'Pictures', directory: External })`, que solo se borran los 2 `JPEG_*` de tipo fichero (se excluyen `notes.txt`, `IMG_*` y un directorio con nombre válido), las llamadas exactas a `deleteFile` y el recuento (2).
  - `› matches the names Capacitor gives the photos and nothing else`: casos positivos y negativos del patrón.
  - `› keeps deleting when one photo cannot be deleted` (recuento 1, 2 llamadas), `› deletes nothing when there are no photos`, `› rejects when the folder cannot be listed`.
  - `apps/web/src/features/mobile/camera-photo-cleanup.test.ts` › `deletes the camera photos in the native app`, `swallows a failed clean-up so the app starts anyway`.
  - Independencia del modo: la llamada está en `main.tsx` antes de montar el router, sin pasar por la `DataSource`. Correcto.
- A2 (una subida fallida no borra la foto antes de reintentar/descartar): [x] por diseño, sin test automático; ver el punto 5 abajo. Lo acepto como suficiente.
- A3 (web y PWA sin cambios): [x] `camera-photo-cleanup.test.ts` › `does nothing on the web` (no se llama a `removeCameraPhotos`); `features/pwa/native-only.test.ts` sigue en verde (`native-camera.ts` ya está en `NATIVE_ONLY_MODULES`, `apps/web/src/features/pwa/config.ts:40`; `@capacitor/filesystem` lo cubre el patrón `node_modules/@capacitor`; `main.tsx` solo importa estáticamente `features/mobile/camera-photo-cleanup.ts`, que no trae Capacitor).
- A4 (tests de la limpieza): [x] los 8 anteriores + `apps/mobile/test/docs.test.mjs` › `documents the camera permission` (frase nueva de `docs/mobile.md`).
- A5 (harness): [x] ver C6.

## Tasks
- No aplica (`sdd: false`, sin `tasks.md`). El plan de `progress/current.md` queda cubierto.

## Puntos de verificación pedidos

1. **Ruta y patrón = Capacitor.** `@capacitor/android` 8.6.0, `BridgeWebChromeClient.java:460-467`: `"JPEG_" + new SimpleDateFormat("yyyyMMdd_HHmmss")` + `_` + `File.createTempFile(prefix, ".jpg", getExternalFilesDir(DIRECTORY_PICTURES))`. El sufijo aleatorio de `createTempFile` es un `long` no negativo en decimal, así que `^JPEG_\d{8}_\d{6}_\d+\.jpg$` coincide y no admite otra cosa. OK.
2. **`Directory.External` = `getExternalFilesDir(null)` y sin permisos.** Lo he comprobado desensamblando `ionfilesystem-android-1.1.1` (la dependencia nativa de `@capacitor/filesystem` 8.1.5, en la caché de Gradle): el alias `EXTERNAL` pertenece a `IONFILEFolderType.EXTERNAL_FILES` con `inExternalStorage = false`, y `IONFILEUriHelper` lo resuelve con `Context.getExternalFilesDir(null)`. `FilesystemPlugin.runWithPermission` (`FilesystemPlugin.kt:363-370`) solo pide permisos si `inExternalStorage`. OK: `readdir` y `deleteFile` no piden nada.
3. **Borrar una foto que una página aún usa.** No encuentro ningún caso real:
   - Recreación de la Activity sin muerte del proceso: `MainActivity` tiene `configChanges` (orientación, tamaño, uiMode, locale…) y `launchMode="singleTask"`, así que ni el giro ni un intent externo crean un segundo WebView en el mismo proceso. Si aun así se recreara (p. ej. «No conservar actividades»), el WebView recarga y el JS anterior (con sus `File`) desaparece; además, el `BridgeWebChromeClient` nuevo tiene `activityListener == null` (`BridgeWebChromeClient.java:70-74`) y descarta el resultado de la cámara: la foto ya estaba perdida para la página.
   - Arranque con la cámara abierta: la cámara se lanza con `startActivityForResult` en la tarea de la app, así que la Activity de Ikrive no vuelve a crearse hasta que la cámara termina. Si el renderer del WebView muere, `BridgeWebViewClient.onRenderProcessGone` (l. 92-104) no recarga la página (devuelve `false`, el proceso cae), así que no hay un arranque del JS con la cámara abierta.
   - No hay `location.reload()` en `apps/web/src` ni persistencia de `File` en IndexedDB: cualquier `File` pendiente vive solo en memoria del JS que se está sustituyendo.
   - Solo queda una carrera teórica (ver Avisos), que no considero un caso real.
4. **Native-only.** Confirmado (ver A3). `isNativeApp()` es la constante de build `import.meta.env.MODE === 'native'`; en la web `cleanUpCameraPhotos` vuelve antes del `import()`.
5. **A2 sin test automático.** Suficiente: no hay ningún borrado fuera del arranque (el diff no toca `PhotoPicker`, `AttachmentPicker`, los formularios ni las `DataSource`), y una subida fallida solo puede reintentarse con el mismo JS vivo, en el que el barrido ya se ejecutó. El paso 3 del checklist en dispositivo lo cubre a mano.

## Checkpoints
- C1: [x] `pnpm harness` en verde, una sola feature activa (#79 `in_progress`), rama `feat/camera-photo-cleanup`.
- C2: [x] no aplica (`sdd: false`): no hay spec; trazabilidad acceptance → test revisada arriba, leyendo los tests.
- C3: [x] el diff solo toca `lib/native-camera.ts` (+ test), `features/mobile/camera-photo-cleanup.ts` (+ test), `main.tsx`, `docs/mobile.md`, `apps/mobile/test/docs.test.mjs`, `feature_list.json` (estado) y `progress/`. Sin cambios de otras features ni refactors.
- C4: [x] código del dominio en `features/mobile/`, el acceso nativo en `lib/native-*`, cargado con `import()`. Sin API, BD ni textos de UI (no hace falta i18n).
- C5: [x] sin `any`, `@ts-ignore`, `console.log` ni TODOs. El `catch {}` vacío está comentado y justificado.
- C6: [x] `pnpm harness --full` en verde (lint, typecheck; tests e2e 6, shared 187, db 3, web 672, api 373); `pnpm --filter @ikrive/mobile test` 30/30. Los tests afirman resultados concretos. No hay UI nueva, así que no hacen falta capturas.
- C7: [x] `progress/impl_camera-photo-cleanup.md` con archivos, mapa acceptance → test, salida del harness y checklist de dispositivo; `progress/current.md` al día; `docs/PLAN.md` no cambia (no cierra fase ni cambia decisiones).

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- Carrera teórica al arrancar: si el usuario pulsara «Hacer foto» antes de que termine el barrido (`readdir` + `deleteFile`, unos milisegundos tras cargar el JS), `createTempFile` crearía el fichero vacío y el barrido podría listarlo y borrarlo con la cámara abierta. En la práctica es inalcanzable, porque antes hay que navegar hasta la edición del vehículo o un mantenimiento. Si se quiere blindar, bastaría con borrar solo los ficheros cuyo `mtime` sea anterior al momento del arranque.
- El acceptance 1 ofrece «tras subirlas o guardarlas (o al arrancar)». Se ha elegido «al arrancar», así que las fotos de la sesión actual se quedan en el teléfono hasta el siguiente arranque. Está documentado en `docs/mobile.md` y justificado en el informe del implementer.
- No hay prueba en dispositivo: el checklist de 8 pasos de `progress/impl_camera-photo-cleanup.md` es la única verificación real en Android (sobre todo los pasos 3, 4 y 6).

## Cambios requeridos
Ninguno.

---

## Ronda 2 (Gate 2: aplicar el aviso 1, barrido solo de fotos anteriores al arranque)

**Veredicto ronda 2:** APPROVED

Diff revisado: `apps/web/src/lib/native-camera.ts` (`removeCameraPhotos(startedAt)`), `apps/web/src/features/mobile/camera-photo-cleanup.ts` (captura `startedAt`) y sus dos tests. El resto del diff no cambia respecto a la ronda 1.

### 1. `FileInfo.mtime` en Android = ms de `File.lastModified()`: [x]
- `@capacitor/filesystem` 8.1.5, `dist/esm/definitions.d.ts:417-422`: `mtime: number`, «Time of last modification in milliseconds».
- `android/.../FilesystemMethodResults.kt:51`: `put("mtime", lastModifiedTimestamp)`.
- Desensamblado de `ionfilesystem-android-1.1.1` (caché de Gradle): `IONFILEDirectoriesHelper$listDirectory$2` llama a `File.listFiles()` y a `IONFILECommonKt.getMetadata(File)` por cada hijo; `getMetadata` hace `File.lastModified()` (offset 122) y lo pasa como último `long` del constructor de `IONFILEMetadataResult`, que lo guarda en `lastModifiedTimestamp` (offset 63-65). Epoch en ms, 0 si no se puede leer: mismo reloj de pared que `Date.now()`.

### 2. La carrera queda cerrada: [x]
- `startedAt = Date.now()` se ejecuta de forma síncrona en la llamada `void cleanUpCameraPhotos()` de `main.tsx`, antes del primer `await` (el `import()`), y por tanto antes de montar la UI y del `readdir`. Cualquier foto exige que el usuario pulse un input con `capture` en una UI ya montada, así que `createTempFile` crea el fichero después de `startedAt` y su `mtime` es ≥ `startedAt` ≥ `floor(startedAt / 1000) * 1000`: se conserva. El fichero vacío y la foto final (que reescribe el mismo fichero, `mtime` posterior) quedan ambos fuera del borrado.
- Las fotos de ejecuciones anteriores tienen `mtime` < arranque y se siguen borrando.

### 3. Truncado al segundo: [x]
- Comparación estricta `mtime < floor(startedAt/1000)*1000`: un sistema de ficheros con resolución de segundos trunca el `mtime` de una foto nueva a ≥ ese mismo límite, así que no se borra. Solo es más conservador (una foto previa del mismo segundo del arranque se queda hasta el siguiente arranque); no introduce ningún borrado nuevo.
- `mtime` ausente, 0, `NaN` o no numérico → `Number.isFinite`/`> 0` lo conservan. Correcto.
- Reloj movido hacia atrás entre sesiones: las fotos antiguas quedarían con `mtime` > arranque y se conservarían (dirección segura). Hacia delante no afecta a fotos de esta sesión.

### 4. Tests: [x]
- `native-camera.test.ts` › `deletes only the photos older than the start of the app`: con `STARTED_AT` = …:30.500, se borran `EARLIER` y `STARTED_AT - 501` (…:29.999) y se conservan `STARTED_AT - 500` (inicio exacto del segundo, frontera del `<` estricto), `STARTED_AT` y `+1000`; afirma las llamadas exactas a `deleteFile` y el recuento 2. Discrimina tanto un `<=` como la ausencia de truncado.
- `› keeps the photos without a usable modification time`: `undefined`, 0, `NaN`, cadena → 0 borrados, `deleteFile` no llamado.
- `camera-photo-cleanup.test.ts` › `deletes the camera photos older than its call in the native app`: avanza el reloj simulado +500 ms tras la llamada y antes de que resuelva el `import()`; afirma `removeCameraPhotos(startedAt)` exacto. Si el instante se tomara tras el `import()`, el test fallaría: verifica de verdad el orden.
- Los tests previos usan `mtime = EARLIER` por defecto y siguen afirmando lo mismo.
- Checklist en dispositivo: paso 9 nuevo (mtime futuro se conserva, mtime actual se borra tras reabrir).

### Checkpoints (ronda 2)
- C1: [x] una feature `in_progress` (#79), rama `feat/camera-photo-cleanup`.
- C2: [x] `sdd: false`; trazabilidad de la ronda 2 revisada arriba.
- C3: [x] solo cambian los dos módulos de la limpieza y sus tests, más `progress/`.
- C4: [x] sin cambios de arquitectura; el plugin sigue cargado con `import()`.
- C5: [x] sin `any`, `@ts-ignore`, `console.log` ni TODOs.
- C6: [x] `pnpm harness --full` en verde (lint, typecheck; e2e 6, shared 187, db 3, web 674, api 373); `pnpm --filter @ikrive/mobile test` 30/30.
- C7: [x] `progress/impl_camera-photo-cleanup.md` con sección «Ronda 2», verificación del plugin, trazabilidad y salida del harness.

### Hallazgos
Ninguno.

### Avisos para el humano (no bloquean)
- Residual teórico: el kernel fija el `mtime` con un reloj «coarse» (resolución de un tick, ~4-10 ms), que puede ir hasta un tick por detrás de `Date.now()`. Solo importaría si una foto se creara a menos de un tick de `startedAt` y justo tras un cambio de segundo; como la foto exige montar la UI, navegar y pulsar la cámara, es inalcanzable.
- Sigue sin verificación en dispositivo: el paso 9 del checklist es la prueba real de la ronda 2.

### Cambios requeridos
Ninguno.
