# Design — sale-report-invoices

Se respeta la frontera de #29: el **modelo** (`buildSaleReport`, puro) decide referencias, columna, lista y textos; el **render** de react-pdf solo pinta; y el **servicio** carga los adjuntos, decide cuáles se pueden anexar (tope y legibilidad) y fusiona con `pdf-lib` sobre el `Buffer` de react-pdf.

Sin cambios de BD ni de rutas nuevas. Una variable de entorno nueva: `REPORT_MAX_ANNEX_MB`.

## Flujo de `generate` con `includeInvoices=true`

1. `findOwned` → 404 (igual que #29).
2. Mantenimientos incluidos → `attachmentsRepo.listByEntity('maintenance', id)` por cada uno (orden de subida). Los excluidos **no se consultan** (R12). Se recorren en el orden de referencias (mantenimientos en el orden de la tabla de #29, adjuntos en orden de subida) con `remaining = maxAnnexBytes`.
3. **Tope** (R18, R19), antes de tocar el fichero: si `row.size > remaining` → `skipped = 'size_limit'` + `log.warn({ vehicleId, attachmentId }, 'Sale report: attachment skipped, report annex size limit reached')` y se pasa al siguiente (uno posterior más pequeño puede caber). `row.size` es la columna `attachments.size`, que guarda los bytes exactos del fichero almacenado (se escribe con `file.data.length` al subir y los ficheros no se modifican), así que no hace falta `stat`.
4. **Pre-carga** del anexo que cabe (`loadAnnex`): lee el fichero (`buffer(storage.read(key))`) y
   - PDF → `PDFDocument.load(bytes)` (sin `ignoreEncryption`: un PDF cifrado lanza `EncryptedPDFError`); 0 páginas = fallo.
   - Imagen → `toAnnexImage` (sharp: `rotate()` EXIF, `resize` ≤ 2000 px `inside` sin ampliar; JPEG→JPEG, PNG/WebP→PNG, porque pdf-lib solo incrusta JPEG/PNG).
   - Cualquier excepción (también `ENOENT`) → `skipped = 'unreadable'` + `log.warn({ vehicleId, attachmentId, err }, 'Sale report: attachment could not be annexed')` (R13, R14).
   - Si carga bien → `remaining -= row.size`. Un anexo ilegible **no consume** presupuesto (no aporta nada al PDF).
5. `buildSaleReport` recibe por mantenimiento `attachments: { id, name, skipped }[]`.
6. `renderSaleReportPdf(report)` como en #29.
7. Si `report.annexes` tiene alguna entrada con `notice === null`: `appendAnnexes(reportPdf, ordered)` → `PDFDocument.load(reportPdf)`, por cada anexo en el orden de `report.annexes.items` (R11): PDF → `copyPages(doc, doc.getPageIndices())` + `addPage`; imagen → `embedJpg`/`embedPng` + página A4 (apaisada si `width > height`) + `drawImage` con `fitImage` (R10). Si no, se devuelve el buffer de react-pdf sin tocar.

Con `includeInvoices=false` el servicio no ejecuta los pasos 2, 3, 4 ni 7 (R16). Superar el tope nunca produce error: siempre 200.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `packages/shared/src/schemas/reports.ts` | `includeInvoices: flag` en `saleReportQuerySchema`. |
| shared | `packages/shared/src/schemas/reports.test.ts` | Ampliar los tres tests existentes con `includeInvoices`. |
| shared | `packages/shared/src/domain/sale-report.ts` | `SaleReportAttachment`, `attachments?` en `SaleReportMaintenance`, columna `annexes`, sección `annexes`, textos nuevos. |
| shared | `packages/shared/src/domain/sale-report.test.ts` | Tests de anexos (T3). |
| api | `apps/api/package.json` | dep `pdf-lib@^1.17.1`. |
| api | `apps/api/src/config.ts` | `REPORT_MAX_ANNEX_MB: z.coerce.number().int().positive().default(100)`. |
| api | `apps/api/src/lib/images.ts` | `toAnnexImage(input): Promise<{ data: Buffer; format: 'jpeg' \| 'png'; width: number; height: number }>`. |
| api | `apps/api/src/modules/reports/pdf/annexes.ts` (nuevo) | `loadAnnex`, `fitImage`, `appendAnnexes`, tipo `LoadedAnnex`. |
| api | `apps/api/src/modules/reports/pdf/sale-report-document.tsx` | Pintar la columna `annexes` (genérico: ya itera `columns`) y la lista de anexos tras la tabla, con el aviso de fallo resaltado. |
| api | `apps/api/src/modules/reports/service.ts` | Deps `attachments: AttachmentsRepository`, `storage: FileStorage`, `maxAnnexBytes: number`; `generate(ownerId, vehicleId, options, log)`. |
| api | `apps/api/src/modules/reports/routes.ts` | Pasar `request.log`. |
| api | `apps/api/src/app.ts` | Inyectar `attachmentsRepo`, `storage` y `maxAnnexBytes: config.REPORT_MAX_ANNEX_MB * 1024 * 1024` en `createReportsService`. |
| test | `apps/api/test/reports.test.ts` | Tests de anexado y tope (T8–T10, T13). |
| docs | `README.md` (tabla «Configuración»), `.env.example` | Documentar `REPORT_MAX_ANNEX_MB`. |

## Tipos (`domain/sale-report.ts`)

```ts
export interface SaleReportAttachment {
  id: string;
  /** Nombre original del fichero. */
  name: string;
  /** Motivo por el que no se anexó; null si se anexó. */
  skipped: SaleReportAnnexSkip | null;
}
export type SaleReportAnnexSkip = 'unreadable' | 'size_limit';
export interface SaleReportMaintenance { /* …#29… */ attachments?: readonly SaleReportAttachment[] } // por defecto []

export type SaleReportColumn = 'date' | 'odometer' | 'category' | 'title' | 'cost' | 'annexes';

export interface SaleReport {
  // …#29…
  /** null sin `includeInvoices` o sin anexos (R7). */
  annexes: {
    title: string;
    items: { id: string; ref: string; label: string; notice: string | null }[];
  } | null;
}
```

- `label` = `«A1 · 15 jun 2025 · Cambio de aceite · factura.pdf»` montado con los formateadores de #29; `notice` = texto del diccionario según `skipped` (`unreadable` → «No se pudo anexar este archivo.»; `size_limit` → «No se anexó: se superó el tamaño máximo del informe.» / «Not attached: the report's maximum size was exceeded.») o `null`.
- La columna `annexes` va la última (después de `cost` si existe). Las referencias se asignan sobre `included` ya ordenado, por lo que R3 y R6 salen del mismo filtro que la tabla.
- Los anexos omitidos (por cualquier motivo) **conservan** su referencia (la tabla los sigue citando y la lista explica que faltan).
- Textos nuevos en `SaleReportTexts`: `maintenance.columns.annexes` («Anexos»/«Annexes»), `annexes.title` («Facturas anexadas»/«Attached invoices»), `annexes.skipped.unreadable`, `annexes.skipped.sizeLimit`.

## Firmas (`apps/api`)

```ts
// pdf/annexes.ts
export type LoadedAnnex =
  | { kind: 'pdf'; doc: PDFDocument }
  | { kind: 'image'; format: 'jpeg' | 'png'; data: Buffer; width: number; height: number };
export async function loadAnnex(row: AttachmentRow, storage: FileStorage): Promise<LoadedAnnex>; // lanza si no se puede
/** Caja centrada de la imagen dentro de `box` (márgenes ya descontados), sin deformar ni ampliar. */
export function fitImage(image: { width: number; height: number }, box: { width: number; height: number }):
  { x: number; y: number; width: number; height: number };
export async function appendAnnexes(reportPdf: Buffer, annexes: readonly LoadedAnnex[]): Promise<Buffer>;

// service.ts
generate(ownerId: string, vehicleId: string, options: SaleReportOptions, log: FastifyBaseLogger)
  : Promise<{ fileName: string; pdf: Buffer }>;
```

Página de imagen: A4 (595.28 × 841.89 pt, invertida si la imagen es apaisada), margen 36 pt. #32 llamará a `generate` con su propio `request.log`.

## Contrato HTTP

| Método y ruta | Éxito | Errores |
|---|---|---|
| `GET /api/vehicles/:id/report.pdf?…&includeInvoices` | 200 `application/pdf` | 400 query inválido (incluido `includeInvoices=yes`) · 401 · 404 · 429 (sin cambios) |

Un anexo ilegible o que no cabe en el tope nunca produce 4xx/5xx: es un 200 con aviso (R13, R19). Cabeceras y rate limit, como #29.

## Tests

- **Fixtures** generados en el test con `pdf-lib` (sin binarios en el repo): PDFs con tamaños de página distintos (p. ej. 300×400 dos páginas, 500×500 una) para comprobar el orden leyendo `getPage(i).getSize()`; PNG/WebP con `sharp({ create })`, uno apaisado.
- **Cifrado:** un PDF de pdf-lib guardado con `useObjectStreams: false` al que se añade `/Encrypt << /Filter /Standard >>` en el `trailer` (pdf-lib lo detecta y lanza `EncryptedPDFError`). **Corrupto:** `%PDF-1.7` + basura (pasa la detección de tipo de la subida, que solo mira la firma).
- **Nº de páginas** con `PDFDocument.load(res.rawPayload).getPageCount()`. Referencia = el mismo informe pedido con `includeInvoices=false` (la lista de anexos cabe en la última página con los datos de prueba).
- **Warning:** `createTestApp({}, { logStream })` como `logging.test.ts`, buscando una línea con `level: 40` y el `attachmentId`.
- **Tope:** `createTestApp({ REPORT_MAX_ANNEX_MB: '1' }, { logStream })`. Anexo «grande» = `%PDF-1.7` + ~1,1 MB de ceros (pasa la subida); como sería ilegible si se leyera, que su aviso sea el de tope (y no el de ilegible) demuestra que el tamaño se evalúa antes de cargarlo.

## Impacto en UI

Ninguno en la web (es #31, que además avisará si se combina `includeInvoices` con las opciones de ocultar). En el PDF: columna «Anexos» estrecha al final de la tabla y lista «Facturas anexadas» tras ella, con el aviso de fallo en el color de error de la marca.

## Alternativas descartadas

- **Página separadora por anexo** (generada con pdf-lib): rompe la cuenta de páginas del acceptance y obliga a incrustar Outfit/Plus Jakarta con `@pdf-lib/fontkit` para escribir títulos con acentos.
- **Incrustar las imágenes con `<Image>` de react-pdf dentro del documento:** los anexos deben mezclar PDFs e imágenes en el orden de la tabla, y los PDFs solo se pueden añadir después del render; las imágenes quedarían todas antes.
- **Estampar la referencia en cada página anexada:** modifica las facturas («se anexan tal cual») y puede tapar su contenido.
- **`ignoreEncryption: true`:** pdf-lib copiaría páginas con contenido ilegible; mejor omitir y avisar.
- **Parar al primer anexo que no cabe:** más simple, pero dejaría fuera facturas pequeñas posteriores que sí caben.
- **Medir con `fs.stat` o con el PDF final:** `stat` añade E/S y duplica `attachments.size`; medir el resultado obliga a cargar y procesar el anexo antes de decidir, justo lo que el tope quiere evitar.
- **Responder 413/422 al superar el tope:** el humano pidió servir siempre el informe.

## Decisiones a validar (Gate 1)

1. La referencia al mantenimiento va **en la tabla** (columna «Anexos») y en una **lista** tras ella; no hay páginas separadoras.
2. La lista muestra el **nombre original** del fichero (puede contener datos personales; es lo que subió el propio usuario).
3. Se omite con aviso cualquier anexo ilegible, no solo PDFs corruptos o cifrados: también PDFs sin páginas, imágenes que no decodifican y ficheros que faltan en disco.
4. Las imágenes no se amplían; la página es apaisada si la imagen lo es. Se reescalan a ≤ 2000 px y se reencodifican (JPEG→JPEG, PNG/WebP→PNG) aplicando la orientación EXIF.
5. `includeInvoices=true` combinado con `hidePrices`/`hidePlate`/`hideVin` se acepta sin error; avisar es cosa de la web (#31).
6. El pie «n / total» sigue contando solo las páginas del informe.
7. **(Validada en Gate 1)** Tope total por informe `REPORT_MAX_ANNEX_MB` (100 por defecto): se mide el tamaño almacenado antes de cargar, se salta el que no cabe y se sigue con los siguientes; aviso propio y log `warn`; siempre 200. Sin límite de número de anexos.
8. Un anexo que cabe pero resulta ilegible **no descuenta** su tamaño del presupuesto.
9. El tope se aplica a los bytes almacenados, no al PDF resultante: las imágenes se reencodifican y el PDF final puede ser algo mayor o menor que el tope.

## Riesgos

- **Memoria y tiempo:** los anexos se cargan en memoria a la vez, pero acotados por `REPORT_MAX_ANNEX_MB` (bytes almacenados). Las imágenes decodificadas y los objetos de pdf-lib ocupan varias veces más que el fichero, así que un tope alto en una máquina pequeña sigue pudiendo ser costoso; el rate limit de #29 (10/min) limita la concurrencia.
- **Re-guardar el PDF de react-pdf con pdf-lib** podría afectar a fuentes o `ToUnicode`; los tests de texto de #29 (`extractText`) se ejecutan sin la opción, pero T9 comprueba también el texto de un informe con anexos.
- **PDFs raros que pdf-lib carga pero no copia** (`copyPages` lanza): para detectarlo antes de construir el modelo, `loadAnnex` hace ya el `copyPages` a un documento propio y `appendAnnexes` copia desde ahí.
- **Privacidad:** las facturas pueden contener matrícula, VIN e importes aunque se pidan ocultar (decisión de fase 6).

## Fuera de alcance

UI web (#31), enlaces públicos (#32/#33), adjuntos de repostajes u otras entidades, OCR o tachado de facturas, compresión de PDFs, caché del informe.
