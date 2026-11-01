# Implementación — sale-report-invoices (#30)

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `packages/shared/src/schemas/reports.ts` | `includeInvoices: flag` en `saleReportQuerySchema`. |
| `packages/shared/src/schemas/reports.test.ts` | Los tres tests existentes ampliados con `includeInvoices`. |
| `packages/shared/src/domain/sale-report.ts` | `SaleReportAnnexSkip`, `SaleReportAttachment`, `attachments?` en `SaleReportMaintenance`, `SaleReportAnnex`, columna `annexes` (última, solo si hay anexos), sección `annexes` (`null` sin opción o sin anexos), textos es/en (`maintenance.columns.annexes`, `annexes.title`, `annexes.skipped.{unreadable,sizeLimit}`). Referencias `A<n>` asignadas sobre `included` ya ordenado. |
| `packages/shared/src/domain/sale-report.test.ts` | `describe('annexes')` con 6 tests (T3, T13); `options` de los fixtures con `includeInvoices: false`. |
| `apps/api/package.json`, `pnpm-lock.yaml` | Dependencia `pdf-lib@^1.17.1`. |
| `apps/api/src/config.ts` | `REPORT_MAX_ANNEX_MB` (entero positivo, 100 por defecto). |
| `apps/api/src/lib/images.ts` | `toAnnexImage` (rotate EXIF, ≤ 2000 px sin ampliar, JPEG→JPEG, resto→PNG, devuelve dimensiones) y tipo `AnnexImage`. |
| `apps/api/src/modules/reports/pdf/annexes.ts` (nuevo) | `LoadedAnnex`, `loadAnnex` (PDF sin `ignoreEncryption`, 0 páginas = error, `copyPages` a un documento propio; imagen vía `toAnnexImage`), `fitImage`, `appendAnnexes` (PDF completos; imagen en A4 vertical/apaisada, margen 36 pt, centrada). Carga con `updateMetadata: false` para conservar los metadatos de Ikrive. |
| `apps/api/src/modules/reports/pdf/sale-report-document.tsx` | Ancho de la columna `annexes` (11 %) y `AnnexList` tras la tabla, con `notice` en `#c2410c` (`--destructive` claro). |
| `apps/api/src/modules/reports/service.ts` | Deps `attachments`, `storage`, `maxAnnexBytes`; `generate(…, log)`: con `includeInvoices` y solo para incluidos lista adjuntos en orden de tabla/subida, comprueba `row.size` contra el presupuesto antes de leer (`size_limit` + `warn`), carga (`unreadable` + `warn` si falla, sin descontar), descuenta si carga; `appendAnnexes` solo si hay alguno cargado. |
| `apps/api/src/modules/reports/routes.ts` | Pasa `request.log`. |
| `apps/api/src/app.ts` | Inyecta `attachmentsRepo`, `storage` y `maxAnnexBytes = REPORT_MAX_ANNEX_MB * 1024 * 1024`. |
| `apps/api/test/reports.test.ts` | `describe('sale report invoices')` con 9 tests (T8–T10, T13); fixtures generados con pdf-lib y sharp. |
| `README.md`, `.env.example` | `REPORT_MAX_ANNEX_MB`. |

## Trazabilidad

| R | Test(s) |
|---|---|
| R1 | `packages/shared/src/schemas/reports.test.ts` › `defaults every option to false`, `accepts true/false/1/0` |
| R2 | `packages/shared/src/schemas/reports.test.ts` › `rejects other values`; `apps/api/test/reports.test.ts` › `rejects invalid includeInvoices` |
| R3 | `packages/shared/src/domain/sale-report.test.ts` › `numbers annexes in table order` |
| R4 | `sale-report.test.ts` › `numbers annexes in table order`; `reports.test.ts` › `references each annex` |
| R5 | `sale-report.test.ts` › `numbers annexes in table order`; `reports.test.ts` › `references each annex` |
| R6 | `sale-report.test.ts` › `never annexes excluded maintenance`; `reports.test.ts` › `never annexes excluded maintenance` |
| R7 | `sale-report.test.ts` › `keeps the #29 report without includeInvoices` |
| R8 | `sale-report.test.ts` › `translates the annex texts`, `marks annexes skipped by the size limit` |
| R9 | `reports.test.ts` › `appends invoices in table order` |
| R10 | `reports.test.ts` › `fits annex images without distortion`, `appends invoices in table order` (A4 apaisada/vertical) |
| R11 | `reports.test.ts` › `appends invoices in table order` (ver «Cambios tras Gate 2» sobre el orden) |
| R12 | `reports.test.ts` › `never annexes excluded maintenance` (incluye fichero del adjunto excluido borrado del disco → ningún `warn`: no se lee) |
| R13 | `reports.test.ts` › `skips unreadable invoices` (cifrado, corrupto, fichero borrado), `skips pdfs without pages and images that do not decode` (PDF válido de 0 páginas, PNG roto en disco) |
| R14 | `reports.test.ts` › `skips unreadable invoices`, `skips pdfs without pages and images that do not decode`, `skips annexes over the size limit and keeps going` (log `level: 40` con `vehicleId` y `attachmentId`) |
| R15 | `sale-report.test.ts` › `marks annexes that could not be read`; `reports.test.ts` › `skips unreadable invoices`, `skips pdfs without pages and images that do not decode` |
| R16 | `reports.test.ts` › `does not change the report without includeInvoices` |
| R17 | `reports.test.ts` › `reads REPORT_MAX_ANNEX_MB` |
| R18 | `reports.test.ts` › `does not count unreadable annexes against the size limit` (decisión 8 del design); `reports.test.ts` › `counts the size limit over all the annexes of the report` (tope 1 MB, tres PDFs de ~0,4 MB que caben solos: se anexan los dos primeros, el tercero se omite con aviso y `warn`, uno pequeño posterior sí se anexa; falla si se quita `remaining -= row.size`), `skips annexes over the size limit and keeps going` |
| R19 | `reports.test.ts` › `skips annexes over the size limit and keeps going` (el «grande» sería ilegible si se leyera: su aviso es el de tope) |
| R20 | `sale-report.test.ts` › `marks annexes skipped by the size limit`; `reports.test.ts` › `skips annexes over the size limit and keeps going` |

## `pnpm harness --full`

```
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared  Test Files 12 passed · Tests 98 passed
apps/api         Test Files 25 passed · Tests 215 passed
apps/web         Test Files 33 passed · Tests 263 passed
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Revisión visual

Sin UI web (es #31). Informe de ejemplo con 3 mantenimientos, un PDF, un PNG apaisado y un PDF corrupto, rasterizado con `pdftoppm` (fuera del repo):

- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/14d79761-70b6-46e0-8e94-30ce1f35962f/scratchpad/visual/report.pdf`
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/14d79761-70b6-46e0-8e94-30ce1f35962f/scratchpad/visual/page-1.png` (columna «Anexos» `A1, A2` / `A3` / `—`, lista «Facturas anexadas», aviso en rojo marca)
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/14d79761-70b6-46e0-8e94-30ce1f35962f/scratchpad/visual/page-2.png` (PDF 300×400 anexado)
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/14d79761-70b6-46e0-8e94-30ce1f35962f/scratchpad/visual/page-3.png` (PNG en A4 apaisada, centrado)

## Desviaciones del spec

Ninguna funcional. Detalles menores:

- `loadAnnex` recibe `Pick<AttachmentRow, 'mimeType' | 'storageKey'>` en lugar de la fila entera (compatible con la firma del design).
- `toAnnexImage` no tiene test unitario propio: queda cubierto por `appends invoices in table order` (PNG apaisado y WebP vertical anexados en A4) y por el caso de imagen del informe visual.
- `PDFDocument.load`/`create` con `updateMetadata: false`, para que re-guardar con pdf-lib no cambie el `Producer`/`ModDate` del informe de react-pdf.
- El test `rejects invalid includeInvoices` prueba además `includeInvoices=` y `=2`; `reads REPORT_MAX_ANNEX_MB` prueba además `'5'`.

## Cambios tras la revisión (CHANGES_REQUESTED)

- `apps/api/test/reports.test.ts`: helper `paddedPdf` (PDF válido con un stream sin referenciar de relleno) y test nuevo `counts the size limit over all the annexes of the report` para R18. Verificado por mutación: comentando `remaining -= row.size` en `service.ts` el test falla (1 failed | 18 passed); restaurado.
- Refuerzo opcional R12: `never annexes excluded maintenance` borra del disco el fichero del adjunto excluido y comprueba que no hay ningún `warn` del vehículo.
- `pnpm harness --full` en verde: shared 98, api 213, web 263.

## Cambios tras Gate 2 (notas del humano)

1. **Orden de anexado** — `apps/api/src/modules/reports/service.ts`: los `LoadedAnnex` se guardan en un `Map` por id de adjunto y la lista para `appendAnnexes` se construye recorriendo `report.annexes.items` (saltando los que tienen `notice`), como dice el paso 7 del design (R11). Ya no depende de que el orden de carga coincida con el de la tabla.
   - **Sin test nuevo que distinga ambos órdenes**: con el repositorio real no es posible construir un caso donde difieran. `buildSaleReport` ordena con un `sort` estable por fecha el mismo array que el servicio recorre al cargar, y ese array ya viene ordenado por fecha (`date desc, createdAt desc` invertido), así que el orden de tabla es siempre idéntico al de carga. Forzar la diferencia exigiría un repositorio falso que devuelva registros desordenados (un artificio que no usa ningún otro test de la API). El cambio queda cubierto por `appends invoices in table order` (si `appendAnnexes` recibiera otra cosa que los ítems del modelo, p. ej. invertidos o sin los cargados, el test falla) y blinda el contrato frente a cambios futuros del orden del repositorio.
2. **R13** — test nuevo `skips pdfs without pages and images that do not decode`: PDF válido sin páginas (`save({ addDefaultPage: false })`; sin esa opción pdf-lib añade una página en blanco) e imagen que no decodifica. Como la subida rechaza imágenes que no decodifican, se sube un PNG válido y se sobrescribe en disco con la firma PNG + basura (igual que el test existente borra ficheros). Ambos omitidos: páginas = informe + 1, aviso de ilegible 2 veces, `warn` con los dos `attachmentId`.
3. **Decisión 8** — test nuevo `does not count unreadable annexes against the size limit`: tope 1 MB, PDF corrupto de 0,6 MB (cabe, ilegible) seguido de dos PDFs válidos de ~0,4 MB → se anexan ambos, sin aviso de tope, `warn` solo del corrupto. **Verificado por mutación**: moviendo `remaining -= row.size` antes de `loadAnnex` el test falla (1 failed | 20 passed en `reports.test.ts`); restaurado.
- `pnpm harness --full` en verde: shared 98, api 215, web 263.
