# Design — sale-report-web

Solo `apps/web`. Sin cambios de BD, de API ni de `packages/shared` (se consumen `SaleReportOptions` y `saleReportFileName`).

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| web/lib | `apps/web/src/lib/api-client.ts` | Extraer `toApiError(response)` de `request` y añadir `api.download(path) → Promise<{ blob: Blob; fileName: string \| null }>`, que comparte credenciales y errores (`ApiError`) con el resto. |
| web/lib | `apps/web/src/lib/download.ts` (nuevo) | `downloadBlob(fileName, blob)`: el `<a download>` + `createObjectURL` que hoy vive en `downloadIcs`. |
| web | `apps/web/src/features/calendar/actions.ts` | `downloadIcs` pasa a llamar a `downloadBlob` (mismo comportamiento; su test `downloads an .ics file` sigue en verde). |
| web | `apps/web/src/features/reports/sale-report.ts` (nuevo) | Lógica pura: `saleReportPath`, `fileNameFromContentDisposition`, `hidesAnything`. |
| web | `apps/web/src/features/reports/sale-report.test.ts` (nuevo) | Unitarios de lo anterior. |
| web | `apps/web/src/features/reports/queries.ts` (nuevo) | `useDownloadSaleReport(vehicle)` (`useMutation`). |
| web | `apps/web/src/features/reports/sale-report-dialog.tsx` (nuevo) | `SaleReportDialog` (trigger + diálogo). |
| web | `apps/web/src/features/reports/sale-report-dialog.test.tsx` (nuevo) | Tests de componente. |
| web | `apps/web/src/routes/_app/vehicles/$vehicleId/index.tsx` | Botón en la barra superior, junto a «Editar». |
| web/test | `apps/web/src/test/render.tsx` | `MockResponse` admite `headers?: Record<string, string>` y `body` de tipo `Blob` (se envía tal cual, sin JSON). Compatible con los tests existentes. |
| i18n | `apps/web/src/i18n/locales/{es,en}.json` | Namespace `saleReport.*`. |

## Contrato HTTP consumido (de #29/#30, sin cambios)

`GET /api/vehicles/:id/report.pdf?hidePrices&hidePlate&hideVin&includeInvoices` (booleanos `true`/`false`/`1`/`0`, por defecto `false`).

- 200 `application/pdf`, `content-disposition: attachment; filename="<ascii>"; filename*=UTF-8''<encoded>` (`contentDisposition` de `apps/api/src/lib/http.ts`), nombre `ikrive-<slug>-<YYYY-MM-DD>.pdf`.
- Errores `application/problem+json`: 400 query inválido (no ocurre: la web solo envía `true`), 401, 404, 429 (> 10/min). Superar `REPORT_MAX_ANNEX_MB` **no** es un error: la API responde 200 y avisa dentro del PDF, así que la web no lo trata.

## Tipos y firmas

```ts
// lib/api-client.ts
download: (path: string) => Promise<{ blob: Blob; fileName: string | null }>;

// lib/download.ts
export function downloadBlob(fileName: string, blob: Blob): void;

// features/reports/sale-report.ts
/** `/vehicles/<id>/report.pdf` + `?<flag>=true` solo de las opciones marcadas, en el orden del esquema. */
export function saleReportPath(vehicleId: string, options: SaleReportOptions): string;          // R12
/** `filename*` (RFC 5987, UTF-8) si existe y se puede decodificar; si no, `filename`; si no, null. */
export function fileNameFromContentDisposition(header: string | null): string | null;           // R13, R14
export const hidesAnything = (o: SaleReportOptions) => o.hidePrices || o.hidePlate || o.hideVin; // R10, R11

// features/reports/queries.ts
export function useDownloadSaleReport(vehicle: Pick<Vehicle, 'id' | 'name' | 'make' | 'model'>):
  UseMutationResult<void, unknown, SaleReportOptions>;
```

`useDownloadSaleReport`: `api.download(saleReportPath(...))` → `downloadBlob(fileName ?? saleReportFileName(vehicleTitle(vehicle), todayIso()), blob)`. Sin caché de TanStack Query (mutación, no query: es una acción con efecto y el PDF lleva `no-store`).

## UI

- **Botón (R1):** `Button variant="outline" size="sm"` con icono `FileText` en la barra superior de la ficha, agrupado con «Editar» (`flex gap-2`). Visible para cualquier estado: el caso típico es un vehículo vendido.
- **Diálogo:** `Dialog`/`DialogContent` de `components/ui/dialog.tsx` (Radix: foco atrapado y Escape, R3/R4). `DialogTitle` «Informe de venta» y `DialogDescription` breve. El estado de las casillas vive en un componente dentro de `DialogContent`, que Radix desmonta al cerrar: cada apertura empieza desmarcada (R5).
- **Casillas:** mismo patrón que `includeInReport` en `maintenance-form.tsx` (`<label>` + `<input type="checkbox" className="size-5 accent-primary">`). Orden: Ocultar precios, Ocultar matrícula (si `vehicle.plate`), Ocultar VIN (si `vehicle.vin`), separador, Incluir facturas con una línea de ayuda («Se añaden al final las facturas de los mantenimientos incluidos en el informe»).
- **Avisos (R10, R11):** bloque con icono `TriangleAlert`, fondo suave de aviso y texto `text-sm`, dentro de un contenedor `aria-live="polite"` para que el lector de pantalla los anuncie al aparecer. Primero el de texto libre y debajo el de facturas.
- **Pie:** `DialogClose` «Cancelar» (ghost) y «Descargar» (`type="submit"`, icono `Download`). Pendiente (R16): `disabled` + `Loader2` animado + «Generando…».
- **Error (R17):** `toast.error(t('saleReport.error'))`; el diálogo no se cierra y conserva las casillas.
- Móvil: `DialogFooter` ya apila los botones; la barra superior hace `flex-wrap`. Modo oscuro: solo tokens del tema.

### i18n (`saleReport.*`)

`button`, `title`, `description`, `hidePrices`, `hidePlate`, `hideVin`, `includeInvoices`, `includeInvoicesHint`, `freeTextWarning`, `invoicesWarning`, `download`, `generating`, `error`.

## Tests (estrategia)

- **Unitarios** (`sale-report.test.ts`, Node): rutas con 0, 1 y 4 opciones; `Content-Disposition` con `filename*` y `filename`, solo `filename`, `filename*` mal codificado → `filename`, cabecera nula o sin nombre → `null`.
- **Componente** (`sale-report-dialog.test.tsx`, jsdom): se renderiza `SaleReportDialog` con `<Toaster />` y `mockApi`. La respuesta del PDF usa la ampliación de `mockApi` (`body: new Blob(['%PDF-1.7'], { type: 'application/pdf' })`, `headers: { 'content-disposition': … }`). La descarga se observa como en `add-to-calendar.test.tsx`: `URL.createObjectURL` stubeado y `vi.spyOn(HTMLAnchorElement.prototype, 'click')`. La petición en curso se retiene con un handler que devuelve una promesa sin resolver.

## Alternativas descartadas

- **Navegar a la URL (`<a href download>` o `window.location`) en vez de `fetch` + blob:** descarga sin cargar el PDF en memoria, pero no permite el estado de carga ni detectar un error de la API (el navegador mostraría un JSON problem+json o nada), que exige el acceptance.
- **Mostrar siempre las cuatro casillas y deshabilitar las que no aplican:** el acceptance pide que no aparezcan.
- **Quitar `includeInvoices` automáticamente al ocultar datos:** la decisión de fase 6 es avisar, no impedir.

## Decisiones a validar

1. El botón va en la barra superior junto a «Editar» (no en la tarjeta «Gestionar»), visible en cualquier estado del vehículo.
2. Solo se envían las opciones marcadas (`=true`); las desmarcadas se omiten y la API las toma como `false`.
3. Tras una descarga correcta el diálogo se cierra sin toast de éxito (el navegador ya muestra la descarga).
4. Un único toast de error para cualquier fallo, incluido el 429 del rate limit de #29 («No se ha podido generar el informe. Inténtalo de nuevo en unos segundos.»).
5. Si la cabecera no trae nombre, nombre de respaldo con `saleReportFileName` y la fecha local del navegador.
6. Las casillas vuelven a desmarcarse cada vez que se abre el diálogo (no se recuerdan entre aperturas ni se guardan).

## Riesgos

- **Memoria:** con facturas el PDF puede acercarse a `REPORT_MAX_ANNEX_MB` (100 MB por defecto) y se carga entero como `Blob`. Aceptable para un uso puntual; se libera con `revokeObjectURL`.
- **Tiempo:** la generación con anexos puede tardar segundos; el estado de carga lo cubre. Si el usuario cierra el diálogo con la petición en curso, la descarga se completa igualmente al terminar (no se cancela).
- `mockApi` gana dos capacidades (cabeceras y cuerpo binario): los tests existentes no cambian porque ambas son opcionales.

## Fuera de alcance

Enlaces públicos y su aviso de `BASE_URL` (#32/#33), previsualizar el PDF en la app, recordar las opciones, cancelar una generación en curso, cambios en la API o en el contenido del PDF.
