# Review — #81 camera-process-restore

**Veredicto:** APPROVED

Revisado el diff completo: `git diff main...HEAD` (solo el spec y el estado del backlog), `git diff` y los ficheros sin trackear (`camera-restore.ts`, `camera-restore-handler.tsx` y sus tests, `camera-capture-button.test.tsx`). `pnpm harness --full` lo he ejecutado yo y está en verde: web 702, api 373, shared 187, db 3 y mobile 31 tests.

## Trazabilidad requirements ↔ tests

Rutas relativas a `apps/web/src`.

- R1: [x] `components/camera-capture-button.test.tsx` › `native: saves the capture target before opening the camera`. Comprueba el JSON exacto `{ target, mode: 'local', openedAt }` y que `openedAt ≤` el momento del `click()`. `native: opens the camera synchronously…` usa un `fireEvent.click` sin `await` y una escritura que no termina, y comprueba que `click()` se ha llamado. `lib/native-camera.test.ts` › `saves, reads and clears…` comprueba `writeFile` en `Directory.Data`, con UTF-8 y `recursive: true`.
- R2: [x] `camera-capture-button.test.tsx` › `forgets the capture when the photo arrives` y `…when the camera is cancelled`. Comprueba que se llama a `clearPendingCapture`, que va después de `save`, y que el aviso de permiso no cambia. El caso del fichero que no existe lo cubre `native-camera.test.ts`.
- R3: [x] `camera-capture-button.test.tsx` › `opens the camera even if the capture cannot be saved`. `save` rechaza y aun así se abre la cámara, llega `onFile` y se ejecuta el `clear` siguiente.
- R4: [x] `native-camera.test.ts` › `reads the newest non-empty camera photo…` comprueba:
  - el filtro por nombre, tamaño, tipo y `mtime ≥ floor(openedAt)`;
  - el orden;
  - la ruta;
  - el `File` `image/jpeg` con su nombre y bytes.

  `camera-restore-handler.test.tsx` › `restores only once per app run` comprueba que `readPendingCapture` se llama una vez y que solo hay un `PUT` tras volver a montar.
- R5: [x] `camera-restore-handler.test.tsx` › `restores a vehicle photo…` comprueba la ruta `/vehicles/v1/edit`, el `PUT /vehicles/v1/photo` con el nombre del fichero y el toast. El texto del toast no coincide con el spec (ver Avisos).
- R6: [x] `restores an invoice into the attachments dialog…` comprueba el diálogo del registro, el `POST …/r1/attachments` con el fichero y «1 factura subida».
- R7: [x] `restores an invoice draft into the create form without saving it` comprueba:
  - los 8 campos;
  - la factura pendiente;
  - que no hay ningún `POST` antes de «Guardar»;
  - el cuerpo del `POST` y la subida a `r9` después.
- R8: [x] `warns that the other pending invoices were lost` comprueba el toast. El test de R7 comprueba que no sale con `pendingCount: 0`.
- R9: [x] `features/mobile/local-mode.test.tsx` › `restores a camera photo as the vehicle photo in local mode` comprueba `photoUrl` y el fichero `.webp` en el almacén. `restores an invoice draft and saves it with its invoice in local mode` comprueba la fila, el adjunto con su `originalName` y el `.jpg` en el almacén.
- R10: [x] `camera-restore-handler.test.tsx` › bloque `when the photo cannot be restored` (marcador inválido, foto null o ilegible, otro modo, vehículo 404, registro inexistente). Cada caso comprueba el toast exacto, que no hay navegación, que no hay diálogo y que se borra el marcador. El test `finds no camera photo when the camera left only an empty file` de `native-camera.test.ts` también cubre este requirement.
- R11: [x] `forgets the pending capture after restoring it` y `…after a failed restore`. Comprueban que `clear` va después de `readCameraPhotoSince`. Además, `expectWarning` lo comprueba en todos los fallos.
- R12: [x] `features/mobile/camera-photo-cleanup.test.ts` › `keeps the photos taken since a pending capture…` comprueba que se llama con `OPENED_AT`. `removeCameraPhotos` ya redondea hacia abajo al segundo, y lo cubren los tests de #79. `ignores an invalid pending capture` cubre 3 JSON inválidos y uno ilegible, y en todos el corte es `STARTED_AT`.
- R13: [x] `deletes the recovered photo on the next start without a pending capture` comprueba los cortes `[OPENED_AT]` y `[nextStart]`.
- R14: [x] `camera-capture-button.test.tsx` › `web: opens the camera without saving anything nor loading native code` comprueba que el módulo nativo no se carga y que no hay ni `save` ni `clear`. `features/pwa/native-only.test.ts` sigue en verde: los módulos nuevos solo usan `import()` de `@/lib/native-camera`. `_app.tsx` monta el handler solo con `isNativeApp()`.
- R15: [x] `apps/mobile/test/docs.test.mjs` › `documents the camera photo recovery and the adb test`.

## Tasks
- T1–T16 y T18: [x]
- T17: [ ], sin dispositivo. Está justificado en `progress/impl_camera-process-restore.md` › «T17 — prueba en dispositivo: PENDIENTE (humano)». Tiene que hacerlo el humano antes de Gate 2. El procedimiento basta, con el matiz de `am kill` que explico en Avisos.

## Checkpoints
- C1: [x] El arnés está en verde, la única feature activa es #81 y la rama es `feat/camera-process-restore`.
- C2: [x] El spec está completo y en EARS. La tabla de acceptance está cubierta. Todas las tasks están marcadas salvo T17, que está justificada. Cada R tiene un test que he abierto y leído.
- C3: [x] El diff toca solo los ficheros de `design.md` (más `progress/current.md` y `tasks.md`). El único cambio que no es estrictamente de la feature es mover `base64ToBytes`, y está previsto (T1).
- C4: [x] No hay API ni BD. El código web está en `features/mobile/` y `features/maintenance/`, los textos en `es.json` y `en.json`, y se usan los toasts y componentes existentes. `targetExists` usa `vehicleQuery` y `maintenanceQuery`.
- C5: [x] Sin `any`, `@ts-ignore`, `console.*` ni TODOs. Las fechas del borrador van como `YYYY-MM-DD` y el kilometraje se guarda tal cual en texto.
- C6: [x] El harness está en verde y los tests afirman resultados concretos. No hay capturas, y está justificado: la UI nueva son solo dos toasts de sonner con el estilo existente, y solo se ven en el build nativo con un marcador en disco.
- C7: [x] El informe de implementación tiene los archivos, el mapa R→test y la salida. `current.md` está al día. `PLAN.md` no necesita cambios: no se cierra ninguna fase ni cambia ninguna decisión.

## Hallazgos

He mirado a fondo los puntos que pediste y en ninguno hay un fallo que bloquee.

1. **Cola de escrituras** (`features/mobile/camera-restore.ts:112-145`):
   - `rememberCapture` toma `Date.now()` y encola de forma síncrona. El botón (`camera-capture-button.tsx:367-371`) llama a `void rememberCapture(...)` y justo después a `input.click()` en el mismo handler, sin `await`, así que se conserva la activación de usuario.
   - `queueChange` encadena sobre `lastChange` y cada cambio espera a que termine el anterior. Un `cancel` o `change` inmediato no puede borrar el marcador antes de que se escriba.
   - Los errores se tragan dentro del eslabón, así que una escritura fallida no bloquea la cola (lo comprueba el test de R3).
   - El módulo nativo ya está cargado desde el arranque por `cleanUpCameraPhotos`, así que el `import()` de la cola no añade latencia real.
2. **Corte de la limpieza de #79** (`camera-photo-cleanup.ts:400`): `Math.min(startedAt, openedAt)`, y `removeCameraPhotos` redondea hacia abajo al segundo y borra solo `mtime < before`. Se conservan las fotos con `mtime ≥ floor(openedAt)`, que es lo que pide R12. Un marcador ilegible o inválido devuelve `null` y el corte vuelve a ser `startedAt`.
3. **Carrera entre la limpieza y el handler:**
   - El handler borra el marcador en el `finally` y solo después de leer la foto entera en memoria.
   - Si la limpieza lee el marcador después de ese borrado, la foto ya está en un `File` en memoria y borrar el fichero no afecta.
   - En cualquier otro orden, la limpieza ve el marcador y conserva la foto.

   No hay ventana de pérdida.
4. **Una vez por proceso en StrictMode:**
   - `claimRestoreRun` es un flag de módulo. El segundo efecto de StrictMode devuelve `false` y el primero sigue su promesa con un `navigate` y un `queryClient` estables.
   - Los consumidores usan `useRestoredCapture`, que saca la captura del almacén antes de llamar a `consume`.
   - `MaintenanceAttachments` y `MaintenanceForm` protegen la subida o la factura pendiente con un `useRef` del `File`, que sobrevive al doble efecto.

   El resultado es una sola subida.

## Avisos para el humano (no bloquean)

1. **El texto del toast de R5 no coincide con el spec.** R5 dice «Foto guardada» entre paréntesis, pero el camino de `PhotoPicker` (`vehicles.photo.saved`) muestra «Foto actualizada», y el test comprueba ese texto. El núcleo de R5, «por el mismo camino que una foto recién hecha», se cumple, y cambiar la clave existente afectaría a la subida normal. Propuesta: el leader corrige el paréntesis de `specs/camera-process-restore/requirements.md` a «Foto actualizada» antes del merge, para que spec y test coincidan.
2. **La nota del informe sobre el fallo al leer el marcador no coincide con el código.** El informe dice que, si `readPendingCapture` falla con un error distinto de «no existe», el handler «aun así intenta borrarlo». En `camera-restore-handler.tsx:260-262` la lectura está fuera del `try/finally`, así que en ese caso no se llama a `clearPendingCapture`. Es inocuo: no se sabe si hay marcador, y el siguiente arranque lo vuelve a intentar. Pero conviene corregir la nota o el código.
3. **Fallo de `navigate` sin toast.** Si `openTarget` rechaza (`camera-restore-handler.tsx:270`), el marcador se borra pero no sale ningún toast, porque el `.catch` exterior se lo traga. En la práctica no debería pasar, porque las rutas son estáticas y ya existen.
4. **Los tests de orden no reproducen una escritura lenta.** Los tests de `camera-capture-button.test.tsx` comprueban `invocationCallOrder` (save antes que clear), pero `save` resuelve al momento. Ningún test cubre una escritura todavía pendiente cuando llega el `cancel`, así que la garantía principal de la cola no está fijada por un test. Es una desviación del implementer, no un requirement, por eso no bloquea.
5. **`setLocalMode(true)`** en `native: saves the capture target…` no se restaura en `afterEach`. Ahora no afecta a los demás tests del fichero.
6. **T17 y `adb shell am kill`.** El procedimiento de `docs/mobile.md` › «Probar en un dispositivo» y el del informe bastan: cubren los tres destinos, los dos modos, el caso de cancelar, el `ls` de `Pictures` antes y después de reiniciar, y `exit-info`. El matiz: `am kill` solo mata procesos que Android considera seguros de matar en segundo plano, y con la cámara delante puede no hacerlo. El paso `pidof` lo detectaría. En ese caso hay dos alternativas en la APK debug:
   - `adb shell run-as com.ikrive.app kill -9 $(adb shell pidof com.ikrive.app)`;
   - Opciones de desarrollador › «Límite de procesos en segundo plano: ninguno».

   No hay que usar `am force-stop`: borra la tarea y no entrega el resultado. Convendría añadir esta alternativa a `docs/mobile.md` cuando se haga T17.
7. **Comprobar en el dispositivo durante T17:**
   - que el `JPEG_*` que crea Capacitor antes de abrir la cámara tiene un `mtime` igual o posterior a `openedAt` una vez escrito;
   - que en el caso de cancelar queda a 0 bytes, que es lo que dispara `camera.restoreFailed`.

   Si alguna de las dos falla, el criterio de `readCameraPhotoSince` no vale para ese fabricante.

## Cambios requeridos
Ninguno.
