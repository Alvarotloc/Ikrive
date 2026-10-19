# Requirements — maintenance-attachments-web

> Feature 7 (fase 3). Facturas de un mantenimiento en la interfaz: subir una o varias (desde su diálogo o ya en el alta), verlas (miniatura o icono), abrirlas/descargarlas y borrarlas, sobre la API de la feature 5. La API expone además el límite de subida para que la web lo muestre y lo aplique antes de subir.
> Base de la API: `/api/vehicles/:id/maintenance/:recordId/attachments`. «Factura» = `Attachment` de `@ikrive/shared`. «Límite» = `maxUploadMb` de `GET /api/config` (R21).

## R1
CUANDO el usuario pulsa el botón de facturas de un registro de la timeline, el sistema DEBE abrir un diálogo con las facturas de ese mantenimiento devueltas por `GET .../attachments`.

## R2
MIENTRAS el mantenimiento no tiene facturas, el sistema DEBE mostrar en el diálogo un mensaje de lista vacía.

## R3
El sistema DEBE ofrecer un selector de ficheros con selección múltiple cuyo `accept` es exactamente la lista de `ATTACHMENT_MIME_TYPES` de `@ikrive/shared`.

## R4
CUANDO el usuario selecciona uno o varios ficheros, el sistema DEBE enviar cada fichero en su propio `POST .../attachments` multipart (campo `file`), uno detrás de otro.

## R5
CUANDO termina una tanda de subidas con al menos un fichero subido, el sistema DEBE volver a pedir la lista de facturas y mostrar un `toast.success` con el número de facturas subidas.

## R6
MIENTRAS hay una subida en curso, el sistema DEBE deshabilitar el botón de subir facturas.

## R7
El sistema DEBE mostrar cada factura de imagen con un `<img>` cuyo `src` es su `thumbnailUrl` y cuyo `alt` es su nombre original.

## R8
El sistema DEBE mostrar cada factura PDF con un icono de documento, sin pedir miniatura.

## R9
El sistema DEBE mostrar el nombre original de cada factura.

## R10
El sistema DEBE convertir la miniatura o el icono y el nombre de cada factura en un enlace a su `url`, de modo que al pulsarlo el navegador abre o descarga el original.

## R11
CUANDO el usuario pulsa borrar en una factura, el sistema DEBE pedir confirmación en un `AlertDialog` y solo hacer `DELETE .../attachments/:attachmentId` si el usuario confirma.

## R12
CUANDO el borrado de una factura termina con éxito, el sistema DEBE volver a pedir la lista de facturas y mostrar un `toast.success`.

## R13
SI la API responde 415 a la subida de un fichero ENTONCES el sistema DEBE mostrar con `toast.error` (sonner) un mensaje de tipo no admitido que incluye el nombre del fichero.

## R14
SI la API responde 413 a la subida de un fichero ENTONCES el sistema DEBE mostrar con `toast.error` (sonner) un mensaje de tamaño excedido que incluye el nombre del fichero y, si la web conoce el límite, el límite en MB.

## R15
SI la API responde con cualquier otro error al subir o borrar una factura ENTONCES el sistema DEBE mostrar con `toast.error` el mensaje genérico `common.error`.

## R16
SI la subida de un fichero de la tanda falla ENTONCES el sistema DEBE seguir subiendo los ficheros restantes.

## R17
El sistema DEBE definir todos los textos nuevos de la feature en `es.json` y en `en.json`, con el mismo conjunto de claves en ambos.

## R18
El sistema DEBE mostrar el diálogo de facturas sin desbordamiento horizontal a 375 px de ancho y legible en modo claro y oscuro.

## R19
SI falla la carga de la lista de facturas ENTONCES el sistema DEBE mostrar en el diálogo el mensaje `common.error` en lugar de la lista.

## R20
MIENTRAS se carga la lista de facturas, el sistema DEBE mostrar en el diálogo el mensaje `common.loading`.

## R21
CUANDO un usuario autenticado pide `GET /api/config`, el sistema DEBE responder 200 con `{ "maxUploadMb": <n> }`, donde `<n>` es el valor de `MAX_UPLOAD_MB`, validado con `clientConfigSchema` de `@ikrive/shared`.

## R22
SI `GET /api/config` llega sin sesión ENTONCES el sistema DEBE responder 401 `application/problem+json`.

## R23
MIENTRAS la web conoce el límite, el sistema DEBE mostrar junto a cada selector de facturas (diálogo de facturas y alta) una ayuda con los tipos admitidos y el límite en MB.

## R24
CUANDO el usuario elige un fichero cuyo tamaño supera el límite (`size > maxUploadMb · 1024 · 1024`), el sistema DEBE mostrar el mismo `toast.error` de tamaño excedido (nombre y límite) y descartar ese fichero sin enviar su `POST`.

## R25
MIENTRAS el formulario de mantenimiento está en modo alta, el sistema DEBE ofrecer un selector de facturas con selección múltiple y el `accept` de R3, y listar los nombres de los ficheros elegidos.

## R26
CUANDO el usuario pulsa quitar en un fichero elegido del alta, el sistema DEBE sacarlo de la lista para que no se suba.

## R27
CUANDO el alta de un mantenimiento con facturas elegidas termina con éxito, el sistema DEBE subirlas en serie a `POST .../:recordId/attachments` con el `recordId` devuelto, con los mismos toasts por fichero (R13, R14, R15) y de éxito (R5) que el diálogo de facturas.

## R28
SI falla la subida de alguna factura elegida en el alta ENTONCES el sistema DEBE cerrar el formulario sin borrar el mantenimiento creado.

## R29
SI falla la subida de alguna factura elegida en el alta ENTONCES el sistema DEBE mostrar un `toast` que indica que las facturas que faltan se pueden subir desde las facturas del mantenimiento.

## R30
MIENTRAS se crea el mantenimiento o se suben sus facturas, el sistema DEBE deshabilitar el botón de guardar del formulario.

## R31
MIENTRAS el formulario de mantenimiento está en modo edición, el sistema NO DEBE mostrar el selector de facturas.

## Trazabilidad acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| Desde un mantenimiento se pueden subir una o varias facturas | R1, R2, R3, R4, R5, R6, R16, R19, R20, R25, R26, R27, R28, R29, R30, R31 |
| Las imágenes se muestran con su miniatura y los PDF con un icono; al pulsar se abren o descargan | R7, R8, R9, R10 |
| Se puede borrar una factura con confirmación | R11, R12 |
| Los errores de tipo o tamaño de la API se muestran al usuario con sonner | R13, R14, R15, R21, R22, R23, R24 |
| Todos los textos están en es.json y en.json | R17 |
| (Convención de la fase: UI móvil y modo oscuro) | R18 |

R21–R24 salen del cambio pedido en Gate 1 (límite en MB conocido por la web) y R25–R31 del alta con facturas (también Gate 1).
