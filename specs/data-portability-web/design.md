# Design — data-portability-web

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| web | `apps/web/src/features/data-portability/queries.ts` | **Nuevo.** `EXPORT_URL = '/api/me/export'` y `useImportData()`. |
| web | `apps/web/src/features/data-portability/import.ts` | **Nuevo.** `importErrorKey(error)` (lógica pura) e `IMPORT_ACCEPT = '.zip,application/zip'`. |
| web | `apps/web/src/features/data-portability/data-section.tsx` | **Nuevo.** `DataPortabilitySection`: tarjeta «Tus datos» con exportar, importar, diálogo y resumen. |
| web | `apps/web/src/routes/_app/settings.tsx` | Añade `<DataPortabilitySection />` al final, tras «Apariencia». Sin cambios en el `loader` (la sección no hace queries). |
| web | `apps/web/src/i18n/locales/{es,en}.json` | Namespace nuevo `dataPortability`. |
| tests | `apps/web/src/features/data-portability/import.test.ts`, `data-section.test.tsx` | **Nuevos.** |

Sin cambios en `packages/shared`, la API ni la BD. Reutiliza `DataImportSummary` (`@ikrive/shared`), `api.post` con `FormData` y `ApiError` (`lib/api-client.ts`), `queryKeys`, `Card`, `Button` (`asChild` para el enlace), `AlertDialog*` de `components/ui/dialog.tsx`, `toast` de `sonner` y el patrón de input oculto de `features/maintenance/attachment-picker.tsx`.

## Contrato HTTP consumido

| Petición | Respuesta | UI |
|---|---|---|
| `GET /api/me/export` | 200 `application/zip`, `Content-Disposition: attachment; filename="ikrive-export-YYYY-MM-DD.zip"` (stream) | Descarga nativa del navegador (R1) |
| `POST /api/me/import`, multipart, campo `file` | 201 `DataImportSummary` | Toast de éxito + resumen + invalidación (R7–R9) |
| ídem | 400 / 409 / 413 / 415 problem+json (`detail` en inglés) | Toast de error (R10) |

## Tipos y firmas

```ts
// queries.ts
export const EXPORT_URL = '/api/me/export';
/** POST /me/import with the zip; on success invalidates vehicles.all and notificationChannels.all. */
export function useImportData(): UseMutationResult<DataImportSummary, unknown, File>;

// import.ts
export type ImportErrorKey =
  | 'dataPortability.errors.invalid'      // 400
  | 'dataPortability.errors.settings'     // 409
  | 'dataPortability.errors.tooLarge'     // 413
  | 'dataPortability.errors.fileType'     // 415
  | 'common.error';
export function importErrorKey(error: unknown): ImportErrorKey;
```

## Flujo de UI

- **Exportar** (R1): `<Button asChild variant="outline"><a href={EXPORT_URL} download>…</a></Button>` con icono `Download`. La cookie de sesión va sola (mismo origen; en dev, proxy de Vite) y el navegador escribe el stream a disco con el nombre del `Content-Disposition`.
- **Importar** (R2–R6): `<input type="file" accept={IMPORT_ACCEPT} className="sr-only" tabIndex={-1} aria-label=…>` disparado por el botón «Importar datos». Al elegir fichero se guarda en estado (`pending: File | null`), se limpia `event.target.value` y se abre un `AlertDialog` controlado (`open={pending !== null}`). El diálogo muestra el nombre del fichero y el texto «se añaden… no se borra ni modifica nada… la moneda y las unidades deben coincidir». «Cancelar» → `pending = null`, sin petición. «Importar» → `importData.mutate(file)` y cierra el diálogo. Mientras `isPending`, el botón queda deshabilitado con `Loader2` y «Importando…».
- **Éxito** (R7–R9): `toast.success(t('dataPortability.imported'))` y el resumen queda en estado del componente: lista (`<dl>`) con las 8 categorías y sus contadores (formateados con `useFormat().number`). Si `skipped.notificationChannels > 0`, un aviso (`role="status"`) con plural i18n. La invalidación vive en `onSuccess` del `useMutation` (no en `mutate()`), como en `useDownloadSaleReport`.
- **Error** (R10): `toast.error(t(importErrorKey(error)), { description: error instanceof ApiError ? error.problem.detail : undefined })`. Se borra el resumen anterior para no confundirlo con el del intento fallido.
- Diseño: misma `Card` que las demás secciones; botones en `flex flex-wrap gap-2` (se apilan en móvil); el resumen en `grid grid-cols-2 sm:grid-cols-4`. Tokens de tema, sin colores fijos (modo oscuro). Sin estado vacío ni de carga propios (no hay query).

## i18n (`dataPortability`)

`title` («Tus datos»), `description`, `export`, `exportHint`, `import`, `importing`, `fileInput`, `confirmTitle`, `confirmDescription` (con `{{name}}`), `confirm`, `imported`, `summaryTitle`, `summary.{vehicles,odometerReadings,maintenanceSchedules,maintenanceRecords,fuelLogs,attachments,photos,notificationChannels}`, `skippedChannels_one/_other`, `errors.{invalid,settings,tooLarge,fileType}`. El test `es and en define the same keys` de `i18n/locales.test.ts` ya garantiza la paridad (R11).

## Alternativas descartadas

- **Exportar con `api.download` + `downloadBlob`** (como el informe de venta): carga el zip entero en memoria del navegador (hasta `IMPORT_MAX_MB`, 1 GiB por defecto, con todas las facturas) y anula el streaming de #34. A cambio daría un toast si falla, pero los únicos fallos realistas son sesión caducada (el layout ya redirige) o un 500.
- **Mostrar el resumen en un diálogo modal**: obliga a cerrarlo; en la tarjeta queda visible y no bloquea.
- **Comprobar en el cliente el tamaño contra `IMPORT_MAX_MB`**: exigiría exponerlo en `GET /config` (cambio de API fuera del acceptance); el 413 de la API ya lo cubre.

## Decisiones a validar (Gate 1)

1. **Export como enlace nativo** (`<a download>`), sin toast si falla: lo maneja el gestor de descargas del navegador.
2. **Mensajes de error traducidos por estado** y el `detail` de la API (en inglés) como descripción del toast, útil para saber qué fichero o ajuste falla.
3. **El diálogo avisa de que moneda y unidades deben coincidir** (regla R7 de #35) para evitar el 409 a ciegas.
4. **Sin límite de tamaño en el cliente** ni cambios en la API.
5. **Sección al final de Ajustes**, después de «Apariencia».

## Riesgos

- Import grande: la petición puede tardar; el botón queda en «Importando…» sin barra de progreso (`fetch` no expone progreso de subida).
- Si el usuario sale de Ajustes durante el import, la invalidación sigue ocurriendo (está en el `useMutation`) pero el resumen se pierde; el toast de éxito o error sí aparece.

## Fuera de alcance

- Export o import de un solo vehículo, «sustituir» en vez de añadir, barra de progreso.
- Cambiar los ajustes desde el error 409 (el usuario los edita en la tarjeta «Preferencias»).
