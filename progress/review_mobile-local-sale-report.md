# Review — #68 mobile-local-sale-report

**Veredicto:** APPROVED

Revisado sobre `feat/mobile-local-sale-report`: `git diff main...HEAD` (solo el spec), `git diff` y los ficheros sin trackear (36 entradas en `git status --porcelain`). He leído el diff completo.

## Trazabilidad requirements ↔ tests

- R1: [x] Hay un único módulo, `packages/shared/src/sale-report-pdf/{document,render,annexes,generate}`. La API (`apps/api/src/modules/reports/service.ts`) y el modo local (`apps/web/src/lib/data-source/local/sale-report.ts`) llaman los dos a `generateSaleReportPdf`. `document.tsx` es idéntico al original salvo los imports (comprobado con `diff` contra `main`). Lo cubren `annexes.test.ts:135-207`, `apps/api/test/reports.test.ts:643` y `local-sale-report.test.ts:317`.
- R2: [x] En `apps/api/test/reports.test.ts` solo cambian el import de `fitImage` y el `describe` nuevo; no se ha tocado ninguna aserción. `report-shares.test.ts` no aparece en el diff y está en verde. Para el punto público, `GET /api/public/reports/:token` pasa por el mismo `generate()`. El smoke de Docker `report pdf` pasa (ver R22).
- R3: [x] `annexes.test.ts:135`: las páginas quedan `[A4, A5, A5, A4, A5]` en el orden de los anexos. `annexes.test.ts:152`: imagen apaisada. `annexes.test.ts:128`: `fitImage` sin deformar ni ampliar. `local-sale-report.test.ts:227`: la imagen se anexa en una página A4 propia.
- R4: [x] `annexes.test.ts:160`: se omiten el fichero ausente, el corrupto, el PDF sin páginas y la imagen que no decodifica, y el anexo final aún cabe en el presupuesto de 1000 bytes. `local-sale-report.test.ts:238`: 3 avisos `unreadable` (fichero ausente, PDF corrupto e imagen) y solo se anexa la factura buena.
- R5: [x] `annexes.test.ts:187`: `reads` = `['a1','a3']` y `size_limit` solo para `a2`. `local-sale-report.test.ts:259`: lo mismo con el presupuesto real de 25 MB.
- R6: [x] `local-sale-report.test.ts:191`: el PDF lleva `/BaseFont /XXXXXX+Outfit-` y `+PlusJakartaSans-`, y no contiene `/Helvetica`. Las fuentes se inyectan con `ReportFontSource`. En el chunk, `Record<ReportFontFile['file'], string>` obliga a declarar todas (lo comprueba el typecheck). La API les pasa rutas con `resolveReportFont`.
- R7: [x] `local-sale-report.test.ts:155`: con la zona de Madrid, un instante del 16 en UTC da `ikrive-seat-ibiza-2026-11-17.pdf`; afirma también el tipo `application/pdf` y la cabecera `%PDF-`. `local-sale-report.test.ts:170`: datos locales, ajustes `en`/USD/mi y opciones de ocultación.
- R8: [x] `apps/api/test/reports.test.ts:643` y `local-sale-report.test.ts:317` hacen `toMatchFileSnapshot` sobre el mismo `packages/shared/src/sale-report-pdf/__snapshots__/cross-report.txt`. El snapshot incluye el anexo «Factura de prueba», el aviso `unreadable`, el `size_limit` y el mantenimiento excluido (no aparece).
- R9: [x] `local-sale-report.test.ts:203`: `reads` = `[invoice.storageKey]` y no aparecen ni el texto ni el nombre de la factura excluida. `annexes.test.ts:207`: `listed` y `reads` están vacíos sin `includeInvoices`.
- R10: [x] `canvas-images.test.ts:96`: JPEG a 2000×1500 con `image/jpeg` 0.85. `canvas-images.test.ts:111`: webp y png pasan a `image/png`. `canvas-images.test.ts:125`: una imagen pequeña no se amplía. `canvas-images.test.ts:133`: decodifica con `imageOrientation: 'from-image'` y rechaza si no decodifica.
- R11: [x] `local-sale-report.test.ts:259` (`LOCAL_MAX_ANNEX_MB * 1024 * 1024 === 25 MB` y comportamiento en el límite) y `apps/api/test/reports.test.ts:549` (el valor por defecto de la API sigue en 100).
- R12: [x] `local-sale-report.test.ts:284`: Problem 404 `Vehicle not found` exacto.
- R13: [x] `local-sale-report.test.ts:293`: Problem 500 `Could not generate the sale report`, tanto si falla la carga del chunk como si falla el render.
- R14: [x] `native-only.test.ts:175`: comprueba el detector con casos sintéticos y recorre todo `src/` sin encontrar infractores. Los únicos imports del módulo fuera del chunk son `import type` (`files.ts`, `canvas-images.ts`, `sale-report.ts`).
- R15: [x] `native-only.test.ts:156`: regla por `facadeModuleId`, con sus casos negativos. Además lo he comprobado sobre la imagen Docker que he construido: `assets/native/sale-report-pdf-TMHc3uCl.js` existe, `public/sw.js` no menciona `assets/native` ni `sale-report-pdf`, y ningún `assets/*.js` contiene `PDFDocument` ni `registerHyphenationCallback`.
- R16: [x] `local-mode.test.tsx:428` (el botón «Informe de venta» aparece en la ficha) y `:458` (el diálogo tiene los checkboxes y «Descargar» habilitado).
- R17: [x] `local-mode.test.tsx:458`: no aparecen «Compartir con un enlace» ni «Crear enlace», y `reportShares.list` no se llama (spy).
- R18: [x] `local-mode.test.tsx:475`: «Generando…» se muestra deshabilitado mientras dura el `gate`; luego `saveFile` recibe `ikrive-seat-ibiza-<hoy>.pdf` y un blob `application/pdf` que empieza por `%PDF-`, y el diálogo se cierra.
- R19: [x] `local-mode.test.tsx:504`: aparece el toast `saleReport.error`, `saveFile` no se llama, el diálogo sigue abierto y «Descargar» vuelve a estar habilitado.
- R20: [x] `sale-report-dialog.test.tsx` no aparece en el diff y está en verde. En modo servidor, `ReportSharesSection` se sigue pintando, porque solo depende de `!isLocalMode()`.
- R21: [x] No hay claves nuevas: el diálogo usa las `saleReport.*` existentes y `locales.test.ts` está en verde.
- R22: [x] La anotación de T18 en `impl_*.md` existe y es OK. Para comprobar que corresponde a la versión actual del código, he reconstruido yo la imagen (`docker build -f docker/Dockerfile -t ikrive:review .` → exit 0, mismo hash de chunk `TMHc3uCl`). Contra ella, `node docker/smoke.mjs` pasa los 7 checks, `report pdf` incluido (SMOKE_EXIT=0), y la imagen ocupa 235.5 MB. Después la he borrado. La imagen `ikrive:dev` del implementer es de las 13:39:30 CET; los únicos ficheros posteriores son tests.

## Tasks

- T1–T19: [x]

## Checkpoints

- C1: [x] `pnpm harness` en verde, con una sola feature activa (#68 `in_progress`) en la rama `feat/mobile-local-sale-report`.
- C2: [x] El spec tiene sus tres ficheros, en EARS. La tabla cubre los 5 criterios de aceptación. Todas las tasks están `[x]` y cada `R<n>` tiene un test que he abierto y leído.
- C3: [x] El diff se ciñe a `design.md`. Las desviaciones están justificadas en `impl_*.md`:
  - el import relativo en `tsup.config.ts`;
  - `@types/node` en shared, que el design ya preveía en «Riesgos»;
  - `toBlob(type, quality?)`.
  
  No hay cambios de otras features.
- C4: [x] La lógica de dominio pura está en `packages/shared`, con tests unitarios. La API mantiene `routes/service/repository` y la propiedad (`requireOwned` → 404) sin cambios. El DataSource local devuelve Problems (404/500) y no hay cambios de BD. En la web, el código queda en `features/reports` y `lib/data-source/local`, y no hay textos nuevos.
- C5: [x] Sin `any`, `@ts-ignore`, `console.log` ni TODOs. `issuedOn` es `YYYY-MM-DD` (`todayIn`). Los kilómetros no se convierten.
- C6: [x] `pnpm harness --full` en verde, ejecutado por mí (shared 183, db 3, web 620, api 371, e2e 6). Los tests usan SQLite en memoria real, tanto en la API como en `createMemorySqlite`. No hay capturas; la excepción está justificada en `impl_*.md` (desviación 9) con el mismo criterio que se aceptó en #65, #66 y #67: el diálogo en local solo existe en la app nativa y en modo servidor no cambia.
- C7: [x] `impl_mobile-local-sale-report.md` está completo (archivos, mapa R→test, T13, T18 y T19). `progress/current.md` está al día. `docs/PLAN.md` actualizado: #68 implementada y fase 8 «En curso».

## Hallazgos

Ninguno bloqueante.

## Avisos para el humano (no bloquean)

1. **Comprobación en el dispositivo antes de Gate 2.** Ningún test ejecuta el chunk real en un WebView Android. Quedan sin cubrir tres cosas:
   - las `.woff` servidas como asset con `?url` y cargadas por react-pdf desde `capacitor://`/`https://localhost`;
   - el wasm de yoga en el WebView;
   - `toBlob('image/png')` y `toBlob('image/jpeg')` del canvas real.
   
   Conviene generar un informe con facturas PDF e imagen en una APK de depuración.
2. **Tamaño del chunk:** 1.617 kB (617 kB gzip). Solo lo descarga el modo local, pero el render ocurre en el hilo principal y el spinner puede congelarse (riesgo aceptado en el design).
3. **Precache y bundle inicial:** el precache crece +12,6 KiB y el chunk inicial +0,07 kB, por los chunks comunes (`jsx-runtime`, `tslib`, `sale-report`). El design decía «no cambian»; la diferencia es menor y está documentada (desviación 7).
4. **`registerReportFonts` es estado global de proceso:** la primera `ReportFontSource` registrada es la que se usa siempre. Hoy no importa porque cada proceso tiene una sola fuente, pero un test que registrara otras fuentes antes que la API las impondría a los demás tests del mismo worker (en `annexes.test.ts` se usa `'Helvetica'`, en un paquete aparte).
5. **`tsup.config.ts` importa `REPORT_FONT_FILES` por ruta relativa** dentro de `packages/shared/src`, no de `@ikrive/shared` como decía el design. El motivo es técnico y real, y el build Docker lo valida.
6. Con más de 25 MB de facturas, el informe en el teléfono omite con `size_limit` algunas que la API (100 MB por defecto) sí anexaría. Es la decisión 3 de la Gate 1.

## Cambios requeridos

Ninguno.
