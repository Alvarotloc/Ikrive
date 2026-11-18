# Requirements — mobile-local-export-streaming

> Feature 75 (fase 8). Sigue a #66 (`specs/mobile-local-export/`), cuyo riesgo de memoria resuelve: hoy el zip local vive entero en memoria, luego en un `Blob` y luego en un único base64 que cruza el bridge.
> Fuentes: `progress/explore_mobile-local-export-streaming_{pipeline,native-fs}.md`, `specs/mobile-local-export/`.
> **Modo local**, **DataSource local**, **almacén local** y **Problem** como en #66. **Escritor en streaming** = `streamDataExportZip` de `@ikrive/shared/data-export-zip`. **Destino del export** = el `LocalExportSink` que recibe los trozos del zip. **Destino del dispositivo** = el de `apps/web/src/lib/native-export.ts` (fichero en `Directory.Cache`). **Destino en memoria** = el que monta el `Blob` de #66. **Fichero del export** = `exports/<nombre saneado>` en `Directory.Cache`.

## A. Escritor de zip compartido

## R1
CUANDO se añade un fichero al escritor en streaming, el sistema DEBE entregar al callback sus trozos del zip (cabecera y datos) antes de que vuelva `addFile`, sin acumularlos.

## R2
El escritor en streaming DEBE producir, concatenando sus trozos, exactamente los mismos bytes que `createDataExportZip().finish()` para los mismos ficheros y el mismo documento.

## R3
CUANDO un zip hecho con `buildDataExport` y el escritor en streaming se sube a `POST /api/me/import` de otra cuenta, la API DEBE aceptarlo con 201 y crear los mismos datos y ficheros que el zip de `GET /api/me/export`.

## B. Export local por trozos

## R4
CUANDO el export local añade un fichero al zip, el sistema DEBE haber escrito todos sus trozos en el destino del export antes de leer el siguiente fichero del almacén.

## R5
MIENTRAS se genera el export local, los bytes leídos del almacén que aún no se han escrito en el destino NO DEBEN superar el tamaño del mayor fichero del export (adjunto, foto o `data.json` comprimido).

## R6
CUANDO el export local escribe en un destino que no es el de memoria, el zip escrito DEBE tener los mismos bytes que el `Blob` del destino en memoria para los mismos datos y la misma fecha de export.

## R7
SI el export local falla (lectura de un fichero, escritura en el destino o construcción del documento) ENTONCES el sistema DEBE descartar el destino del export antes de rechazar.

## R8
SI la escritura en el destino del export falla ENTONCES el sistema DEBE rechazar el export con un Problem 500 `Could not write the export`.

## R9
DONDE la DataSource local se crea sin destino del dispositivo (web, tests), el sistema DEBE devolver el export como en #66: un `Blob` `application/zip` llamado `ikrive-export-<hoy>.zip`.

## C. Destino del dispositivo

## R10
CUANDO empieza un export en el destino del dispositivo, el sistema DEBE borrar `exports/` de `Directory.Cache` (si existe) y crear vacío el fichero del export antes de escribir ningún trozo.

## R11
CUANDO el destino del dispositivo recibe un trozo, el sistema DEBE añadirlo al fichero del export con `appendFile` en base64 en porciones de como mucho 512 KiB, sin escribir nunca el zip entero en una sola llamada.

## R12
CUANDO se cierra el destino del dispositivo, el sistema DEBE devolver el fichero del dispositivo (`fileName`, `uri` `file://` y `path`) sin leer su contenido.

## R13
CUANDO se descarta el destino del dispositivo, el sistema DEBE borrar el fichero del export sin rechazar, aunque no exista o el borrado falle.

## D. Compartir y web

## R14
CUANDO `dataPortability.export()` devuelve un fichero del dispositivo, el sistema DEBE abrir la hoja de compartir con su `uri` (`Share.share({ files: [uri] })`) sin leer el fichero.

## R15
SI el usuario cierra la hoja de compartir sin elegir destino (`Share.share` rechaza con «Share canceled») ENTONCES el sistema DEBE resolver sin mostrar ningún error y sin borrar el fichero del export, que queda para el `rmdir` de `exports/` del siguiente export (R10).

## R16
SI la hoja de compartir falla por otra causa ENTONCES el sistema DEBE borrar el fichero del export y mostrar el toast «No se ha podido generar el export».

## R17
CUANDO `dataPortability.export()` devuelve un `Blob` (web, modo servidor o destino en memoria), el sistema DEBE guardarlo con `downloadBlob` con su nombre, como en #66.

## R18
El sistema DEBE tener todos los textos nuevos en `es.json` y en `en.json`.

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| En modo local, el export escribe el zip por trozos a un fichero del dispositivo y lo comparte desde él, sin construir el zip completo en memoria ni convertirlo entero a base64 | R1, R4, R10, R11, R12, R14 |
| El pico de memoria del export no crece con el tamaño total del zip: como mucho, un fichero leído más los trozos pendientes de escribir (test con un almacén simulado que mide los bytes retenidos) | R4, R5, R11 |
| El zip resultante es idéntico en contenido al de #66: data.json válido con dataExportSchema y aceptado por POST /api/me/import | R2, R3, R6 |
| Si el export falla o se cancela, el fichero temporal se borra (interpretado como: un export que no termina borra su fichero; cerrar la hoja de compartir no lo borra, ver «Decisión a validar 1» en `design.md`) | R7, R8, R13, R16 (R15, R10: el fichero de una hoja cerrada lo limpia el siguiente export) |
| En la web (sin plugin nativo) el export local sigue funcionando como en #66 | R9, R17 |
| Todos los textos nuevos están en es.json y en.json | R18 |
| pnpm harness --full pasa en verde | Todas (última task) |
