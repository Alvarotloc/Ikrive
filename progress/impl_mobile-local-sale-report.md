# Implementación — mobile-local-sale-report (#68)

Rama `feat/mobile-local-sale-report`. Tasks T1–T19 marcadas en `specs/mobile-local-sale-report/tasks.md`. Sin commits.

## Cambios por archivo

### A. Módulo PDF compartido (`@ikrive/shared/sale-report-pdf`)

- `packages/shared/src/domain/sale-report-fonts.ts` (nuevo): `REPORT_FONT_FILES`, `ReportFontFile`, `ReportFontFamily`, `REPORT_FONTS`. Se exporta desde `src/index.ts`.
- `packages/shared/src/sale-report-pdf/document.tsx`: `SaleReportDocument`, movido sin cambios desde `apps/api/.../pdf/sale-report-document.tsx`. Solo cambian sus imports.
- `packages/shared/src/sale-report-pdf/render.tsx` (nuevo):
  - `ReportFontSource`.
  - `registerReportFonts(fonts)`: se registra una sola vez y sin guionado.
  - `renderSaleReportPdf(report, fonts)`: usa `pdf(<SaleReportDocument/>).toBlob()` y devuelve un `Uint8Array`.
- `packages/shared/src/sale-report-pdf/annexes.ts` (nuevo): `AnnexImage`, `AnnexImageNormalizer`, `LoadedAnnex`, `loadAnnex(bytes, mimeType, toAnnexImage)`, `fitImage` y `appendAnnexes`. Trabajan con `Uint8Array` y no usan `storage`.
- `packages/shared/src/sale-report-pdf/generate.ts` (nuevo): `generateSaleReportPdf(input, deps)`.
  - Incluye el bucle de presupuesto y omisión que antes estaba en `service.ts`.
  - Los casos `size_limit` (no lee el fichero) y `unreadable` (no gasta presupuesto) avisan con `onAnnexSkipped`.
  - Después llama a `buildSaleReport`, al render y a los anexos, en el orden de `report.annexes.items`.
- `packages/shared/src/sale-report-pdf/index.ts` (nuevo): reexporta lo anterior. No se reexporta desde `src/index.ts`.
- `packages/shared/src/sale-report-pdf/cross-scenario.ts` (nuevo, solo para tests): `CROSS_NOW`, `CROSS_SETTINGS`, `CROSS_VEHICLE`, `CROSS_READINGS`, `CROSS_MAINTENANCE` (uno excluido), `CROSS_OPTIONS` (`hidePlate` + `includeInvoices`), `crossScenarioFiles()` y `textPdf()`.
  - `crossScenarioFiles()` crea cuatro facturas: una PDF con «Factura de prueba», una PDF corrupta, una con `size` inflado a 26 MB y otra del mantenimiento excluido.
- `packages/shared/src/sale-report-pdf/__snapshots__/cross-report.txt` (nuevo): el snapshot del test cruzado, generado desde la API.
- `packages/shared/src/sale-report-pdf/annexes.test.ts` (nuevo): 6 tests (T4).
- `packages/shared/package.json`:
  - Exports `./sale-report-pdf` y `./sale-report-pdf/cross-scenario`.
  - Dependencias `@react-pdf/renderer ^4.9.0`, `pdf-lib ^1.17.1` y `react ^19.3.0`.
  - devDependencies `@types/react ^19.3.0` y `@types/node ^26.6.5`.
- `packages/shared/tsconfig.json`: `"jsx": "react-jsx"` y `"types": ["node"]`.
- `apps/api/src/modules/reports/service.ts`: `generate()` delega en `generateSaleReportPdf`.
  - `readAnnex` = `buffer(storage.read(key))`.
  - `toAnnexImage` = `sharp` de `lib/images.ts`.
  - Los dos `log.warn` siguen iguales en `onAnnexSkipped`.
  - Devuelve `Buffer.from(pdf)`.
- `apps/api/src/modules/reports/pdf/fonts.ts`: conserva solo `resolveReportFont`.
- Borrados: `apps/api/src/modules/reports/pdf/{annexes.ts,render.tsx,sale-report-document.tsx,font-files.ts}`.
- `apps/api/tsup.config.ts`: `REPORT_FONT_FILES` se importa de `packages/shared/src/domain/sale-report-fonts`. Ver la desviación 1.
- `apps/api/test/build.test.ts`: `REPORT_FONT_FILES` se importa de `@ikrive/shared` (solo cambia el import).
- `apps/api/test/reports.test.ts`:
  - `fitImage` se importa de `@ikrive/shared/sale-report-pdf`.
  - Se importa `vi`.
  - Nuevo `describe('cross-mode sale report')` › `matches the cross-mode sale report`.
  - No se ha cambiado ninguna aserción existente.

### B. DataSource local

- `apps/web/src/lib/data-source/local/sale-report.ts` (nuevo): `LOCAL_MAX_ANNEX_MB = 25`, `SaleReportPdfKit`, `LoadSaleReportPdf` y `localSaleReport(db, deps, queue)`.
  - Dentro de la cola lee: `requireVehicle` (404), mantenimientos invertidos, ajustes, lecturas y adjuntos de los mantenimientos incluidos (solo con `includeInvoices`, en orden `createdAt` y después `rowid`).
  - Fuera de la cola carga el kit y genera el PDF. Cualquier fallo de carga o de render acaba en un 500 `Could not generate the sale report`.
- `apps/web/src/lib/data-source/local/sale-report-pdf.ts` (nuevo, chunk del PDF): reexporta `generateSaleReportPdf` y `fonts`.
  - `fonts` sale de las cuatro `.woff?url` de `@fontsource`, en un `Record<ReportFontFile['file'], string>`.
- `apps/web/src/lib/data-source/local/files.ts`: `LocalImages.toAnnexImage(data, mimeType)` y `LocalDeps.saleReportPdf?`.
- `apps/web/src/lib/data-source/local/canvas-images.ts`: `toAnnexImage`.
  - Decodifica con `imageOrientation: 'from-image'` y aplica `fitInside(…, 2000)`.
  - Codifica como `image/jpeg` 0,85 si la entrada era JPEG y como `image/png` en otro caso. Devuelve el tamaño del canvas.
  - `ImageCanvas.toBlob(type, quality?)`.
- `apps/web/src/lib/data-source/local/index.ts`: `saleReport: localSaleReport(db, deps, queue)` (`reportShares` sigue en 501) y JSDoc actualizado.
- `apps/web/src/test/fake-images.ts`: `PNG_1X1` y `toAnnexImage`, que devuelve un PNG real de 1×1 o rechaza `CORRUPT`.
- `apps/web/src/test/node-sale-report-pdf.ts` (nuevo): `nodeSaleReportPdf` y `loadNodeSaleReportPdf`, con las fuentes como data URL leídas de `@fontsource`.
- `apps/web/package.json`: `@fontsource/outfit ^5.3.0` y `@fontsource/plus-jakarta-sans ^5.3.0` en dependencies; `unpdf ^2.1.0` en devDependencies.
- `apps/web/src/lib/data-source/local/local-sale-report.test.ts` (nuevo): 10 tests (T9 y T11).
- `apps/web/src/lib/data-source/local/canvas-images.test.ts`: 4 tests nuevos (T7). El tipo `quality` del doble pasa a ser opcional.
- `apps/web/src/lib/data-source/local/local-data-source.test.ts`: `saleReport.download` sale de la lista de operaciones que responden 501.

### C/D. Bundle

- `apps/web/src/features/pwa/config.ts`: `NATIVE_ONLY_ENTRIES` y `nativeChunkFileNames({ moduleIds, facadeModuleId })`.
- `apps/web/src/features/pwa/native-only.test.ts`: `sends the local sale report pdf chunk to assets/native/` y `the web imports the sale report pdf module only through import()`.

### E. Web

- `apps/web/src/routes/_app/vehicles/$vehicleId/index.tsx`: `<SaleReportDialog>` se muestra siempre; se quitan `isLocalMode()` y su import.
- `apps/web/src/features/reports/sale-report-dialog.tsx`: con `isLocalMode()` no se pintan ni el `<hr />` ni `ReportSharesSection`, así que no se pide `reportShares.list`.
- `apps/web/src/features/mobile/local-mode.test.tsx`:
  - Hay un `vi.mock('@/lib/data-source/local/sale-report-pdf')` que apunta al kit de Node, con `gate`/`fail` y un shim de `fetch('data:…')`. Ver la desviación 4.
  - Se renombra el test de la ficha y hay 3 tests nuevos.
- `es.json`/`en.json`: sin claves nuevas (el diálogo usa las `saleReport.*` de siempre).

### F. Docs

- `CONTRIBUTING.md`: `@ikrive/shared/sale-report-pdf`, `LocalDeps.saleReportPdf`, `toAnnexImage`, el kit de Node de los tests y `NATIVE_ONLY_ENTRIES` junto con la guarda de imports.
- `docs/PLAN.md`: #68 implementada (con resumen) y fase 8 pasa a «⏳ En curso». Sigue pendiente porque quedan #71, #73, #75 y #77.

## Trazabilidad

| R | Archivo › test |
|---|---|
| R1 | `packages/shared/src/sale-report-pdf/annexes.test.ts` › todos; `apps/api/test/reports.test.ts` › `matches the cross-mode sale report`; `apps/web/src/lib/data-source/local/local-sale-report.test.ts` › `matches the cross-mode sale report` (API y local usan `generateSaleReportPdf`) |
| R2 | `apps/api/test/reports.test.ts` (los 21 tests previos, con las aserciones sin tocar) y `apps/api/test/report-shares.test.ts`, en verde; `apps/api/test/build.test.ts` › `copies the migrations and the report fonts`; T18 (smoke Docker › `report pdf`) |
| R3 | `annexes.test.ts` › `appends every pdf page and each image on its own A4 page in annex order`, `turns the page landscape for wide images`, `fits annex images without distortion`; `local-sale-report.test.ts` › `appends image invoices on their own page` |
| R4 | `annexes.test.ts` › `skips unreadable annexes without using the budget`; `local-sale-report.test.ts` › `skips unreadable invoices as the API does` |
| R5 | `annexes.test.ts` › `skips annexes over the remaining budget without reading them`; `local-sale-report.test.ts` › `skips invoices over the 25 MB annex budget` |
| R6 | `local-sale-report.test.ts` › `embeds the brand fonts` (subsets `Outfit-*` y `PlusJakartaSans-*`, sin Helvetica); `apps/api/test/reports.test.ts` (fuentes por ruta); en el chunk, `Record<ReportFontFile['file'], string>` (typecheck) |
| R7 | `local-sale-report.test.ts` › `downloads the sale report as a pdf named after today in the settings time zone`, `renders the local data with the report options` |
| R8 | `apps/api/test/reports.test.ts` › `matches the cross-mode sale report` y `local-sale-report.test.ts` › `matches the cross-mode sale report` (mismo `cross-report.txt`; la web pasa sin `-u` y falla si el fichero cambia, comprobado a mano) |
| R9 | `local-sale-report.test.ts` › `appends the invoices of included records only`; `annexes.test.ts` › `never reads attachments of excluded records or without includeInvoices` |
| R10 | `canvas-images.test.ts` › `recodes jpeg annex images as jpeg within 2000 px`, `recodes other annex images as png`, `never enlarges small annex images`, `decodes annex images with the EXIF orientation` |
| R11 | `local-sale-report.test.ts` › `skips invoices over the 25 MB annex budget` (`LOCAL_MAX_ANNEX_MB` = 25); `apps/api/test/reports.test.ts` › `reads REPORT_MAX_ANNEX_MB` (sigue en 100) |
| R12 | `local-sale-report.test.ts` › `rejects with a 404 for a missing vehicle` |
| R13 | `local-sale-report.test.ts` › `rejects with a 500 when the pdf module fails` (fallo de carga y de render) |
| R14 | `native-only.test.ts` › `the web imports the sale report pdf module only through import()` |
| R15 | `native-only.test.ts` › `sends the local sale report pdf chunk to assets/native/`; T13 (build) |
| R16 | `local-mode.test.tsx` › `vehicle page shows the photo picker and the sale report`, `sale report dialog hides the public links` (opciones y «Descargar») |
| R17 | `local-mode.test.tsx` › `sale report dialog hides the public links` (no aparecen ni la sección ni «Crear enlace», y no se llama a `reportShares.list`) |
| R18 | `local-mode.test.tsx` › `downloads the sale report pdf through the share sheet` |
| R19 | `local-mode.test.tsx` › `shows a toast when the local sale report fails` |
| R20 | `apps/web/src/features/reports/sale-report-dialog.test.tsx` (sin cambios, en verde) |
| R21 | `apps/web/src/i18n/locales.test.ts` (en verde; no hay claves nuevas) |
| R22 | T18, más abajo |

## T13 — Build web (`pnpm --filter @ikrive/web build`)

- **Chunk del PDF:** `dist/assets/native/sale-report-pdf-TMHc3uCl.js`, de **1.617,23 kB (617,04 kB gzip)**.
  - No está en el precache: `grep sale-report-pdf dist/sw.js` no encuentra nada y `dist/sw.js` no contiene ninguna entrada `assets/native`.
- **Fuentes `.woff`:** las cuatro están en `dist/assets/*.woff` (~68 KB) y no entran en el precache, porque `globPatterns` solo incluye `woff2`.
- **Fugas de PDF:** ningún chunk fuera de `assets/native/` contiene `PDFDocument`, `registerHyphenationCallback` ni `yoga`.

Comparación con `main` (build en un worktree temporal, ya borrado):

| Chunk | main | rama |
|---|---|---|
| `index-*.js` (inicial) | 382,78 kB / 119,41 gzip | 382,85 kB / 119,47 gzip (+0,07 kB: entradas del mapa de preload de los chunks nuevos) |
| `local-*.js` | 121,97 kB / 34,55 gzip | 125,87 kB / 36,55 gzip (+3,9 kB: `localSaleReport` y `toAnnexImage`) |
| `data-source-*.js` | 108,67 kB | 100,49 kB (los textos del informe pasan a un chunk común `sale-report-*.js` de 5,65 kB) |
| Precache | 89 entradas, 1923,75 KiB | 91 entradas, 1936,34 KiB (+12,6 KiB) |

El precache crece porque rolldown separa en chunks comunes los módulos que la app comparte con el chunk del PDF: `jsx-runtime` (antes `rolldown-runtime`), `tslib.es6` (1,1 kB), `stats` y `sale-report`. A eso se suma el código nuevo del chunk local. Ni react-pdf ni pdf-lib entran en él.

## T18 — Verificación Docker (R22) — **OK**

Se ejecutó sobre la versión final del código, después del último cambio y de `pnpm harness --full` (2026-11-17T12:42Z):

```
$ docker build -f docker/Dockerfile -t ikrive:dev .
  → build_exit=0 (pnpm install --frozen-lockfile OK; vite build con dist/assets/native/sale-report-pdf-*.js; tsup OK)
$ docker run -d --name ikrive-smoke -p 3187:3000 \
    -e AUTH_SECRET=ci-smoke-secret-0123456789abcdefghijklmnop -e BASE_URL=http://127.0.0.1:3187 ikrive:dev
$ node docker/smoke.mjs http://127.0.0.1:3187
  ✓ health
  ✓ sign-up
  ✓ create vehicle
  ✓ spa index
  ✓ upload photo
  ✓ serve photo
  ✓ report pdf
  smoke test passed
$ docker exec ikrive-smoke node dist/job.js reminders
  {"job":"reminders","evaluated":0,"created":0,"failed":0}
$ docker exec ikrive-smoke id -u   → 1000
$ node docker/image-size.mjs ikrive:dev   → ikrive image ikrive:dev: 235.5 MB (< 250 MB)
$ docker run --rm --entrypoint sh ikrive:dev -c '…no bundled packages in node_modules…'   → exit 0
```

El primer intento de smoke falló (`health` no respondía) porque se lanzó el contenedor sin `AUTH_SECRET` ni `BASE_URL`. Con las mismas variables que usa CI (`.github/workflows/ci.yml`), pasa.

## T19 — `pnpm harness --full` — **verde**

```
[OK]    77 features: 72 done, 4 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #68 mobile-local-sale-report (in_progress)
[OK]    Rama actual: feat/mobile-local-sale-report
Checked 516 files in 182ms. No fixes applied.
[OK]    pnpm lint
[OK]    pnpm typecheck
e2e test:             Test Files  2 passed (2)    Tests  6 passed (6)
packages/shared test: Test Files 26 passed (26)   Tests 183 passed (183)
packages/db test:     Test Files  1 passed (1)    Tests  3 passed (3)
apps/web test:        Test Files 92 passed (92)   Tests 620 passed (620)
apps/api test:        Test Files 38 passed (38)   Tests 371 passed (371)
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones del spec

1. **`apps/api/tsup.config.ts` importa `REPORT_FONT_FILES` por ruta relativa** (`../../packages/shared/src/domain/sale-report-fonts`), no de `@ikrive/shared`.
   - tsup carga su config con bundle-require, que deja los paquetes como externos.
   - Node intenta entonces ejecutar `packages/shared/src/index.ts` y falla con `ERR_MODULE_NOT_FOUND` (imports TS sin extensión).
   - El dato sigue viniendo del mismo módulo de shared. `build.test.ts` sí lo importa de `@ikrive/shared`.
2. **`packages/shared/tsconfig.json` añade `"types": ["node"]` y `@types/node` como devDependency.** Sin ellos, `Blob.arrayBuffer()` (de `toBlob()`) no tipa en shared, que no tiene `lib: DOM`. Es la opción que preveía el design en «Riesgos».
3. **Los tests web no usan pdf-lib**, porque no es dependencia de `apps/web` y el design no la añade.
   - Las facturas PDF de `local-sale-report.test.ts` se crean con `textPdf()`, exportada desde `cross-scenario.ts` (subpath solo para tests).
   - El tamaño de las páginas se mide con `unpdf` (`getDocumentProxy`).
4. **Dos ajustes en `local-mode.test.tsx`** (solo en el test):
   - **Fetch de `data:` URLs:** bajo jsdom, yoga (motor de layout de react-pdf) carga su wasm con `fetch('data:…')`, que `mockApi` rechazaría. El mock del chunk responde esas URLs mientras renderiza.
   - **Precarga después del resto:** el `beforeAll` precarga el módulo del PDF tras los demás `import()`. Importado en paralelo con `@/lib/data-source/local`, Vitest no aplicaba el mock al `import()` de `localSaleReport` (reproducido en un test de prueba, ya borrado).
5. **`ImageCanvas.toBlob(type, quality?)`:** `quality` pasa a ser opcional para la codificación PNG.
6. **`apps/api/package.json` no cambia:**
   - La API conserva `@react-pdf/renderer`, `pdf-lib` y `react`. `build.test.ts` › `pins pdfkit…` resuelve `@react-pdf/renderer` desde la API, y los tests de la API usan pdf-lib.
   - pnpm resuelve una sola copia (`@react-pdf+renderer@4.9.0_react@19.3.0`, `react@19.3.0`), compartida con shared.
7. **Tamaños (design C):** el design decía que «el bundle web inicial y el chunk local no cambian de tamaño». El inicial cambia +0,07 kB y el local, +3,9 kB por el código nuevo. React-pdf y pdf-lib no entran en ninguno de los dos. Detalle en T13.
8. **`apps/api/src/lib/images.ts`** mantiene su propia interfaz `AnnexImage` (`data: Buffer`), que es compatible con la compartida. No se ha tocado.
9. **Capturas (docs/verification.md, nivel 5):** no se han hecho.
   - El diálogo en modo local solo existe dentro de la app nativa (SQLite de `@capacitor-community/sqlite`), así que `pnpm dev` no puede renderizarlo.
   - En modo servidor el diálogo no cambia.
   - El comportamiento visible se cubre con los tests de jsdom de `local-mode.test.tsx`.

## Checklist manual en el dispositivo (APK de depuración, antes de Gate 2)

> Añadida por el leader tras la revisión: ningún test ejecuta el PDF en un WebView Android real.

**Preparación**

- APK de depuración: el artefacto `ikrive-debug-apk` del CI, o en local `pnpm --filter @ikrive/mobile exec cap sync android && cd apps/mobile/android && ./gradlew assembleDebug`.
- La app en modo **En este teléfono**.
- Un vehículo con varias lecturas de km y 3–4 mantenimientos con precio, uno de ellos con «Incluir en el informe» desactivado.
- En los mantenimientos incluidos, estas facturas: un PDF de varias páginas, una foto vertical hecha con la cámara (con orientación EXIF), una captura PNG apaisada, y una factura en el mantenimiento excluido.

**Pasos**

1. **El botón aparece.** En la ficha del vehículo se ve «Informe de venta» y el diálogo muestra las opciones de privacidad y «Descargar». No aparece la sección «Compartir con un enlace».
2. **Descarga básica.** Sin facturas y con las opciones por defecto, pulsa «Descargar». Se ve «Generando…» y se abre la hoja de compartir de Android con `ikrive-<vehículo>-<hoy>.pdf`. Guárdalo o ábrelo con un visor.
3. **Contenido.** En el PDF aparecen la portada, el resumen, la gráfica de km y la tabla de mantenimientos con todo en el idioma y la moneda de Ajustes. El mantenimiento excluido no aparece.
4. **Fuentes.** Los títulos usan Outfit y el texto Plus Jakarta Sans, no una fuente genérica tipo Helvetica. Esto valida que se cargan las `.woff` desde el WebView.
5. **Privacidad.** Con «Ocultar precios», «Ocultar matrícula» y «Ocultar VIN», esos datos no aparecen en el PDF.
6. **Facturas como anexos.** Con «Incluir facturas», al final aparece la lista de anexos (A1, A2…) y luego:
   - todas las páginas del PDF de la factura;
   - la foto en su propia página A4, **derecha** (no girada) y sin deformar;
   - la captura apaisada en una página A4 apaisada.
   La factura del mantenimiento excluido no se anexa.
7. **Factura ilegible.** Con un gestor de archivos o `adb`, borra o corrompe el fichero de una factura (o adjunta un PDF protegido con contraseña). El informe se genera igual y esa factura aparece en la lista con el aviso de ilegible, sin anexarse.
8. **Límite de 25 MB.** Con facturas que sumen más de 25 MB (por ejemplo varios PDF escaneados grandes), las que no caben aparecen con el aviso de límite de tamaño y la app no se cierra. Anota cuánto tarda y si el spinner se congela.
9. **Sin conexión.** En modo avión, repite el paso 2: el informe se genera. Esto valida que el módulo del PDF y las fuentes van dentro de la APK.
10. **Modo servidor intacto.** Cambia a «Mi servidor»: el informe se descarga desde la API como antes y «Compartir con un enlace» vuelve a aparecer.
11. **Visual.** Revisa el diálogo en tema claro y oscuro.
