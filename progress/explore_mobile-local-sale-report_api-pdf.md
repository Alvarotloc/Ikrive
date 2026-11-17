# Exploración: cómo genera la API el PDF del informe de venta

> Informe de un agente `Explore` para la feature #68 `mobile-local-sale-report`.

## Resumen

La API genera el informe en tres pasos:

1. **Contenido:** `buildSaleReport` (`@ikrive/shared`) devuelve el contenido ya traducido y formateado.
2. **Maquetación:** `@react-pdf/renderer` lo maqueta y lo renderiza.
3. **Facturas:** `pdf-lib` las añade al final; `sharp` prepara antes las que son imágenes.

## 1. `buildSaleReport` (`packages/shared/src/domain/sale-report.ts`)

Se re-exporta desde `packages/shared/src/index.ts:12`.

- **Firma:** `buildSaleReport(input: SaleReportInput): SaleReport` (L330). Es una función pura: solo usa `Intl` y no hace I/O.
- **`SaleReportInput` (L30-40):**
  - `vehicle`
  - `readings: OdometerPoint[]`
  - `maintenance: SaleReportMaintenance[]` (L19-28), cada uno con `attachments` opcionales `{id, name, skipped: 'unreadable'|'size_limit'|null}[]` (L8-17)
  - `settings` (locale/currency/distanceUnit)
  - `options: SaleReportOptions` (hidePrices/hidePlate/hideVin/includeInvoices; esquema en `packages/shared/src/schemas/reports.ts`)
  - `issuedOn` (`YYYY-MM-DD`)
- **Salida `SaleReport` (L64-92):** todas las cadenas van ya resueltas.
  - `locale`, `fileName` (`ikrive-<slug>-<date>.pdf`, L279)
  - `cover`, `summary`
  - `chart` (puntos normalizados a [0,1], `xLabels`/`yLabels`)
  - `maintenance{title, empty, columns, rows}`
  - `annexes{title, items[{id, ref 'A1'.., label, notice}]} | null`
  - `footer`
- **i18n:** los textos están en `SALE_REPORT_TEXTS` (es/en, L122-251), dentro de shared y no en los es/en.json de la web. El formato se hace con `Intl` (L262-273).
- **Privacidad y anexos:** las opciones de privacidad se aplican aquí. Las referencias de los anexos y los avisos de omisión (`unreadable`/`sizeLimit`) se asignan en L363-377.

## 2. Rutas y código PDF de la API

- **Descarga:** `GET /vehicles/:id/report.pdf` en `apps/api/src/modules/reports/routes.ts:10-34`. Requiere sesión, tiene un límite de 10 peticiones/min y responde con `attachment` + `no-store`.
- **Enlaces para compartir:** `apps/api/src/modules/report-shares/routes.ts`.
  - CRUD en L21, L34 y L40.
  - El enlace público `GET /public/reports/:token` (L61-80) sirve el PDF `inline` y llama a `reports.generate(...)` desde `service.render` (`service.ts:81-93`).
- **Orquestación:** `apps/api/src/modules/reports/service.ts:80-156`.
  1. Carga el vehículo, los ajustes y los mantenimientos (en orden de creación).
  2. Si `includeInvoices` está activo, pasa cada adjunto por `loadAnnex`.
  3. Llama a `buildSaleReport`, luego a `renderSaleReportPdf` y luego a `appendAnnexes`, en el orden de `report.annexes.items` (L151-155).
- **Maquetación:** `pdf/sale-report-document.tsx`.
  - Componentes: `Document/Page/View/Text/Svg/Line/Polyline/StyleSheet`.
  - Todo está en una sola `Page` A4 que fluye por varias páginas: cabecera, cajas de vehículo y resumen, gráfica `Svg` `Polyline` (L103-136), tabla, anexos y pie.
  - La cabecera de la tabla es `fixed` y las filas usan `wrap={false}` (L150-165). El pie es `fixed` con el número de página (L226-228).
  - El documento no traduce ni formatea nada.
- **Render:** `pdf/render.tsx:6-9` llama a `registerReportFonts()` y después a `renderToBuffer(...)`.
- **Fuentes:**
  - `pdf/font-files.ts` lista los `.woff` de `@fontsource` (Outfit 600/700 y Plus Jakarta Sans 400/600; react-pdf no lee woff2).
  - `pdf/fonts.ts` los localiza en disco (`existsSync`/`createRequire`/`fileURLToPath`, L13-22) y los registra con `Font.register` sin guionado (L33-40).
  - `tsup.config.ts:57-65` los copia a `dist/fonts/`.
- **Anexos:** `pdf/annexes.ts`.
  - `loadAnnex` (L15-29) lee el archivo con `storage.read` + `node:stream/consumers`.
  - Imágenes: `toAnnexImage` (`apps/api/src/lib/images.ts:49-60`) usa `sharp` con `failOn:'error'` para rotar, limitar a 2000px y recodificar como JPEG/PNG.
  - PDF: `PDFDocument.load` (lanza error si está cifrado), se rechaza si no tiene páginas y se hace una copia de prueba.
  - `appendAnnexes` (L46-68) copia las páginas de cada PDF y pone cada imagen en su propia página A4 (apaisada si es más ancha que alta), ajustada con `fitImage` y un margen de 36pt.
- **Facturas omitidas (`service.ts:96-124`):**
  - **`size_limit`:** se comprueba con `row.size` antes de leer el archivo, contra el presupuesto `REPORT_MAX_ANNEX_MB`.
  - **`unreadable`:** cualquier excepción de `loadAnnex`.
  - En ambos casos se registra un warning y aparece un aviso en el informe. Las ilegibles no gastan presupuesto.

## 3. ¿Solo Node o portable al navegador?

- **Solo Node hoy:**
  - `fonts.ts` (`node:fs`/`module`/`url`)
  - `renderToBuffer`
  - `annexes.ts` (`node:stream/consumers`, `Buffer`)
  - `sharp` (módulo nativo)
  - `FileStorage`
- **Ya portable:**
  - `buildSaleReport`
  - `SaleReportDocument` (JSX puro; react-pdf tiene build de navegador con `pdf(...).toBlob()`)
  - `pdf-lib` (isomórfico, trabaja con `Uint8Array`)
  - `fitImage`
- **Qué habría que mover a shared** (o a un entry point aparte para no inflar el bundle principal):
  1. `sale-report-document.tsx` y la lista de fuentes. El registro de fuentes recibiría URLs o bytes en lugar de leer de disco.
  2. `appendAnnexes` y `fitImage`, con `Uint8Array` en lugar de `Buffer`.
  3. Un `loadAnnex` que reciba los bytes y un normalizador de imagen inyectado: `sharp` en el servidor; canvas o `createImageBitmap` en web/móvil.
  4. El bucle de omisión y presupuesto como helper compartido, con el logger y el almacenamiento inyectados.
- **Web local:** hoy la fuente de datos local rechaza con 501 `saleReport.download` y `reportShares` (`apps/web/src/lib/data-source/local/index.ts:48,64-65`).

## 4. Tests existentes

- **`apps/api/test/reports.test.ts`** comprueba los bytes reales del PDF con `unpdf` `extractText` + `pdf-lib`.
  - L76-249: el informe en general.
  - L378-606: facturas (`fitImage`, orden de la tabla, registros excluidos, referencias, ilegibles, PDF sin páginas, imágenes que no decodifican, límite de tamaño, las ilegibles no gastan presupuesto).
- **`apps/api/test/report-shares.test.ts`**: los enlaces para compartir.
- **`packages/shared/src/domain/sale-report.test.ts`**: tests unitarios de `buildSaleReport` (anexos en L366-479).
- **Web:** `apps/web/src/features/reports/sale-report.test.ts` y `sale-report-dialog.test.tsx` (helpers de URL y UI, sin render de PDF).
- No hay tests unitarios junto a `apps/api/src/modules/reports/pdf/`.
