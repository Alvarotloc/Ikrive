# Design — mobile-local-sale-report

Cuatro bloques:

- **A.** La maquetación, el render, los anexos y el bucle de omisión salen de `apps/api/src/modules/reports/pdf/` a un entry point aparte, `@ikrive/shared/sale-report-pdf`. La API pasa a usarlo sin cambiar su comportamiento.
- **B.** `saleReport.download` del DataSource local carga ese módulo con `import()` y genera el PDF en el teléfono.
- **C.** El chunk del PDF va a `assets/native/`.
- **D.** El diálogo vuelve a la ficha en modo local, sin «Compartir con un enlace».

No hay cambios de BD ni de contrato HTTP.

## A. Módulo PDF compartido

| Archivo | Cambio |
|---|---|
| `packages/shared/src/domain/sale-report-fonts.ts` (nuevo) | `REPORT_FONT_FILES`, `ReportFontFile`, `ReportFontFamily` y `REPORT_FONTS`, movidos de `pdf/font-files.ts` y `pdf/fonts.ts`. Son datos puros y se exportan desde `src/index.ts`, así `tsup.config.ts` y la web los leen sin cargar react-pdf. |
| `packages/shared/src/sale-report-pdf/document.tsx` (nuevo) | `SaleReportDocument`, movido tal cual de `pdf/sale-report-document.tsx`. |
| `packages/shared/src/sale-report-pdf/render.tsx` (nuevo) | `registerReportFonts(fonts)` (una sola vez; `Font` es estado global; sin guionado) y `renderSaleReportPdf(report, fonts)` con `pdf(<SaleReportDocument/>).toBlob()`. Esa API existe en el build de Node y en el de navegador de react-pdf, y sustituye a `renderToBuffer`. |
| `packages/shared/src/sale-report-pdf/annexes.ts` (nuevo) | `LoadedAnnex`, `AnnexImage`, `loadAnnex(bytes, mimeType, toAnnexImage)`, `fitImage` y `appendAnnexes(pdf, annexes)`, movidos de `pdf/annexes.ts` con `Uint8Array` en lugar de `Buffer` y sin `storage`. |
| `packages/shared/src/sale-report-pdf/generate.ts` (nuevo) | `generateSaleReportPdf`: el bucle de presupuesto y omisión de `reports/service.ts`, más `buildSaleReport`, el render y los anexos. |
| `packages/shared/src/sale-report-pdf/index.ts` (nuevo) | Reexporta lo anterior. **No** se reexporta desde `src/index.ts`. |
| `packages/shared/src/sale-report-pdf/cross-scenario.ts` (nuevo, solo tests) | Escenario del test cruzado (R8). Subpath `./sale-report-pdf/cross-scenario`. |
| `packages/shared/package.json` | `exports["./sale-report-pdf"]` y `["./sale-report-pdf/cross-scenario"]`; dependencias `@react-pdf/renderer` `^4.9.0`, `pdf-lib` `^1.17.1` y `react` `^19.3.0` (las mismas versiones que la API); `@types/react` en devDependencies. |
| `packages/shared/tsconfig.json` | `"jsx": "react-jsx"`. |
| `apps/api/src/modules/reports/service.ts` | `generate()` carga vehículo, ajustes, mantenimientos y lecturas como hoy y delega en `generateSaleReportPdf`: `readAnnex` = `buffer(storage.read(key))`, `toAnnexImage` = el de `lib/images.ts` (`sharp`), `onAnnexSkipped` = los mismos `log.warn`. Devuelve `Buffer.from(pdf)`. |
| `apps/api/src/modules/reports/pdf/` | Se borran `annexes.ts`, `render.tsx`, `sale-report-document.tsx` y `font-files.ts`. `fonts.ts` conserva solo `resolveReportFont`, que solo funciona en Node. |
| `apps/api/tsup.config.ts` | `REPORT_FONT_FILES` se importa de `@ikrive/shared`. |
| `apps/api/test/reports.test.ts` | `fitImage` se importa de `@ikrive/shared/sale-report-pdf`; el resto, sin cambios. Nuevo test cruzado (R8). |

```ts
// @ikrive/shared/sale-report-pdf
export type ReportFontSource = (font: ReportFontFile) => string; // ruta (Node), URL o data URL
export type AnnexImageNormalizer = (data: Uint8Array, mimeType: string) => Promise<AnnexImage>;
export interface AnnexImage { data: Uint8Array; format: 'jpeg' | 'png'; width: number; height: number }
export interface SaleReportAnnexFile { id: string; name: string; mimeType: string; size: number; storageKey: string }

export interface SaleReportPdfInput extends Omit<SaleReportInput, 'maintenance'> {
  /** En orden de creación (el de la tabla del informe). */
  maintenance: readonly (Omit<SaleReportMaintenance, 'attachments'> & { id: string })[];
}
export interface SaleReportPdfDeps {
  fonts: ReportFontSource;
  maxAnnexBytes: number;
  /** Solo se llama para los mantenimientos incluidos y con `includeInvoices`. */
  attachmentsOf(recordId: string): readonly SaleReportAnnexFile[];
  readAnnex(file: SaleReportAnnexFile): Promise<Uint8Array>;
  toAnnexImage: AnnexImageNormalizer;
  onAnnexSkipped?(file: SaleReportAnnexFile, reason: SaleReportAnnexSkip, error?: unknown): void;
}
export function generateSaleReportPdf(
  input: SaleReportPdfInput,
  deps: SaleReportPdfDeps,
): Promise<{ fileName: string; pdf: Uint8Array }>;
```

Reglas de los anexos, iguales que en `service.ts`:

- `size > remaining`: se marca `size_limit` sin leer el fichero.
- Si `readAnnex` o `loadAnnex` lanzan, se marca `unreadable` y no se descuenta del presupuesto.
- Al final se anexa en el orden de `report.annexes.items`.

La API sigue mandando a react-pdf rutas de disco (`resolveReportFont`) y su `toAnnexImage` con `sharp` no cambia.

## B. DataSource local

| Archivo | Cambio |
|---|---|
| `apps/web/src/lib/data-source/local/sale-report.ts` (nuevo) | `localSaleReport(db, deps, queue)`, `LOCAL_MAX_ANNEX_MB = 25` y los tipos `SaleReportPdfKit` y `LoadSaleReportPdf`. Del módulo compartido solo hace `import type`. |
| `apps/web/src/lib/data-source/local/sale-report-pdf.ts` (nuevo, chunk del PDF) | Reexporta `generateSaleReportPdf` y define `fonts`: las cuatro `.woff` de `@fontsource` importadas con `?url` en un `Record<ReportFontFile['file'], string>`, así `typecheck` falla si falta alguna. |
| `apps/web/src/lib/data-source/local/files.ts` | `LocalImages.toAnnexImage(data, mimeType)`. `LocalDeps.saleReportPdf?: LoadSaleReportPdf`, que por defecto es `() => import('./sale-report-pdf')`. |
| `apps/web/src/lib/data-source/local/canvas-images.ts` | `toAnnexImage`: decodifica con `imageOrientation: 'from-image'`, aplica `fitInside(…, 2000)` y codifica con `toBlob('image/jpeg', 0.85)` si es JPEG o con `'image/png'` en otro caso; devuelve el tamaño del canvas. |
| `apps/web/src/lib/data-source/local/index.ts` | `saleReport: localSaleReport(db, deps, queue)`; `reportShares` sigue en 501. Se actualiza el JSDoc. |
| `apps/web/src/test/fake-images.ts` | `toAnnexImage` devuelve un PNG real de 1×1 (pdf-lib lo embebe) o rechaza `CORRUPT`. |
| `apps/web/src/test/node-sale-report-pdf.ts` (nuevo) | El `SaleReportPdfKit` de los tests: el módulo compartido con las fuentes como **data URL** leídas de `@fontsource`. Las data URL funcionan con el build de Node y con el de navegador de react-pdf. |
| `apps/web/package.json` | Dependencias `@fontsource/outfit` y `@fontsource/plus-jakarta-sans` (las de la API); `unpdf` en devDependencies. |

```ts
export interface SaleReportPdfKit {
  generateSaleReportPdf: typeof import('@ikrive/shared/sale-report-pdf').generateSaleReportPdf;
  fonts: ReportFontSource;
}
export type LoadSaleReportPdf = () => Promise<SaleReportPdfKit>;
```

`download(vehicleId, options)` en local:

1. Dentro de `queue.run` (como `data-export.ts`): `requireVehicle` (404 `Vehicle not found`), ajustes, mantenimientos en el mismo orden que la API (`listByVehicle` invertido), lecturas, y adjuntos de los mantenimientos con `includeInReport` (`entityType = 'maintenance'`, `createdAt` y después `rowid`) agrupados por mantenimiento. Los adjuntos solo se cargan con `includeInvoices`.
2. Fuera de la cola:
   - `await deps.saleReportPdf()` y después `generateSaleReportPdf` con `issuedOn: todayIn(settings.timezone)`, `maxAnnexBytes: LOCAL_MAX_ANNEX_MB * 1024 * 1024`, `readAnnex` = `fileBytes(await files.read(storageKey, mimeType))` y `toAnnexImage` = `deps.images.toAnnexImage`.
   - Cualquier `MissingFileError` u otro error de lectura acaba en `unreadable`, como en la API.
3. `{ blob: new Blob([pdf], { type: 'application/pdf' }), fileName }`. Si falla la carga del chunk o el render, se lanza `problem(500, 'Internal Server Error', 'Could not generate the sale report')`. Los 404 se propagan tal cual.

Las opciones llegan tipadas (`SaleReportOptions`) desde el diálogo y no se validan con `saleReportQuerySchema`, que valida las cadenas de la query.

## C. Carga diferida y bundle

- El chunk contiene `local/sale-report-pdf.ts`, el módulo compartido, react-pdf y pdf-lib. Medido con esbuild: unos **1,67 MB minificado y 630 KB gzip**. Las `.woff` (~68 KB) van aparte, como assets.
- El bundle web inicial y el chunk local no cambian de tamaño.
- `apps/web/src/features/pwa/config.ts`:
  - Nuevo `NATIVE_ONLY_ENTRIES = [/\/src\/lib\/data-source\/local\/sale-report-pdf\.ts$/]`.
  - `nativeChunkFileNames({ moduleIds, facadeModuleId })` manda a `assets/native/` cualquier chunk cuyo `facadeModuleId` cumpla esa lista, además de los que ya manda hoy. Así no hace falta listar a mano las ~30 dependencias transitivas de react-pdf.
  - Las dependencias pequeñas que comparte con la app (p. ej. `react`) quedan en chunks comunes.
  - Las `.woff` no entran en el precache porque `globPatterns` solo incluye `woff2`.
- `native-only.test.ts`:
  - Comprueba la regla del `facadeModuleId`.
  - Amplía la guarda de imports estáticos: la web solo llega a `@ikrive/shared/sale-report-pdf`, `@react-pdf/renderer`, `pdf-lib` y `local/sale-report-pdf` con `import()`. La excepción es el propio `local/sale-report-pdf.ts`, igual que ya se excluyen los `lib/native-*.ts`.
- Comprobación manual en `progress/impl_*.md`: con `pnpm --filter @ikrive/web build`, el chunk está en `dist/assets/native/` y no aparece en el precache de `dist/sw.js`.

## D. Web

| Archivo | Cambio |
|---|---|
| `apps/web/src/routes/_app/vehicles/$vehicleId/index.tsx` | `<SaleReportDialog vehicle={vehicle} />` siempre; se quitan el `isLocalMode()` y su comentario. |
| `apps/web/src/features/reports/sale-report-dialog.tsx` | En modo local (`isLocalMode()`) no se pintan el `<hr />` ni `<ReportSharesSection>`, así que tampoco se hace la consulta `reportShares.list`. |

- **Textos:** no hay claves nuevas. El diálogo usa las `saleReport.*` de siempre y el contenido del PDF sale de `SALE_REPORT_TEXTS` (shared), igual que en la API.
- **Estados:** carga y error, los de siempre: «Generando…» con `Loader2` y el toast `saleReport.error`.
- **Descarga en el móvil:** `downloadBlob` abre la hoja de compartir (`native-files.ts`), como el resto de descargas.

## Test cruzado (R8)

- **Escenario:** `cross-scenario.ts` exporta los datos (`now` fijo, ajustes, vehículo, lecturas y mantenimientos, uno excluido), las opciones (`includeInvoices`, `hidePlate`) y `crossScenarioFiles()`. Esta función crea con pdf-lib tres facturas:
  - una PDF con el texto «Factura de prueba», que se anexa;
  - una PDF corrupta (`unreadable`);
  - una tercera cuyo `size` se infla en la BD por encima de 25 MB (`size_limit` con el presupuesto local).
- **API:** `apps/api/test/reports.test.ts` › `matches the cross-mode sale report`. Siembra el escenario por HTTP con `REPORT_MAX_ANNEX_MB=25` (el mismo presupuesto que el local; el valor por defecto de la API sigue en 100) y `vi.setSystemTime(now)`.
- **Web:** `apps/web/src/lib/data-source/local/local-sale-report.test.ts` › `matches the cross-mode sale report`. Siembra el escenario por el DataSource local.
- **Comparación:** las dos extraen el texto con `unpdf` (`mergePages`, espacios de `Intl` normalizados) y hacen `toMatchFileSnapshot('…/packages/shared/src/sale-report-pdf/__snapshots__/cross-report.txt')`. Si una de las dos difiere, falla.
- **Actualización:** el fichero se regenera con `vitest -u`. En CI no se escribe, así que si falta, el test falla.

## Verificación Docker (R22)

Paso obligatorio, no opcional: el bundle de la API cambia (react-pdf y pdf-lib se resuelven desde `packages/shared`). El implementer ejecuta `docker build -f docker/Dockerfile -t ikrive:dev .` y `node docker/smoke.mjs` (que genera un informe de venta PDF) y anota comandos, salida resumida y resultado en `progress/impl_mobile-local-sale-report.md`. El reviewer rechaza la feature si falta esa anotación o si es KO.

## Alternativas descartadas

1. **Duplicar la maquetación en `apps/web`** (copiar `sale-report-document.tsx`): dos layouts que se desincronizan sin que falle ningún test. Descartada.
2. **Separar el render por plataforma** (`renderToBuffer` en la API y `pdf().toBlob()` en la web) **y compartir solo el documento**: dos caminos de render sin ganar nada, porque `toBlob()` funciona en los dos builds.
3. **Leer las fuentes de `public/fonts`:** allí solo hay `.woff2`, que react-pdf no lee. Añadir `.woff` binarias al repo contradice `docs/PLAN.md` (fase 6). Las `?url` de `@fontsource` no meten binarios en el repo.
4. **Listar en `NATIVE_ONLY_MODULES` las dependencias del PDF** (`@react-pdf/*`, `pdfkit`, `fontkit`, `yoga-layout`…): la lista es frágil y un chunk mixto acabaría en `assets/`. La regla por `facadeModuleId` no depende del árbol de dependencias.
5. **Render en un Web Worker:** no congelaría la UI durante el render, pero obliga a pasar fuentes, bytes y el normalizador de imágenes (canvas, que necesita `OffscreenCanvas`) al worker. Queda fuera de alcance.
6. **Test cruzado importando la API desde la web, o la web desde la API:** son fronteras ya descartadas en #66. Se usa un snapshot de fichero compartido.

## Decisiones a validar (Gate 1)

1. **react-pdf, pdf-lib y react pasan a ser dependencias de `packages/shared`**, aislados en el subpath `@ikrive/shared/sale-report-pdf` (mismo patrón que `fflate` en `data-export-zip`). `shared` compila JSX por primera vez.
2. **La API cambia `renderToBuffer` por `pdf().toBlob()`**, que deja los mismos bytes de contenido. Si los tests de la API detectan alguna diferencia, se vuelve a `renderToBuffer` solo en la API y se mantiene compartido todo lo demás.
3. **El presupuesto local es de 25 MB** (`LOCAL_MAX_ANNEX_MB`), menor que los 100 MB por defecto de la API, por la memoria del WebView: pdf-lib tiene a la vez los anexos, el PDF final y su copia en base64 en `downloadBlob`. No se puede configurar en el teléfono. Con más de 25 MB de facturas, el informe local omite con `size_limit` algunas que la API (con su valor por defecto) sí anexaría.
4. **Texto de referencia (snapshot) en `packages/shared`** para el test cruzado, regenerable con `vitest -u`. Hay que regenerarlo cuando cambie el layout.
5. **El chunk del PDF va a `assets/native/` con una regla nueva por punto de entrada** (`NATIVE_ONLY_ENTRIES`), aunque no sea código de Capacitor.
6. **Un fallo de lectura de una factura en local siempre es `unreadable`** (como en la API), también si no es `MissingFileError`. En el export (#66) ese caso aborta; aquí el informe se genera siempre.

## Riesgos

- **Memoria del teléfono:** pdf-lib tiene en memoria los anexos, el PDF final y su copia en base64 en `downloadBlob` (unas 3-4 veces el tamaño de las facturas). El presupuesto local de 25 MB lo acota a ~100 MB de pico; un WebView muy justo aún podría quedarse sin memoria (mismo tipo de riesgo que acepta #66 y que #75 trata para el export).
- **UI congelada** durante el render en el hilo principal (cientos de ms, más con muchas facturas): el spinner puede pararse. Se acepta.
- **Resolución de react-pdf en Vitest:** el proyecto `dom` (jsdom) podría resolver el build de navegador. Las data URL de `node-sale-report-pdf.ts` funcionan en los dos builds.
- **Tipos de `Blob` en shared sin `lib: DOM`:** si `toBlob()` no tipa, se puede usar `@types/node` como devDependency de shared o hacer la conversión en `render.tsx`, sin castings a `any`.
- **Bundle de la API:** react-pdf se resuelve ahora desde `packages/shared`. `pdfkit` sigue en `RUNTIME_EXTERNALS` y en `apps/api/package.json`. Se cubre con la verificación Docker obligatoria (ver «Verificación Docker»).
- **Duplicación de react:** si pnpm resolviera otra copia de `react` para shared, react-pdf fallaría. Se fijan las mismas versiones que la API y la web.

## Fuera de alcance

- Enlaces públicos y «Compartir con un enlace» en modo local (siguen en 501; `docs/PLAN.md`).
- Render en un worker, barra de progreso y escritura del PDF en streaming a disco.
- Hacer configurable el presupuesto de anexos en el teléfono.
