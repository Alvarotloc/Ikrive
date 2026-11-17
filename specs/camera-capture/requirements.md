# Requirements — camera-capture

> Feature 73 (fase 8). Detectada al probar #65 en un móvil físico: los selectores de foto y de facturas solo abren la galería.
> **Táctil** = `isNativeApp()` o la media query `(pointer: coarse)`. **Escritorio** = lo contrario. **Input de cámara** = `<input type="file" accept="image/*" capture="environment">` sin `multiple`. **Selector de foto** = `PhotoPicker` (editar vehículo). **Selector de facturas** = `AttachmentPicker` (diálogo de facturas y formulario de alta de mantenimiento). **Cancelar la cámara** = el evento `cancel` del input de cámara (Android devuelve `null` al WebView).

## A. Selector de foto del vehículo

## R1
MIENTRAS el dispositivo es táctil, el selector de foto DEBE ofrecer el botón «Hacer foto», que abre un input de cámara.

## R2
MIENTRAS el dispositivo es táctil, el selector de foto DEBE ofrecer el botón «Elegir de la galería», que abre el input actual (`accept="image/*"`, sin `capture`).

## R3
CUANDO el usuario hace una foto del vehículo, el sistema DEBE subirla con la misma mutación que una imagen elegida, con el mismo aviso de éxito y los mismos mensajes de error.

## B. Selector de facturas

## R4
MIENTRAS el dispositivo es táctil, el selector de facturas DEBE ofrecer el botón «Hacer foto», que abre un input de cámara, además de su botón actual de elegir archivos.

## R5
CUANDO el usuario hace una foto de una factura, el sistema DEBE pasarla por el mismo filtrado de tamaño, la misma subida y los mismos mensajes de error (413/415/genérico) que una imagen elegida como archivo.

## C. Escritorio

## R6
MIENTRAS el dispositivo es de escritorio, el sistema NO DEBE mostrar «Hacer foto» en ningún selector.

## R7
MIENTRAS el dispositivo es de escritorio, el selector de foto DEBE mantener su botón actual con los textos «Añadir foto» / «Cambiar foto».

## D. Permiso de cámara en Android

## R8
El proyecto Android DEBE declarar el permiso `android.permission.CAMERA` en `AndroidManifest.xml`.

## R9
El proyecto Android DEBE declarar en `AndroidManifest.xml` una consulta (`<queries>`) de la acción `android.media.action.IMAGE_CAPTURE`, para que Capacitor encuentre la app de cámara en Android 11+.

## R10
La app nativa DEBE registrar un plugin `CameraPermission` cuyo `checkPermissions()` devuelve el estado del permiso `CAMERA` con el alias `camera`.

## R11
SI en la app nativa el usuario cancela la cámara y el permiso `CAMERA` no está concedido ENTONCES el sistema DEBE mostrar un aviso de error que dice que falta el permiso, dónde activarlo y que puede elegir una imagen o archivo ya guardado.

## R12
SI en la app nativa el usuario cancela la cámara con el permiso `CAMERA` concedido ENTONCES el sistema NO DEBE mostrar ningún aviso.

## R13
CUANDO el usuario elige una imagen de la galería o un archivo después de que se le haya avisado de la falta de permiso, el sistema DEBE subirla como siempre.

## R14
MIENTRAS la SPA corre como web o PWA, el sistema NO DEBE cargar el módulo `lib/native-camera.ts` ni consultar el permiso al cancelar la cámara.

## R15
El sistema DEBE emitir `lib/native-camera.ts` en un chunk de `assets/native/`, fuera del precache del service worker.

## E. Modos y textos

## R16
MIENTRAS la app nativa está en modo local, el sistema DEBE guardar en el dispositivo la foto del vehículo y la de una factura hechas con la cámara, igual que una imagen elegida.

## R17
MIENTRAS la app nativa está en modo servidor, el sistema DEBE enviar la foto hecha con la cámara al servidor configurado con el token de sesión, igual que una imagen elegida.

## R18
El sistema DEBE definir en `es.json` y `en.json` todos los textos nuevos (botones, etiquetas de los inputs y aviso de permiso).

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| El selector de foto del vehículo ofrece «Hacer foto» (capture="environment") y «Elegir de la galería» | R1, R2, R3 |
| El selector de facturas ofrece «Hacer foto»; la foto sigue los mismos tipos, límites y validaciones | R4, R5 |
| Android declara CAMERA, se pide la primera vez; si se deniega, la app lo indica y galería/archivo siguen funcionando | R8, R9, R10, R11, R12, R13 |
| En escritorio no se ofrece una acción que no hace nada distinto | R6, R7 |
| Funciona igual en modo servidor y en modo local | R16, R17, R14, R15 |
| Todos los textos están en es.json y en.json | R18 |
| `pnpm harness --full` pasa en verde | Todas (T15) |
