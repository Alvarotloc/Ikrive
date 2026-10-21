# Review — #14 maintenance-schedules-web

**Veredicto:** APPROVED

_Segunda revisión: resuelto el cambio requerido de la primera (test de recarga para R12)._

## Trazabilidad requirements ↔ tests
- R1: [x] `features/schedules/schedules-section.test.tsx` › `lists the schedules ordered by due status and date` (heading, 1 GET, filas). El montaje en la ficha (`routes/_app/vehicles/$vehicleId/index.tsx`) lo cubren el typecheck y las capturas.
- R2: [x] `features/schedules/schedules.test.ts` › los 3 tests (estado, fecha → km con null al final, título, sin mutar la entrada) + SS › `lists the schedules…` (orden real en el DOM).
- R3: [x] SS › `shows the next due date in the locale and the distance in the user unit` (fecha `es` + `135.000 mi`; solo fecha si no hay km).
- R4: [x] SS › `marks an estimated due date` (texto exacto con «(estimada)» y ausencia en la regla no estimada).
- R5: [x] SS › `shows the no data text when nothing can be computed`.
- R6: [x] SS › `shows a distinct badge for ok, due soon and overdue` (texto + clases distintas para cada estado).
- R7: [x] SS › `describes the interval in months and distance` (ambos, solo km, solo meses, singular, categoría traducida).
- R8: [x] SS › `shows the empty message without schedules`.
- R9: [x] SS › `shows the add button only for active vehicles` (active → abre diálogo; sold → sin botón, con editar/borrar).
- R10: [x] `features/schedules/form.test.ts` › `parses intervals typed with thousands separators` + `schedule-form.test.tsx` › `shows field errors without calling the API` (mensajes traducidos, `aria-invalid`, sin POST).
- R11: [x] F › `requires an interval in months or distance` + SF › `requires an interval in months or distance` (mensaje en el campo de meses, sin POST).
- R12: [x] F › `omits blank last done fields when creating` + SF › `creates a schedule, closes the dialog and shows a toast` (POST sin `lastDone*`, cierre, toast) + SS › `reloads the list after creating a schedule` (`schedules-section.test.tsx:201`: alta desde la sección, el GET devuelve la regla nueva tras el POST; afirma toast, fila «Neumáticos», diálogo cerrado, orden `['Neumáticos','Cambio de aceite']`, 1 POST y 2 GET; fallaría si `useScheduleMutation` dejara de invalidar `vehicles.schedules(id)`).
- R13: [x] F › `sends blank intervals and last done odometer as null when updating` / `prefills the form from a schedule`, SF › `sends every field with PATCH when editing` (cuerpo exacto), SS › `opens the form prefilled when editing a schedule`.
- R14: [x] SS › `deletes a schedule only after confirming` (cancelar → 0 DELETE; confirmar → 1 DELETE, toast, lista recargada, 2 GET, `maintenance('v1')` invalidada).
- R15: [x] SF › `keeps the dialog open with the generic error when saving fails` + SS › `shows the generic error when deleting fails`.
- R16: [x] `features/maintenance/maintenance-form.test.tsx` › `hides the schedule selector…`, `links the record to the chosen schedule` (opciones «Ninguna» + reglas), `preselects the record schedule when editing`.
- R17: [x] MF › `links the record to the chosen schedule` (`scheduleId: 'oil'` en el POST), `sends a null schedule when choosing none` (PATCH con `null`), `maintenance/form.test.ts` › `turns no schedule into null and keeps a chosen one`, cuerpos exactos existentes con `scheduleId: null`.
- R18: [x] MF › `refreshes the schedules section with the new due date after saving a linked record` (sección y diálogo en el mismo QueryClient; pasa de «Vencido» a «Al día» con la fecha nueva).
- R19: [x] SF › `labels the distance fields with the user unit` (`mi` en las tres etiquetas y en el error).
- R20: [x] `i18n/locales.test.ts` › `es and en define the same keys`; revisado el diff: claves idénticas en `es.json` y `en.json`.
- R21: [x] capturas claro/oscuro/375 px en `scratchpad/shots/` (revisadas `mobile-375-dark-section.png` y `desktop-light-form-error.png`), desbordamiento 0 px en `report.json`.

## Tasks
- T1..T14: [x]

## Checkpoints
- C1: [x] `pnpm harness` OK, una feature activa, rama `feat/maintenance-schedules-web`.
- C2: [x] spec completo, tasks `[x]` y cada R1–R21 con test real.
- C3: [x] el diff solo toca los archivos listados en `design.md` (más `progress/`).
- C4: [x] código en `features/schedules/`, `queryOptions`, textos en es/en, `Badge`/`Card`/`Dialog`/`AlertDialog`/`FormField` reutilizados; esquema derivado de `@ikrive/shared`. Sin cambios de API/BD.
- C5: [x] sin `any`, `@ts-ignore`, `console.log` ni TODOs; fechas `YYYY-MM-DD` (`max=todayIso()`), distancias sin convertir.
- C6: [x] `pnpm harness --full` en verde (shared 26, api 62, web 144; reejecutado en la segunda revisión); tests con `mockApi`, sin mocks de hooks; capturas referenciadas.
- C7: [x] `impl_maintenance-schedules-web.md` completo; `current.md` describe la sesión; `PLAN.md` sin cambios necesarios (la fase 4 sigue abierta).

## Hallazgos
Ninguno bloqueante. El hallazgo 1 de la primera revisión (R12 sin test de recarga) queda resuelto; el resto del diff no cambia respecto a la primera revisión salvo el test nuevo y la fila R12 del informe (`queries.ts` conserva la invalidación de `vehicles.schedules(id)`).

## Avisos para el humano (no bloquean)
- Desviaciones declaradas, aceptadas: `toUpdateBody` omite `lastDoneDate` vacío (el `updateMaintenanceScheduleSchema` no acepta `null`, así que R13 «todos los campos» se cumple con la fecha que siempre trae la regla); `scheduleFormSchema(unit)` como factoría (el diseño lo permite); `z.preprocess` para números no nullable; prefijo «Vence: …».
- Zod 4 no ejecuta el refine de objeto si fallan campos: con título vacío y sin intervalos, el error de intervalo solo aparece al corregir el título. R11 se cumple, pero la experiencia queda en dos pasos.
- El riesgo del diseño se mantiene: si borras una regla con el formulario de mantenimiento abierto, el 400 se muestra como «fecha futura».

## Cambios requeridos
Ninguno.
