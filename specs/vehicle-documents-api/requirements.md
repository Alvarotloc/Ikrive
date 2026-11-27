# Requirements — vehicle-documents-api

> Feature 89 (fase 9). Documentos del vehículo con caducidad (póliza, permiso de circulación, ITV, otros): tabla, CRUD en la API y en el DataSource local, adjuntos con la tabla `attachments`, avisos con el job de recordatorios y en local, y zip de export/import. La interfaz es #90.
> «Documento» = fila de `vehicle_documents` conforme a `vehicleDocumentSchema` (`design.md`). «Hoy» = la fecha de hoy en la zona horaria del usuario. «Modo local» = `dataSource()` en modo «En este teléfono». «Job» = `runReminders` (`apps/api/src/jobs/reminders.job.ts`). «Clave de aviso» = `document:<id>:<status>:<expiryDate>`.

## CRUD en la API

## R1
CUANDO el usuario envía `POST /api/vehicles/:id/documents` con un cuerpo válido sobre un vehículo suyo, el sistema DEBE guardar el documento (con `warnDays` 30 y `expiryDate` null si no se envían) y responder 201 con el documento conforme a `vehicleDocumentSchema`.

## R2
CUANDO el usuario pide `GET /api/vehicles/:id/documents` de un vehículo suyo, el sistema DEBE devolver sus documentos ordenados por `expiryDate` ascendente, los que no tienen fecha al final y, a igual fecha, por fecha de creación ascendente.

## R3
CUANDO el usuario pide `GET /api/vehicles/:id/documents/:documentId` de un documento suyo, el sistema DEBE responder 200 con ese documento.

## R4
CUANDO el usuario envía `PATCH /api/vehicles/:id/documents/:documentId` con un cuerpo válido, el sistema DEBE cambiar solo los campos enviados y responder 200 con el documento actualizado.

## R5
CUANDO el usuario envía `DELETE /api/vehicles/:id/documents/:documentId` de un documento suyo, el sistema DEBE borrar el documento, las filas de sus adjuntos y sus ficheros, y responder 204.

## R6
SI el cuerpo de un POST o PATCH no cumple `createVehicleDocumentSchema` o `updateVehicleDocumentSchema` (tipo fuera de `DOCUMENT_TYPES`, título vacío o de más de 120 caracteres, `expiryDate` no ISO, `warnDays` no entero, negativo o mayor que 365, notas de más de 2000 caracteres) ENTONCES el sistema DEBE responder 400 `application/problem+json` sin escribir nada.

## R7
SI el vehículo no existe o pertenece a otro usuario ENTONCES el sistema DEBE responder 404 `application/problem+json` con `detail` «Vehicle not found» en todos los endpoints de documentos y de sus adjuntos.

## R8
SI el documento no existe o pertenece a otro vehículo ENTONCES el sistema DEBE responder 404 `application/problem+json` con `detail` «Document not found» en todos los endpoints de un documento y de sus adjuntos.

## R9
El sistema DEBE devolver en `status` de cada documento `expired` si hoy es posterior a `expiryDate`, `expiring` si hoy es igual o posterior a `expiryDate − warnDays` días, y `valid` en otro caso o sin `expiryDate`.

## R10
CUANDO se borra un vehículo, en la API o en modo local, el sistema DEBE borrar sus documentos, las filas de los adjuntos de esos documentos y sus ficheros.

## Adjuntos de documentos

## R11
CUANDO el usuario sube un fichero en el campo `file` con `POST /api/vehicles/:id/documents/:documentId/attachments`, el sistema DEBE guardarlo con `entityType: 'document'` y responder 201 con un `attachmentSchema` cuya `url` es `/api/vehicles/:id/documents/:documentId/attachments/:attachmentId`.

## R12
CUANDO el usuario pide `GET /api/vehicles/:id/documents/:documentId/attachments`, el sistema DEBE devolver los adjuntos de ese documento en orden de subida.

## R13
CUANDO el usuario pide `GET …/documents/:documentId/attachments/:attachmentId` (con o sin `?inline=1`) o su `/thumbnail`, el sistema DEBE servir el fichero con las mismas cabeceras (tipo, `content-disposition`, `nosniff`, CSP) y la misma miniatura WebP que los adjuntos de mantenimiento.

## R14
CUANDO el usuario envía `DELETE …/documents/:documentId/attachments/:attachmentId`, el sistema DEBE borrar la fila y el fichero y responder 204.

## R15
SI el contenido del fichero subido no es PDF, JPEG, PNG ni WebP, o es una imagen que no se decodifica, ENTONCES el sistema DEBE responder 415 `application/problem+json` sin guardar fila ni fichero.

## R16
SI el fichero subido supera `MAX_UPLOAD_MB` ENTONCES el sistema DEBE responder 413 `application/problem+json` sin guardar fila ni fichero.

## R17
SI el adjunto no existe, pertenece a otro documento o es de un registro de mantenimiento ENTONCES el sistema DEBE responder 404 `application/problem+json` con `detail` «Attachment not found».

## R18
El sistema DEBE seguir sirviendo los adjuntos de mantenimiento en `/api/vehicles/:id/maintenance/:recordId/attachments` con las mismas URLs, respuestas y errores que antes de esta feature.

## Avisos

## R19
CUANDO el job se ejecuta desde la hora de aviso del dueño y un documento de un vehículo activo de un usuario activo está `expiring` o `expired`, el sistema DEBE crear una notificación in-app de tipo `document_expiring` o `document_expired` con el título del documento, el nombre del vehículo como cuerpo, el enlace `/vehicles/:id` y la clave de aviso.

## R20
SI ya existe una notificación con la misma clave de aviso ENTONCES el sistema NO DEBE crear otra ni enviarla de nuevo por los canales.

## R21
CUANDO el job crea una notificación de documento, el sistema DEBE enviarla por los canales activos del dueño con el título «<etiqueta del tipo en su idioma>: <título del documento>».

## R22
CUANDO cambia el `expiryDate` de un documento (renovación), el sistema DEBE crear una notificación nueva en la siguiente ejecución en la que el documento esté `expiring` o `expired`.

## R23
SI el documento está `valid`, o su vehículo está vendido o archivado, o su dueño está desactivado, ENTONCES el sistema NO DEBE crear notificación de ese documento.

## R24
CUANDO se borra un documento, el sistema DEBE conservar las notificaciones que ya se crearon de ese documento.

## Modo local

## R25
MIENTRAS está activo el modo local, el sistema DEBE ofrecer `documents.list`, `create`, `update` y `remove` con los mismos DTO, orden, `status` y errores (estado y `detail`) que la API, sin escribir nada cuando rechaza.

## R26
MIENTRAS está activo el modo local, el sistema DEBE ofrecer `documentAttachments.list`, `upload` y `remove`, y servir con `files.get` sus URLs `local://` y miniaturas, con las mismas validaciones (415, 413) y errores 404 que la API.

## R27
MIENTRAS está activo el modo local, CUANDO `generateLocalReminders` se ejecuta desde la hora de aviso, el sistema DEBE guardar para cada documento las mismas notificaciones (tipo, título, cuerpo, enlace y clave de aviso) que el job, sin duplicar las ya guardadas.

## Export e import

## R28
CUANDO se genera un export, en la API o en modo local, el sistema DEBE incluir en cada vehículo un array `documents` con todos los campos de cada documento y sus `attachments`, y copiar al zip el fichero de cada adjunto en `attachmentExportPath(id, mimeType)`.

## R29
CUANDO se importa con `POST /api/me/import` un zip con documentos, el sistema DEBE crearlos en el vehículo importado con ids nuevos, crear sus adjuntos con `entityType: 'document'` y sus ficheros, y contarlos en `documents` y `attachments` del resumen.

## R30
CUANDO se importa un zip con `formatVersion: 1` cuyos vehículos no traen `documents`, el sistema DEBE importarlo como si cada vehículo trajera `documents: []`.

## R31
SI dos documentos del `data.json` comparten `id`, o un adjunto de documento tiene un `path` distinto de `attachmentExportPath(id, mimeType)` o un `id` repetido con cualquier otro adjunto, ENTONCES el sistema DEBE responder 400 `application/problem+json` sin importar nada.

## R32
CUANDO termina un import del zip, la sección de datos de la web DEBE mostrar el contador de documentos importados junto a los demás contadores.

## Textos

## R33
El sistema DEBE definir en `es` y en `en` las etiquetas de `document_expiring` y `document_expired` (web `notifications.types.*` y mensajes de canales) y la del contador `documents` del resumen del import.

## Cobertura del acceptance

| Criterio de `feature_list.json` | Requirements |
|---|---|
| CRUD de documentos por vehículo con adjunto validado por MIME y MAX_UPLOAD_MB, y un documento de otro usuario responde 404 | R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18 |
| Un documento dentro de su plazo de aviso genera una única notificación in-app y se envía por los canales del usuario | R9, R19, R20, R21, R23, R24 |
| Renovar la fecha de vencimiento permite un nuevo aviso | R22 |
| El modo local genera los mismos avisos con las mismas funciones puras | R25, R26, R27, R10 |
| El zip de export/import conserva documentos y adjuntos, y un zip antiguo se sigue importando | R28, R29, R30, R31, R32 |
| `pnpm harness --full` pasa en verde | R33 y la última task de `tasks.md` |

R25 y R26 existen porque el modo local necesita crear documentos para avisar y exportar (`docs/PLAN.md` › Fase 9: «gastos y documentos funcionan también en local»). R32 y R33 son los cambios mínimos en la web que exige el contrato nuevo para compilar y para que `locales.test.ts` siga en verde.
