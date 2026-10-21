# Design — maintenance-schedules-web

Solo `apps/web`. Sin cambios en la API, la BD ni `packages/shared`: consume el contrato de `maintenance-schedules-api` y reutiliza `createMaintenanceScheduleSchema`, `MaintenanceSchedule`, `CreateMaintenanceScheduleInput`, `UpdateMaintenanceScheduleInput`, `MAINTENANCE_CATEGORIES` y `SCHEDULE_STATUSES`.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| web/lib | `apps/web/src/lib/query-keys.ts` | `vehicles.schedules(id) = ['vehicles','detail',id,'schedules']`. Cuelga de `vehicles.all`: las mutaciones de mantenimiento (que ya invalidan `vehicles.all`) la recargan sin tocarlas (R18). |
| web/ui | `apps/web/src/components/ui/badge.tsx` | Variantes nuevas `warning` (próximo) y `danger` (vencido); `status` (menta) para «al día». |
| web/css | `apps/web/src/index.css` | Token `--warning` / `--color-warning` en claro y oscuro (ámbar derivado de la paleta). `danger` usa `--destructive`. |
| web/feature | `apps/web/src/features/schedules/schedules.ts` (nuevo) | `sortSchedules(schedules)` (R2). |
| web/feature | `apps/web/src/features/schedules/schedules.test.ts` (nuevo) | Tests unitarios del orden. |
| web/feature | `apps/web/src/features/schedules/form.ts` (nuevo) | `scheduleFormSchema`, `defaultsFrom(schedule?)`, `toCreateBody(values)`, `toUpdateBody(values)`. |
| web/feature | `apps/web/src/features/schedules/form.test.ts` (nuevo) | Tests unitarios del esquema y los cuerpos. |
| web/feature | `apps/web/src/features/schedules/queries.ts` (nuevo) | `schedulesQuery`, `useCreateSchedule`, `useUpdateSchedule`, `useDeleteSchedule`. |
| web/feature | `apps/web/src/features/schedules/schedule-form.tsx` (nuevo) | `ScheduleFormDialog` (alta y edición). |
| web/feature | `apps/web/src/features/schedules/schedule-form.test.tsx` (nuevo) | Tests de componente del formulario. |
| web/feature | `apps/web/src/features/schedules/schedules-section.tsx` (nuevo) | `SchedulesSection`, `ScheduleRow`, `ScheduleStatusBadge`, `DeleteScheduleDialog`. |
| web/feature | `apps/web/src/features/schedules/schedules-section.test.tsx` (nuevo) | Tests de componente de la sección. |
| web/feature | `apps/web/src/features/maintenance/form.ts` | Campo `scheduleId: z.string()` (`''` → `null`) en `maintenanceFormSchema`; `defaultsFrom` lo rellena desde el record. |
| web/feature | `apps/web/src/features/maintenance/maintenance-form.tsx` | `useQuery(schedulesQuery(vehicleId))` y `Select` «Regla» si hay reglas. |
| web/feature | `apps/web/src/features/maintenance/{form,maintenance-form}.test.*` | Los cuerpos esperados incluyen `scheduleId: null`; tests nuevos de vinculación. |
| web/route | `apps/web/src/routes/_app/vehicles/$vehicleId/index.tsx` | Loader: `ensureQueryData(schedulesQuery)`; `SchedulesSection` a ancho completo justo antes de `MaintenanceSection`. |
| i18n | `apps/web/src/i18n/locales/{es,en}.json` | Namespace `schedules.*` y `maintenance.fields.schedule` / `maintenance.noSchedule`. |

Los parsers `parseInteger` se importan de `@/features/vehicles/numbers`; las etiquetas de categoría reutilizan `maintenance.categories.*`.

## Contrato HTTP consumido

| Llamada | Uso | Errores tratados |
|---|---|---|
| `GET /api/vehicles/:id/schedules` | `schedulesQuery` (loader + `useSuspenseQuery` en la sección, `useQuery` en el form de mantenimiento) | 404 → `notFound()` (loader) |
| `POST /api/vehicles/:id/schedules` | alta | cualquier error → `common.error` en la raíz |
| `PATCH /api/vehicles/:id/schedules/:scheduleId` | edición | ídem |
| `DELETE /api/vehicles/:id/schedules/:scheduleId` | borrado | `toast.error(common.error)` |
| `POST|PATCH /api/vehicles/:id/maintenance[/:recordId]` | ahora con `scheduleId` | sin cambios en `formErrorFor` |

Invalidación: alta y edición de regla → `vehicles.schedules(id)`. Borrado → `vehicles.detail(id)` (los mantenimientos vinculados pasan a `scheduleId: null`).

## Tipos y firmas

```ts
// features/schedules/schedules.ts
export function sortSchedules(schedules: readonly MaintenanceSchedule[]): MaintenanceSchedule[];

// features/schedules/form.ts — campos numéricos como texto (parseInteger, '' → null)
export const scheduleFormSchema; // title, category, intervalMonths, intervalDistance, warnDays,
                                 // warnDistance, lastDoneDate ('' → undefined), lastDoneOdometer
                                 // + refine "al menos un intervalo" con path ['intervalMonths']
export type ScheduleFormInput = z.input<typeof scheduleFormSchema>;
export type ScheduleFormValues = z.output<typeof scheduleFormSchema>;
export function defaultsFrom(schedule?: MaintenanceSchedule): ScheduleFormInput; // alta: oil_change, warnDays 30, warnDistance 1000
export function toCreateBody(values: ScheduleFormValues): CreateMaintenanceScheduleInput; // omite lastDone* vacíos
export function toUpdateBody(values: ScheduleFormValues): UpdateMaintenanceScheduleInput; // todo, vacíos → null

// features/schedules/schedules-section.tsx
export function SchedulesSection({ vehicle }: { vehicle: Pick<Vehicle, 'id' | 'status'> }): JSX.Element;
```

Los campos se construyen con `createMaintenanceScheduleSchema.shape.<campo>` (`.unwrap()` donde haga falta) como hace `maintenanceFormSchema`. El refine del esquema compartido lleva un mensaje literal en inglés que tiene prioridad sobre `z.config`, así que el esquema del formulario declara su propio refine con `error: () => i18n.t('schedules.errors.intervalRequired', { unit })` (la unidad se inyecta: `scheduleFormSchema` puede ser una factoría `scheduleFormSchema(unit)` si hace falta).

## UI

- Card «Próximos mantenimientos» con botón `accent` «Añadir regla» (solo `active`), lista `<ol>` con filas como `MaintenanceRow`: título + categoría (`Badge stamp`), intervalo, próximo vencimiento («12 mar 2027 (estimada) · 135.000 km») y `ScheduleStatusBadge`; botones editar / borrar con `aria-label` por título.
- Estado vacío: texto `schedules.empty`. Carga: Suspense del loader. Error: el de la ruta.
- Formulario en `Dialog` (como `MaintenanceFormDialog`): título, categoría, cada (meses) / cada ({{unit}}), avisar con (días) / ({{unit}}) de antelación, última vez (fecha, `max=todayIso()`) / (km). En alta, ayuda bajo «última vez»: «Si lo dejas vacío, se cuenta desde la compra del vehículo».
- Móvil: badge y acciones comparten la primera línea, como en la línea de tiempo. Oscuro: variantes con tokens, nada de colores literales.

## Alternativas descartadas

- **Ordenar en la API.** La API devuelve por creación (R7 de #13) y cambiarlo rompería su contrato y tests; el orden es presentación y vive en una función pura de la web.
- **Usar `createMaintenanceScheduleSchema` tal cual con `zodResolver`.** Los inputs son texto («15.000») y su mensaje del refine está en inglés; se deriva como en `maintenanceFormSchema`.
- **Rellenar título y categoría del mantenimiento al elegir una regla.** Útil, pero no está en el `acceptance`; queda fuera.

## Decisiones a validar

1. **Orden «por vencimiento»** = primero el estado (vencido → próximo → al día), luego fecha, luego km, luego título. Sin el estado, una regla vencida solo por km y sin fecha estimada quedaría al final.
2. **Vehículos no activos**: la sección se muestra y se pueden editar y borrar reglas, pero no crear (igual que los mantenimientos).
3. **Selector de regla oculto** si el vehículo no tiene reglas.
4. **Estados**: al día = `Badge status` (menta), próximo = `warning` (ámbar, token nuevo), vencido = `danger` (`--destructive`).

## Riesgos

- Si la regla se borra con el formulario de mantenimiento abierto, la API responde 400 sin `errors` y `formErrorFor` lo muestra como «fecha futura». Caso raro; se acepta (la API no tiene códigos de error legibles por máquina).
- Los tests existentes de `maintenance-form.test.tsx` que comparan el cuerpo exacto del `POST`/`PATCH` deben incluir `scheduleId: null` y mockear `GET /vehicles/v1/schedules`.

## Fuera de alcance

Botón «Añadir al calendario», notificaciones y jobs (fase 4, otras features); mostrar en la línea de tiempo a qué regla pertenece un mantenimiento; avisos en el dashboard.
