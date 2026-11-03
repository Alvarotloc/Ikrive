# Requirements — data-import-api

> Feature 35 (fase 7). Importa en la cuenta autenticada un zip generado por el export (#34). Añade, no sobrescribe.
> «Import» = `POST /api/me/import`. «Zip» = el fichero recibido en el campo `file`. «Documento» = su `data.json`. «Esquema» = `dataExportSchema` de `packages/shared`. «Fichero referenciado» = entrada del zip cuya ruta aparece en `attachments[].path` o `photoPath`. «Sin importar nada» = sin filas nuevas en la BD y sin ficheros nuevos en `uploads/`.

## Endpoint

## R1
CUANDO un usuario con sesión envía `POST /api/me/import` (multipart) con un zip válido en el campo `file`, el sistema DEBE responder 201 con un resumen que cuenta los vehículos, lecturas, programaciones, mantenimientos, repostajes, adjuntos, fotos y canales importados, y los canales omitidos.

## R2
SI la petición a `POST /api/me/import` no tiene sesión ENTONCES el sistema DEBE responder 401 `application/problem+json`.

## R3
SI la petición no trae un fichero en `file` o el fichero no es un zip legible ENTONCES el sistema DEBE responder 400 `application/problem+json` sin importar nada.

## Validación del documento

## R4
SI el zip no contiene `data.json` en la raíz o su contenido no es JSON ENTONCES el sistema DEBE responder 400 sin importar nada.

## R5
SI `formatVersion` falta o no es una versión soportada ENTONCES el sistema DEBE responder 400 con un `detail` que indica la versión recibida y la soportada, sin importar nada.

## R6
SI el documento no valida contra el esquema ENTONCES el sistema DEBE responder 400 con la lista `errors` (`path`, `message`) de los problemas encontrados, sin importar nada.

## R7
SI `currency`, `distanceUnit` o `volumeUnit` del documento difieren de los ajustes del usuario ENTONCES el sistema DEBE responder 409 con un `detail` que nombra los ajustes distintos, sin importar nada.

## Creación y remapeo

## R8
CUANDO el import termina bien, el sistema DEBE crear en la cuenta del usuario cada vehículo, lectura de odómetro, programación, mantenimiento, repostaje y adjunto del documento con un id nuevo y el resto de sus campos (incluidos `createdAt`, `updatedAt` y `archivedAt`) iguales a los del documento.

## R9
El sistema DEBE traducir `scheduleId` y `odometerReadingId` de mantenimientos y repostajes al id nuevo del elemento correspondiente del mismo vehículo importado.

## R10
El sistema NO DEBE modificar ni borrar los vehículos, registros, canales ni ajustes que el usuario ya tenía antes del import.

## R11
CUANDO importa un adjunto, el sistema DEBE guardar su fichero con una clave de almacenamiento aleatoria nueva y registrar su `originalName` saneado como en la subida normal, su `mimeType`, `size` y `sha256`.

## R12
SI el contenido de un adjunto no es PDF, JPEG, PNG o WebP, no coincide con su `mimeType` o es una imagen que no se decodifica ENTONCES el sistema DEBE responder 415 sin importar nada.

## R13
SI los bytes de un fichero referenciado no coinciden con el `size` o el `sha256` declarados en el documento ENTONCES el sistema DEBE responder 400 sin importar nada.

## R14
DONDE un vehículo tiene `photoPath`, el sistema DEBE guardar esa foto con una clave nueva como foto del vehículo importado tras comprobar que es un WebP decodificable, y responder 415 sin importar nada si no lo es.

## R15
SI un fichero referenciado por el documento no está en el zip ENTONCES el sistema DEBE responder 400 sin importar nada.

## R16
CUANDO el zip contiene entradas que el documento no referencia, el sistema DEBE ignorarlas sin descomprimirlas ni guardarlas.

## Canales de notificación

## R17
CUANDO un canal del documento tiene `hasToken: false` y su `config` valida contra `notificationChannelConfigSchema`, el sistema DEBE crearlo con su `type`, `enabled` y `config`.

## R18
SI un canal del documento tiene `hasToken: true` o una `config` que no valida contra `notificationChannelConfigSchema` ENTONCES el sistema DEBE omitirlo y contarlo en `skipped.notificationChannels` del resumen.

## Atomicidad

## R19
SI cualquier paso del import falla ENTONCES el sistema NO DEBE dejar ninguna fila creada por ese import en la BD.

## R20
SI el import falla después de haber guardado algún fichero ENTONCES el sistema DEBE borrar todos los ficheros que guardó ese import.

## R21
El sistema DEBE borrar el zip temporal recibido al terminar el import, tanto si termina bien como si falla.

## Límites y seguridad del zip

## R22
SI el zip ocupa más de `IMPORT_MAX_MB` ENTONCES el sistema DEBE responder 413 sin importar nada.

## R23
SI el tamaño descomprimido declarado de `data.json` supera 32 MiB, el de un fichero referenciado supera `MAX_UPLOAD_MB` o la suma de los de `data.json` y los ficheros referenciados supera `IMPORT_MAX_MB` ENTONCES el sistema DEBE responder 413 antes de descomprimir esas entradas, sin importar nada.

## R24
SI el tamaño real descomprimido de una entrada leída no coincide con el declarado en el zip ENTONCES el sistema DEBE responder 400 sin importar nada.

## R25
SI el zip tiene una entrada con ruta absoluta, con un segmento `..` o con `\`, dos entradas con el mismo nombre, entradas cifradas o más de 50 000 entradas ENTONCES el sistema DEBE responder 400 sin importar nada.

## Efectos sobre los jobs

## R26
El sistema NO DEBE crear notificaciones in-app ni enviar mensajes por los canales durante el import.

## Ida y vuelta

## R27
CUANDO se exporta la cuenta A, se importa ese zip en una cuenta B con la misma moneda y unidades y se exporta B, el sistema DEBE producir un documento igual al de A salvo los ids, `exportedAt` y los canales omitidos, con los mismos bytes en cada fichero referenciado.

## Acceptance → requirements

| Acceptance (`feature_list.json` #35) | Requirements |
|---|---|
| `POST /api/me/import` (autenticado, multipart) acepta el zip y responde 201 con un resumen | R1, R2, R3 |
| `data.json` se valida con el esquema compartido; inválido o `formatVersion` no soportada → 400 claro sin importar nada | R4, R5, R6, R7 |
| Ids nuevos y referencias remapeadas; adjuntos con nombres aleatorios nuevos y tipo validado como en la subida normal | R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18 |
| Import atómico: ni datos ni ficheros a medias | R19, R20, R21 |
| Límites de tamaño del zip y protección contra zip bombs y rutas con `../` | R22, R23, R24, R25 |
| Test de ida y vuelta (exportar, importar en otro usuario, volver a exportar) | R27 (T12) |
| `pnpm harness --full` en verde | T16 |
| (Decisión del leader: efectos sobre jobs y notificaciones) | R26 |
