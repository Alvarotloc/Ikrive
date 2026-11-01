# Requirements — sale-report-pdf

> Feature 29 (fase 6). Informe de venta en PDF: modelo construido por una función pura de `@ikrive/shared` (`buildSaleReport`) y renderizado con `@react-pdf/renderer` en `GET /api/vehicles/:id/report.pdf`.
> «Incluidos» = mantenimientos con `includeInReport = true`. «Lecturas» = todas las de `odometer_readings` (`manual`, `maintenance`, `fuel`). Idioma, moneda y unidad de distancia salen de `user_settings` del **propietario**.
> Facturas (`includeInvoices`, #30), web (#31) y enlace público (#32) quedan fuera.

## Modelo del informe (`packages/shared`)

## R1
El sistema DEBE incluir en la portada del informe el nombre visible del vehículo (alias, o marca + modelo), marca y modelo, versión, año, combustible, matrícula, VIN y la fecha de emisión, omitiendo los campos que el vehículo no tiene.

## R2
El sistema DEBE mostrar en el resumen como km actuales el valor de la lectura más reciente (`latestOdometerReading`), o `—` si el vehículo no tiene lecturas.

## R3
El sistema DEBE mostrar en el resumen como media anual el resultado de `averageDistancePerYear` sobre las lecturas, o `—` cuando es `null`.

## R4
El sistema DEBE mostrar en el resumen como número de mantenimientos el número de mantenimientos incluidos.

## R5
El sistema DEBE mostrar en el resumen como gasto en mantenimiento la suma, redondeada a céntimos, de los costes no nulos de los mantenimientos incluidos.

## R6
El sistema DEBE listar en la tabla de mantenimientos solo los mantenimientos incluidos.

## R7
El sistema DEBE ordenar la tabla de mantenimientos por fecha ascendente, conservando el orden de creación entre los de la misma fecha.

## R8
El sistema DEBE mostrar en cada fila de la tabla la fecha, los km (o `—` sin km), la categoría traducida, el título y el coste (o `—` sin coste).

## R9
El sistema DEBE construir la serie del gráfico de km con una lectura por día (la de mayor valor), ordenada por fecha, con `x` proporcional a la fecha e `y` proporcional al valor entre el mínimo y el máximo, ambos normalizados a [0, 1], y etiquetas de eje con la primera y la última fecha y el valor mínimo y máximo.

## R10
SI las lecturas cubren menos de dos días distintos ENTONCES el sistema DEBE omitir el gráfico y mostrar en su lugar el texto de datos insuficientes.

## R11
SI no hay mantenimientos incluidos ENTONCES el sistema DEBE mostrar en lugar de la tabla el texto de lista vacía.

## R12
DONDE `hidePrices` es `true`, el sistema DEBE omitir la columna de coste de la tabla y el gasto en mantenimiento del resumen.

## R13
DONDE `hidePlate` es `true`, el sistema DEBE omitir la matrícula del informe.

## R14
DONDE `hideVin` es `true`, el sistema DEBE omitir el VIN del informe.

## R15
El sistema DEBE tomar todos los textos fijos del informe (títulos, etiquetas, categorías, combustibles, textos vacíos) de un diccionario tipado `Record<Locale, …>` según `user_settings.locale`.

## R16
El sistema DEBE formatear fechas (`dateStyle: 'medium'`, UTC), importes (moneda de `user_settings.currency`) y distancias (número sin decimales + `user_settings.distanceUnit`) con `Intl` en el idioma del propietario.

## R17
El sistema DEBE nombrar el fichero `ikrive-<slug>-<YYYY-MM-DD>.pdf`, con `<slug>` el nombre visible en minúsculas, sin acentos y con los caracteres no alfanuméricos sustituidos por `-` (o `vehicle` si queda vacío), y la fecha de emisión.

## Query (`packages/shared`)

## R18
El sistema DEBE validar `hidePrices`, `hidePlate` y `hideVin` con `saleReportQuerySchema` de `@ikrive/shared`, aceptando `true`/`false`/`1`/`0` y tomando `false` cuando faltan.

## R19
SI alguna de esas opciones llega con otro valor ENTONCES el sistema DEBE responder 400 `application/problem+json`.

## Endpoint (`apps/api`)

## R20
CUANDO el usuario hace `GET /api/vehicles/:id/report.pdf` sobre un vehículo suyo, el sistema DEBE responder 200 con `Content-Type: application/pdf` y un cuerpo que empieza por `%PDF-`.

## R21
CUANDO el sistema sirve el informe, DEBE enviar `Content-Disposition: attachment` con el nombre de R17, usando como fecha de emisión el día de hoy en `user_settings.timezone` del propietario.

## R22
SI el vehículo no existe o es de otro usuario ENTONCES el sistema DEBE responder 404 `application/problem+json` sin generar el PDF.

## R23
SI la petición no tiene sesión ENTONCES el sistema DEBE responder 401.

## R24
El sistema DEBE componer el PDF con Outfit en los títulos y Plus Jakarta Sans en el texto, cargadas desde los ficheros `.woff` de `@fontsource/outfit` y `@fontsource/plus-jakarta-sans`.

## R25
SI un cliente supera 10 peticiones por minuto a `GET /api/vehicles/:id/report.pdf` ENTONCES el sistema DEBE responder 429.

## Acceptance → requirements

| Acceptance (`feature_list.json` #29) | Requirements |
|---|---|
| GET report.pdf autenticado → 200, `application/pdf`, `attachment` con nombre legible | R17, R20, R21, R23 |
| Vehículo ajeno o inexistente → 404 problem+json | R22 |
| Portada, resumen, gráfico SVG de km y tabla de mantenimientos | R1, R2, R3, R4, R5, R8, R9, R10, R11 |
| Solo `includeInReport = true`, ordenados por fecha | R6, R7 |
| `hidePrices`/`hidePlate`/`hideVin` (por defecto false, esquema zod en shared) | R12, R13, R14, R18, R19 |
| Textos es/en según locale; fechas, importes y distancias con moneda y unidad | R15, R16 |
| Función pura en shared con tests (privacidad, vehículo vacío) | R1–R17 (tests de T3–T6) |
| Integración: 200 con `%PDF`, 404 por propiedad, VIN/matrícula ausentes del texto | R13, R14, R20, R22 |
| Outfit + Plus Jakarta Sans desde `@fontsource` (.woff) | R24 |
| `pnpm harness --full` en verde | T14 |
