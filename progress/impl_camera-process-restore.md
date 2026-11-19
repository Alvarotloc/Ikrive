# Implementación — camera-process-restore (#81)

Rama `feat/camera-process-restore`, sin commits (los hace el leader tras Gate 2). Tasks T1–T18 hechas. T17 (prueba en dispositivo) hecha en un HONOR ABR-NX1, en los dos modos y con los tres destinos (ver «T17 — prueba en dispositivo»).

## Cambios por archivo

Rutas relativas a `apps/web/src` salvo que se indique otra cosa.

### Nativo
- `lib/native-files.ts`: exporta `base64ToBytes` (antes privado en `native-storage.ts`).
- `lib/native-storage.ts`: importa `base64ToBytes` de `native-files`.
- `lib/native-camera.ts`:
  - `PENDING_CAPTURE_PATH = 'camera/pending-capture.json'` en `Directory.Data`;
  - `savePendingCapture(json)` (UTF-8, `recursive: true`);
  - `readPendingCapture()`: `null` si el fichero no existe; cualquier otro error rechaza;
  - `clearPendingCapture()`: no falla si el fichero no existe;
  - `readCameraPhotoSince(openedAt)`: el `JPEG_*` más reciente de `Pictures` con `size > 0` y `mtime ≥ floor(openedAt)`, leído entero como `File` `image/jpeg` con su nombre, o `null`.
- `lib/native-camera.test.ts`: mocks de `Data`/`Encoding`/`readFile`/`writeFile` y de `@capacitor/share` y `file-opener` (los importa `native-files`, como ya hace `native-storage.test.ts`). Cuatro tests nuevos.

### Marcador, botón y limpieza
- `features/mobile/camera-restore.ts` (nuevo):
  - `CaptureTarget`, `PendingCapture` y `pendingCaptureSchema` (zod; el borrador se valida con un esquema que `satisfies z.ZodType<MaintenanceFormInput>`);
  - `parsePendingCapture` y `currentCaptureMode`;
  - `rememberCapture` y `forgetCapture`: solo en la app nativa, con `import()`, sin rechazar nunca;
  - `pendingCaptureCutoff()`;
  - el almacén `offerRestoredCapture` / `useRestoredCapture`;
  - `claimRestoreRun` / `forgetRestoreRun`: la guarda de «una vez por proceso».
- `components/camera-capture-button.tsx`:
  - prop opcional `restoreTarget`;
  - en `onClick`, `void rememberCapture(restoreTarget())` y justo después `input.click()`, síncrono (solo en la app nativa y con destino);
  - `forgetCapture()` en `change` y en `cancel` (solo en la app nativa). El aviso de permiso no cambia.
- `components/camera-capture-button.test.tsx` (nuevo): los seis tests de T6.
- `features/mobile/camera-photo-cleanup.ts`: corte `Math.min(startedAt, (await pendingCaptureCutoff()) ?? startedAt)` y JSDoc actualizado.
- `features/mobile/camera-photo-cleanup.test.ts`: mock de `readPendingCapture` y tres tests nuevos.

### Recuperación
- `features/mobile/camera-restore-handler.tsx` (nuevo): `CameraRestoreHandler`.
  - Se ejecuta una vez por proceso y lee y valida el marcador.
  - Comprueba el modo y que el destino existe (`fetchQuery(vehicleQuery)`, y `maintenanceQuery` para `invoice`).
  - Lee la foto, la deja en el almacén y navega a `/vehicles/$id/edit` (foto del vehículo) o a `/vehicles/$id` (facturas y alta).
  - Si algo falla, muestra el toast `camera.restoreFailed` sin navegar.
  - Borra el marcador en un `finally`.
- `routes/_app.tsx`: `{isNativeApp() && <CameraRestoreHandler />}`.
- `features/vehicles/photo-picker.tsx`: `restoreTarget` de tipo `vehicle-photo` y `useRestoredCapture` → `onFile`.
- `features/maintenance/attachment-picker.tsx`: prop `restoreTarget`, que pasa al botón.
- `features/maintenance/maintenance-attachments.tsx`:
  - `restoreTarget` de tipo `invoice`;
  - prop `restoredFile` en `MaintenanceAttachmentsDialog`, que se sube una sola vez al montar (guarda con `useRef`, por StrictMode).
- `features/maintenance/maintenance-form.tsx`:
  - en el alta, `restoreTarget` de tipo `invoice-draft` con `form.getValues()` y `pending.length`;
  - prop `restored` (`RestoredDraft`): sus valores van como `defaultValues` y la foto pasa por `acceptFiles` a `pending` una sola vez. Si `lostInvoices`, toast `camera.restoredLostInvoices`.
- `features/maintenance/maintenance-timeline.tsx` (`MaintenanceSection`): `useRestoredCapture` con los destinos `invoice` (solo si el registro está en la lista) e `invoice-draft` de este vehículo.
  - Abre el diálogo de facturas o el formulario de alta con la foto.
  - El estado de la foto recuperada se limpia al cerrar el diálogo o al abrir otro, para que no se vuelva a subir.
- `i18n/locales/{es,en}.json`: `camera.restoreFailed` y `camera.restoredLostInvoices`.
- `features/mobile/camera-restore-handler.test.tsx` (nuevo): T12, T13 y un caso extra, `does nothing without a pending capture`.
- `features/mobile/local-mode.test.tsx`: mock de `@/lib/native-camera`, `forgetRestoreRun()` en `beforeEach` y los dos tests de T14.

### Docs
- `docs/mobile.md`:
  - en **Cámara**, el punto «Si Android cierra la app con la cámara abierta»: los tres destinos, qué se pierde, la sesión caducada, el aviso y cuándo se borra la foto;
  - la sección `### Probar en un dispositivo` (dentro de «Publicar una versión», junto a «Compilar en local», que es donde se genera `app-debug.apk`), con `adb install -r`, `am kill`, `pidof`, `ls …/files/Pictures`, los dos modos, el caso de cancelar y `dumpsys activity exit-info`.
- `apps/mobile/test/docs.test.mjs`: test `documents the camera photo recovery and the adb test`.

## Trazabilidad

| R | Test(s) |
|---|---|
| R1 | `lib/native-camera.test.ts` › `saves, reads and clears the pending capture in the app data`; `components/camera-capture-button.test.tsx` › `native: saves the capture target before opening the camera`, `native: opens the camera synchronously in the same click, without waiting for the capture to be saved` |
| R2 | `lib/native-camera.test.ts` › `saves, reads and clears…`, `reads a missing pending capture as null and clears it without error`; `camera-capture-button.test.tsx` › `native: forgets the capture when the photo arrives`, `native: forgets the capture when the camera is cancelled` |
| R3 | `camera-capture-button.test.tsx` › `native: opens the camera even if the capture cannot be saved`, `native: opens the camera synchronously…` |
| R4 | `lib/native-camera.test.ts` › `reads the newest non-empty camera photo taken since the camera opened`; `features/mobile/camera-restore-handler.test.tsx` › `restores a vehicle photo on the edit page after the app was killed` (comprueba `readCameraPhotoSince(openedAt)`), `restores only once per app run` |
| R5 | `camera-restore-handler.test.tsx` › `restores a vehicle photo on the edit page after the app was killed` (`PUT /vehicles/v1/photo` con el fichero y toast «Foto actualizada») |
| R6 | `camera-restore-handler.test.tsx` › `restores an invoice into the attachments dialog of its record` (`POST …/r1/attachments`, «1 factura subida») |
| R7 | `camera-restore-handler.test.tsx` › `restores an invoice draft into the create form without saving it` |
| R8 | `camera-restore-handler.test.tsx` › `warns that the other pending invoices were lost` (y el caso sin pendientes no avisa, en el test de R7) |
| R9 | `features/mobile/local-mode.test.tsx` › `restores a camera photo as the vehicle photo in local mode`, `restores an invoice draft and saves it with its invoice in local mode` |
| R10 | `lib/native-camera.test.ts` › `finds no camera photo when the camera left only an empty file`; `camera-restore-handler.test.tsx` › `warns when the pending capture is invalid`, `warns when the camera photo cannot be found` (null y lectura fallida), `warns when the capture was taken in the other mode`, `warns when the vehicle no longer exists`, `warns when the maintenance record no longer exists` |
| R11 | `camera-restore-handler.test.tsx` › `forgets the pending capture after restoring it`, `forgets the pending capture after a failed restore` (y `expectWarning` lo comprueba en todos los fallos) |
| R12 | `features/mobile/camera-photo-cleanup.test.ts` › `keeps the photos taken since a pending capture opened the camera`, `ignores an invalid pending capture` |
| R13 | `camera-photo-cleanup.test.ts` › `deletes the recovered photo on the next start without a pending capture` |
| R14 | `camera-capture-button.test.tsx` › `web: opens the camera without saving anything nor loading native code`; `features/pwa/native-only.test.ts` (sin cambios, en verde con los módulos nuevos); `camera-restore-handler.test.tsx` › `does nothing without a pending capture` |
| R15 | `apps/mobile/test/docs.test.mjs` › `documents the camera photo recovery and the adb test` |

Para comprobar que los tests del handler detectan fallos, quité a mano el `offerRestoredCapture` del handler: fallaron los 6 tests de restauración. Después lo restauré.

## `pnpm harness --full`

```
[OK]    82 features: 79 done, 2 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #81 camera-process-restore (in_progress)
[OK]    Rama actual: feat/camera-process-restore
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test
          apps/web     99 files, 702 tests passed
          apps/api     38 files, 373 tests passed
          packages/shared 26 files, 187 tests passed
          packages/db  1 file, 3 tests passed
          apps/mobile  31 tests passed
[OK]    Arnés en verde.
```

`pnpm --filter @ikrive/web build:native` también compila.

## T17 — prueba en dispositivo: HECHA

Dispositivo: HONOR ABR-NX1 (Android 16), APK debug de esta rama (`build:web` + `cap sync android` + `./gradlew assembleDebug` con `JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64`; el `JAVA_HOME` por defecto del equipo es JDK 17 y falla con `invalid source release: 21`, como ya avisa «Compilar en local») instalada con `adb install -r` encima de la debug anterior (misma firma, datos conservados). Cámara: `com.hihonor.camera/.ThirdCamera`. Todo se ha manejado por adb (`input tap`, `uiautomator dump`, `screencap`): la cámara acepta el toque en el obturador (`shutter_button`) y en «Aceptar» (`done_button`), así que no ha hecho falta nadie delante.

Procedimiento en cada caso:
1. Pulsar **Hacer foto**.
2. Comprobar que la cámara está delante (`topResumedActivity`) y que el marcador está en `files/camera/pending-capture.json` (`run-as`).
3. Ejecutar `adb shell am kill com.ikrive.app` y `pidof`, que tiene que salir vacío.
4. Obturador → Aceptar, y capturas cada 0,5 s para ver el toast.
5. Listar `Pictures`, `files/camera` y dónde ha acabado el fichero.

**Modo servidor:** API de esta rama arrancada aparte (sin el `.env` del repo, `PORT=3999`, `DATA_DIR` en el scratchpad, BD nueva), con `adb reverse tcp:3999 tcp:3999`, una cuenta y un vehículo de prueba creados para la ocasión («Servidor T17»). Al terminar, se ha vuelto a poner en la app el servidor que tenía (`http://192.168.1.48:3000`), sin sesión, y el modo «En este teléfono». La API de prueba está parada y el `adb reverse`, quitado.

**Modo local:** datos de prueba del propio teléfono (vehículos `test-clio` «Pruebas Clio» y, por un toque equivocado, `test-report-golf` «Informe Golf»).

### Resultados

| Destino | Modo | Muerte del proceso | Resultado | Evidencia |
|---|---|---|---|---|
| a) foto del vehículo | local | la mató el sistema al abrir la cámara (`pidof` vacío antes de `am kill`; exit-info `SIGNALED 9`, `iAwareR[LowMemQuick](previous)`) | ✅ abre `/vehicles/test-clio/edit` con la foto; nuevo `files/uploads/vehicles/ccfe67d5….webp` (288616 B) | marcador `{"kind":"vehicle-photo","vehicleId":"test-clio"},"mode":"local"` borrado tras recuperar |
| a) foto del vehículo | local (2.ª pasada) | `am kill` (`KILL BACKGROUND`) | ✅ edición de «Informe Golf» + toast «Foto actualizada»; nuevo `27d49514….webp` | capturas `a_*.png` |
| b) factura de un registro | local | `am kill` | ✅ diálogo «Facturas · T17 borrador 2» + «1 factura subida»; una sola subida (`c9c051cc….jpg`, 923103 B = tamaño del JPEG de la cámara) | `b_strip.png` |
| c) alta de mantenimiento | local | `am kill` | ✅ formulario con fecha, km 81234, categoría, título, taller y coste como estaban, y `JPEG_…163704….jpg` como factura pendiente. Antes de **Guardar** no hay ficheros nuevos (11 adjuntos). Tras Guardar: «Mantenimiento añadido» + «1 factura subida» y `aca408f5….jpg` (889422 B) | `evidence_c_local_before_save.png`, `h_strip.png` |
| a) foto del vehículo | servidor | la mató el sistema | ✅ edición + «Foto actualizada»; `apidata/uploads/vehicles/3f29eaca….webp` | `sa_strip.png` |
| c) alta de mantenimiento | servidor | `am kill` | ✅ formulario restaurado con la foto pendiente. 0 filas en `maintenance_records` antes de **Guardar**; después, la fila «T17 servidor» (51000 km, «Taller S», 12,3) y su adjunto (916521 B) + «1 factura subida» | `evidence_c_server_before_save.png`, `sh_strip.png` |
| c) con otra factura pendiente (R8) | servidor | `am kill` | ✅ marcador con `pendingCount: 1`; al volver, formulario restaurado + toast «Hemos recuperado la foto, pero las otras facturas que habías añadido se han perdido. Vuelve a añadirlas.» (no guardado: se cerró con Escape) | `sl_strip.png` |
| b) factura de un registro | servidor | `am kill` | ✅ diálogo «Facturas · T17 servidor» + «1 factura subida»; segundo adjunto del registro (880066 B) | `sb_strip.png` |
| cancelar la cámara | local | `am kill` | ✅ toast «No se ha podido recuperar la foto de la cámara. Vuelve a hacerla.», sin navegar (se queda en el inicio), marcador borrado y JPEG de 0 B | `x_strip.png` |
| cancelar la cámara | servidor | `am kill` | ✅ el mismo toast, sin navegar y sin subir foto del vehículo | `sx_strip.png` |
| foto del vehículo sin que muera el proceso (regresión) | servidor | ninguna (mismo pid 29682 antes y después) | ✅ camino normal: «Foto actualizada», foto nueva y marcador borrado por `change` | `sv_strip.png` |
| foto del vehículo (extra) | servidor | la mató el sistema | ✅ como el primer caso de servidor | `sn_strip.png` |

Las capturas están fuera del repo, en `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/5ea92add-99be-4662-bc67-d4154910e19e/scratchpad/t17/` (los `*_strip.png` son tiras de capturas seguidas).

### Marcador, `Pictures` y limpieza (R12, R13)

- **R12:** en todos los casos, la foto recuperada sigue en `Pictures` después del arranque que la recupera, aunque la limpieza se ejecuta en ese mismo arranque.
- **R13:** en el arranque siguiente sin marcador, la foto se borra. Ejemplos:
  - la foto de 16:29:44 ya no está tras cerrar y abrir la app (`force-stop` + lanzar) con `files/camera` vacío;
  - la de 16:34:09 se borra en el arranque de la pasada siguiente, porque el corte es el `openedAt` del marcador nuevo.
- **R11:** `files/camera/` se queda vacío después de cada intento, tanto si sale bien como si falla.

### Notas 6 y 7 del reviewer

- **Nota 6 (`am kill`):** basta con `am kill`.
  - Las 9 veces que el proceso seguía vivo con la cámara delante, `am kill` lo mató: `pidof` vacío y exit-info `reason=10 (USER REQUESTED) subreason=24 (KILL BACKGROUND)`.
  - En otras 3 ocasiones lo había matado ya el propio sistema al abrir la cámara (`reason=2 SIGNALED status=9`, `iAwareR[LowMemQuick](previous)`), que es justo el fallo de #79.

  No ha hecho falta `run-as … kill -9`, así que no se ha añadido a `docs/mobile.md`.
- **Nota 7 (`mtime` y 0 bytes):** se cumple en los dos casos.
  - Capacitor crea el `JPEG_*` vacío entre 8 y 11 ms después de `openedAt`, nunca antes:

    | `openedAt` | `mtime` del JPEG vacío |
    |---|---|
    | 16:29:12.100 | 16:29:12.110 |
    | 16:33:52.587 | 16:33:52.598 |
    | 16:37:04.366 | 16:37:04.374 |
    | 16:39:33.925 | 16:39:33.930 |
    | 16:40:34.977 | 16:40:34.986 |
    | 16:53:35.610 | 16:53:35.614 |

    Al aceptar la foto, la cámara lo reescribe con la foto y con el `mtime` de la captura.
  - Al cancelar, el fichero se queda en **0 bytes** (`JPEG_20261119_164034_….jpg`, `JPEG_20261119_165335_….jpg`), y eso es lo que dispara `camera.restoreFailed`.

  El criterio de `readCameraPhotoSince` vale para este fabricante.

### Sin probar en el dispositivo (cubierto por tests)

- **Marcador de otro modo y vehículo o registro borrado** (R10): para preparar el caso hay que cambiar de modo o borrar datos con la app muerta y la cámara abierta. Lo cubren los tests de `camera-restore-handler.test.tsx`.
- **Sesión caducada con servidor:** no se ha forzado.

### Cambios en los datos del teléfono (no destructivos, todos en vehículos de prueba)

- **Local, «Pruebas Clio» (`test-clio`):**
  - ahora tiene foto (antes no tenía);
  - mantenimiento nuevo «T17 borrador 2» (19 nov 2026, 81.234 km, «Taller T17», 45,50 €), con dos facturas JPEG.
- **Local, «Informe Golf» (`test-report-golf`):** se ha sustituido su foto, una foto de prueba de hoy a las 14:42, por una foto oscura, por un toque equivocado en la lista. La foto anterior no se puede recuperar: la app borra el fichero al sustituirla.
- **Lecturas de km:** no se ha tocado ninguna.
- **Ajustes:** el servidor guardado vuelve a ser `http://192.168.1.48:3000` (hubo que cerrar la sesión de prueba) y el modo, «En este teléfono».
- **`Download/`:** el fichero `t17-factura.jpg`, subido para el caso R8, ya está borrado.

### `pnpm harness --full` tras T17

No ha cambiado código. Sigue en verde: web 702 tests, api 373, el resto igual.

## Desviaciones y notas

- **Cola de escrituras del marcador** (`camera-restore.ts`, `queueChange`). `rememberCapture` y `forgetCapture` se encadenan en una promesa de módulo. Así, un `cancel` inmediato no puede borrar el marcador antes de que termine de escribirse, lo que dejaría un marcador huérfano y un aviso falso en el siguiente arranque. No cambia el comportamiento pedido: `rememberCapture` se sigue lanzando sin `await` e `input.click()` sigue siendo síncrono. Lo cubren los tests de orden de `camera-capture-button.test.tsx`.
- **Guarda «una vez por proceso»** expuesta como `claimRestoreRun` / `forgetRestoreRun` en `camera-restore.ts`, en lugar de una variable privada del handler. Así los tests pueden simular un proceso nuevo, igual que hace `forgetLocalDataSource`. `forgetRestoreRun` también vacía el almacén.
- **Texto del toast de R5:** el requirement dice «Foto guardada», pero la clave existente `vehicles.photo.saved` dice «Foto actualizada». Se usa el mismo camino que una foto recién hecha (lo que pide R5), así que el test comprueba «Foto actualizada». No se ha cambiado el texto.
- **Fallo al leer el marcador** (un error distinto de «no existe»): el handler no avisa, porque no puede saber si había marcador, y aun así intenta borrarlo. Lo mismo hace `pendingCaptureCutoff`, que en ese caso devuelve `null`. R10 solo cubre el caso «hay un marcador».
- **`forgetCapture` en `change`/`cancel`** se llama en la app nativa aunque el botón no tenga `restoreTarget`, tal como dice R2. Si no hay marcador, no hace nada.
- **Revisión visual:** no hay capturas. La UI nueva son solo dos toasts de sonner (mismo estilo que los existentes) y una navegación. Solo se pueden ver en el build nativo con un marcador en disco, no con `pnpm dev`, y la feature no añade componentes (design › UI). El texto y el comportamiento los cubren los tests de componente. Si el reviewer las quiere, habría que hacerlas en el dispositivo durante T17.
- **Ubicación de «Probar en un dispositivo»:** va como subsección `###` dentro de «Publicar una versión (mantenedores)», justo después de «Compilar en local», que es donde se genera la APK debug que usa el procedimiento.
