# Requirements — mobile-local-files

> Feature 65 (fase 8, etapa 2, parte 2 de 5). Va después de #54. Adjuntos de mantenimiento y foto del vehículo en el modo «En este teléfono»: ficheros en `@capacitor/filesystem` (`Directory.Data`), miniaturas y redimensionado con canvas en lugar de `sharp`, y URLs locales opacas resueltas por `files.get`.
> Fuentes: `progress/explore_mobile-local-mode_{data-source,mobile,export}.md`, `specs/mobile-local-core/`, `docs/PLAN.md` › Decisiones (fotos de vehículos, adjuntos) y Fase 8 › Etapa 2.
> **Modo local**, **DataSource local** y **Problem** como en `specs/mobile-local-core/requirements.md`. **Almacén local** = el almacén de ficheros de la DataSource local (en el dispositivo, `Directory.Data`). **URL local** = URL opaca que la DataSource local pone en `photoUrl`, `attachment.url` y `attachment.thumbnailUrl`.

## A. Código compartido

## R1
El sistema DEBE detectar el tipo de un adjunto (PDF, JPEG, PNG o WebP) por sus bytes mágicos con una única función `detectAttachmentType` de `@ikrive/shared`, que usan la subida y el import de la API y la DataSource local.

## R2
El sistema DEBE normalizar el nombre declarado de un adjunto con una única función `sanitizeFileName` de `@ikrive/shared` (último segmento de la ruta, sin espacios en los extremos, como mucho 255 caracteres, `file.<ext>` si queda vacío), que usan la API y la DataSource local.

## R3
La API DEBE mantener el comportamiento de la subida de adjuntos, de la foto del vehículo y del import tras mover el código a `@ikrive/shared`, sin cambiar las aserciones de sus tests.

## B. Adjuntos en modo local

## R4
CUANDO, en modo local, se sube un adjunto a un mantenimiento existente, el sistema DEBE guardar el fichero tal cual en el almacén local con una clave aleatoria `attachments/<uuid>.<ext>` y una fila en `attachments` (tipo detectado, tamaño, sha256 en hex y nombre saneado), y devolver un DTO que cumple `attachmentSchema`, con `thumbnailUrl` solo para imágenes.

## R5
SI, en modo local, un adjunto no es PDF, JPEG, PNG ni WebP por sus bytes mágicos, o es una imagen que no se puede decodificar, ENTONCES el sistema DEBE rechazar con un Problem 415 `Only PDF, JPEG, PNG and WebP files are allowed` sin escribir fichero ni fila.

## R6
SI, en modo local, un adjunto o una foto supera `maxUploadMb` de la configuración local (20 MB) ENTONCES el sistema DEBE rechazar con un Problem 413 sin escribir fichero ni fila.

## R7
El sistema DEBE listar los adjuntos de un mantenimiento en modo local en orden de subida.

## R8
CUANDO, en modo local, se borra un adjunto, el sistema DEBE borrar su fila y su fichero del almacén local.

## R9
SI, en modo local, el vehículo, el mantenimiento o el adjunto de una operación de adjuntos no existe en esa cadena ENTONCES el sistema DEBE rechazar con un Problem 404 con los mismos textos que la API.

## C. Foto del vehículo en modo local

## R10
CUANDO, en modo local, se sube la foto de un vehículo, el sistema DEBE aplicar la orientación EXIF, reducirla a 1600 px en su lado mayor sin ampliarla, recodificarla a WebP, guardarla como `vehicles/<uuid>.webp`, borrar la foto anterior y devolver el vehículo con una URL local de la foto que cambia con cada foto.

## R11
SI, en modo local, la foto no es JPEG, PNG, WebP, AVIF, GIF ni TIFF por sus bytes mágicos o no se puede decodificar ENTONCES el sistema DEBE rechazar con un Problem 400 `The file is not a supported image (JPEG, PNG, WebP, AVIF, GIF or TIFF)` sin cambiar la foto guardada. _(AVIF añadido en #71 `api-photo-avif`.)_

## R12
SI el recodificado de una foto o de una miniatura no produce un WebP (por sus bytes mágicos) ENTONCES el sistema DEBE rechazar sin guardar nada.

## R13
CUANDO, en modo local, se quita la foto de un vehículo, el sistema DEBE dejar `photoUrl: null` y borrar su fichero del almacén local.

## D. Lectura de ficheros

## R14
CUANDO, en modo local, se llama a `files.get` con una URL local de foto, de adjunto (con o sin `?inline=1`) o de miniatura, el sistema DEBE devolver el fichero con su tipo MIME y, para el original de un adjunto, su nombre como `fileName`.

## R15
CUANDO se pide la miniatura de un adjunto de imagen en modo local, el sistema DEBE devolver un WebP orientado de como mucho 320 px en su lado mayor, sin ampliarlo.

## R16
SI, en modo local, `files.get` recibe una URL que no es local o que no corresponde a una foto, un adjunto o una miniatura existentes ENTONCES el sistema DEBE rechazar con un Problem 404.

## E. Borrado en cascada y consistencia

## R17
CUANDO, en modo local, se borra un mantenimiento, el sistema DEBE borrar las filas de sus adjuntos en la misma transacción que el registro y, después, sus ficheros del almacén local.

## R18
CUANDO, en modo local, se borra un vehículo, el sistema DEBE borrar las filas de los adjuntos de sus mantenimientos en la misma transacción que el vehículo y, después, esos ficheros y su foto del almacén local.

## R19
SI, en modo local, falla la escritura en la base tras guardar el fichero de un adjunto o de una foto ENTONCES el sistema DEBE borrar ese fichero y rechazar sin cambiar los datos.

## F. Adaptadores del dispositivo

## R20
CUANDO la DataSource local se ejecuta en el dispositivo, el almacén local DEBE guardar, leer y borrar los ficheros con `@capacitor/filesystem` en `Directory.Data` bajo `uploads/<clave>`, sin fallar al borrar un fichero que ya no existe.

## R21
CUANDO la DataSource local se ejecuta en el dispositivo, el procesado de imágenes DEBE decodificar con `createImageBitmap` aplicando la orientación EXIF y codificar a WebP con un `canvas` (calidad 0,8 para la foto y 0,7 para la miniatura).

## G. Interfaz en modo local

## R22
MIENTRAS la app está en modo local, la edición de un vehículo DEBE mostrar el selector de foto y la ficha DEBE seguir ocultando el informe de venta.

## R23
MIENTRAS la app está en modo local, los mantenimientos DEBEN mostrar los adjuntos: el selector del formulario de alta y el acceso a las facturas de cada registro.

## R24
MIENTRAS la app está en modo local, la web DEBE cargar fotos, miniaturas y facturas (ver, abrir y descargar) a través de `files.get` de la DataSource, sin usar la URL como `src` o `href`.

## R25
SI en modo local se llama a una operación que sigue sin soporte (informe de venta, enlaces públicos, avisos, canales, feed iCal, import, admin) ENTONCES la DataSource local DEBE seguir rechazando con un Problem 501 sin tocar la base ni el almacén local.

## R26
El sistema DEBE definir en `es.json` y `en.json` todos los textos nuevos de esta feature.

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| En modo local se pueden subir, ver y borrar adjuntos de un mantenimiento y la foto de un vehículo, con los mismos tipos y límites que la API | R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R19, R20, R21, R22, R23, R24, R25 |
| La detección del tipo por bytes mágicos y sanitizeFileName se comparten entre API y modo local desde packages/shared | R1, R2, R3 |
| Borrar un mantenimiento o un vehículo borra sus ficheros locales | R17, R18 |
| Todos los textos están en es.json y en.json | R26 |
| pnpm harness --full pasa en verde | R3 y todos |
