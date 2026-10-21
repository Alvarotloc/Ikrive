# Implementación — maintenance-schedules-web

Rama `feat/maintenance-schedules-web`. Solo `apps/web`; sin cambios en API, BD ni `packages/shared`. Sin commits.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `apps/web/src/lib/query-keys.ts` | `vehicles.schedules(id) = ['vehicles','detail',id,'schedules']` (cuelga de `vehicles.all`, así guardar un mantenimiento la invalida, R18). |
| `apps/web/src/features/schedules/queries.ts` (nuevo) | `schedulesQuery`, `useCreateSchedule`/`useUpdateSchedule` (invalidan `vehicles.schedules(id)`), `useDeleteSchedule` (invalida `vehicles.detail(id)`: reglas y mantenimientos). |
| `apps/web/src/features/schedules/schedules.ts` (nuevo) | `sortSchedules`: estado (overdue → due_soon → ok), `nextDueDate` asc, `nextDueOdometer` asc (null al final), título. No muta la entrada. |
| `apps/web/src/features/schedules/form.ts` (nuevo) | `scheduleFormSchema(unit)` derivado de `createMaintenanceScheduleSchema.shape` (números como texto con `parseInteger`), refine propio «al menos un intervalo» con `path: ['intervalMonths']` y mensaje traducido con la unidad; `defaultsFrom`, `toCreateBody`, `toUpdateBody`. |
| `apps/web/src/features/schedules/schedule-form.tsx` (nuevo) | `ScheduleFormDialog` (alta/edición) con react-hook-form + `zodResolver`, etiquetas con `distanceUnit`, ayuda bajo «última vez» solo en alta (`aria-describedby`), `common.error` en la raíz si falla. |
| `apps/web/src/features/schedules/schedules-section.tsx` (nuevo) | `SchedulesSection`, `ScheduleRow`, `ScheduleStatusBadge`, `DeleteScheduleDialog` (AlertDialog). Alta solo si `active`; estado vacío. |
| `apps/web/src/components/ui/badge.tsx` | Variantes `warning` (ámbar) y `danger` (`--destructive`). |
| `apps/web/src/index.css` | Token `--warning` / `--color-warning` en claro (`#8a6100`) y oscuro (`#f0cf7a`). |
| `apps/web/src/features/maintenance/form.ts` | Campo `scheduleId` (`''` → `null`, `pipe(shape.scheduleId.unwrap())`); `defaultsFrom` lo rellena. |
| `apps/web/src/features/maintenance/maintenance-form.tsx` | `useQuery(schedulesQuery)` y `Select` «Regla» (opción «Ninguna» + reglas en orden de vencimiento) solo si hay reglas. |
| `apps/web/src/routes/_app/vehicles/$vehicleId/index.tsx` | Loader precarga `schedulesQuery`; `SchedulesSection` a ancho completo antes de `MaintenanceSection`. |
| `apps/web/src/i18n/locales/{es,en}.json` | Namespace `schedules.*`, `maintenance.fields.schedule`, `maintenance.noSchedule`. |
| Tests | `schedules.test.ts`, `form.test.ts`, `schedule-form.test.tsx`, `schedules-section.test.tsx` (nuevos); `maintenance/form.test.ts` y `maintenance/maintenance-form.test.tsx` actualizados (`scheduleId: null` en los cuerpos, mock de `GET /vehicles/v1/schedules`) y ampliados. |

## Trazabilidad

Abreviaturas: SS = `features/schedules/schedules-section.test.tsx`, SF = `features/schedules/schedule-form.test.tsx`, F = `features/schedules/form.test.ts`, S = `features/schedules/schedules.test.ts`, MF = `features/maintenance/maintenance-form.test.tsx`, MFU = `features/maintenance/form.test.ts`.

| R | Test |
|---|---|
| R1 | SS › lists the schedules ordered by due status and date (GET y render) · montaje en la ficha: typecheck + capturas |
| R2 | S › sorts overdue before due soon before ok · sorts by next due date then odometer with nulls last · breaks ties by title · SS › lists the schedules ordered by due status and date |
| R3 | SS › shows the next due date in the locale and the distance in the user unit (`mi`, solo fecha cuando no hay km) |
| R4 | SS › marks an estimated due date |
| R5 | SS › shows the no data text when nothing can be computed |
| R6 | SS › shows a distinct badge for ok, due soon and overdue |
| R7 | SS › describes the interval in months and distance (ambos, solo meses, solo km, singular, categoría) |
| R8 | SS › shows the empty message without schedules |
| R9 | SS › shows the add button only for active vehicles |
| R10 | F › parses intervals typed with thousands separators · SF › shows field errors without calling the API |
| R11 | F › requires an interval in months or distance · SF › requires an interval in months or distance |
| R12 | F › omits blank last done fields when creating · SF › creates a schedule, closes the dialog and shows a toast · SS › reloads the list after creating a schedule (recarga: la regla nueva aparece y hay 2 GET; falla si `useScheduleMutation` no invalida `vehicles.schedules(id)`) |
| R13 | F › sends blank intervals and last done odometer as null when updating · F › prefills the form from a schedule · SF › sends every field with PATCH when editing · SS › opens the form prefilled when editing a schedule |
| R14 | SS › deletes a schedule only after confirming (cancelar sin DELETE; confirmar → DELETE, toast, lista recargada y `maintenance('v1')` invalidada) |
| R15 | SF › keeps the dialog open with the generic error when saving fails · SS › shows the generic error when deleting fails |
| R16 | MF › hides the schedule selector when the vehicle has no schedules · links the record to the chosen schedule (opciones) · preselects the record schedule when editing |
| R17 | MF › links the record to the chosen schedule · sends a null schedule when choosing none · MFU › turns no schedule into null and keeps a chosen one · cuerpos existentes con `scheduleId: null` |
| R18 | MF › refreshes the schedules section with the new due date after saving a linked record |
| R19 | SF › labels the distance fields with the user unit |
| R20 | `i18n/locales.test.ts › es and en define the same keys` |
| R21 | Capturas (abajo): claro, oscuro y 375 px, desbordamiento horizontal 0 px |

## Revisión visual (T13)

Stack aislado sin tocar el `pnpm dev` del humano (:5173): SPA compilada con `vite build --outDir` al scratchpad, servida por la API (`WEB_DIST_DIR`) en `127.0.0.1:3418` con `DATA_DIR` en el scratchpad. Sembrado vía API: Seat León a 135.000 km con tres reglas (aceite «Al día» con fecha y km, ITV «Próximo» solo meses, neumáticos con título largo «Vencido» solo km). playwright-core 1.58 contra `/usr/bin/google-chrome`, `es-ES`. La API está parada.

Directorio: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/bccd4e4b-56ab-46e3-b65c-d41565ed05f6/scratchpad/shots/`

| Ancho | Claro | Oscuro |
|---|---|---|
| 1440 | `desktop-light-section.png` · `desktop-light-form-error.png` | `desktop-dark-section.png` · `desktop-dark-form-error.png` |
| 375 | `mobile-375-light-section.png` · `mobile-375-light-form-error.png` | `mobile-375-dark-section.png` · `mobile-375-dark-form-error.png` |

`*-form-error.png` muestran el diálogo «Añadir regla» con el error «Indica un intervalo en meses o en km» en el campo de meses. Desbordamiento horizontal: 0 px en las 4 variantes (`report.json`). Script: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/bccd4e4b-56ab-46e3-b65c-d41565ed05f6/scratchpad/pw/shots.mjs`.

Ajuste tras la primera ronda: en escritorio la columna de badges tenía ancho variable y los títulos no quedaban alineados entre filas; ahora es de 9rem fijos (`sm:grid-cols-[9rem_1fr_auto]`).

## `pnpm harness --full`

```
[OK]    19 features: 13 done, 5 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #14 maintenance-schedules-web (in_progress)
[OK]    Rama actual: feat/maintenance-schedules-web
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared  Tests  26 passed (26)
apps/api         Tests  62 passed (62)
apps/web         Test Files 18 passed · Tests 144 passed (144)
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones y precisiones

- **`toUpdateBody` y `lastDoneDate`:** el diseño dice «todo, vacíos → null», pero `updateMaintenanceScheduleSchema` no acepta `lastDoneDate: null` (la regla siempre tiene fecha). Se envían a `null` los intervalos y `lastDoneOdometer` (lo que pide R13); una fecha borrada en edición se omite del PATCH (se conserva la actual).
- **`scheduleFormSchema` es una factoría `scheduleFormSchema(unit)`**, opción que el diseño permite, para inyectar la unidad en el mensaje del refine.
- **Parser numérico con `z.preprocess`:** `warnDays`/`warnDistance` no son nullable, así que `z.string().transform(parseInteger).pipe(...)` no tipa. Se usa `z.string().pipe(z.preprocess(parseInteger, schema))`; un vacío llega como `null` y se muestra «Este campo es obligatorio.».
- **Texto del vencimiento** con prefijo «Vence: …» (`schedules.nextDue`) para que se entienda en la fila; formato interior como el diseño («12 mar 2027 (estimada) · 135.000 km»).
- **Orden del selector «Regla»:** mismas reglas que la sección (`sortSchedules`).
- Sin cambios fuera del alcance de `design.md`.
