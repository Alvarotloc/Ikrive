# Requirements — sale-report-invoices

> Feature 30 (fase 6). Amplía #29 (`sale-report-pdf`): con `includeInvoices=true`, `GET /api/vehicles/:id/report.pdf` anexa al final del informe las facturas (adjuntos) de los mantenimientos incluidos, con `pdf-lib`.
> «Incluidos» = mantenimientos con `includeInReport = true`. «Anexo» = un adjunto de un mantenimiento incluido. «Informe» = las páginas que genera react-pdf.
> Los anexos van tal cual: las opciones `hidePrices`/`hidePlate`/`hideVin` no los alteran (decisión de fase 6).

## Query (`packages/shared`)

## R1
El sistema DEBE validar `includeInvoices` en `saleReportQuerySchema` de `@ikrive/shared`, aceptando `true`/`false`/`1`/`0` y tomando `false` cuando falta.

## R2
SI `includeInvoices` llega con otro valor ENTONCES el sistema DEBE responder 400 `application/problem+json`.

## Modelo del informe (`packages/shared`)

## R3
DONDE `includeInvoices` es `true` y algún mantenimiento incluido tiene adjuntos, el sistema DEBE numerar los anexos `A1`, `A2`… siguiendo el orden de la tabla de mantenimientos y, dentro de cada mantenimiento, el orden de subida.

## R4
DONDE `includeInvoices` es `true` y hay anexos, el sistema DEBE añadir a la tabla de mantenimientos una columna «Anexos» con las referencias de cada fila separadas por comas, o `—` si la fila no tiene.

## R5
DONDE `includeInvoices` es `true` y hay anexos, el sistema DEBE añadir tras la tabla una lista de anexos con, por cada uno, su referencia, la fecha y el título del mantenimiento y el nombre original del fichero.

## R6
El sistema NO DEBE incluir en el modelo (referencias, columna ni lista) los adjuntos de mantenimientos con `includeInReport = false`.

## R7
MIENTRAS `includeInvoices` es `false`, o no hay anexos, el sistema DEBE construir el mismo modelo que #29, sin columna ni lista de anexos.

## R8
El sistema DEBE tomar los textos de anexos (columna, título de la lista, aviso de anexo ilegible y aviso de anexo omitido por tope) del diccionario `SALE_REPORT_TEXTS` según `user_settings.locale`.

## Endpoint y anexado (`apps/api`)

## R9
DONDE `includeInvoices` es `true`, el sistema DEBE añadir tras las páginas del informe todas las páginas de cada anexo PDF, en su orden original.

## R10
DONDE `includeInvoices` es `true`, el sistema DEBE incrustar cada anexo de imagen (JPEG, PNG o WebP) en su propia página A4, vertical o apaisada según la imagen, centrada dentro de los márgenes, escalada sin deformar y sin ampliarla.

## R11
El sistema DEBE añadir los anexos al PDF en el orden de sus referencias (R3).

## R12
El sistema NO DEBE leer ni anexar los adjuntos de mantenimientos con `includeInReport = false`.

## R13
SI un anexo no se puede leer (PDF corrupto, cifrado o sin páginas, imagen que no se decodifica o fichero ausente) ENTONCES el sistema DEBE omitirlo y servir el informe con el resto con 200.

## R14
SI un anexo se omite, por ilegible (R13) o por tope (R19), ENTONCES el sistema DEBE registrar un log `warn` con el id del adjunto y del vehículo.

## R15
SI un anexo se omite por ilegible ENTONCES el sistema DEBE indicar en su entrada de la lista de anexos que no se pudo anexar.

## R16
MIENTRAS `includeInvoices` es `false` o falta, el sistema DEBE servir el mismo PDF que #29, sin cargar ni leer adjuntos.

## Tope de tamaño de anexos (`apps/api`)

## R17
El sistema DEBE tomar el tope total de anexos por informe de la variable de entorno `REPORT_MAX_ANNEX_MB`, un entero positivo que vale 100 si falta.

## R18
DONDE `includeInvoices` es `true`, el sistema DEBE recorrer los anexos en el orden de sus referencias (R3) y anexar cada uno solo si su tamaño almacenado en bytes cabe en lo que queda del tope, descontándolo entonces del presupuesto.

## R19
SI un anexo no cabe en lo que queda del tope ENTONCES el sistema DEBE omitirlo sin leer su fichero y seguir evaluando los anexos posteriores, respondiendo 200.

## R20
SI un anexo se omite por tope ENTONCES el sistema DEBE indicar en su entrada de la lista de anexos, con un aviso distinto del de R15, que se superó el tamaño máximo del informe.

## Acceptance → requirements

| Acceptance (`feature_list.json` #30) | Requirements |
|---|---|
| `includeInvoices` booleano, por defecto false, en el mismo esquema zod de shared | R1, R2 |
| PDFs fusionados completos e imágenes una por página, ajustadas sin deformar | R9, R10 |
| Orden de la tabla y referencia al mantenimiento (en la tabla o separador) | R3, R4, R5, R11 |
| Adjuntos de mantenimientos con `includeInReport = false` nunca se anexan | R6, R12 |
| PDF corrupto o cifrado: se omite, warning y aviso en el informe | R13, R14, R15 |
| Integración: nº de páginas = informe + páginas PDF + 1 por imagen; sin la opción no cambia | R7, R9, R10, R16 |
| `pnpm harness --full` en verde | T11 |
| (Textos es/en, heredado de #29) | R8 |
| (Gate 1: tope total de anexos por informe, `REPORT_MAX_ANNEX_MB`) | R14, R17, R18, R19, R20 |
