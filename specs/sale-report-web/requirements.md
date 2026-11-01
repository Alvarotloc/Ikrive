# Requirements — sale-report-web

> Feature 31 (fase 6). Solo web: botón «Informe de venta» en la ficha del vehículo que abre un diálogo con las opciones de #29 (`hidePrices`, `hidePlate`, `hideVin`) y #30 (`includeInvoices`) y descarga `GET /api/vehicles/:id/report.pdf`.
> «Opción de ocultar» = Ocultar precios, Ocultar matrícula u Ocultar VIN. «Diálogo» = el del informe de venta.
> La API no cambia. Enlaces públicos (#32/#33) quedan fuera.

## Botón y diálogo

## R1
El sistema DEBE mostrar en la ficha del vehículo un botón «Informe de venta», sea cual sea el estado del vehículo (activo, archivado o vendido).

## R2
CUANDO el usuario pulsa «Informe de venta», el sistema DEBE abrir un diálogo (`role="dialog"`) cuyo nombre accesible es su título «Informe de venta».

## R3
MIENTRAS el diálogo está abierto, el sistema DEBE mantener el foco dentro de él al recorrerlo con Tab y Mayús+Tab.

## R4
CUANDO el usuario pulsa Escape con el diálogo abierto, el sistema DEBE cerrarlo sin hacer ninguna petición.

## Opciones

## R5
CUANDO se abre el diálogo, el sistema DEBE mostrar las casillas «Ocultar precios» e «Incluir facturas», todas desmarcadas.

## R6
DONDE el vehículo tiene matrícula, el sistema DEBE mostrar en el diálogo la casilla «Ocultar matrícula», desmarcada al abrir.

## R7
SI el vehículo no tiene matrícula ENTONCES el sistema NO DEBE mostrar la casilla «Ocultar matrícula».

## R8
DONDE el vehículo tiene VIN, el sistema DEBE mostrar en el diálogo la casilla «Ocultar VIN», desmarcada al abrir.

## R9
SI el vehículo no tiene VIN ENTONCES el sistema NO DEBE mostrar la casilla «Ocultar VIN».

## Avisos

## R10
MIENTRAS hay alguna opción de ocultar marcada, el sistema DEBE mostrar en el diálogo el aviso de que solo se quitan los campos del vehículo y de los mantenimientos, y que si el alias, la versión o los títulos de los mantenimientos incluyen la matrícula, el VIN o importes, aparecerán en el informe.

## R11
MIENTRAS hay alguna opción de ocultar marcada e «Incluir facturas» está marcada, el sistema DEBE mostrar en el diálogo el aviso de que las facturas se anexan tal cual y pueden mostrar esos datos.

## Descarga

## R12
CUANDO el usuario pulsa «Descargar», el sistema DEBE pedir `GET /api/vehicles/:id/report.pdf` con `<opción>=true` por cada casilla marcada (`hidePrices`, `hidePlate`, `hideVin`, `includeInvoices`) y sin el parámetro de las no marcadas.

## R13
CUANDO la API responde 200, el sistema DEBE descargar el cuerpo de la respuesta con el nombre de fichero de su cabecera `Content-Disposition` (`filename*` UTF-8 si existe; si no, `filename`).

## R14
SI la respuesta 200 no trae un nombre de fichero legible en `Content-Disposition` ENTONCES el sistema DEBE descargarla como `saleReportFileName(<nombre visible del vehículo>, <hoy>)` de `@ikrive/shared`.

## R15
CUANDO la descarga se ha iniciado, el sistema DEBE cerrar el diálogo.

## R16
MIENTRAS la petición del informe está en curso, el sistema DEBE mostrar el botón «Descargar» deshabilitado y con el texto de carga «Generando…».

## R17
SI la petición del informe falla (respuesta no 2xx o error de red) ENTONCES el sistema DEBE mostrar un toast de error y dejar el diálogo abierto con las opciones marcadas.

## i18n

## R18
El sistema DEBE definir todos los textos nuevos (botón, título, descripción, casillas, avisos, carga y error) en `es.json` y `en.json` con las mismas claves.

## Acceptance → requirements

| Acceptance (`feature_list.json` #31) | Requirements |
|---|---|
| Botón «Informe de venta» que abre un diálogo accesible (título, foco atrapado, Escape) | R1, R2, R3, R4 |
| Casillas Ocultar precios / matrícula / VIN e Incluir facturas; Descargar pide report.pdf con esas opciones y descarga con el nombre de la API | R5, R6, R8, R12, R13, R14 |
| Aviso de facturas si se combina ocultar + Incluir facturas | R11 |
| Aviso de texto libre si se marca cualquier opción de ocultar | R10 |
| Carga y botón deshabilitado; si falla, toast de error y diálogo abierto | R15, R16, R17 |
| Ocultar matrícula / VIN no aparecen sin ese dato | R7, R9 |
| Textos en es.json y en.json | R18 |
| Tests de componente: abrir, URL con opciones, aviso de facturas, aviso de texto libre, error de la API | R2, R10, R11, R12, R17 (tasks T8–T12) |
| `pnpm harness --full` en verde | T15 |
