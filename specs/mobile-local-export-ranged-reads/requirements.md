# Requirements — mobile-local-export-ranged-reads

> Feature 80 (fase 8). Sigue a #75 (`specs/mobile-local-export-streaming/`), cuya alternativa 2 retoma: en la prueba en dispositivo de #75 (442 MB de PDF) el renderer del WebView llegó a ~1,07 GB porque `native-storage.read` lee cada adjunto entero como base64.
> Términos de #75: **escritor en streaming** (`streamDataExportZip`), **destino del export** (`LocalExportSink`), **almacén local** (`LocalFileStore`), **almacén del dispositivo** (`lib/native-storage.ts`), **almacén en memoria** (`apps/web/src/test/memory-file-store.ts`). **Entrada abierta** = la que devuelve el nuevo `openFile(path)` del escritor en streaming. **Trozo de lectura** = lo que entrega `LocalFileStore.readChunks`; **`EXPORT_READ_BYTES`** = 256 KiB.

## A. Escritor de zip compartido

## R1
CUANDO se pasa un trozo a una entrada abierta con `push`, el escritor en streaming DEBE entregar al callback ese trozo (con la cabecera de la entrada delante si es el primero) antes de que vuelva `push`, sin acumularlo.

## R2
El escritor en streaming DEBE producir, para un fichero pasado en trozos a una entrada abierta (incluido un fichero vacío), exactamente los mismos bytes que con `addFile` del fichero entero.

## R3
SI se llama a `openFile`, `addFile` o `finish` mientras otra entrada sigue abierta ENTONCES el escritor en streaming DEBE lanzar un error sin entregar nada al callback.

## R4
CUANDO un zip hecho con `buildDataExport` y entradas abiertas alimentadas por trozos se sube a `POST /api/me/import` de otra cuenta, la API DEBE aceptarlo con 201 y crear los mismos datos y ficheros que el zip de `GET /api/me/export`.

## B. Lectura por trozos del almacén local

## R5
CUANDO se recorre `readChunks(key, chunkBytes)` de un almacén local, el almacén DEBE entregar el fichero en orden en trozos de como mucho `chunkBytes`, leyendo cada trozo solo cuando se pide.

## R6
SI el fichero de `key` no existe ENTONCES `readChunks` DEBE rechazar con `MissingFileError` en la primera lectura, sin entregar ningún trozo.

## R7
CUANDO el almacén del dispositivo lee un fichero por trozos, el sistema DEBE pedir cada trozo con `Filesystem.readFile({ offset, length })`, con `length` entre 1 y `chunkBytes`, a partir del tamaño que da `Filesystem.stat`.

## R8
SI `Filesystem.readFile` devuelve un trozo de tamaño distinto del pedido ENTONCES el almacén del dispositivo DEBE rechazar con un error que no es `MissingFileError`.

## R9
CUANDO el fichero del dispositivo tiene 0 bytes, el almacén del dispositivo DEBE terminar `readChunks` sin entregar trozos y sin llamar a `Filesystem.readFile`.

## C. Export local

## R10
CUANDO el export local copia un adjunto o una foto, el sistema DEBE leerlo con `readChunks` en trozos de `EXPORT_READ_BYTES`, sin llamar a `LocalFileStore.read`.

## R11
CUANDO el export local recibe un trozo de lectura, el sistema DEBE haber escrito en el destino del export todos los trozos pendientes del zip antes de pedir el siguiente trozo de lectura.

## R12
MIENTRAS se genera el export local, los bytes leídos del almacén que aún no se han escrito en el destino NO DEBEN superar 2 × `EXPORT_READ_BYTES`, sea cual sea el tamaño de los ficheros.

## R13
SI un fichero del export no existe en el dispositivo ENTONCES el export local DEBE omitirlo como en #75: sin entrada en el zip ni en `data.json`.

## R14
SI la lectura de un fichero falla por otra causa, antes o después de abrir su entrada, ENTONCES el export local DEBE descartar el destino y rechazar con un Problem 500 `Could not read a file of the export`.

## R15
El export local DEBE producir exactamente los mismos bytes que el zip de #75 hecho con `addFile` de cada fichero entero, para los mismos datos y la misma fecha de export.

## R16
DONDE la DataSource local se crea con el almacén en memoria y sin destino del dispositivo (web, tests), el export local DEBE devolver el `Blob` `application/zip` `ikrive-export-<hoy>.zip` como en #75.

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| En la app nativa en modo local, el export lee cada adjunto y foto por rangos y nunca tiene un fichero entero en memoria ni en base64 | R5, R7, R8, R9, R10, R11 |
| El pico retenido del export no depende del tamaño del mayor fichero: como mucho unos pocos trozos (test con almacén simulado que mide bytes retenidos) | R1, R3, R11, R12 |
| El zip es idéntico en contenido al de #75 (mismas entradas, bytes y sha256) y lo acepta POST /api/me/import | R2, R4, R13, R14, R15 |
| En la web y con el almacén en memoria el export sigue funcionando como en #75 | R6, R16 |
| Prueba en el móvil con ~400 MB de adjuntos de 15–20 MB: el pico del renderer del WebView baja claramente frente a ~1,07 GB de #75, y se documenta | R7, R10, R12 + prueba manual T11 (no automatizable en CI) |
| pnpm harness --full pasa en verde | Todas (última task) |
