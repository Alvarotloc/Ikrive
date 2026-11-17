# Tasks — mobile-local-sale-report

## A. Módulo PDF compartido

- [ ] T1 — Crear `packages/shared/src/domain/sale-report-fonts.ts` (`REPORT_FONT_FILES`, `ReportFontFile`, `ReportFontFamily`, `REPORT_FONTS`) y exportarlo desde `src/index.ts`. `apps/api/tsup.config.ts` lo importa de `@ikrive/shared` y se borra `apps/api/src/modules/reports/pdf/font-files.ts`. Cubre: R6.
- [ ] T2 — `packages/shared`: subpath `./sale-report-pdf`, dependencias `@react-pdf/renderer`, `pdf-lib` y `react`, `@types/react` en devDependencies y `jsx: react-jsx`. Mover `SaleReportDocument` a `src/sale-report-pdf/document.tsx`. Crear `render.tsx` con `registerReportFonts(fonts)` y `renderSaleReportPdf(report, fonts)` sobre `pdf().toBlob()`, con fuentes inyectadas. Cubre: R1, R6.
- [ ] T3 — Crear `packages/shared/src/sale-report-pdf/annexes.ts` (`loadAnnex(bytes, mimeType, toAnnexImage)`, `fitImage`, `appendAnnexes` sobre `Uint8Array`) y `generate.ts` (`generateSaleReportPdf` con presupuesto, `size_limit`, `unreadable` y `onAnnexSkipped`), más `index.ts`. Cubre: R1, R3, R4, R5.
- [ ] T4 — Tests en `packages/shared/src/sale-report-pdf/annexes.test.ts`, con PDFs hechos con pdf-lib y un normalizador de imágenes falso: `fits annex images without distortion`, `appends every pdf page and each image on its own A4 page in annex order`, `turns the page landscape for wide images`, `skips unreadable annexes without using the budget`, `skips annexes over the remaining budget without reading them`, `never reads attachments of excluded records or without includeInvoices`. Cubre: R3, R4, R5.
- [ ] T5 — `apps/api/src/modules/reports/service.ts` delega en `generateSaleReportPdf` (`readAnnex` con `storage`, `toAnnexImage` con `sharp`, los mismos `log.warn`, `Buffer.from(pdf)`). `pdf/fonts.ts` conserva solo `resolveReportFont` y se borran `annexes.ts`, `render.tsx` y `sale-report-document.tsx`. En `apps/api/test/reports.test.ts` solo cambia la importación de `fitImage`. `reports.test.ts` y `report-shares.test.ts` pasan sin cambiar aserciones. Cubre: R1, R2, R6.

## B. DataSource local

- [ ] T6 — `LocalImages.toAnnexImage` en `apps/web/src/lib/data-source/local/files.ts` y su implementación en `canvas-images.ts` (EXIF, ≤ 2000 px, JPEG 0.85 desde JPEG y PNG en otro caso). `toAnnexImage` en `src/test/fake-images.ts` (PNG real de 1×1; rechaza `CORRUPT`). Cubre: R10.
- [ ] T7 — Tests en `apps/web/src/lib/data-source/local/canvas-images.test.ts`: `recodes jpeg annex images as jpeg within 2000 px`, `recodes other annex images as png`, `never enlarges small annex images`, `decodes annex images with the EXIF orientation`. Cubre: R10.
- [ ] T8 — Crear `apps/web/src/lib/data-source/local/sale-report.ts` (`localSaleReport`, `LOCAL_MAX_ANNEX_MB`, `SaleReportPdfKit`, `LoadSaleReportPdf`) y `local/sale-report-pdf.ts` (fuentes `?url` de `@fontsource`). Añadir `LocalDeps.saleReportPdf` (por defecto `import('./sale-report-pdf')`) y `saleReport` en `local/index.ts` (`reportShares` sigue en 501). Añadir las dependencias de `@fontsource` y `unpdf` (dev) a `apps/web/package.json`. Cubre: R7, R9, R11, R12, R13, R14.
- [ ] T9 — Crear `apps/web/src/test/node-sale-report-pdf.ts` (kit con fuentes en data URL). Tests en `apps/web/src/lib/data-source/local/local-sale-report.test.ts`: `downloads the sale report as a pdf named after today in the settings time zone`, `renders the local data with the report options`, `embeds the brand fonts`, `appends the invoices of included records only`, `appends image invoices on their own page`, `skips unreadable invoices as the API does`, `skips invoices over the 25 MB annex budget`, `rejects with a 404 for a missing vehicle`, `rejects with a 500 when the pdf module fails`. En `local-data-source.test.ts`, `rejects unsupported operations with 501` deja de incluir `saleReport.download`. Cubre: R6, R7, R9, R11, R12, R13.

## C. Test cruzado

- [ ] T10 — Crear `packages/shared/src/sale-report-pdf/cross-scenario.ts` (subpath `./sale-report-pdf/cross-scenario`): datos, opciones, `now` y `crossScenarioFiles()` (PDF con texto, PDF corrupto y factura de `size` inflado por encima de 25 MB). Cubre: R8.
- [ ] T11 — Test `matches the cross-mode sale report` en `apps/api/test/reports.test.ts` y en `apps/web/src/lib/data-source/local/local-sale-report.test.ts`. La API arranca con `REPORT_MAX_ANNEX_MB=25` (igual que `LOCAL_MAX_ANNEX_MB`). Los dos usan `vi.setSystemTime(now)`, extraen el texto con `unpdf` y hacen `toMatchFileSnapshot` sobre `packages/shared/src/sale-report-pdf/__snapshots__/cross-report.txt`. Generar el snapshot con `vitest -u` desde la API y comprobar que la web pasa sin `-u`. Cubre: R8, R3, R4, R5.

## D. Bundle

- [ ] T12 — `apps/web/src/features/pwa/config.ts`: `NATIVE_ONLY_ENTRIES` y `nativeChunkFileNames` por `facadeModuleId`. Tests en `native-only.test.ts`: `sends the local sale report pdf chunk to assets/native/` y `the web imports the sale report pdf module only through import()` (`@ikrive/shared/sale-report-pdf`, `@react-pdf/renderer`, `pdf-lib` y `local/sale-report-pdf`, salvo dentro de este último). Cubre: R14, R15.
- [ ] T13 — Ejecutar `pnpm --filter @ikrive/web build` y comprobar que el chunk del PDF está en `dist/assets/native/` y no aparece en el precache de `dist/sw.js`, y que el chunk inicial no crece. Anotar los tamaños en `progress/impl_mobile-local-sale-report.md`. Cubre: R15.

## E. Web

- [ ] T14 — `routes/_app/vehicles/$vehicleId/index.tsx` muestra `SaleReportDialog` siempre. `features/reports/sale-report-dialog.tsx` oculta el `<hr />` y `ReportSharesSection` con `isLocalMode()`. Cubre: R16, R17, R20.
- [ ] T15 — Tests en `apps/web/src/features/mobile/local-mode.test.tsx` (con `vi.mock('@/lib/data-source/local/sale-report-pdf')` hacia el kit de Node):
  - Renombrar `vehicle page shows the photo picker and hides the sale report` a `vehicle page shows the photo picker and the sale report`, que afirma que está el botón «Informe de venta».
  - Nuevos: `sale report dialog hides the public links`, `downloads the sale report pdf through the share sheet` (`saveFile` recibe `ikrive-seat-ibiza-<hoy>.pdf` y un blob que empieza por `%PDF`; «Generando…» mientras tanto) y `shows a toast when the local sale report fails`.

  Cubre: R16, R17, R18, R19, R21.
- [ ] T16 — En `apps/web/src/features/reports/sale-report-dialog.test.tsx`, los tests de modo servidor (`opens an accessible dialog with the report options`, `requests the report with the checked options and downloads it with the API file name`…) pasan sin cambiar aserciones. Comprobar que `apps/web/src/i18n/locales.test.ts` está en verde. Cubre: R20, R21.

## F. Cierre

- [ ] T17 — Documentación:
  - `CONTRIBUTING.md`: `@ikrive/shared/sale-report-pdf`, `LocalDeps.saleReportPdf`, `toAnnexImage` y `NATIVE_ONLY_ENTRIES`.
  - `docs/PLAN.md`: estado de #68 y tabla de fases.

  Cubre: R2.
- [ ] T18 — **Verificación Docker (obligatoria):** ejecutar `docker build -f docker/Dockerfile -t ikrive:dev .` y `node docker/smoke.mjs` contra esa imagen (genera un informe de venta PDF). Anotar en `progress/impl_mobile-local-sale-report.md` los comandos, la salida resumida y el resultado (OK/KO). Si falla, la feature no pasa a revisión. El reviewer comprueba que esa anotación existe y es de la última versión del código. Cubre: R2, R22.
- [ ] T19 — Ejecutar `pnpm harness --full` y documentar trazabilidad en `progress/impl_mobile-local-sale-report.md`. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21, R22.
