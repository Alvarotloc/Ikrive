# Review — #26 form-field-error-a11y

**Veredicto:** APPROVED

Feature `sdd: false`: no hay `specs/`. Reviso contra la `description` y los `acceptance` de la entrada 26 de `feature_list.json` y contra el aviso 4 de `progress/review_fuel-logs-web.md`.

## Trazabilidad acceptance ↔ tests

Todos los tests están en `apps/web/src/components/form-field.test.tsx` (FF).

- A1 (`aria-describedby` con id estable + `aria-invalid`): [x] FF:30 › `links the error to its input…`. Comprueba la descripción accesible exacta, `toBeInvalid()` y que `aria-describedby` es igual al `id` del `role=alert`. FF:120 › `gives each field a distinct error id` comprueba que los ids son distintos entre campos. El id sale de `useId()`, así que es estable entre renders.
- A2 (se conservan las descripciones previas): [x] FF:43 › la descripción es exactamente «Calculado Importe no válido»: se mantiene la pista y se añade el error, en ese orden.
- A3 (sin error no se apunta a ningún id inexistente): [x] FF:54. Sin pista no hay `aria-describedby` ni `aria-invalid` y la descripción está vacía. Con pista solo aparece `odometer-hint`.
- A4 (los formularios se benefician sin cambios): [x] FF:76 (input envuelto en un `div`, el patrón del odómetro en repostajes), FF:89 (`Select` y `Textarea`) y FF:107 (solo se enlaza el control cuyo `id` coincide). Lo he comprobado leyendo el código: todos los usos de `FormField` pasan al control el mismo `id` que al campo. Pasa en login, registro, ajustes, `vehicle-form` y `vehicle-actions`, que usan ids literales, y en `fuel-log-form`, `schedule-form`, `maintenance-form` y `channel-form`, donde los helpers `field()`/`input()` generan el mismo prefijo. No se ha tocado ningún formulario.
- A5 (`toHaveAccessibleDescription`): [x] lo usan 6 de los 7 tests nuevos.
- A6 (harness): [x] he ejecutado `pnpm harness --full` y está en verde (web 251, api 194).

## Tasks
- No aplica (sin `tasks.md`, feature `sdd: false`).

## Checkpoints
- C1: [x] harness OK · solo #26 está activa · rama `feat/form-field-error-a11y`.
- C2: [x] no aplica: sin spec por ser `sdd: false` (docs/sdd.md:26). Cada acceptance tiene un test que he leído.
- C3: [x] el diff solo toca `form-field.tsx`, `form-field-context.ts` (nuevo), los tres primitivos `ui/` (una línea cada uno, como documenta el impl), los tests, `feature_list.json` (estado) y `progress/current.md`. No hay refactors ajenos.
- C4: [x] solo es web. El cambio está en `components/` y reutiliza los componentes de marca. No añade textos nuevos, así que no hace falta tocar es/en. API y BD no aplican.
- C5: [x] sin `any`, `@ts-ignore`, `console.log` ni TODOs. Fechas y ficheros no aplican.
- C6: [x] harness verde. Los tests afirman descripciones e ids concretos. No hay capturas, con justificación: el cambio solo afecta a atributos ARIA, no a lo que se ve.
- C7: [x] `impl_form-field-error-a11y.md` incluye los archivos, el mapa acceptance → test y la salida del harness. `current.md` está al día. PLAN no necesita cambios.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
1. El enlace depende de una convención implícita: el control tiene que ser `Input`, `Select` o `Textarea` y llevar el mismo `id` que el `FormField`. Si un formulario futuro mete otro control, o un id distinto, el error dejará de enlazarse sin que nada avise. Lo documenta el JSDoc de `FormField`. Si se quiere blindar, se puede añadir más adelante un aviso en desarrollo o un test.
2. `odometer-form.tsx` no usa `FormField` y sigue sin enlazar sus errores. El impl lo deja fuera de alcance, y la feature solo pide `FormField`.
3. El componente usa `<FormFieldContext value>` como provider, una sintaxis que necesita React 19. El typecheck pasa, así que el proyecto ya está en esa versión.

## Cambios requeridos
Ninguno.
