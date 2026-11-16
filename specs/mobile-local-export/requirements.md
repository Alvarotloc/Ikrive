# Requirements — mobile-local-export

> Feature 66 (fase 8, etapa 2, parte 3 de 5). Va después de #65. El modo local genera en el cliente el zip de export de la fase 7 (`data.json` + adjuntos + fotos) y la API sigue sirviendo el suyo. Es el camino de local a servidor.
> Fuentes: `progress/explore_mobile-local-export_{api-export,web-local}.md`, `specs/data-export-api/`, `specs/mobile-local-files/`, `docs/PLAN.md` › Fase 8 (modo local, «Paso inverso»).
> **Modo local**, **DataSource local**, **almacén local** y **Problem** como en `specs/mobile-local-files/requirements.md`. **Constructor** = la función pura `buildDataExport` de `@ikrive/shared`. **Escritor de zip** = `createDataExportZip` de `@ikrive/shared/data-export-zip`.

## A. Constructor compartido

## R1
El sistema DEBE construir el `data.json` del export con una única función pura `buildDataExport` de `@ikrive/shared`, que usan `GET /api/me/export` y el export del modo local.

## R2
CUANDO se llama al constructor con filas, ajustes, `appVersion` y `exportedAt`, el sistema DEBE devolver un documento que cumple `dataExportSchema`, con lecturas, planes, mantenimientos y repostajes bajo su vehículo y los adjuntos bajo su mantenimiento, en el orden de las filas de entrada y sin ids de propietario ni claves de almacenamiento.

## R3
SI el id de un adjunto o el de un vehículo con foto no está en los conjuntos de ficheros presentes que recibe el constructor ENTONCES el sistema DEBE omitir ese adjunto (o dejar `photoPath: null`) y no incluirlo en la lista de ficheros a copiar.

## R4
El constructor NO DEBE incluir el `token` de un canal de notificación en el documento (solo `hasToken`).

## R5
La API DEBE mantener `GET /api/me/export` (cuerpo, cabeceras, streaming, ficheros ausentes omitidos con aviso en el log) sin cambiar las aserciones de `apps/api/test/data-export.test.ts`.

## B. Zip del cliente

## R6
El escritor de zip DEBE producir un zip con cada fichero sin comprimir en la ruta que se le da y `data.json` (`JSON.stringify(document, null, 2)`) en la raíz.

## R7
CUANDO un zip hecho con el constructor y el escritor de zip se sube a `POST /api/me/import` de otra cuenta, la API DEBE aceptarlo con 201 tras validar su `data.json` con `dataExportSchema`, y crear los mismos datos y ficheros que importaría el zip de `GET /api/me/export`.

## C. DataSource

## R8
CUANDO se llama a `dataPortability.export()` de la DataSource HTTP, el sistema DEBE pedir `GET /api/me/export` y devolver el zip con el nombre de su `Content-Disposition`.

## R9
CUANDO se llama a `dataPortability.export()` en modo local, el sistema DEBE devolver un `application/zip` llamado `ikrive-export-<hoy en la zona horaria de los ajustes>.zip` cuyo `data.json` cumple `dataExportSchema` y contiene los ajustes, vehículos, lecturas, planes, mantenimientos, repostajes y adjuntos locales, sin canales de notificación.

## R10
CUANDO, en modo local, un adjunto o una foto tiene su fichero en el almacén local, el sistema DEBE incluirlo en el zip en la ruta de su documento (`attachments/<id>.<ext>`, `photos/<vehicleId>.webp`) con los mismos bytes que el almacén.

## R11
SI, en modo local, el almacén rechaza la lectura de un fichero con `MissingFileError` ENTONCES el sistema DEBE omitir ese adjunto o esa foto (como la API) y exportar el resto.

## R12
SI, en modo local, la lectura de un fichero falla por otra causa ENTONCES el sistema DEBE rechazar el export con un Problem 500 sin devolver un zip.

## D. Web

## R13
MIENTRAS la app está en modo local, Ajustes DEBE mostrar la tarjeta «Tus datos» con «Descargar mis datos» y sin «Importar datos».

## R14
CUANDO, en modo local, se pulsa «Descargar mis datos», el sistema DEBE generar el zip con `dataPortability.export()` y guardarlo con `downloadBlob` con su nombre, con el botón deshabilitado y el texto «Preparando…» mientras se genera.

## R15
SI el export falla en modo local ENTONCES el sistema DEBE mostrar un toast «No se ha podido generar el export».

## R16
MIENTRAS la web no está en modo local, el sistema DEBE exportar como hasta ahora: en el navegador, enlace a `/api/me/export`; en modo servidor, `GET /api/me/export` con el token, guardado con su nombre y toast `common.fileError` si falla.

## R17
El sistema DEBE tener todos los textos nuevos en `es.json` y en `en.json`.

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| Desde el modo local se puede exportar un zip que el import de un servidor (POST /api/me/import) acepta, con test que valida el documento con dataExportSchema y lo importa en la API | R6, R7, R8, R9, R10, R11, R12, R13, R14, R15 |
| El constructor de data.json vive en packages/shared y lo usan la API y el modo local | R1, R2, R3, R4, R5 |
| La web en modo servidor sigue exportando igual | R5, R16 |
| Todos los textos están en es.json y en.json | R17 |
| pnpm harness --full pasa en verde | Todas (última task) |
