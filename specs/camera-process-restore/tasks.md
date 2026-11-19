# Tasks — camera-process-restore

Rutas relativas a `apps/web/src` salvo que se indique otra cosa.

## Nativo

- [x] T1 — Mover `base64ToBytes` de `lib/native-storage.ts` a `lib/native-files.ts`, exportarlo e importarlo desde `native-storage.ts`. Los tests existentes siguen en verde. Cubre: R4.
- [x] T2 — Añadir a `lib/native-camera.ts`:
  - `PENDING_CAPTURE_PATH`;
  - `savePendingCapture`, `readPendingCapture` y `clearPendingCapture`, en `Directory.Data`, con `null`/sin error si el fichero no existe;
  - `readCameraPhotoSince(openedAt)`: el `JPEG_*` más reciente con `size > 0` y `mtime ≥ floor(openedAt)`, leído como `File` `image/jpeg` con su nombre, o `null`.

  Cubre: R1, R2, R4, R10.
- [x] T3 — Tests en `lib/native-camera.test.ts`, con `@capacitor/filesystem` simulado:
  - `saves, reads and clears the pending capture in the app data`;
  - `reads a missing pending capture as null and clears it without error`;
  - `reads the newest non-empty camera photo taken since the camera opened`;
  - `finds no camera photo when the camera left only an empty file`.

  Cubre: R1, R2, R4, R10.

## Marcador y botón

- [x] T4 — Crear `features/mobile/camera-restore.ts`:
  - `CaptureTarget` y `pendingCaptureSchema` (zod);
  - `rememberCapture` / `forgetCapture`, con `import()` del módulo nativo, sin hacer nada en la web y sin rechazar nunca;
  - `pendingCaptureCutoff()`;
  - el almacén `offerRestoredCapture` / `useRestoredCapture`.

  Cubre: R1, R2, R3, R12, R14.
- [x] T5 — `components/camera-capture-button.tsx`:
  - prop `restoreTarget`;
  - `rememberCapture` lanzado sin `await` (fire-and-forget) y `input.click()` síncrono justo después, en el mismo gesto (solo en la app nativa);
  - `forgetCapture()` en `change` y en `cancel`, sin cambiar el aviso de permiso.

  Cubre: R1, R2, R3, R14.
- [x] T6 — Tests en `components/camera-capture-button.test.tsx` (nuevo), con `@/lib/native-camera` simulado:
  - `native: saves the capture target before opening the camera`;
  - `native: opens the camera synchronously in the same click, without waiting for the capture to be saved`;
  - `native: forgets the capture when the photo arrives`;
  - `native: forgets the capture when the camera is cancelled`;
  - `native: opens the camera even if the capture cannot be saved`;
  - `web: opens the camera without saving anything nor loading native code`.

  Cubre: R1, R2, R3, R14.

## Limpieza de #79

- [x] T7 — `features/mobile/camera-photo-cleanup.ts`: el corte es `Math.min(startedAt, (await pendingCaptureCutoff()) ?? startedAt)`. Actualizar su JSDoc. Cubre: R12, R13.
- [x] T8 — Tests en `features/mobile/camera-photo-cleanup.test.ts`:
  - `keeps the photos taken since a pending capture opened the camera`;
  - `ignores an invalid pending capture`;
  - `deletes the recovered photo on the next start without a pending capture`.

  Cubre: R12, R13.

## Recuperación

- [x] T9 — Crear `features/mobile/camera-restore-handler.tsx` (`CameraRestoreHandler`):
  - se ejecuta una vez por proceso;
  - valida el marcador, el modo y que el destino existe, y luego lee la foto, la ofrece al almacén y navega;
  - si algo falla, toast `camera.restoreFailed`;
  - borra el marcador en un `finally`.

  Montarlo en `routes/_app.tsx` solo con `isNativeApp()`. Cubre: R4, R10, R11, R14.
- [x] T10 — Consumir la foto recuperada en los tres destinos:
  - `features/vehicles/photo-picker.tsx`: `restoreTarget` y `useRestoredCapture` → `onFile`;
  - `features/maintenance/attachment-picker.tsx`: pasa `restoreTarget`;
  - `features/maintenance/maintenance-attachments.tsx`: `restoreTarget` y `restoredFile` → `onFiles`;
  - `features/maintenance/maintenance-form.tsx`: `restoreTarget` con el borrador y prop `restored` (valores, factura pendiente y toast `camera.restoredLostInvoices`);
  - `features/maintenance/maintenance-timeline.tsx`: abre el diálogo o el formulario según el destino.

  Cubre: R5, R6, R7, R8.
- [x] T11 — Claves `camera.restoreFailed` y `camera.restoredLostInvoices` en `i18n/locales/es.json` y `en.json`. Cubre: R8, R10.
- [x] T12 — Tests en `features/mobile/camera-restore-handler.test.tsx` (nuevo; `renderApp`, modo servidor con `setServerMode`, `mockApi`, `@/lib/native-camera` simulado):
  - `restores a vehicle photo on the edit page after the app was killed`, que comprueba el `PUT /vehicles/v1/photo` y el toast «Foto actualizada»;
  - `restores an invoice into the attachments dialog of its record`;
  - `restores an invoice draft into the create form without saving it`, que comprueba los campos, la factura pendiente, que no sale ninguna petición hasta «Guardar» y el `POST` de la factura después;
  - `warns that the other pending invoices were lost`;
  - `restores only once per app run`;
  - `forgets the pending capture after restoring it`.

  Cubre: R4, R5, R6, R7, R8, R11.
- [x] T13 — Tests de fallo en `features/mobile/camera-restore-handler.test.tsx`:
  - `warns when the pending capture is invalid`;
  - `warns when the camera photo cannot be found`;
  - `warns when the capture was taken in the other mode`;
  - `warns when the vehicle no longer exists`;
  - `warns when the maintenance record no longer exists`;
  - `forgets the pending capture after a failed restore`.

  Todos comprueban el toast y que no hay navegación. Cubre: R10, R11.
- [x] T14 — Tests en modo local en `features/mobile/local-mode.test.tsx`, añadiendo `@/lib/native-camera` a sus mocks:
  - `restores a camera photo as the vehicle photo in local mode`;
  - `restores an invoice draft and saves it with its invoice in local mode`, que comprueba la factura en el almacén de ficheros en memoria.

  Cubre: R9.
- [x] T15 — Comprobar que `features/pwa/native-only.test.ts` sigue en verde con los módulos nuevos (ninguno importa estáticamente `@capacitor/*` ni `lib/native-*`). Cubre: R14.

## Docs

- [x] T16 — En `docs/mobile.md`:
  - en el apartado **Cámara**, qué pasa si Android cierra la app con la cámara abierta: dónde llega la foto, qué se pierde, el aviso y cuándo se borra;
  - sección «Probar en un dispositivo» con el procedimiento de `adb shell am kill com.ikrive.app` con la cámara abierta, en los tres destinos y en los dos modos, más `dumpsys activity exit-info`.

  Test `documents the camera photo recovery and the adb test` en `apps/mobile/test/docs.test.mjs`. Cubre: R15.
- [x] T17 — Prueba en dispositivo según T16, con los resultados en `progress/impl_camera-process-restore.md`. Cubre: R5, R6, R7, R9, R12.

## Cierre

- [x] T18 — Ejecutar `pnpm harness --full` y documentar la trazabilidad en `progress/impl_camera-process-restore.md`. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15.
