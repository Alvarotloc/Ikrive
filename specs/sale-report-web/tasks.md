# Tasks — sale-report-web

- [x] T1 — `apps/web/src/lib/api-client.ts`: extraer `toApiError(response)` y añadir `api.download(path)` (`GET` con `credentials: 'include'`, devuelve `{ blob, fileName: fileNameFromContentDisposition(...) }`; si no es 2xx lanza `ApiError` igual que `request`). Cubre: R13, R17.
- [x] T2 — `apps/web/src/lib/download.ts` con `downloadBlob(fileName, blob)` y refactor de `downloadIcs` en `apps/web/src/features/calendar/actions.ts` para usarlo; el test existente `downloads an .ics file` de `apps/web/src/features/schedules/add-to-calendar.test.tsx` sigue en verde. Cubre: R13.
- [x] T3 — `apps/web/src/features/reports/sale-report.ts`: `saleReportPath`, `fileNameFromContentDisposition`, `hidesAnything`. Cubre: R10, R11, R12, R13, R14.
- [x] T4 — Tests en `apps/web/src/features/reports/sale-report.test.ts`:
  - `builds the report path with only the checked options` (ninguna → sin `?`; una; las cuatro en orden `hidePrices`, `hidePlate`, `hideVin`, `includeInvoices`, todas `=true`).
  - `reads the file name from Content-Disposition` (`filename*` UTF-8 con acentos gana a `filename`; solo `filename`; `filename*` mal codificado → `filename`).
  - `returns null without a file name` (cabecera `null`, `attachment` a secas).
  - `detects any hide option` (`hidesAnything` con cada flag y con solo `includeInvoices` → `false`).

  Cubre: R10, R11, R12, R13, R14.
- [x] T5 — `apps/web/src/test/render.tsx`: `MockResponse` con `headers?` opcional y `body` de tipo `Blob` enviado tal cual (con su `type` como `content-type` si no se da otro). Documentarlo en el JSDoc de `mockApi`. Cubre: R13.
- [x] T6 — `apps/web/src/features/reports/queries.ts` (`useDownloadSaleReport`) y `apps/web/src/features/reports/sale-report-dialog.tsx` (`SaleReportDialog`: trigger, casillas condicionales, avisos con `aria-live`, pie con carga, toast de error, cierre tras descargar). Cubre: R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17.
- [x] T7 — Integrar `SaleReportDialog` en `apps/web/src/routes/_app/vehicles/$vehicleId/index.tsx`, junto a «Editar», y añadir el namespace `saleReport.*` del design a `apps/web/src/i18n/locales/es.json` y `en.json`; el test `es and en define the same keys` de `apps/web/src/i18n/locales.test.ts` sigue en verde. Cubre: R1, R18.
- [x] T8 — Test `opens an accessible dialog with the report options` en `apps/web/src/features/reports/sale-report-dialog.test.tsx`: el botón «Informe de venta» abre un `dialog` con nombre «Informe de venta» y las cuatro casillas desmarcadas (vehículo con matrícula y VIN); Tab y Mayús+Tab desde el último/primer elemento dejan el foco dentro del diálogo; Escape lo cierra sin peticiones al informe. Cubre: R1, R2, R3, R4, R5, R6, R8.
- [x] T9 — Test `hides the plate and VIN options when the vehicle has neither` en `sale-report-dialog.test.tsx`: con `plate: null` y `vin: null` no existen «Ocultar matrícula» ni «Ocultar VIN» y sí «Ocultar precios» e «Incluir facturas». Cubre: R7, R9.
- [x] T10 — Test `warns that free text is not redacted` en `sale-report-dialog.test.tsx`: sin opciones de ocultar no hay aviso; al marcar cada una aparece el aviso de texto libre; al desmarcarlas desaparece; marcar solo «Incluir facturas» no lo muestra. Cubre: R10.
- [x] T11 — Test `warns that invoices are appended as they are` en `sale-report-dialog.test.tsx`: aparece solo con una opción de ocultar **y** «Incluir facturas» marcadas; no con cualquiera de las dos por separado. Cubre: R11.
- [x] T12 — Tests de descarga en `sale-report-dialog.test.tsx` (con `URL.createObjectURL` stubeado y spy de `HTMLAnchorElement.prototype.click`, como `add-to-calendar.test.tsx`):
  - `requests the report with the checked options and downloads it with the API file name`: marcar Ocultar precios, Ocultar VIN e Incluir facturas → una petición `GET /api/vehicles/v1/report.pdf?hidePrices=true&hideVin=true&includeInvoices=true`; el enlace descargado tiene `download` = el `filename*` de la cabecera y el blob es el cuerpo; el diálogo se cierra.
  - `falls back to the shared file name without Content-Disposition`: respuesta sin cabecera → `download` = `saleReportFileName(<título>, todayIso())`.

  Cubre: R12, R13, R14, R15.
- [x] T13 — Tests de estado en `sale-report-dialog.test.tsx`:
  - `disables the download button while the report is generating`: con la petición retenida, el botón está deshabilitado y muestra «Generando…»; al resolverla, se descarga.
  - `shows an error toast and keeps the dialog open when the API fails`: respuesta 500 problem+json → toast con el texto de `saleReport.error`, el diálogo sigue abierto, las casillas marcadas se conservan y el botón vuelve a estar habilitado.

  Cubre: R16, R17.
- [x] T14 — Revisión visual con `pnpm dev` y playwright-core: ficha con el botón y diálogo con ambos avisos visibles, en claro, oscuro y móvil. Rutas de las capturas en `progress/impl_sale-report-web.md`. Cubre: R1, R10, R11.
- [x] T15 — Ejecutar `pnpm harness --full` y documentar trazabilidad en `progress/impl_sale-report-web.md`. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18.
