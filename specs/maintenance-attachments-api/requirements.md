# Requirements — maintenance-attachments-api

> Feature 5 (fase 3). Facturas (PDF o imagen) adjuntas a un mantenimiento: subida, listado, descarga, miniatura y borrado.
> Base de las rutas: `/api/vehicles/:id/maintenance/:recordId/attachments`. Campo multipart: `file` (como la foto del vehículo).

## R1
El sistema DEBE persistir los adjuntos en la tabla `attachments` (propietario, `entity_type`/`entity_id`, nombre original, mime, tamaño, sha256, clave en disco aleatoria), creada por una migración generada con drizzle-kit.

## R2
CUANDO el usuario hace `POST .../attachments` con un fichero admitido, el sistema DEBE responder 201 con el adjunto creado (nombre original, mime detectado, tamaño en bytes y sha256 del contenido), conforme a `attachmentSchema` de `@ikrive/shared`.

## R3
CUANDO el usuario sube un segundo fichero al mismo mantenimiento, el sistema DEBE conservar los adjuntos anteriores.

## R4
CUANDO el usuario hace `GET .../attachments`, el sistema DEBE devolver los adjuntos del mantenimiento ordenados por fecha de subida ascendente.

## R5
CUANDO se sube un fichero, el sistema DEBE determinar su mime a partir de los bytes del contenido (PDF, JPEG, PNG o WebP), ignorando el `Content-Type` y la extensión declarados por el cliente.

## R6
SI el contenido del fichero no es PDF, JPEG, PNG ni WebP ENTONCES el sistema DEBE responder 415 `application/problem+json` sin crear registro ni fichero en disco.

## R7
SI un fichero con firma de imagen admitida no se puede decodificar como imagen ENTONCES el sistema DEBE responder 415 `application/problem+json` sin crear registro ni fichero en disco.

## R8
SI el fichero supera `MAX_UPLOAD_MB` ENTONCES el sistema DEBE responder 413 `application/problem+json` sin crear registro ni fichero en disco.

## R9
SI la petición de subida no contiene ningún fichero ENTONCES el sistema DEBE responder 400 `application/problem+json`.

## R10
El sistema DEBE guardar cada fichero con `lib/storage.ts` bajo `<DATA_DIR>/uploads/attachments/` con un nombre aleatorio que no deriva del nombre original.

## R11
CUANDO el propietario hace `GET .../attachments/:attachmentId`, el sistema DEBE devolver los bytes originales con `Content-Type` igual al mime guardado y `Content-Disposition: attachment` con el nombre original.

## R12
CUANDO el propietario hace `GET .../attachments/:attachmentId/thumbnail` sobre una imagen, el sistema DEBE devolver una miniatura `image/webp` que no supera 320 px en su lado mayor.

## R13
SI se pide la miniatura de un adjunto PDF ENTONCES el sistema DEBE responder 404 `application/problem+json`.

## R14
El sistema DEBE incluir en cada adjunto devuelto su `url` de descarga y un `thumbnailUrl` que es `null` para los PDF.

## R15
CUANDO el usuario hace `DELETE .../attachments/:attachmentId`, el sistema DEBE borrar el registro y su fichero en disco y responder 204.

## R16
CUANDO el usuario borra un mantenimiento, el sistema DEBE borrar todos sus adjuntos (registros y ficheros).

## R17
CUANDO el usuario borra un vehículo, el sistema DEBE borrar los adjuntos de todos sus mantenimientos (registros y ficheros).

## R18
SI el vehículo de la ruta no existe o pertenece a otro usuario ENTONCES el sistema DEBE responder 404 en todos los endpoints de adjuntos.

## R19
SI el `recordId` no existe o pertenece a otro vehículo ENTONCES el sistema DEBE responder 404 en todos los endpoints de adjuntos.

## R20
SI el `attachmentId` no existe o pertenece a otro mantenimiento ENTONCES el sistema DEBE responder 404 en la descarga, la miniatura y el borrado.

## Trazabilidad acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| Tabla `attachments` (propietario, entity_type/entity_id, nombre, mime, tamaño, sha256, clave aleatoria) con migración | R1 |
| `POST .../attachments` sube una factura; un mantenimiento admite varias | R2, R3, R4, R9 |
| Solo PDF, JPEG, PNG y WebP, detectados por contenido; el resto 4xx problem+json | R5, R6, R7 |
| Mayor que `MAX_UPLOAD_MB` → 4xx problem+json y nada en disco | R8 |
| Guardados con `lib/storage.ts` bajo `/data/uploads` con nombre aleatorio | R10 |
| `GET .../:attachmentId` descarga el original con nombre y mime, solo para su propietario | R11, R14, R18, R19, R20 |
| `GET .../:attachmentId/thumbnail` devuelve miniatura WebP de las imágenes | R12, R13, R14 |
| `DELETE` borra registro y fichero; borrar el mantenimiento borra sus adjuntos | R15, R16, R17 |
| `apps/api/test/attachments.test.ts` cubre subida, tipo, tamaño, descarga, miniatura, borrado y autorización | R2–R20 (tests en T10–T16) |
