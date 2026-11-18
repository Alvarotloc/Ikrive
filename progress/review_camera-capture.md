# Review — #73 camera-capture

**Veredicto:** APPROVED

Segunda revisión. Los dos cambios requeridos de la primera vuelta están resueltos. Desde la revisión anterior (11:12:05) solo se han modificado `specs/camera-capture/tasks.md`, `progress/impl_camera-capture.md`, `progress/current.md` y `docs/mobile.md`, según las fechas de modificación de todos los ficheros del diff. No se ha tocado código ni tests. La trazabilidad y el análisis de la primera vuelta siguen valiendo.

## Trazabilidad requirements ↔ tests

Rutas web relativas a `apps/web/src/`. He abierto y leído todos los tests.

- R1: [x] `features/vehicles/photo-picker.test.tsx:78` › `offers take photo and choose from gallery on a touch device` (botón «Hacer foto»; input con `type=file`, `capture=environment`, `accept=image/*`, sin `multiple`); `lib/use-can-capture.test.tsx:11,21` (puntero grueso → true; nativo con puntero fino → true).
- R2: [x] `photo-picker.test.tsx:78` (botón «Elegir de la galería»; input de galería con `accept=image/*` y sin `capture`; «Añadir foto» ausente).
- R3: [x] `photo-picker.test.tsx:96` (PUT con `file.name` = la foto, toast «Foto actualizada», input vaciado) y `:108` (415 → mensaje `vehicles.photo.invalid`).
- R4: [x] `features/maintenance/maintenance-attachments.test.tsx` › `camera` › `offers take photo next to upload invoices on a touch device` (atributos del input de cámara, y el de archivos sigue con `multiple` y sin `capture`); `maintenance-form.test.tsx` › `uploads an invoice photo taken with the camera after creating the record`.
- R5: [x] `maintenance-attachments.test.tsx` › `rejects a camera photo over the limit without uploading it` (mensaje de tamaño y 0 subidas), `shows the unsupported type error … 415` (mensaje 415 y sin «factura subida»), `uploads an invoice photo taken with the camera` («1 factura subida», nombre subido); `maintenance-form.test.tsx` (subida tras el POST del mantenimiento, orden comprobado).
- R6: [x] `photo-picker.test.tsx:122` (ni botón ni input de cámara en escritorio); `maintenance-attachments.test.tsx` › `desktop: hides take photo`; `use-can-capture.test.tsx:16`.
- R7: [x] `photo-picker.test.tsx:122` («Añadir foto») y `:131` («Cambiar foto» con foto).
- R8: [x] `apps/mobile/test/config.test.mjs:80` (regex del `uses-permission` CAMERA).
- R9: [x] `apps/mobile/test/config.test.mjs:80` (regex del bloque `<queries><intent><action IMAGE_CAPTURE>`).
- R10: [x] `apps/mobile/test/config.test.mjs:91` (registro antes de `super.onCreate`, `name = "CameraPermission"`, alias `camera` con `Manifest.permission.CAMERA`, `extends Plugin`); `lib/native-camera.test.ts:19` (`registerPlugin('CameraPermission')`, solo `granted` → true). La compilación Java (`compileDebugJavaWithJavac`) está documentada en el informe.
- R11: [x] `photo-picker.test.tsx:140` (nativo + `isCameraGranted=false` → toast con el texto completo, plugin consultado una vez).
- R12: [x] `photo-picker.test.tsx:153` (nativo + concedido → plugin consultado y sin toast tras vaciar la cola).
- R13: [x] `photo-picker.test.tsx:166` (después del aviso, la galería sube `garaje.png` y aparece «Foto actualizada»).
- R14: [x] `photo-picker.test.tsx:182` (web: `isCameraGranted` no se llama y no hay toast). Lo cubre también `native-only.test.ts`, el test que ya detectaba imports estáticos de módulos nativos.
- R15: [x] `features/pwa/native-only.test.ts` › `sends the camera module to assets/native/` (también con `@capacitor/core` en el mismo chunk). El informe documenta el build real (`dist/assets/native/native-camera-*.js`, `sw.js` sin `native/`).
- R16: [x] `features/mobile/local-mode.test.tsx` › `takes the vehicle photo with the camera in local mode` (clave `vehicles/….webp`, `photoUrl` no nulo) y `takes an invoice photo with the camera in local mode` (clave `attachments/…`, la factura en la lista).
- R17: [x] `photo-picker.test.tsx:192` (URL `https://ikrive.example.com/api/vehicles/v1/photo` y `Authorization: Bearer secret-token`).
- R18: [x] `i18n/locales.test.ts` › `es and en define the same keys`. He comprobado en el diff que las cinco claves de `design.md` están en `es.json` y `en.json` con los textos del diseño.

## Tasks
- T1–T15: [x]. T15 ya está marcada en `specs/camera-capture/tasks.md:30`. Ahora `progress/impl_camera-capture.md:3` dice la verdad.

## Coherencia T4–T7 frente al resto (ejecución partida)
- `native-camera.ts` (T4) solo exporta `isCameraGranted`. `CameraCaptureButton` (T7) lo importa con `import()` después de `isNativeApp()`, y los tests de T9 simulan ese mismo módulo (`vi.mock('@/lib/native-camera')`). La interfaz y el uso coinciden.
- La regex de T5 incluye `camera` y casa con la ruta `src/lib/native-camera.ts`.
- `useCanCapture` (T6) se usa igual en `photo-picker.tsx` y en `attachment-picker.tsx`. El hook se llama siempre, como pide `design.md`.
- `CameraCaptureButton` sigue la interfaz de `design.md` (`inputLabel`, `onFile`, `disabled`, `size`, `variant`): `addEventListener('cancel')`, `sr-only`, `tabIndex={-1}`, vacía `value` en `change` e ignora los fallos del import o del plugin. No he visto restos del borrador ni código duplicado.

## Checkpoints
- C1: [x] arnés en verde, una sola feature activa (#73 `in_progress`), rama `feat/camera-capture`.
- C2: [x] `requirements.md`, `design.md` y `tasks.md` existen. El EARS es correcto, la tabla cubre los 7 `acceptance` y cada R tiene su test. Todas las tasks están `[x]`.
- C3: [x] el diff solo toca lo que dice `design.md`. Las desviaciones (`maintenance-timeline.test.tsx` con `mockMediaQuery(false)` y `toast.dismiss()` en `local-mode.test.tsx`) solo afectan a la preparación de los tests y están justificadas en el informe. Sin cambios en la API, la BD ni `shared`.
- C4: [x] no aplica a la API ni a la BD. En la web: componente compartido en `components/`, hooks y lib en `lib/`, selectores en sus `features/`, textos en es/en y `Button` de `components/ui` reutilizado.
- C5: [x] sin `any`, sin `@ts-ignore` y sin `console.log`. No hay fechas nuevas. Los ficheros siguen el camino de subida de siempre.
- C6: [x] `pnpm harness --full` en verde. Lo he vuelto a ejecutar en esta segunda vuelta: lint y typecheck OK; web 643, api 371, mobile 30, shared 183, db 3, e2e 6. Los tests afirman resultados concretos. Las capturas en claro, oscuro, móvil y 320 px existen en la ruta citada; he revisado `mobile-dark-photo.png` y `mobile-320-light-invoices.png` y coinciden con el diseño.
- C7: [x] el informe tiene los archivos tocados, el mapa R→test, la salida del arnés, la checklist manual y una sección para la vuelta de revisión 1. `progress/current.md` describe la sesión e incluye esa vuelta. `docs/PLAN.md` no cambia (no cierra fase ni cambia decisiones).

## Hallazgos
Ninguno pendiente. Los dos hallazgos de la primera vuelta están resueltos:
1. `specs/camera-capture/tasks.md:30`: T15 está `[x]`.
2. `progress/impl_camera-capture.md:3`: la frase coincide con el estado real del spec.

## Avisos para el humano (no bloquean)
- Las capturas están en el scratchpad de la sesión (`/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/463c8b8a-96fb-4d59-8006-19d2f1252c90/scratchpad/shots/`) y se pierden si se reinicia la máquina.
- La checklist manual en un móvil físico (diálogo de permiso, denegar, «no volver a preguntar», `<queries>`) sigue pendiente. Es la única prueba real de R8–R12 en Android, porque los tests solo leen el manifest y el Java como texto.
- A 320 px, en el diálogo de facturas, «Hacer foto» pasa a una segunda línea (efecto de `flex-wrap`, previsto en el diseño).
- Resuelto: `docs/mobile.md` ahora dice «**Subir facturas** (**Añadir facturas** en el alta de un mantenimiento)». Es solo un cambio de redacción y `documents the camera permission` sigue en verde.

## Cambios requeridos
Ninguno.
