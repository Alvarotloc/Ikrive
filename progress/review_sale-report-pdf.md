# Review — #29 sale-report-pdf

**Veredicto:** APPROVED

Revisado: `git diff main...HEAD` (spec + `feature_list.json`), `git diff` y los archivos sin trackear (todos leídos enteros). `pnpm harness --full` ejecutado por el reviewer: verde (shared 92 · api 203 · web 263).

## Trazabilidad requirements ↔ tests

- R1: [x] `packages/shared/src/domain/sale-report.test.ts:49` › `fills the cover with the vehicle data` (filas exactas y en orden; con alias → título alias; `null` omitidos; fecha de emisión) + `apps/api/test/reports.test.ts:94` › `renders the report contents` (nombre, «Seat León FR» y sección «Vehículo» en el texto del PDF)
- R2: [x] `sale-report.test.ts:85` › `summarises the odometer` (`60.000 km` con lecturas desordenadas; `—` sin lecturas) + `formats with the owner's currency and unit`
- R3: [x] `sale-report.test.ts:85` (`20.000 km`; `—` sin lecturas y con < 30 días)
- R4: [x] `sale-report.test.ts:117` › `counts and sums only included maintenance` (`3`, excluido no cuenta) + `:253` (`0`)
- R5: [x] `sale-report.test.ts:117` (10.1 + 20.2 + null = `30,30 €`, excluido de 999 ignorado) + `:253` (`0,00 €`)
- R6: [x] `sale-report.test.ts:134` (excluido ausente) + `reports.test.ts:94` (`not.toContain('Reparación privada')`)
- R7: [x] `sale-report.test.ts:134` › `lists only included maintenance by date` (ascendente y dos del mismo día en orden de entrada)
- R8: [x] `sale-report.test.ts:155` › `formats each maintenance row` (columnas, etiquetas y filas exactas, `—` en km y coste, categoría traducida)
- R9: [x] `sale-report.test.ts:200` › `builds the odometer chart` (agrupado por día con máximo, puntos exactos `0/0.5/1`, etiquetas, `y = 0.5` plano) + `reports.test.ts:94` (etiquetas de eje en el PDF)
- R10: [x] `sale-report.test.ts:235` (dos lecturas el mismo día → `empty`, sin puntos ni etiquetas) + `:253`
- R11: [x] `sale-report.test.ts:253` (texto vacío, sin filas)
- R12: [x] `sale-report.test.ts:269` › `hides prices` (sin columna ni clave `cost`, sin gasto, `JSON.stringify` sin importes ni `€`, con control positivo) + `reports.test.ts:124` (texto sin `12.345,67` ni `€`, control positivo)
- R13: [x] `sale-report.test.ts:282` + `reports.test.ts:124` (`hidePlate=1` → sin matrícula, control con ella presente y VIN intacto)
- R14: [x] `sale-report.test.ts:292` + `reports.test.ts:124` (`hideVin=true` → sin VIN, control positivo)
- R15: [x] `sale-report.test.ts:302` › `uses the owner's locale` + `reports.test.ts:156` › `uses the owner's settings` (tras `PATCH` a `en` los textos cambian y desaparece «Informe de venta»)
- R16: [x] `sale-report.test.ts:327` (EUR/km vs USD/mi, ≥ 5 cifras, fechas `medium`) + `reports.test.ts:156` (`$12,345.67`, `52,000 mi`, `Jun 15, 2025`)
- R17: [x] `sale-report.test.ts:352` › `builds a readable file name` (acentos, Ñ, solo símbolos → `vehicle`, recorte a 60)
- R18: [x] `packages/shared/src/schemas/reports.test.ts:4,8` (defaults `false`; `true/1/TRUE` y `false/0/False`)
- R19: [x] `schemas/reports.test.ts:21` (`yes`, `2`, `''`, repetido, booleano) + `reports.test.ts:215` (400 problem+json con `yes`, `2` y parámetro repetido)
- R20: [x] `reports.test.ts:69` (200, `application/pdf`, `%PDF-`)
- R21: [x] `reports.test.ts:69` (`content-disposition` exacto con fecha `todayIn('Pacific/Kiritimati')` tras cambiar la zona del usuario)
- R22: [x] `reports.test.ts:191` (ajeno e inexistente → 404 problem+json `Vehicle not found`); el servicio lanza antes de `renderSaleReportPdf` (`service.ts:27`)
- R23: [x] `reports.test.ts:207` (401 sin cookie)
- R24: [x] `reports.test.ts:230` (`/BaseFont /XXXXXX+Outfit-` y `+PlusJakartaSans-` en los bytes crudos)
- R25: [x] `reports.test.ts:241` (10 × 200 y la 11.ª 429, app propia por test)

## Tasks

- T1..T14: [x]

## Checkpoints

- C1: [x] `pnpm harness` OK · una sola feature activa (#29 `in_progress`) · rama `feat/sale-report-pdf`.
- C2: [x] spec completo (requirements/design/tasks), EARS con tabla de acceptance completa · tasks todas `[x]` · cada R<n> con test abierto y leído.
- C3: [x] el diff toca exactamente los archivos de la tabla del design; el único cambio fuera de `reports` es el movimiento de `contentDisposition` a `lib/http.ts` (previsto en T7, sin cambio de comportamiento).
- C4: [x] módulo `reports/{routes,service}.ts` (sin repository, justificado en el design) cableado en `app.ts`; query y params validados con esquemas de `@ikrive/shared`; propiedad vía `findOwned` → `NotFoundError` (404); sin BD ni web; dominio puro en `packages/shared` con tests.
- C5: [x] sin `any`, `@ts-ignore`, `console.log` ni TODOs nuevos; fechas `YYYY-MM-DD` formateadas en UTC; distancias sin conversión de unidad; no hay ficheros subidos.
- C6: [x] `pnpm harness --full` verde (ejecutado por el reviewer); tests de API con SQLite en memoria vía `createTestApp`, sin mocks; feature sin UI web, y aun así hay capturas del PDF referenciadas en el impl.
- C7: [x] `progress/impl_sale-report-pdf.md` con archivos, mapa R→test y verificación · `progress/current.md` al día · `docs/PLAN.md` sin cambios necesarios (no cierra la fase 6).

## Comprobaciones específicas pedidas

- **Privacidad:** el documento react-pdf solo pinta campos de `SaleReport`; los metadatos son `title = "<eyebrow> · <nombre visible>"`, `author/creator/producer = "Ikrive"`, `language`; el nombre de fichero sale del nombre visible y la fecha. Ni matrícula, ni VIN, ni importes llegan a metadatos, nombre de fichero ni cabeceras. Lo comprobé renderizando con las tres opciones activas: `/Title` y `/Author` son objetos con «Informe de venta · Seat León» / «Ikrive». Los tests del modelo (`JSON.stringify`) y los de texto extraído, ambos con control positivo, lo cubren.
- **Rate limit:** `config.rateLimit { max: 10, timeWindow: '1 minute' }` sobre el plugin global (300/min); el test demuestra el 429 en la 11.ª.
- **Dependencias/Docker:** el lockfile solo añade paquetes (ninguna versión existente cambia); `react@^19.3.0` y `@types/react@^19.3.0` alinean con la web; `@fontsource/*` y `@react-pdf/renderer` en `dependencies`, `unpdf` en dev. El Dockerfile no necesita cambios: en la imagen `ikrive:dev` (construida hoy 16:01) comprobé que los `.woff` y `@react-pdf/renderer` se resuelven desde `/app/node_modules` con `createRequire('/app/dist/server.js')`, que el bundle importa `@react-pdf/renderer` y `react/jsx-runtime` como externos y que `unpdf` no está en la imagen.

## Desviaciones declaradas (aceptables)

1. `cover.heading`: necesario para respetar «el documento no traduce» con la caja «Vehículo» del diseño; está en `SALE_REPORT_TEXTS` es/en y lo comprueba el test de integración. Aceptable.
2. Filas `Partial<Record<SaleReportColumn, string>>[]`: más honesto que el `Record` del design, que contradecía la propia regla de quitar la clave `cost`. Aceptable.
3. Tipos auxiliares exportados (`SaleReportMaintenance`, `SaleReportRow`, `SaleReportTexts`, `SaleReportColumn`): solo nombran tipos ya implícitos en el interface del design y #30/#32 los necesitarán. Aceptable.

## Hallazgos

Ninguno bloqueante.

## Avisos para el humano (no bloquean)

- `service.ts:33-35`: el orden de creación entre mantenimientos del mismo día depende de `createdAt` en ms (`listByVehicle` ordena por `date desc, createdAt desc`). Dos registros insertados en el mismo ms quedarían en orden indeterminado; en la práctica es irrelevante. La inversión del servicio no tiene test a nivel de API (R7 se prueba en la función pura).
- El eyebrow (`letterSpacing` + `uppercase`) sale en el texto extraído como `I N F O R M E …`. Solo afecta a la extracción de texto y a la accesibilidad del PDF; los tests no dependen de él.
- `sale-report.ts:230`: la regex de diacríticos lleva los caracteres combinantes literales (`[̀-ͯ]`); `̀-ͯ` se leería mejor.
- Rate limit por IP con `trustProxy: true` (configuración que ya existía): si la API se expone sin proxy, un cliente puede saltarse el límite cambiando `X-Forwarded-For`. Esto ya pasaba con el límite global.
- Algo que ya existía, ajeno a esta feature: la imagen Docker contiene un `/app/dist/dist` duplicado (`pnpm deploy` copia `dist` y luego `cp -r apps/api/dist /out/dist` lo anida). Inofensivo, unos 500 KB.
- Riesgo ya recogido en el design: el texto libre (alias, títulos, versión) puede contener la matrícula o importes; las opciones de privacidad solo quitan los campos estructurados. Conviene avisarlo en el diálogo de #31.

## Cambios requeridos

Ninguno.
