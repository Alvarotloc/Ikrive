# Design — sale-report-pdf

Dos piezas con una frontera clara:

1. **Modelo** (`packages/shared`, puro): `buildSaleReport(input) → SaleReport`. Filtra `includeInReport`, aplica la privacidad, calcula el resumen y la geometría del gráfico y **devuelve los textos ya traducidos y formateados**. Todo lo que se puede afirmar sobre el contenido se afirma aquí, con tests unitarios.
2. **Render** (`apps/api`): un documento react-pdf «tonto» que pinta un `SaleReport`, y un servicio `generate(ownerId, vehicleId, options) → { fileName, pdf: Buffer }` que carga datos, construye el modelo y renderiza.

Sin cambios de BD.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `packages/shared/src/schemas/reports.ts` (nuevo) | `saleReportQuerySchema`, tipo `SaleReportOptions`. |
| shared | `packages/shared/src/schemas/reports.test.ts` (nuevo) | Tests del query. |
| shared | `packages/shared/src/domain/sale-report.ts` (nuevo) | `SALE_REPORT_TEXTS`, `buildSaleReport`, `saleReportFileName`, formateadores internos. |
| shared | `packages/shared/src/domain/sale-report.test.ts` (nuevo) | Tests unitarios (factoría `input(overrides)` como `calendar.test.ts`). |
| shared | `packages/shared/src/index.ts` | Exportar ambos. |
| api | `apps/api/package.json` | deps `@react-pdf/renderer@^4`, `react@^19.3.0` (misma versión que la web), `@fontsource/outfit@^5`, `@fontsource/plus-jakarta-sans@^5`; dev `@types/react`, `unpdf@^2`. |
| api | `apps/api/tsconfig.json` | `"jsx": "react-jsx"` (sin lib DOM). |
| api | `apps/api/src/lib/http.ts` (nuevo) | `contentDisposition` movido desde `modules/attachments/routes.ts` (que lo importa de aquí; sin cambio de comportamiento). |
| api | `apps/api/src/modules/reports/pdf/fonts.ts` (nuevo) | `registerReportFonts()` idempotente: `createRequire(import.meta.url).resolve('@fontsource/<familia>/files/<familia>-latin-<peso>-normal.woff')` → `Font.register`. Outfit 600/700, Plus Jakarta Sans 400/600. Desactiva la partición silábica (`Font.registerHyphenationCallback(w => [w])`). |
| api | `apps/api/src/modules/reports/pdf/sale-report-document.tsx` (nuevo) | `<SaleReportDocument report={…} />`: `Document`/`Page` A4, portada, resumen, gráfico (`Svg`, `Polyline`, `Line`), tabla, pie con nº de página. |
| api | `apps/api/src/modules/reports/pdf/render.tsx` (nuevo) | `renderSaleReportPdf(report: SaleReport): Promise<Buffer>` (`renderToBuffer`). |
| api | `apps/api/src/modules/reports/service.ts` (nuevo) | `createReportsService({ vehicles, maintenance, settings })`. |
| api | `apps/api/src/modules/reports/routes.ts` (nuevo) | `GET /vehicles/:id/report.pdf`. |
| api | `apps/api/src/app.ts` | Crear `reportsService` y registrar `reportsRoutes`. |
| test | `apps/api/test/reports.test.ts` (nuevo) | Integración (helper local `pdfText(buffer)` con `unpdf`). |

Sin `repository.ts`: reutiliza `vehiclesRepo.findOwned`/`listReadings`, `maintenanceRepo.listByVehicle` y `settingsService.get`.

## Modelo (`domain/sale-report.ts`)

```ts
export interface SaleReportInput {
  vehicle: Pick<Vehicle, 'name' | 'make' | 'model' | 'version' | 'year' | 'fuelType' | 'plate' | 'vin'>;
  readings: readonly OdometerPoint[];
  /** Todos los del vehículo, en orden de creación; la función filtra `includeInReport`. */
  maintenance: readonly { date: string; odometer: number | null; category: MaintenanceCategory;
                          title: string; cost: number | null; includeInReport: boolean }[];
  settings: Pick<UserSettings, 'locale' | 'currency' | 'distanceUnit'>;
  options: SaleReportOptions;
  /** `YYYY-MM-DD`; la decide quien llama (la API: hoy en la zona del propietario). */
  issuedOn: string;
}

export interface SaleReport {
  locale: Locale;
  fileName: string;
  cover: { eyebrow: string; title: string /* nombre visible */; issued: string;
           rows: { label: string; value: string }[] };           // R1, R13, R14
  summary: { title: string; rows: { label: string; value: string }[] };   // R2–R5, R12
  chart: { title: string; empty: string | null;                   // R10: texto si no hay gráfico
           points: { x: number; y: number }[];                    // R9, [0,1]
           xLabels: [string, string] | null; yLabels: [string, string] | null };
  maintenance: { title: string; empty: string | null;             // R11
                 columns: { key: SaleReportColumn; label: string }[]; // sin 'cost' con hidePrices
                 rows: Record<SaleReportColumn, string>[] };      // R6–R8 (sin 'cost' con hidePrices)
  footer: string;                                                 // «Ikrive · informe de venta» sin adornos
}
type SaleReportColumn = 'date' | 'odometer' | 'category' | 'title' | 'cost';

export const SALE_REPORT_TEXTS: Record<Locale, SaleReportTexts>;  // incluye Record<MaintenanceCategory,…> y Record<FuelType,…>
export function buildSaleReport(input: SaleReportInput): SaleReport;
export function saleReportFileName(displayName: string, issuedOn: string): string; // R17
```

- **Textos ya resueltos:** el documento no traduce ni formatea; así los tests de privacidad del modelo (`JSON.stringify(report)` no contiene la matrícula / el VIN / ningún importe) son suficientes y el render no puede filtrar datos que el modelo ya quitó.
- **Diccionario (R15):** `Record<Locale, …>` como `CALENDAR_EVENT_TEXTS`; categorías y combustibles con `Record<MaintenanceCategory|FuelType, string>`, copiados de `apps/web/src/i18n/locales/{es,en}.json`. Una traducción que falte rompe el typecheck.
- **Formato (R16):** formateadores internos con `Intl` iguales a `useFormat()` de la web (número `maximumFractionDigits: 0`, moneda `style: 'currency'`, fecha `dateStyle: 'medium'` sobre `${iso}T00:00:00Z` con `timeZone: 'UTC'`, distancia `${n} ${unit}`). No se extrae un formateador común con la web (fuera de alcance).
- **Resumen (R2–R5):** km actuales y media anual sobre **todas** las lecturas (también las que vienen de mantenimientos excluidos: el odómetro es un hecho del coche). Nº y gasto sobre los **incluidos**; gasto con `roundMoney`. No se usa `computeVehicleStats`: cuenta todos los mantenimientos y aquí solo valen los incluidos.
- **Gráfico (R9, R10):** lecturas agrupadas por día (máximo valor) y ordenadas; `x = (t − t0)/(tN − t0)` en días UTC, `y = (v − min)/(max − min)` (si `max = min`, `y = 0.5`). Con < 2 días distintos: `points: []`, etiquetas `null` y `empty` con el texto. Es una línea del odómetro acumulado, no barras por mes. El documento convierte `[0,1]` a coordenadas del `Svg` (con `y` invertida) y dibuja `Polyline` + ejes con `Line`; las etiquetas son `Text` fuera del `Svg`.
- **Tabla (R6–R8):** `filter(includeInReport)` + `sort` estable por `date` asc (la entrada llega en orden de creación). `hidePrices` quita la columna `cost` y la clave `cost` de cada fila.
- **Portada (R1, R13, R14):** filas en este orden, omitiendo `null`: Marca y modelo (`make model version`), Año, Combustible, Matrícula, VIN, Fecha de emisión. Nombre visible `name ?? \`${make} ${model}\``.
- **Nombre de fichero (R17):** `normalize('NFD')` + quitar diacríticos, minúsculas, `[^a-z0-9]+ → '-'`, recortar guiones, máx. 60 caracteres. «Seat León FR» → `ikrive-seat-leon-fr-2026-11-01.pdf`.

## Query (`schemas/reports.ts`)

```ts
const flag = z.stringbool({ truthy: ['true', '1'], falsy: ['false', '0'] }).default(false);
export const saleReportQuerySchema = z.object({ hidePrices: flag, hidePlate: flag, hideVin: flag });
export type SaleReportOptions = z.output<typeof saleReportQuerySchema>;
```

`z.coerce.boolean()` se descarta (`"false"` → `true`). `z.stringbool` es case-insensitive; cualquier otro valor (`yes`, `2`, repetido) → 400 (R19). #30 añadirá `includeInvoices` aquí y #32 guardará un `SaleReportOptions`.

## Contrato HTTP

| Método y ruta | Éxito | Errores |
|---|---|---|
| `GET /api/vehicles/:id/report.pdf?hidePrices&hidePlate&hideVin` | 200 `application/pdf` | 400 query inválido · 401 sin sesión · 404 `Vehicle not found` (inexistente o ajeno) · 429 (> 10/min) |

- `preHandler: app.authenticate`; `schema: { params: idParamSchema, querystring: saleReportQuerySchema }`; `config: { rateLimit: { max: 10, timeWindow: '1 minute' } }` (sobrescribe el global de 300 solo en esta ruta).
- Cabeceras: `content-type: application/pdf`, `content-disposition: contentDisposition(fileName, 'attachment')`, `cache-control: private, no-store` (datos personales generados al vuelo), `x-content-type-options: nosniff`.
- El punto de `report.pdf` va en un segmento estático; find-my-way lo resuelve (lo prueba el test 200).

## Servicio (frontera para #30 y #32)

```ts
export function createReportsService(deps: { vehicles: VehiclesRepository; maintenance: MaintenanceRepository; settings: SettingsService }) {
  return {
    /** Lanza NotFoundError antes de renderizar si el vehículo no es de `ownerId`. */
    async generate(ownerId: string, vehicleId: string, options: SaleReportOptions): Promise<{ fileName: string; pdf: Buffer }>;
  };
}
```

- `generate` = `findOwned` → `settings.get(ownerId)` → `issuedOn = todayIn(settings.timezone)` → `buildSaleReport` (mantenimientos con `listByVehicle(...).reverse()` para orden de creación, como `stats`) → `renderSaleReportPdf`.
- **#30** añadirá deps (`attachments`, `storage`) y anexará con pdf-lib sobre el `Buffer` dentro de `generate`. **#32** llamará a `generate(share.ownerId, share.vehicleId, share.options)` desde la ruta pública. Ninguna de las dos toca el modelo ni el documento.

## Fuentes y Docker

- `@fontsource/*` van en `dependencies` (no dev): `pnpm deploy --prod` las copia a `/app/node_modules`, y `createRequire(import.meta.url).resolve` funciona igual desde `src/` (tsx, vitest) y desde `dist/` (bundle). Sin binarios en el repo.
- Subconjunto `latin` (cubre á, ñ, €, espacios finos de `Intl`).
- `@react-pdf/renderer` v4 es ESM y queda externo en tsup; `yoga-layout` es wasm (sin build nativo).

## Tests

- Texto del PDF: devDep **`unpdf`** (`extractText(new Uint8Array(buf), { mergePages: true })`): ESM, sin worker ni configuración. La misma librería da el nº de páginas (`getDocumentProxy`) que necesitará #30. Los streams de react-pdf van comprimidos: no se busca en el buffer crudo, salvo los nombres de fuente (R24), que van en diccionarios sin comprimir (`/BaseFont /XXXXXX+Outfit-…`, `…+PlusJakartaSans-…`).
- Cada test de privacidad tiene su control positivo: sin la opción, el texto **sí** contiene el VIN / la matrícula.
- En `es`, `Intl` no agrupa números de 4 cifras: los datos de prueba usan ≥ 5 cifras.

## Impacto en UI

Ninguno en la web (es #31). Maquetación del PDF según el mockup y los tokens de `docs/PLAN.md` › Diseño: A4 vertical; cabecera con eyebrow «Informe de venta», título con el nombre del vehículo y fecha de emisión; dos cajas (Vehículo / Resumen) con borde fino `rgba(45,58,58,.1)`; gráfico con línea verde oscuro `#1a3638` sobre fondo menta claro; tabla con cabecera tinta `#2d3a3a`, filas alternas `#f9fafb`, cabecera repetida en cada página (`fixed`) e importes alineados a la derecha; pie con número de página. Sin estrellas, «blockchain», referencia `#IKR-…`, ni «Estado ITV».

## Alternativas descartadas

- **Gráfico con `distanceByMonth` (barras de km por mes):** responde a «cuánto se usa», no al histórico del odómetro, y la interpolación crea barras en meses sin lecturas. La línea de lecturas reales es lo que un comprador puede contrastar.
- **Traducir y formatear dentro del componente react-pdf:** dejaría la privacidad y los textos sin tests unitarios en shared y obligaría a probarlo todo extrayendo texto de PDFs.
- **`pdfjs-dist/legacy` para extraer texto:** más pesado y requiere configurar el worker en Node; `unpdf` lo empaqueta listo.
- **TTF en `apps/api/assets/fonts` copiados en `onSuccess`:** binarios en el repo y un paso de build más; `@fontsource` trae `.woff` versionados.
- **Reutilizar `computeVehicleStats` para el resumen:** cuenta los mantenimientos excluidos.

## Decisiones a validar (Gate 1)

1. Nº y gasto de mantenimientos **solo sobre los incluidos**; km actuales, media anual y gráfico sobre **todas** las lecturas.
2. Tabla en orden **ascendente** (del más antiguo al más reciente).
3. La «portada» es la cabecera de la primera página (como el mockup), no una página aparte.
4. Booleanos del query: `true`/`false`/`1`/`0` (sin distinguir mayúsculas); el resto, 400.
5. Rate limit propio: **10 peticiones/minuto por IP** en esta ruta (renderizar es caro: cientos de ms y CPU). El global sigue en 300.
6. Nombre de fichero sin traducir (`ikrive-<slug>-<fecha>.pdf`) y con slug ASCII.
7. Los vehículos vendidos o archivados también generan informe.
8. Portada sin precio ni fecha de compra, notas ni foto (no los pide el acceptance).

## Riesgos

- **Texto libre:** el alias, los títulos de mantenimiento o la versión pueden contener la matrícula o un importe; las opciones de privacidad solo quitan los campos estructurados.
- **Extracción de texto:** depende de los `ToUnicode` que fontkit incrusta; si `unpdf` no recupera el texto, el implementer para y lo reporta (no hay workaround aceptable como desactivar la compresión solo en tests).
- **Tipos de `@react-pdf/renderer` con TypeScript 7 / sin lib DOM:** verificar en T1; si exige DOM, se reporta antes de añadir `lib`.
- **Rendimiento:** render síncrono en CPU en el hilo de Node; aceptable para uso personal con el rate limit.
- **Fuentes globales:** `Font.register` es estado global del módulo; la función es idempotente.

## Fuera de alcance

Facturas anexadas e `includeInvoices` (#30), botón y diálogo web (#31), enlaces públicos (#32/#33), fotos del vehículo, repostajes y consumo en el informe, firma o referencia del documento, caché del PDF, conversión de unidades o moneda.
