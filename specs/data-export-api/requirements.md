# Requirements — data-export-api

> Feature 34 (fase 7). Descarga de todos los datos del usuario en un zip, base del import (#35) y del futuro paso del modo local del móvil a un servidor.
> «Export» = respuesta de `GET /api/me/export`. «Documento» = el `data.json` de la raíz del zip. «Fichero referenciado» = adjunto o foto cuya ruta dentro del zip aparece en el documento. «Esquema» = `dataExportSchema` de `packages/shared`.

## Endpoint

## R1
CUANDO un usuario con sesión pide `GET /api/me/export`, el sistema DEBE responder 200 con `Content-Type: application/zip` y `Content-Disposition: attachment` con el nombre `ikrive-export-<YYYY-MM-DD>.zip`, donde la fecha es «hoy» en la zona horaria del usuario.

## R2
SI la petición a `GET /api/me/export` no tiene sesión ENTONCES el sistema DEBE responder 401 `application/problem+json`.

## Contenido

## R3
El sistema DEBE incluir en la raíz del zip un `data.json` con `formatVersion: 1`, `appVersion` igual a la versión de Ikrive (`APP_VERSION`) y `exportedAt` (fecha-hora ISO 8601).

## R4
El sistema DEBE incluir en el documento los ajustes del usuario (`currency`, `distanceUnit`, `volumeUnit`, `locale`, `timezone`, `odometerReminderWeekday`, `reminderHour`).

## R5
El sistema DEBE incluir en el documento todos los vehículos del usuario, sea cual sea su estado (activo, archivado o vendido), cada uno con sus lecturas de odómetro, programaciones de mantenimiento, mantenimientos y repostajes.

## R6
El sistema DEBE expresar cada referencia interna (`maintenanceRecords[].scheduleId`, `maintenanceRecords[].odometerReadingId`, `fuelLogs[].odometerReadingId`) con el `id` de un elemento del mismo vehículo dentro del documento, o `null`.

## R7
El sistema DEBE incluir cada adjunto de un mantenimiento como metadatos (`id`, `originalName`, `mimeType`, `size`, `sha256`, `createdAt`, `path`) dentro de ese mantenimiento y su fichero en `attachments/<id>.<ext>` con los mismos bytes que en disco.

## R8
DONDE un vehículo tiene foto, el sistema DEBE incluir su fichero en `photos/<vehicleId>.webp` y esa ruta en `photoPath` del vehículo (`null` si no tiene foto).

## R9
El sistema DEBE incluir los canales de notificación del usuario con `type`, `enabled`, `hasToken` y `config` sin el campo `token`.

## R10
El sistema DEBE generar un zip cuyas entradas sean exactamente `data.json` más los ficheros referenciados por el documento.

## Aislamiento y secretos

## R11
El sistema NO DEBE incluir en el export vehículos, registros, adjuntos, ficheros, ajustes ni canales de otros usuarios.

## R12
El sistema NO DEBE incluir en el export hashes de contraseña, sesiones, cuentas, verificaciones, tokens de canales de notificación ni claves de almacenamiento (`storageKey`, `vehicles.photo`).

## R13
El sistema NO DEBE incluir en el export los enlaces públicos (`report_shares`), el feed iCal (`calendar_feeds`) ni las notificaciones in-app.

## Esquema compartido

## R14
El sistema DEBE generar un documento que valide contra `dataExportSchema`, el esquema zod exportado por `packages/shared`.

## R15
SI un documento tiene un `formatVersion` distinto de 1 ENTONCES el esquema DEBE rechazarlo.

## R16
SI un documento tiene ids repetidos dentro de su colección o una referencia interna que no existe en el mismo vehículo ENTONCES el esquema DEBE rechazarlo.

## R17
SI un documento tiene una ruta de fichero que no sigue `attachments/<id>.<pdf|jpg|png|webp>` (con el `id` del propio adjunto) o `photos/<vehicleId>.webp` (con el `id` del propio vehículo) ENTONCES el esquema DEBE rechazarlo.

## Streaming y robustez

## R18
El sistema DEBE escribir el zip en streaming, abriendo cada fichero como stream solo cuando lo añade al zip y con como mucho un fichero abierto a la vez.

## R19
SI un fichero de un adjunto o de una foto no existe en disco ENTONCES el sistema DEBE completar el export sin ese adjunto (o con `photoPath: null`) y registrar un aviso en el log.

## Acceptance → requirements

| Acceptance (`feature_list.json` #34) | Requirements |
|---|---|
| `GET /api/me/export` (autenticado) 200 `application/zip`, `Content-Disposition` attachment y nombre con la fecha | R1, R2 |
| `data.json` con `formatVersion` y versión de Ikrive, y `attachments/` con los ficheros referenciados | R3, R4, R5, R6, R7, R8, R9, R10 |
| Solo datos del usuario; sin otros usuarios, hashes, sesiones, tokens de enlaces/feed ni secretos de canales | R9, R11, R12, R13 |
| Esquema zod en `packages/shared` reutilizable por el import | R14, R15, R16, R17 |
| Zip en streaming, sin cargar todos los adjuntos en memoria | R18, R19 |
| Tests de integración: contenido, aislamiento y ausencia de secretos | R1–R13, R18, R19 (T7–T11) |
| `pnpm harness --full` en verde | T13 |
