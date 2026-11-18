# Implementación — camera-capture (#73)

Rama `feat/camera-capture`. Todas las tasks T1–T15 están marcadas en `specs/camera-capture/tasks.md`. Sin commitear.

Una ejecución anterior se cortó a mitad de T7. En esta se han revisado T4–T6 contra `design.md`: cumplen el diseño y no ha hecho falta cambiarlas. Sus tests están en verde. También se ha terminado el borrador de `CameraCaptureButton` (T7) y se han hecho T8–T15.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `apps/mobile/android/app/src/main/AndroidManifest.xml` | `<uses-permission android:name="android.permission.CAMERA" />` y `<queries>` con la acción `android.media.action.IMAGE_CAPTURE` (T1). |
| `apps/mobile/android/app/src/main/java/com/ikrive/app/CameraPermissionPlugin.java` (nuevo) | Plugin `@CapacitorPlugin(name = "CameraPermission", permissions = @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }))` sin métodos propios (T2). |
| `apps/mobile/android/app/src/main/java/com/ikrive/app/MainActivity.java` | `onCreate` llama a `registerPlugin(CameraPermissionPlugin.class)` antes de `super.onCreate` (T2). |
| `apps/mobile/test/config.test.mjs` | Tests `declares the CAMERA permission and the image capture query` y `registers the camera permission plugin` (T3). |
| `apps/web/src/lib/native-camera.ts` (nuevo) | `registerPlugin('CameraPermission')` e `isCameraGranted()`, que solo es `true` con `granted` (T4). |
| `apps/web/src/lib/native-camera.test.ts` (nuevo) | Test unitario con `@capacitor/core` simulado (T4). |
| `apps/web/src/features/pwa/config.ts` | `camera` añadido a la regex de `NATIVE_ONLY_MODULES` (T5). |
| `apps/web/src/features/pwa/native-only.test.ts` | Test `sends the camera module to assets/native/` (T5). |
| `apps/web/src/lib/use-can-capture.ts` (nuevo) | `COARSE_POINTER_QUERY` y `useCanCapture()` = `useMediaQuery('(pointer: coarse)') \|\| isNativeApp()`. El hook se llama siempre (T6). |
| `apps/web/src/lib/use-can-capture.test.tsx` (nuevo) | 3 tests con `renderHook` y `mockMediaQuery` (T6). |
| `apps/web/src/components/camera-capture-button.tsx` (nuevo) | `CameraCaptureButton`: un `Button` «Hacer foto» con el icono `Camera` y un input oculto (`accept="image/*"`, `capture="environment"`, sin `multiple`, `sr-only`, `tabIndex={-1}`, `aria-label`). En `change` llama a `onFile` y vacía el input. El `cancel` se escucha con `addEventListener`: solo en la app nativa hace `import('@/lib/native-camera')` y, si `isCameraGranted()` es `false`, muestra `toast.error(t('camera.denied'))`. Si el import o el plugin fallan, no se avisa de nada (T7). |
| `apps/web/src/i18n/locales/es.json`, `en.json` | `camera.take`, `camera.input`, `camera.denied`, `vehicles.photo.gallery`, `vehicles.photo.fileInput` con los textos de `design.md` (T7). |
| `apps/web/src/features/vehicles/photo-picker.tsx` | `useCanCapture()`. En táctil muestra `CameraCaptureButton` (mismo `onFile`, `size="sm"`, `variant="outline"`, `disabled={busy}`) y el botón de archivo dice «Elegir de la galería». En escritorio todo sigue igual («Añadir foto» / «Cambiar foto»). El input de galería tiene `aria-label`. La barra tiene `flex-wrap` (T8). |
| `apps/web/src/features/vehicles/photo-picker.test.tsx` (nuevo) | 10 tests de componente (T9). |
| `apps/web/src/features/maintenance/attachment-picker.tsx` | `useCanCapture()`. En táctil, `CameraCaptureButton` (`outline`, `sm`, mismo `disabled`) con `onFile={(file) => onFiles([file])}`, junto al botón actual dentro de un `flex flex-wrap gap-2`. El texto de ayuda sigue debajo de los dos (T10). |
| `apps/web/src/features/maintenance/maintenance-attachments.test.tsx` | `mockMediaQuery(false)` en `beforeEach` y un bloque `camera` con 5 tests (T11). |
| `apps/web/src/features/maintenance/maintenance-form.test.tsx` | `mockMediaQuery(false)` en `beforeEach` y el test `uploads an invoice photo taken with the camera after creating the record` (T12). |
| `apps/web/src/features/maintenance/maintenance-timeline.test.tsx` | `mockMediaQuery(false)` en `beforeEach`. Ver «Desviaciones». |
| `apps/web/src/features/mobile/local-mode.test.tsx` | `vehicle page shows the photo picker and the sale report` ahora es táctil: comprueba «Hacer foto» y «Elegir de la galería», sube por el input `Elegir foto del vehículo` y espera el toast «Foto actualizada». `maintenance shows attachments` comprueba que hay «Hacer foto» en el alta. Tests nuevos: `takes the vehicle photo with the camera in local mode` y `takes an invoice photo with the camera in local mode`. Helper `jpeg(name)` y `toast.dismiss()` en `afterEach` (T13). |
| `docs/mobile.md` | Viñeta **Cámara** en «Ficheros»: se pide permiso la primera vez; si se deniega, la app avisa y explica cómo activarlo en *Ajustes › Aplicaciones › Ikrive › Permisos*; galería y archivos siguen funcionando («Subir facturas», o «Añadir facturas» en el alta de un mantenimiento); dónde quedan las fotos (T14). |
| `apps/mobile/test/docs.test.mjs` | Test `documents the camera permission` (T14). |

Sin cambios en la API, la BD, `packages/shared` ni `DataSource`.

## Trazabilidad

Rutas de web relativas a `apps/web/src/`.

| R | Archivo › test |
|---|---|
| R1 | `features/vehicles/photo-picker.test.tsx` › `offers take photo and choose from gallery on a touch device`; `lib/use-can-capture.test.tsx` › `is true on a coarse pointer`, `is true in the native app with a fine pointer` |
| R2 | `photo-picker.test.tsx` › `offers take photo and choose from gallery on a touch device` (input de galería con `accept="image/*"` y sin `capture`) |
| R3 | `photo-picker.test.tsx` › `uploads a photo taken with the camera like a chosen one`, `shows the invalid image error for a camera photo the API rejects` |
| R4 | `features/maintenance/maintenance-attachments.test.tsx` › `camera` › `offers take photo next to upload invoices on a touch device`, `uploads an invoice photo taken with the camera`; `features/maintenance/maintenance-form.test.tsx` › `uploads an invoice photo taken with the camera after creating the record`; `use-can-capture.test.tsx` |
| R5 | `maintenance-attachments.test.tsx` › `camera` › `rejects a camera photo over the limit without uploading it`, `shows the unsupported type error for a camera photo the API rejects with 415`, `uploads an invoice photo taken with the camera`; `maintenance-form.test.tsx` › `uploads an invoice photo taken with the camera after creating the record` |
| R6 | `photo-picker.test.tsx` › `desktop: hides take photo and keeps add photo`; `maintenance-attachments.test.tsx` › `camera` › `desktop: hides take photo`; `use-can-capture.test.tsx` › `is false on a fine pointer on the web` |
| R7 | `photo-picker.test.tsx` › `desktop: hides take photo and keeps add photo`, `desktop: keeps change photo when the vehicle has one` |
| R8 | `apps/mobile/test/config.test.mjs` › `declares the CAMERA permission and the image capture query` |
| R9 | `apps/mobile/test/config.test.mjs` › `declares the CAMERA permission and the image capture query` |
| R10 | `apps/mobile/test/config.test.mjs` › `registers the camera permission plugin`; `lib/native-camera.test.ts` › `is granted only when the camera permission is granted`; compilación Java (`:app:compileDebugJavaWithJavac`, OK) |
| R11 | `photo-picker.test.tsx` › `native: warns when the camera is cancelled without permission`; `native-camera.test.ts`; `apps/mobile/test/docs.test.mjs` › `documents the camera permission` |
| R12 | `photo-picker.test.tsx` › `native: says nothing when the camera is cancelled with permission`; `native-camera.test.ts` |
| R13 | `photo-picker.test.tsx` › `chooses from the gallery after the camera permission warning`; `docs.test.mjs` › `documents the camera permission` |
| R14 | `photo-picker.test.tsx` › `web: never checks the camera permission on cancel`; `features/pwa/native-only.test.ts` › `sends the camera module to assets/native/` |
| R15 | `native-only.test.ts` › `sends the camera module to assets/native/`. Build de producción: `apps/web/dist/assets/native/native-camera-*.js` existe y `dist/sw.js` no hace ninguna referencia a `native/` (grep: 0) |
| R16 | `features/mobile/local-mode.test.tsx` › `takes the vehicle photo with the camera in local mode` (`vehicles/….webp` en el almacén), `takes an invoice photo with the camera in local mode` (`attachments/…`) |
| R17 | `photo-picker.test.tsx` › `server mode: sends the camera photo to the server with the token` (URL `https://ikrive.example.com/api/vehicles/v1/photo`, `Authorization: Bearer secret-token`) |
| R18 | `i18n/locales.test.ts` › `es and en define the same keys`; los textos en español se comprueban en todos los tests de arriba |

## `pnpm harness --full` (T15)

```
[OK]    79 features: 74 done, 4 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #73 camera-capture (in_progress)
[OK]    Rama actual: feat/camera-capture
[OK]    pnpm lint
[OK]    pnpm typecheck
e2e test:          Test Files 2 passed  | Tests 6 passed
apps/mobile test:  tests 30 | pass 30
packages/shared:   Test Files 26 passed | Tests 183 passed
packages/db:       Test Files 1 passed  | Tests 3 passed
apps/web test:     Test Files 95 passed | Tests 643 passed
apps/api test:     Test Files 38 passed | Tests 371 passed
[OK]    pnpm test
[OK]    Arnés en verde.
```

Otras comprobaciones:
- `pnpm build`: OK. `native-camera-*.js` queda en `apps/web/dist/assets/native/`, fuera del precache.
- `JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 ./gradlew --offline :app:compileDebugJavaWithJavac` en `apps/mobile/android`: OK, así que `CameraPermissionPlugin` y `MainActivity` compilan. No se ha generado la APK ni se ha hecho `cap sync`.

## Revisión visual

El puerto 3000 lo ocupa otro proceso de la máquina (el proxy de `pnpm dev` apunta ahí), así que no he usado `pnpm dev`. En su lugar he servido el build de producción con `E2E_PORT=3123 node e2e/server.mjs` (DATA_DIR temporal y vacío) y he hecho las capturas con playwright-core y `/usr/bin/google-chrome`. Para las de móvil he usado el perfil Pixel 7 (`hasTouch`, `isMobile`, así que `pointer: coarse`). El servidor ya está parado.

Capturas en `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/463c8b8a-96fb-4d59-8006-19d2f1252c90/scratchpad/shots/`. Están en un directorio temporal y se pierden si se reinicia la máquina:
- `desktop-light-photo.png`, `desktop-dark-photo.png`: solo «Añadir foto», sin «Hacer foto».
- `desktop-{light,dark}-invoices.png`, `desktop-{light,dark}-create.png`: solo «Subir facturas» / «Añadir facturas».
- `mobile-light-photo.png`, `mobile-dark-photo.png`, `mobile-320-light-photo.png`: «Hacer foto» y «Elegir de la galería». A 320 px los botones pasan a una segunda línea gracias a `flex-wrap`.
- `mobile-{light,dark}-invoices.png`, `mobile-320-light-invoices.png`: «Subir facturas» y «Hacer foto», con la ayuda debajo.
- `mobile-{light,dark}-create.png`, `mobile-320-light-create.png`: «Añadir facturas» y «Hacer foto» en el alta de mantenimiento.

## Checklist manual en un móvil físico (design.md › Riesgos)

Pendiente de hacer por un humano con la APK de esta rama (artefacto `ikrive-debug-apk` del CI, o `build:native` + `cap sync android` + `assembleDebug` con el JDK 21):

- [ ] **Primera vez → diálogo:** con la app recién instalada, «Hacer foto» (en la foto del vehículo o en las facturas) muestra el diálogo de Android para el permiso de cámara.
- [ ] **Conceder → foto subida (servidor):** en modo servidor, al conceder se abre la cámara y la foto se sube: el vehículo muestra la foto nueva, o aparece «1 factura subida» y la factura en la lista.
- [ ] **Conceder → foto subida (local):** lo mismo en el modo «En este teléfono»: la foto del vehículo y la de la factura se guardan y se ven al volver a abrirlas.
- [ ] **Cerrar la cámara con permiso:** abrir la cámara y salir sin hacer la foto no muestra ningún aviso.
- [ ] **Denegar → aviso y galería OK:** si se deniega en el diálogo, sale el toast «Ikrive no tiene permiso para usar la cámara. Actívalo en Ajustes › Aplicaciones › Ikrive › Permisos…». «Elegir de la galería» y «Subir facturas» siguen subiendo con normalidad.
- [ ] **«No volver a preguntar» → aviso inmediato:** con el permiso denegado de forma permanente, «Hacer foto» muestra el aviso al momento, sin diálogo ni cámara.
- [ ] **Activar en Ajustes:** tras conceder el permiso en *Ajustes › Aplicaciones › Ikrive › Permisos*, «Hacer foto» abre la cámara directamente.
- [ ] **(Opcional) Android System WebView < 113:** no sale el aviso de denegación, pero la galería sigue funcionando (riesgo aceptado).

## Desviaciones del spec

- **`maintenance-timeline.test.tsx`**: `design.md` solo nombra `maintenance-form.test.tsx` y `maintenance-attachments.test.tsx` como los tests que necesitan `mockMediaQuery(false)` en `beforeEach`. `maintenance-timeline.test.tsx` también monta un `AttachmentPicker` (abre el diálogo de facturas) y fallaba con `window.matchMedia is not a function`. Le he aplicado el mismo arreglo que pide el diseño, solo en la preparación del test y sin cambiar ninguna aserción.
- **`local-mode.test.tsx`**: he añadido `toast.dismiss()` en `afterEach`. Sin él, el toast «Foto actualizada» del test anterior se repetía en el siguiente (es la misma pauta que en los demás tests con Sonner).
- **Test adicional en `photo-picker.test.tsx`**: `desktop: keeps change photo when the vehicle has one`, para cubrir el texto «Cambiar foto» de R7. No sustituye a ninguno de los tests pedidos en T9.
- **Revisión visual con el build de producción en vez de `pnpm dev`**: el puerto 3000 estaba ocupado. Lo explico arriba.

## Vuelta de revisión 1 (`progress/review_camera-capture.md`)

- **Cambio requerido 1:** T15 marcada `[x]` en `specs/camera-capture/tasks.md`. La verificación ya estaba hecha y documentada arriba.
- **Cambio requerido 2:** la frase del principio («Todas las tasks T1–T15 están marcadas») ya es cierta: T1–T15 están `[x]`.
- **Aviso de redacción:** `docs/mobile.md`, viñeta **Cámara**, ahora dice «**Elegir de la galería** y **Subir facturas** (**Añadir facturas** en el alta de un mantenimiento) siguen funcionando». El test `documents the camera permission` sigue pasando (sus regex no dependen de esa frase).
- No se ha tocado nada más: ni código ni tests.
- `pnpm harness --full` otra vez en verde: lint y typecheck OK; mobile 30/30, shared 183, db 3, web 95 ficheros / 643 tests, api 38 ficheros / 371 tests; «Arnés en verde».
