# impl_sale-report-pdf

> Feature #29 `sale-report-pdf` · rama `feat/sale-report-pdf` · sin commitear. T1–T14 marcadas `[x]`.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `apps/api/package.json`, `pnpm-lock.yaml` | deps `@react-pdf/renderer@^4.9.0`, `react@^19.3.0`, `@fontsource/outfit@^5.3.0`, `@fontsource/plus-jakarta-sans@^5.3.0`; dev `@types/react@^19.3.0`, `unpdf@^2.1.0`. |
| `apps/api/tsconfig.json` | `"jsx": "react-jsx"` (sin lib DOM: el typecheck pasa sin ella). |
| `packages/shared/src/schemas/reports.ts` (nuevo) | `saleReportQuerySchema` (`z.stringbool` `true/1`·`false/0`, default `false`) y `SaleReportOptions`. |
| `packages/shared/src/schemas/reports.test.ts` (nuevo) | 3 tests del query. |
| `packages/shared/src/domain/sale-report.ts` (nuevo) | `SALE_REPORT_TEXTS` (es/en, categorías y combustibles), formateadores `Intl` internos, `saleReportFileName`, `buildSaleReport` y tipos `SaleReport*`. |
| `packages/shared/src/domain/sale-report.test.ts` (nuevo) | 14 tests unitarios (factorías `input()`/`record()`). |
| `packages/shared/src/index.ts` | Exporta `domain/sale-report` y `schemas/reports`. |
| `apps/api/src/lib/http.ts` (nuevo) | `contentDisposition` movido sin cambios desde `modules/attachments/routes.ts`. |
| `apps/api/src/modules/attachments/routes.ts` | Importa `contentDisposition` de `lib/http` (18 tests de adjuntos en verde). |
| `apps/api/src/modules/reports/pdf/fonts.ts` (nuevo) | `registerReportFonts()` idempotente: `.woff` de `@fontsource` con `createRequire(import.meta.url).resolve`, Outfit 600/700 y Plus Jakarta Sans 400/600; sin partición silábica. |
| `apps/api/src/modules/reports/pdf/sale-report-document.tsx` (nuevo) | Documento A4: cabecera (eyebrow, nombre, fecha), cajas Vehículo/Resumen, gráfico (`Svg` + `Line` + `Polyline`, etiquetas como `Text`), tabla con cabecera `fixed`, filas alternas y coste a la derecha, pie `fixed` con nº de página. |
| `apps/api/src/modules/reports/pdf/render.tsx` (nuevo) | `renderSaleReportPdf(report)` → `renderToBuffer`. |
| `apps/api/src/modules/reports/service.ts` (nuevo) | `createReportsService({ vehicles, maintenance, settings }).generate(ownerId, vehicleId, options)`. |
| `apps/api/src/modules/reports/routes.ts` (nuevo) | `GET /vehicles/:id/report.pdf` (auth, `idParamSchema`, `saleReportQuerySchema`, rate limit 10/min, cabeceras del design). |
| `apps/api/src/app.ts` | Crea `reportsService` y registra `reportsRoutes`. |
| `apps/api/test/reports.test.ts` (nuevo) | 9 tests de integración (helper `pdfText` con `unpdf`). |

## Trazabilidad

| R | Test(s) |
|---|---|
| R1 | `packages/shared/src/domain/sale-report.test.ts` › `fills the cover with the vehicle data`; `apps/api/test/reports.test.ts` › `renders the report contents` |
| R2 | `sale-report.test.ts` › `summarises the odometer`, `formats with the owner's currency and unit` |
| R3 | `sale-report.test.ts` › `summarises the odometer` (con lecturas, sin lecturas y < 30 días) |
| R4 | `sale-report.test.ts` › `counts and sums only included maintenance`, `handles a vehicle without maintenance or readings` |
| R5 | `sale-report.test.ts` › `counts and sums only included maintenance` (10.1 + 20.2 = `30,30 €`), `handles a vehicle without maintenance or readings` |
| R6 | `sale-report.test.ts` › `lists only included maintenance by date`; `reports.test.ts` › `renders the report contents` |
| R7 | `sale-report.test.ts` › `lists only included maintenance by date` |
| R8 | `sale-report.test.ts` › `formats each maintenance row` |
| R9 | `sale-report.test.ts` › `builds the odometer chart`; `reports.test.ts` › `renders the report contents` (etiquetas de eje) |
| R10 | `sale-report.test.ts` › `omits the chart with readings on fewer than two days`, `handles a vehicle without maintenance or readings` |
| R11 | `sale-report.test.ts` › `handles a vehicle without maintenance or readings` |
| R12 | `sale-report.test.ts` › `hides prices`; `reports.test.ts` › `hides the vin and the plate` |
| R13 | `sale-report.test.ts` › `hides the plate`; `reports.test.ts` › `hides the vin and the plate` |
| R14 | `sale-report.test.ts` › `hides the vin`; `reports.test.ts` › `hides the vin and the plate` |
| R15 | `sale-report.test.ts` › `uses the owner's locale`; `reports.test.ts` › `uses the owner's settings` |
| R16 | `sale-report.test.ts` › `formats with the owner's currency and unit`; `reports.test.ts` › `uses the owner's settings` |
| R17 | `sale-report.test.ts` › `builds a readable file name` |
| R18 | `packages/shared/src/schemas/reports.test.ts` › `defaults every option to false`, `accepts true/false/1/0` |
| R19 | `reports.test.ts` (shared) › `rejects other values`; `apps/api/test/reports.test.ts` › `rejects invalid options` |
| R20 | `reports.test.ts` › `serves the sale report as a pdf` |
| R21 | `reports.test.ts` › `serves the sale report as a pdf` (zona `Pacific/Kiritimati` → `todayIn` de esa zona) |
| R22 | `reports.test.ts` › `hides other users' vehicles` |
| R23 | `reports.test.ts` › `requires a session` |
| R24 | `reports.test.ts` › `embeds the brand fonts` (`/BaseFont /XXXXXX+Outfit-…` y `…+PlusJakartaSans-…`) |
| R25 | `reports.test.ts` › `rate limits the report` |

## Verificación

### `pnpm harness --full` (resumido)

```
[OK]    33 features: 28 done, 4 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #29 sale-report-pdf (in_progress)
[OK]    Rama actual: feat/sale-report-pdf
[OK]    pnpm lint        (biome: 279 files, no fixes)
[OK]    pnpm typecheck   (shared, api, web)
[OK]    pnpm test        shared 92 · api 203 · web 263 — todos en verde
[OK]    Arnés en verde.
```

### Puntos de parada del design

- **T1 (tipos de react-pdf sin DOM):** `tsc --noEmit` en verde con `jsx: react-jsx` y `types: ["node"]`; no se añadió `lib: DOM`.
- **T10/T11 (texto con `unpdf`):** `extractText(…, { mergePages: true })` recupera todo el texto (acentos, `€`, espacios de `Intl`, VIN, matrícula). Única rareza: el eyebrow, con `letterSpacing` y `textTransform: uppercase`, sale como `I N F O R M E D E V E N TA`; los tests no dependen de él (el pie lleva el mismo texto).

### T13 — visual y Docker

- Stack aislado: `tsx src/server.ts` en el puerto 3917 con `DATA_DIR` en el scratchpad (el `pnpm dev` del humano no se tocó; proceso parado al terminar). Datos de ejemplo: 9 lecturas (2019–2026), 21 mantenimientos (3 excluidos, uno sin coste). Informes `es`, `es` con `hidePrices&hidePlate=1&hideVin`, `en` (`USD`/`mi`) y vehículo vacío en `en`, rasterizados con `pdftoppm -png -r 80`:
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/7479b241-9d59-4d5b-b081-00b32c834b58/scratchpad/shots/es-1.png`, `…/shots/es-2.png` (2 páginas, cabecera de tabla repetida en la 2.ª)
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/7479b241-9d59-4d5b-b081-00b32c834b58/scratchpad/shots/es-hide-prices-1.png`, `…/shots/es-hide-prices-2.png` (sin matrícula, VIN, columna de coste ni gasto)
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/7479b241-9d59-4d5b-b081-00b32c834b58/scratchpad/shots/en-1.png`, `…/shots/en-2.png`
  - `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/7479b241-9d59-4d5b-b081-00b32c834b58/scratchpad/shots/en-empty-1.png` (textos de gráfico y tabla vacíos, `—` en km)
  - `pdffonts`: `PlusJakartaSans-Regular`, `PlusJakartaSans-SemiBold`, `Outfit-SemiBold`, `Outfit-Bold`, todas embebidas en subconjunto con ToUnicode.
- Docker: `docker build -f docker/Dockerfile -t ikrive:dev .` OK. Contenedor en el puerto 3918 → `/api/health` `{"status":"ok","version":"0.0.0"}`; mismo script de datos → 4 informes 200 `application/pdf` con el `content-disposition` esperado y las 4 fuentes embebidas (`/app/node_modules/@fontsource/outfit/files` presente). PDFs en `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/7479b241-9d59-4d5b-b081-00b32c834b58/scratchpad/docker-shots/`. Contenedor parado (`--rm`).

## Desviaciones del spec

1. **`SaleReport.cover.heading`** (texto «Vehículo»/«Vehicle»): el interface del design no tenía título para la caja de la portada, pero la maquetación pide «dos cajas (Vehículo / Resumen)» y el documento no debe traducir. Añadido al modelo y a `SALE_REPORT_TEXTS`.
2. **Tipo de las filas de la tabla:** `Partial<Record<SaleReportColumn, string>>[]` en vez de `Record<SaleReportColumn, string>[]`, porque con `hidePrices` las filas no llevan la clave `cost` (como dice el propio design) y un `Record` completo mentiría al tipo.
3. **Exportados extra:** `SaleReportMaintenance`, `SaleReportRow`, `SaleReportTexts` y `SaleReportColumn` (tipos auxiliares del interface del design).

## Notas

- En `es`, `Intl` no agrupa 4 cifras (`3255,00 €`); es el mismo comportamiento que la web (`useFormat`).
- El slug recorta a 60 caracteres y vuelve a quitar el guion final que pueda quedar tras el recorte.
