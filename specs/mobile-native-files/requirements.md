# Requirements — mobile-native-files

Feature #55 (fase 8, etapa 1). En la APK (la web dentro de Capacitor, #51) `<a download href="blob:…">` no descarga y `openBlob` no abre pestañas. Se cambia solo la costura `lib/download.ts` / `lib/api-files.ts`: en la app nativa los ficheros se guardan/comparten y se abren con APIs nativas; en la web todo sigue igual.

«App nativa» = `isNativeApp()` de `lib/platform.ts` (build `--mode native`). «Web» = cualquier otro build.

## Web sin cambios

## R1
MIENTRAS se ejecuta la web, `downloadBlob(fileName, blob)` DEBE guardar el fichero con un `<a download="<fileName>" href="blob:…">` temporal sin cargar el módulo nativo `lib/native-files.ts`.

## R2
MIENTRAS se ejecuta la web, `openBlob(blob, fileName)` DEBE abrir el fichero con un `<a target="_blank" rel="noopener" href="blob:…">` temporal sin cargar el módulo nativo `lib/native-files.ts`.

## Guardar y abrir en la app nativa

## R3
MIENTRAS se ejecuta la app nativa, `downloadBlob(fileName, blob)` DEBE escribir el contenido del blob en el directorio de caché de la app con el nombre `fileName` (saneado, ver `design.md`).

## R4
MIENTRAS se ejecuta la app nativa, `downloadBlob(fileName, blob)` DEBE abrir la hoja de compartir del sistema con el fichero escrito en R3, con el título `files.shareTitle`.

## R5
SI el usuario cierra la hoja de compartir sin elegir destino ENTONCES `downloadBlob` DEBE resolver sin error (sin toast).

## R6
MIENTRAS se ejecuta la app nativa, `openBlob(blob, fileName)` DEBE escribir el fichero en la caché de la app y abrirlo con la app del sistema asociada a su tipo MIME (`blob.type`, o `application/octet-stream` si viene vacío).

## R7
CUANDO se llama a `openApiFile(url, fallbackName)`, el sistema DEBE pasar a `openBlob` el nombre del `Content-Disposition` de la respuesta, o `fallbackName` si no lo trae.

## R8
SI escribir, compartir o abrir un fichero falla en la app nativa ENTONCES `downloadBlob` / `openBlob` DEBE rechazar la promesa con el error.

## Flujos de la app nativa

## R9
MIENTRAS se ejecuta la app nativa, CUANDO el usuario descarga una factura (tarjeta del adjunto o visor), el sistema DEBE guardar/compartir el fichero con su nombre original (`Content-Disposition` o `originalName`).

## R10
MIENTRAS se ejecuta la app nativa, CUANDO el usuario abre una factura PDF, el sistema DEBE abrirla con el visor del sistema con tipo `application/pdf`.

## R11
MIENTRAS se ejecuta la app nativa, CUANDO el usuario pulsa «Descargar mis datos», el sistema DEBE guardar/compartir el zip con el nombre del `Content-Disposition`.

## R12
MIENTRAS se ejecuta la app nativa, CUANDO el usuario elige «Descargar .ics» en «Añadir al calendario», el sistema DEBE guardar/compartir el `.ics` con su nombre.

## Errores

## R13
SI guardar o abrir un fichero falla (adjunto, visor, export o `.ics`) ENTONCES el sistema DEBE mostrar un toast de error `common.fileError`.

## Plataforma, i18n y docs

## R14
`apps/mobile/package.json` DEBE declarar los plugins de Capacitor que usa la web (`@capacitor/filesystem`, `@capacitor/share`, `@capacitor-community/file-opener`) con la misma versión exacta que `apps/web/package.json`.

## R15
El sistema DEBE tener todos los textos nuevos en `es.json` y `en.json`.

## R16
`docs/mobile.md` NO DEBE listar la descarga o apertura de ficheros como limitación conocida.

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| En la app móvil, descargar una factura la guarda en el dispositivo o abre la hoja de compartir con su nombre original | R3, R4, R5, R9, R14 |
| En la app móvil, abrir una factura PDF la muestra con el visor del sistema | R6, R7, R10, R14 |
| En la app móvil, el export de datos genera el zip y se puede guardar o compartir | R3, R4, R11 |
| En la app móvil, el .ics de «Añadir al calendario» se puede guardar o compartir | R3, R4, R12 |
| En la web no cambia el comportamiento de descargas ni de apertura de ficheros | R1, R2 |
| Los errores al guardar o abrir un fichero se muestran con un toast | R8, R13 |
| Todos los textos están en es.json y en.json | R15 |
| Tests unitarios o de componente cubren la elección entre la vía nativa y la web en la costura de ficheros | R1, R2, R3, R6 (tests de `lib/download.test.ts`) |
| docs/mobile.md deja de listar la descarga de ficheros como limitación conocida | R16 |
| pnpm harness --full pasa en verde | última task de `tasks.md` |
