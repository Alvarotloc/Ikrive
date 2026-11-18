# Tasks — camera-capture

## Android

- [x] T1 — `apps/mobile/android/app/src/main/AndroidManifest.xml`: `<uses-permission android:name="android.permission.CAMERA" />` y `<queries>` con `android.media.action.IMAGE_CAPTURE`. Cubre: R8, R9.
- [x] T2 — `apps/mobile/android/app/src/main/java/com/ikrive/app/CameraPermissionPlugin.java` (plugin vacío con `@Permission(alias = "camera", strings = CAMERA)`) y `MainActivity.onCreate` con `registerPlugin(CameraPermissionPlugin.class)` antes de `super.onCreate`. Cubre: R10.
- [x] T3 — En `apps/mobile/test/config.test.mjs`: test `declares the CAMERA permission and the image capture query` (regex sobre el manifest) y `registers the camera permission plugin` (lee `MainActivity.java` y `CameraPermissionPlugin.java`: `registerPlugin(CameraPermissionPlugin.class)` antes de `super.onCreate`, `name = "CameraPermission"`, alias `camera` con `Manifest.permission.CAMERA`). Cubre: R8, R9, R10.

## Módulos web

- [x] T4 — `apps/web/src/lib/native-camera.ts` (`isCameraGranted()` con `registerPlugin('CameraPermission')`) y test `apps/web/src/lib/native-camera.test.ts` (con `vi.mock('@capacitor/core')`): `is granted only when the camera permission is granted` (`granted` → true; `prompt`, `denied`, `prompt-with-rationale` → false). Cubre: R10, R11, R12.
- [x] T5 — `apps/web/src/features/pwa/config.ts`: `camera` en la regex de `NATIVE_ONLY_MODULES`. En `apps/web/src/features/pwa/native-only.test.ts`, test `sends the camera module to assets/native/`. Cubre: R15, R14.
- [x] T6 — `apps/web/src/lib/use-can-capture.ts` (`COARSE_POINTER_QUERY`, `useCanCapture`) y test `apps/web/src/lib/use-can-capture.test.tsx` (`renderHook` + `mockMediaQuery`): `is true on a coarse pointer`, `is false on a fine pointer on the web`, `is true in the native app with a fine pointer`. Cubre: R1, R4, R6.
- [x] T7 — `apps/web/src/components/camera-capture-button.tsx` (`CameraCaptureButton` según `design.md`) y claves `camera.take`, `camera.input`, `camera.denied`, `vehicles.photo.gallery`, `vehicles.photo.fileInput` en `apps/web/src/i18n/locales/es.json` y `en.json` (pasa `es and en define the same keys` de `apps/web/src/i18n/locales.test.ts`). Cubre: R11, R12, R14, R18.

## Selectores

- [x] T8 — `apps/web/src/features/vehicles/photo-picker.tsx`: `useCanCapture`, `CameraCaptureButton` con el mismo `onFile`, texto `vehicles.photo.gallery` en táctil, `aria-label` en el input actual y `flex-wrap`. Cubre: R1, R2, R3, R6, R7.
- [x] T9 — Test de componente nuevo `apps/web/src/features/vehicles/photo-picker.test.tsx` (`renderWithProviders`, `mockApi` con el `PUT` de la foto del vehículo, `vi.mock('@/lib/native-camera')`): `offers take photo and choose from gallery on a touch device` (input de cámara con `capture="environment"` y `accept="image/*"`; el de galería sin `capture`), `uploads a photo taken with the camera like a chosen one` (petición enviada y toast «Foto actualizada»), `shows the invalid image error for a camera photo the API rejects`, `desktop: hides take photo and keeps add photo`, `native: warns when the camera is cancelled without permission`, `native: says nothing when the camera is cancelled with permission`, `chooses from the gallery after the camera permission warning`, `web: never checks the camera permission on cancel` (sin `MODE=native`, el mock de `isCameraGranted` no se llama y no hay toast), `server mode: sends the camera photo to the server with the token` (`setServerMode`). Cubre: R1, R2, R3, R6, R7, R11, R12, R13, R14, R17.
- [x] T10 — `apps/web/src/features/maintenance/attachment-picker.tsx`: `useCanCapture` y `CameraCaptureButton` con `onFile={(file) => onFiles([file])}` y el mismo `disabled`. Cubre: R4, R5, R6.
- [x] T11 — En `apps/web/src/features/maintenance/maintenance-attachments.test.tsx`: `mockMediaQuery(false)` en `beforeEach` y tests `offers take photo next to upload invoices on a touch device` (input con `capture="environment"`, `accept="image/*"`, sin `multiple`), `uploads an invoice photo taken with the camera`, `rejects a camera photo over the limit without uploading it`, `shows the unsupported type error for a camera photo the API rejects with 415`, `desktop: hides take photo`. Cubre: R4, R5, R6.
- [x] T12 — En `apps/web/src/features/maintenance/maintenance-form.test.tsx`: `mockMediaQuery(false)` en `beforeEach` y test `uploads an invoice photo taken with the camera after creating the record` (con `mockMediaQuery(true)`). Cubre: R4, R5.

## Modo local y documentación

- [x] T13 — En `apps/web/src/features/mobile/local-mode.test.tsx`: adaptar `vehicle page shows the photo picker and the sale report` (táctil: «Elegir de la galería» y el input por su `aria-label`) y `maintenance shows attachments`; tests nuevos `takes the vehicle photo with the camera in local mode` (clave `vehicles/….webp` en `storage.store`) y `takes an invoice photo with the camera in local mode` (una clave `attachments/…` en `storage.store`). Cubre: R16.
- [x] T14 — `docs/mobile.md`: viñeta de la cámara (se pide el permiso la primera vez; si se deniega, aviso y cómo activarlo en *Ajustes › Aplicaciones › Ikrive › Permisos*; galería y archivos siguen funcionando) y test `documents the camera permission` en `apps/mobile/test/docs.test.mjs`. Copiar en `progress/impl_camera-capture.md` la checklist manual de `design.md` › Riesgos. Cubre: R11, R13.

## Cierre

- [x] T15 — Ejecutar `pnpm harness --full` y documentar trazabilidad en `progress/impl_camera-capture.md`. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18.
