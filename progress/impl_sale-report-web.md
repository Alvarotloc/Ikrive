# Implementación — sale-report-web (#31)

Rama `feat/sale-report-web`. Solo `apps/web`; sin cambios de BD, API ni `packages/shared`. T1–T15 marcadas.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `apps/web/src/lib/api-client.ts` | `toApiError(response)` extraído de `request`. Nuevo `api.download(path)`: `GET` con `credentials: 'include'`, lanza `ApiError` si no es 2xx y devuelve `{ blob, fileName }` (`fileNameFromContentDisposition`). |
| `apps/web/src/lib/download.ts` (nuevo) | `downloadBlob(fileName, blob)`: `<a download>` + `createObjectURL`, que se revoca en el siguiente tick. |
| `apps/web/src/features/calendar/actions.ts` | `downloadIcs` delega en `downloadBlob`. Mismo comportamiento: `downloads an .ics file` sigue en verde. |
| `apps/web/src/features/reports/sale-report.ts` (nuevo) | `saleReportPath` (solo `=true` de las marcadas, en el orden del esquema), `fileNameFromContentDisposition` (`filename*` UTF-8 → `filename` entre comillas o token → `null`) y `hidesAnything`. |
| `apps/web/src/features/reports/sale-report.test.ts` (nuevo) | Tests unitarios (T4). |
| `apps/web/src/features/reports/queries.ts` (nuevo) | `useDownloadSaleReport(vehicle)` (`useMutation`): `api.download` → `downloadBlob(fileName ?? saleReportFileName(vehicleTitle(vehicle), todayIso()), blob)`. |
| `apps/web/src/features/reports/sale-report-dialog.tsx` (nuevo) | `SaleReportDialog`: botón `outline sm` con `FileText` y un `Dialog` con un formulario interno que Radix desmonta al cerrarse, así que cada apertura empieza desmarcada. Casillas condicionales para matrícula y VIN. Los dos avisos (`TriangleAlert`, `bg-warning/15`) van dentro de un contenedor `aria-live="polite"`. En el pie, Cancelar y Descargar; mientras genera, Descargar muestra `Loader2` y «Generando…» y queda deshabilitado. Si falla, se muestra `toast.error` y el diálogo sigue abierto. Si va bien, el diálogo se cierra. |
| `apps/web/src/features/reports/sale-report-dialog.test.tsx` (nuevo) | Tests de componente (T8–T13). |
| `apps/web/src/routes/_app/vehicles/$vehicleId/index.tsx` | `SaleReportDialog` en la barra superior, agrupado con «Editar» (`flex flex-wrap gap-2`). La barra pasa a `flex-wrap`. Visible en cualquier estado. |
| `apps/web/src/test/render.tsx` | `MockResponse.headers?` y `body` de tipo `Blob`: se envían sus bytes con su `type` como `content-type`, salvo que `headers` diga otro. Documentado en el JSDoc de `mockApi`. Los tests existentes no cambian. |
| `apps/web/src/i18n/locales/{es,en}.json` | Namespace `saleReport.*` con las 13 claves del design. |

## Trazabilidad

Abreviaturas: SRD = `apps/web/src/features/reports/sale-report-dialog.test.tsx` › `SaleReportDialog`; SR = `apps/web/src/features/reports/sale-report.test.ts`.

| R | Test |
|---|---|
| R1 | SRD › opens an accessible dialog with the report options (botón «Informe de venta»). Montaje en la ficha: typecheck y capturas `*-page.png`. El botón no depende de `vehicle.status`. |
| R2 | SRD › opens an accessible dialog with the report options (`dialog` con nombre «Informe de venta») |
| R3 | SRD › opens an accessible dialog with the report options (Tab desde «Descargar» → primera casilla; Mayús+Tab → «Descargar») |
| R4 | SRD › opens an accessible dialog with the report options (Escape cierra, 0 peticiones a `report.pdf`) |
| R5 | SRD › opens an accessible dialog with the report options; SRD › starts unchecked every time it opens |
| R6, R8 | SRD › opens an accessible dialog with the report options (vehículo con matrícula y VIN: las cuatro casillas desmarcadas) |
| R7, R9 | SRD › hides the plate and VIN options when the vehicle has neither |
| R10 | SRD › warns that free text is not redacted; SR › detects any hide option |
| R11 | SRD › warns that invoices are appended as they are; SR › detects any hide option |
| R12 | SRD › requests the report with the checked options and downloads it with the API file name; SR › builds the report path with only the checked options |
| R13 | SRD › requests the report with the checked options… (`download` = `filename*` decodificado, blob = cuerpo); SR › reads the file name from Content-Disposition |
| R14 | SRD › falls back to the shared file name without Content-Disposition; SR › returns null without a file name |
| R15 | SRD › requests the report with the checked options… (el diálogo se cierra); SRD › disables the download button while the report is generating (se cierra al resolverse) |
| R16 | SRD › disables the download button while the report is generating |
| R17 | SRD › shows an error toast and keeps the dialog open when the API fails |
| R18 | `apps/web/src/i18n/locales.test.ts` › es and en define the same keys; los textos en español los afirman los tests de SRD |

## Revisión visual (T14)

Stack aislado; no se tocó el `pnpm dev` del humano. La SPA se compiló con `vite build --outDir` en el scratchpad y la sirvió la API (`WEB_DIST_DIR`) en `127.0.0.1:3419`, con `DATA_DIR` también en el scratchpad. Datos sembrados por API: el vehículo «Señor Clio» (Renault Clio) con matrícula, VIN y precio. Las capturas se hicieron con playwright-core contra `/usr/bin/google-chrome` en `es-ES`. En cada variante se abre el diálogo, se marcan «Ocultar matrícula» e «Incluir facturas» (salen los dos avisos) y se pulsa Descargar. Resultado: el navegador descarga `ikrive-senor-clio-2026-11-01.pdf` (un PDF real de 16 KB, cabecera `%PDF-1.3`) y el diálogo se cierra. La API ya está parada.

Directorio: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/fc0c1db0-e29f-444c-a72b-6e9cb076d71b/scratchpad/shots/`

| Variante | Ficha | Diálogo | Con ambos avisos |
|---|---|---|---|
| Escritorio 1440 claro | `desktop-light-page.png` | `desktop-light-dialog.png` | `desktop-light-warnings.png` |
| Escritorio 1440 oscuro | `desktop-dark-page.png` | `desktop-dark-dialog.png` | `desktop-dark-warnings.png` |
| Móvil 375×800 claro | `mobile-375-light-page.png` | `mobile-375-light-dialog.png` | `mobile-375-light-warnings.png` |
| Móvil 375×800 oscuro | `mobile-375-dark-page.png` | `mobile-375-dark-dialog.png` | `mobile-375-dark-warnings.png` |
| Móvil 375×667 claro | `mobile-375x667-light-page.png` | `mobile-375x667-light-dialog.png` | `mobile-375x667-light-warnings.png` |

- Desbordamiento horizontal (`scrollWidth - clientWidth`) de la página y del diálogo: 0 px en las 5 variantes.
- Retoque tras las capturas: con los dos avisos, el diálogo casi ocupaba los 800 px de alto. A 375×667 se habría cortado. `DialogContent` usa ahora `max-h-[90dvh] overflow-y-auto`, igual que el resto de diálogos largos (`maintenance-form`, `fuel-log-form`, etc.). A 375×667 hace scroll y Descargar es alcanzable.
- En móvil, «Informe de venta» y «Editar» bajan a una segunda línea, debajo de «Vehículos» (`flex-wrap`).

## Verificación

`pnpm harness --full` (exit 0):

```
[OK]    33 features: 30 done, 2 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #31 sale-report-web (in_progress)
[OK]    Rama actual: feat/sale-report-web
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared  Tests 98 passed
apps/web         Tests 277 passed
apps/api         Test Files 25 passed · Tests 215 passed
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones del spec

Ninguna funcional. Detalles:

- **`mockApi` con `Blob` (T5):** el `Blob` de jsdom no es el que entiende `Response` de Node (undici), que lo serializaba como `"[object Blob]"`. Por eso se envían sus bytes (`await body.arrayBuffer()`). El comportamiento visible es el del design: el cuerpo se envía tal cual y con su `type`.
- **Dependencia `lib → features`:** `api-client.ts` importa `fileNameFromContentDisposition` de `features/reports/sale-report.ts`, como piden el design y T1. Es la primera vez que `lib/` importa de `features/`. No hay ciclo, porque `sale-report.ts` solo importa tipos de `@ikrive/shared`. El reviewer puede valorar si prefiere moverla a `lib/`.
- **Test extra:** `starts unchecked every time it opens` cubre R5 y la decisión 6 (cerrar y reabrir el diálogo lo deja desmarcado). No lo pedía ninguna task.
- **`max-h-[90dvh] overflow-y-auto`** en `DialogContent`: sale de la revisión visual (ver arriba). Sigue el patrón existente.

## Cambios tras Gate 2 (avisos 1 y 2 de `review_sale-report-web.md`)

- **Aviso 1 (`sale-report-dialog.tsx`):** la región `aria-live="polite"` ya no lleva `empty:hidden`. Siempre está en el árbol de accesibilidad, también vacía. Para que no deje hueco, las casillas y la región van en un mismo hijo del grid del formulario y la región usa `not-empty:mt-5` (sustituye al `gap-5` del grid; la separación con avisos es la misma). Se ha comprobado en el CSS del build: `.not-empty\:mt-5:not(:empty){margin-top:…*5}`. No se han repetido las capturas porque el espaciado visible no cambia.
- **Aviso 2 (`queries.ts` + diálogo):** `useDownloadSaleReport(vehicle, { onError })` pasa `onError` al `useMutation`. Así se ejecuta aunque el formulario se haya desmontado. El diálogo le pasa el `toast.error`. `mutate()` solo conserva `onSuccess` (cierra el diálogo tras la descarga, si sigue montado). Con el diálogo abierto, el comportamiento ante un error no cambia: sigue abierto y conserva las casillas.
- **Tests (`sale-report-dialog.test.tsx`):**
  - `warns that free text is not redacted`: ahora comprueba que la región `aria-live` existe vacía y visible antes de cualquier aviso, y que los avisos aparecen dentro de esa misma región.
  - Nuevo `shows the error toast even if the dialog was closed while generating`: retiene la respuesta, cierra con Cancelar, responde 500 y espera el toast. Falla si se quita el `onError` del `useMutation`.
- `pnpm harness --full`: en verde (shared 98, web 277, api 215).
