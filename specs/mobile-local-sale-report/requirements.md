# Requirements — mobile-local-sale-report

> Feature 68 (fase 8, etapa 2, parte 5 de 5). Va después de #65. `saleReport.download` en modo local genera el PDF del informe de venta en el dispositivo a partir de `buildSaleReport`, con las facturas como anexos.
> Fuentes: `progress/explore_mobile-local-sale-report_{api-pdf,web-local}.md`, `specs/sale-report-pdf/`, `specs/sale-report-invoices/`, `specs/mobile-local-files/`, `specs/mobile-local-export/`, `docs/PLAN.md` › Fase 8 («Enlaces públicos»).
> **Modo local**, **DataSource local**, **almacén local** y **Problem** como en `specs/mobile-local-files/requirements.md`. **Módulo PDF compartido** = el entry point `@ikrive/shared/sale-report-pdf`. **Presupuesto de anexos** = bytes guardados de las facturas que caben en un informe (`REPORT_MAX_ANNEX_MB` en la API).

## A. Módulo PDF compartido

## R1
El sistema DEBE maquetar, renderizar y anexar las facturas del informe de venta con un único módulo `@ikrive/shared/sale-report-pdf`, que usan `GET /api/vehicles/:id/report.pdf`, `GET /api/public/reports/:token` y el modo local.

## R2
La API DEBE mantener `GET /api/vehicles/:id/report.pdf` y `GET /api/public/reports/:token` (cuerpo, cabeceras, avisos en el log) sin cambiar las aserciones de `apps/api/test/reports.test.ts` ni de `apps/api/test/report-shares.test.ts`.

## R3
CUANDO se genera un informe con `includeInvoices`, el módulo PDF compartido DEBE añadir tras las páginas del informe, en el orden de `report.annexes.items`, todas las páginas de cada factura PDF y cada factura imagen en su propia página A4 (apaisada si es más ancha que alta), ajustada sin deformar ni ampliar.

## R4
SI una factura no se puede leer o preparar (fichero ausente, PDF corrupto, cifrado o sin páginas, imagen que no decodifica) ENTONCES el módulo PDF compartido DEBE omitirla con el aviso `unreadable`, sin descontarla del presupuesto de anexos, y seguir con las demás.

## R5
SI el tamaño guardado de una factura supera lo que queda del presupuesto de anexos ENTONCES el módulo PDF compartido DEBE omitirla con el aviso `size_limit` sin leer su fichero y seguir con las demás.

## R6
El módulo PDF compartido DEBE recibir las fuentes del informe (Outfit 600/700, Plus Jakarta Sans 400/600) como orígenes inyectados (ruta, URL o data URL) y embeberlas en el PDF, sin leer el disco por su cuenta.

## B. DataSource local

## R7
CUANDO, en modo local, se llama a `saleReport.download(vehicleId, options)`, el sistema DEBE devolver un `application/pdf` llamado `ikrive-<slug>-<hoy en la zona horaria de los ajustes>.pdf`, generado en el dispositivo con `buildSaleReport` a partir del vehículo, lecturas, mantenimientos y ajustes locales y de las opciones recibidas.

## R8
CUANDO el modo local y la API generan el informe de los mismos datos con las mismas opciones y el mismo día, el texto de los dos PDF (anexos incluidos) DEBE ser idéntico.

## R9
CUANDO, en modo local, se genera el informe con `includeInvoices`, el sistema DEBE anexar las facturas de los mantenimientos incluidos en el informe leyéndolas del almacén local, y ninguna de los excluidos.

## R10
CUANDO, en modo local, se anexa una factura imagen, el sistema DEBE prepararla con canvas en lugar de `sharp`: orientación EXIF aplicada, como mucho 2000 px por el lado mayor sin ampliar, recodificada a JPEG si era JPEG y a PNG en otro caso.

## R11
MIENTRAS la app está en modo local, el presupuesto de anexos DEBE ser de 25 MB (`LOCAL_MAX_ANNEX_MB`), sin cambiar el valor por defecto de `REPORT_MAX_ANNEX_MB` en la API (100 MB).

## R12
SI, en modo local, el vehículo no existe ENTONCES el sistema DEBE rechazar `saleReport.download` con un Problem 404 `Vehicle not found`.

## R13
SI, en modo local, la generación del PDF falla por otra causa (carga del módulo, fuentes o render) ENTONCES el sistema DEBE rechazar con un Problem 500 sin devolver un fichero.

## R14
El sistema DEBE cargar el módulo PDF compartido, sus dependencias (`@react-pdf/renderer`, `pdf-lib`) y las fuentes solo con `import()` al descargar el informe en modo local, nunca con un import estático desde la web.

## R15
El build web DEBE colocar el chunk del PDF del modo local en `assets/native/`, fuera del precache del service worker.

## R22
CUANDO se construye la imagen Docker con los cambios de esta feature, `docker/smoke.mjs` DEBE pasar contra ella, incluida la generación del informe de venta en PDF.

## C. Web

## R16
MIENTRAS la app está en modo local, la ficha del vehículo DEBE mostrar el botón «Informe de venta» y su diálogo con las opciones de privacidad y «Descargar».

## R17
MIENTRAS la app está en modo local, el diálogo del informe NO DEBE mostrar la sección «Compartir con un enlace» ni pedir los enlaces públicos a la DataSource.

## R18
CUANDO, en modo local, se pulsa «Descargar», el sistema DEBE generar el PDF con `saleReport.download` y guardarlo con `downloadBlob` (hoja de compartir del teléfono) con su nombre, con el botón deshabilitado y «Generando…» mientras se genera.

## R19
SI la generación falla en modo local ENTONCES el sistema DEBE mostrar el toast `saleReport.error` y mantener el diálogo abierto.

## R20
MIENTRAS la web no está en modo local, el diálogo del informe DEBE seguir mostrando la sección «Compartir con un enlace» y descargando el PDF de la API como hasta ahora.

## R21
El sistema DEBE tener en `es.json` y `en.json` todos los textos que muestra el diálogo del informe en modo local.

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| En modo local se puede descargar el PDF del informe de venta con el mismo contenido que el de la API | R1, R2, R6, R7, R8, R12, R13, R14, R15, R16, R18, R19, R22 |
| Las facturas se añaden como anexos y las ilegibles se omiten como en la API | R3, R4, R5, R8, R9, R10, R11 |
| «Compartir enlace» sigue oculto en modo local | R17, R20 |
| Todos los textos están en es.json y en.json | R21 |
| pnpm harness --full pasa en verde | Todas (última task) |
