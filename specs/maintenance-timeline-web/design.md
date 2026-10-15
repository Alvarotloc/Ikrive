# Design — maintenance-timeline-web

Solo `apps/web`. Sin cambios en la API, la BD ni `packages/shared` (consume el contrato de `maintenance-records-api`).

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| web/lib | `apps/web/src/lib/query-keys.ts` | `vehicles.maintenance(id) = ['vehicles','detail',id,'maintenance']` (cuelga de `vehicles.all`). |
| web/feature | `apps/web/src/features/maintenance/timeline.ts` (nuevo) | Lógica pura: orden, filtro, categorías disponibles, agrupación por año, detalles formateados. |
| web/feature | `apps/web/src/features/maintenance/timeline.test.ts` (nuevo) | Tests unitarios de `timeline.ts`. |
| web/feature | `apps/web/src/features/maintenance/form.ts` (nuevo) | Esquema del formulario, `defaultsFrom(record?)`, `formErrorFor(error)`. |
| web/feature | `apps/web/src/features/maintenance/form.test.ts` (nuevo) | Tests unitarios de `form.ts`. |
| web/feature | `apps/web/src/features/maintenance/queries.ts` (nuevo) | `maintenanceQuery`, `useCreateMaintenance`, `useUpdateMaintenance`, `useDeleteMaintenance`. |
| web/feature | `apps/web/src/features/maintenance/maintenance-form.tsx` (nuevo) | `MaintenanceFormDialog` (alta y edición). |
| web/feature | `apps/web/src/features/maintenance/maintenance-form.test.tsx` (nuevo) | Tests de componente del formulario. |
| web/feature | `apps/web/src/features/maintenance/maintenance-timeline.tsx` (nuevo) | `MaintenanceSection`: filtro, grupos por año, filas, `DeleteMaintenanceDialog`. |
| web/feature | `apps/web/src/features/maintenance/maintenance-timeline.test.tsx` (nuevo) | Tests de componente de la sección. |
| web/route | `apps/web/src/routes/_app/vehicles/$vehicleId/index.tsx` | Loader añade `ensureQueryData(maintenanceQuery)`; Card a ancho completo entre la rejilla de 2 columnas y «Gestión». |
| i18n | `apps/web/src/i18n/locales/{es,en}.json` | Namespace `maintenance.*`. |
| i18n | `apps/web/src/i18n/locales.test.ts` (nuevo) | Paridad de claves es/en y etiqueta por categoría. |

`parseInteger`/`parseDecimal` se importan de `@/features/vehicles/numbers` (no se mueven: un único consumidor nuevo).

## Contrato HTTP consumido

| Llamada | Uso | Errores tratados |
|---|---|---|
| `GET /api/vehicles/:id/maintenance` | `maintenanceQuery` (loader + `useSuspenseQuery`) | 404 → `notFound()` (ya lo hace el loader) |
| `POST /api/vehicles/:id/maintenance` | alta | 409 → km · 400 sin `errors` → fecha · resto → `common.error` |
| `PATCH /api/vehicles/:id/maintenance/:recordId` | edición, cuerpo completo | ídem |
| `DELETE /api/vehicles/:id/maintenance/:recordId` | borrado | cualquiera → `toast.error(common.error)` |

La API no da códigos de error legibles (`type: about:blank`): se ramifica por `problem.status` y por la presencia de `problem.errors`, como `odometer-form.tsx`.

## Tipos y firmas

```ts
// timeline.ts
export type CategoryFilter = MaintenanceCategory | 'all';
export function sortRecords(records: MaintenanceRecord[]): MaintenanceRecord[];          // date desc, createdAt desc
export function availableCategories(records: MaintenanceRecord[]): MaintenanceCategory[]; // orden de MAINTENANCE_CATEGORIES
export function resolveFilter(selected: CategoryFilter, available: MaintenanceCategory[]): CategoryFilter; // → 'all' si ya no está
export function filterRecords(records: MaintenanceRecord[], filter: CategoryFilter): MaintenanceRecord[];
export function groupByYear(records: MaintenanceRecord[]): { year: string; records: MaintenanceRecord[] }[]; // ordena y agrupa
export function recordDetails(record: MaintenanceRecord, fmt: { distance(n: number): string; money(n: number): string }): string[];
// → [km?, taller?, coste?] sin vacíos; la fila los une con « · »

// form.ts
const shape = createMaintenanceRecordSchema.shape;
export const maintenanceFormSchema = z.object({
  date: shape.date,
  odometer: z.string().transform(parseInteger).pipe(shape.odometer),
  category: shape.category,
  title: shape.title,
  description: shape.description,
  workshop: shape.workshop,
  cost: z.string().transform(parseDecimal).pipe(shape.cost),
  includeInReport: z.boolean(),
});
export type MaintenanceFormInput = z.input<typeof maintenanceFormSchema>;   // strings para los inputs
export type MaintenanceFormValues = z.output<typeof maintenanceFormSchema>; // asignable a Create/UpdateMaintenanceRecordInput
export function defaultsFrom(record?: MaintenanceRecord): MaintenanceFormInput; // alta: hoy, 'oil_change', includeInReport true
export function formErrorFor(error: unknown):
  { field: 'odometer' | 'date' | 'root'; messageKey: string };
// 409 → odometer 'maintenance.errors.odometerConflict'; 400 sin errors → date 'maintenance.errors.future'; resto → root 'common.error'
```

```ts
// componentes: sin dependencias de TanStack Router (ni Route.useParams ni Link) para poder probarlos aislados
export function MaintenanceSection(props: { vehicle: Pick<Vehicle, 'id' | 'status'> }): JSX.Element;
// useSuspenseQuery(maintenanceQuery(vehicle.id)); botón de alta solo si status === 'active'
export function MaintenanceFormDialog(props: {
  vehicleId: string; record?: MaintenanceRecord; open: boolean; onOpenChange(open: boolean): void;
}): JSX.Element;
```

`parseInteger` devuelve `null` en blanco y `NaN` en texto no numérico; `NaN` falla `odometerValueSchema` → error en el campo (R12).

## UI

- **Sección** (`MaintenanceSection`, en una `Card` «Mantenimientos»): cabecera con título y botón `accent` «Añadir mantenimiento»; filtro de chips (`<nav aria-label>` con botones `rounded-full` y `aria-pressed`, mismo estilo que los chips de `routes/_app/vehicles/index.tsx`, `flex-wrap` para móvil); `useState<CategoryFilter>` local pasado por `resolveFilter`.
- **Grupo por año**: encabezado `label-caps` y `<ol className="divide-y">`. Fila como `odometer-timeline.tsx`: `grid grid-cols-[auto_1fr_auto]`; izquierda `Badge variant="stamp"` con `t('maintenance.categories.<cat>')`; centro título en negrita, fecha y `recordDetails` en `text-muted-foreground` (`min-w-0`, `break-words`); derecha botones ghost icono (`Pencil`, `Trash2`, `size-9`, `aria-label` con el título).
- **Vacío**: `<p className="py-3 text-sm text-muted-foreground">{t('maintenance.empty')}</p>`; carga vía loader (suspense, igual que el resto de la ficha).
- **Formulario**: `Dialog` controlado con `<form noValidate>` (patrón `SoldDialog`). `DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto"` para móvil. Campos con `FormField`: fecha (`type=date`, `max=todayIso()`), km (`inputMode=numeric`, unidad en la etiqueta), categoría (`Select` nativo), título, taller, coste (`inputMode=decimal`, moneda en la etiqueta), descripción (`Textarea`), «Incluir en el informe» (checkbox nativo). En móvil, rejilla de una columna; `sm:grid-cols-2` para fecha/km y taller/coste. Error raíz con `role="alert"` encima del pie.
- **Borrado**: `AlertDialog` (patrón `DeleteDialog` de `vehicle-actions.tsx`), acción `destructive`.
- **Éxito**: `toast.success(t('maintenance.created'|'updated'|'deleted'))`; las mutaciones invalidan `queryKeys.vehicles.all` (crean/mueven/borran lecturas `maintenance`).
- Tokens semánticos solo (sin colores fijos) → modo oscuro sin trabajo extra; se verifica con capturas.

## i18n

`maintenance.{title, add, edit, empty, filterLabel, all, created, updated, deleted, deleteTitle, deleteDescription, editLabel, deleteLabel, fields.{date, odometer, category, title, workshop, cost, description, includeInReport}, categories.{oil_change…other}, errors.{odometerConflict, future}}`. Interpolación `{{unit}}`, `{{currency}}`, `{{title}}`. `locales.test.ts` compara el conjunto aplanado de claves de ambos ficheros y que existan las 8 `maintenance.categories.*`.

## Estrategia de tests

- **Unitarios** (`timeline.test.ts`, `form.test.ts`, `locales.test.ts`, proyecto `unit`): orden, agrupación, filtro, detalles, parseo del formulario, mapeo de errores y paridad i18n.
- **De componente** (`maintenance-form.test.tsx`, `maintenance-timeline.test.tsx`, proyecto `dom`): todo el comportamiento visible (lista y orden, chips con `aria-pressed`, badge, vacío, diálogo de alta/edición, confirmación de borrado, 409 en km con `aria-invalid`, resto de errores, gating del botón de alta, invalidación). Patrón de `odometer-form.test.tsx`:
  - `renderWithProviders` + `mockApi`; solo se simula `fetch` (nunca los hooks de `queries.ts`). `GET /settings` se responde con `DEFAULT_USER_SETTINGS` para que `useFormat` sea determinista (km, EUR, `es`).
  - Se afirma la petición enviada (método, ruta y cuerpo JSON) leyendo `fetchMock.mock.calls`, y la ausencia de `POST`/`DELETE` cuando no debe haberla.
  - `MaintenanceSection` usa `useSuspenseQuery`: el test la envuelve en `<Suspense fallback={null}>` y espera con `findBy*`. La recarga tras una mutación se comprueba con una ruta `GET` en forma de función que devuelve la lista actualizada.
  - Toasts: `renderWithProviders` no monta `Toaster`; los tests que afirman un toast renderizan `<><Toaster /><Componente/></>` (de `sonner`) y buscan el texto.
  - R19: el test siembra `queryClient.setQueryData(queryKeys.vehicles.detail('v1'), …)` y comprueba `getQueryState(...).isInvalidated` tras guardar.
  - R7: `Badge` no expone la variante como atributo; se afirma el texto traducido y la clase `border-dashed` de `variant="stamp"` (no se toca `components/ui/badge.tsx`).
- **Difícil de probar: la ruta de la ficha** (`routes/_app/vehicles/$vehicleId/index.tsx`) necesita el contexto de TanStack Router (loader, `Route.useParams`, `Link`). No se testea como componente: se prueba `MaintenanceSection` directamente (recibe `vehicle` por props) y el montaje en la ruta (loader + Card) se valida con `pnpm typecheck` y la revisión visual (T11).
- **Revisión visual** (T11): móvil 375 px y modo oscuro (R21), que jsdom no puede comprobar.

## Alternativas descartadas

- **Formulario en rutas propias** (`/vehicles/$vehicleId/maintenance/new` y `/$recordId/edit`): enlaces profundos y más espacio, pero dos rutas, loaders y navegación de vuelta para un formulario de 8 campos; el diálogo mantiene el contexto de la timeline y sigue el patrón de `SoldDialog`. Si la feature 7 necesita mucho espacio para facturas puede pasar a ruta entonces.
- **Filtro en search params** (`?category=`): sobrevive a recargas, pero exige `validateSearch` en la ruta de la ficha para un estado secundario; se usa estado local.
- **Formulario validado directamente con `createMaintenanceRecordSchema`** (inputs numéricos `valueAsNumber`): pierde el parseo de «1.234,56» y el vacío → `null` que ya resuelven `parseInteger`/`parseDecimal`; se reutilizan los campos del esquema compartido envolviendo solo los dos numéricos.
- **Pre-check de conflicto en cliente con `findOdometerConflict`**: en edición el DTO no expone la lectura enlazada para excluirla; la API es la fuente de verdad.

## Decisiones a validar (Gate 1)

1. Formulario en `Dialog`, no en rutas (ver arriba).
2. El botón «Añadir mantenimiento» solo aparece si `vehicle.status === 'active'` (como `OdometerForm`; ahora R22, con test); editar y borrar están disponibles en cualquier estado.
3. Filtro con estado local; solo se ofrecen las categorías presentes en los registros.
4. Agrupación por **año** (no por mes).
5. Edición con `PATCH` de todos los campos: vaciar el km borra la lectura enlazada (`odometer: null`).
6. Valores por defecto del alta: fecha de hoy, categoría `oil_change`, `includeInReport` marcado.
7. Error de borrado → `toast.error`; errores de guardado distintos de 409/400-fecha → mensaje raíz en el formulario.
8. La ruta de la ficha no tiene test de componente (contexto de router); se prueba `MaintenanceSection` aislada y el montaje se valida con capturas.

## Riesgos

- Radix (`Dialog`, `AlertDialog`) en jsdom: renderizan en portal sobre `document.body` (las consultas de `screen` los alcanzan); si falta alguna API del DOM (p. ej. `hasPointerCapture`), se añade el polyfill mínimo en `apps/web/src/test/setup.ts`, no en el test. Se usa `Select` nativo, no el de Radix, en parte por esto.
- Fechas en tests: el alta usa `todayIso()` y `max=todayIso()`; los tests usan fechas pasadas fijas para no depender del día de ejecución.
- Distinguir 400 de fecha futura vs validación depende de la presencia de `problem.errors`; si la API cambia el formato habría que ajustar `formErrorFor` (cubierto por test).
- Importar `JSON` en `locales.test.ts` requiere `resolveJsonModule`, ya usado por `i18n/index.ts`.

## Fuera de alcance

Facturas adjuntas en la UI (feature 7), gasto acumulado en la ficha (8), mantenimientos programados (fase 4), paginación de la timeline, uso de `includeInReport` en el informe (fase 6).
