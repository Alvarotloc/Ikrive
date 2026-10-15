# Review — #6 maintenance-timeline-web

**Veredicto:** APPROVED

Diff revisado: `git diff main...HEAD` (solo spec + `feature_list.json`), `git diff` (es/en.json, `query-keys.ts`, ruta de la ficha, `progress/current.md`, `tasks.md`) y archivos sin trackear (`apps/web/src/features/maintenance/*`, `apps/web/src/i18n/locales.test.ts`, `progress/impl_*`, `progress/explore_*`). `pnpm harness --full` en verde (web 50 tests). Los 30 tests de `features/maintenance` se han repetido 3 veces y una más en orden aleatorio (`--sequence.shuffle`): siempre en verde.

## Trazabilidad requirements ↔ tests

Abreviaturas: TL `features/maintenance/timeline.test.ts`, FO `form.test.ts`, MF `maintenance-form.test.tsx`, MT `maintenance-timeline.test.tsx`, LO `i18n/locales.test.ts`.

- R1: [x] MT:85 `loads the vehicle's records…`: comprueba un `GET /vehicles/v1/maintenance` y que los títulos se pintan. El montaje en la ruta (`index.tsx`, loader + `<MaintenanceSection>`) se verifica con typecheck y capturas, como decidía el design (decisión 8).
- R2: [x] TL:31 (orden por fecha y, a igual fecha, por `createdAt`; además comprueba que no muta la entrada) · MT:85 (orden visible de los títulos).
- R3: [x] TL:43 (años descendentes con sus ids) · MT:85 (encabezados h3 `['2025','2024']` y número de filas por sección).
- R4: [x] TL:58 (orden canónico, solo las presentes) · MT:113 (chips exactos `Todas, Aceite, Neumáticos, Frenos`, aunque los datos llegan en otro orden).
- R5: [x] TL:70 · MT:113 (tras pulsar «Frenos» solo queda «Pastillas»; `aria-pressed` correcto).
- R6: [x] TL:81 · MT:132 (borra el último «Frenos» con un GET en forma de función: «Todas» queda pulsado y el chip «Frenos» desaparece).
- R7: [x] MT:98 (texto traducido + clase `border-dashed` de `variant="stamp"`) · LO:17 (etiqueta no vacía por categoría en es y en).
- R8: [x] TL:87 (omite los nulos y conserva `0 km` / `0 €`) · MT:98 (línea exacta `fecha · 120.000 km · Taller Paco · 89,90 €`, y solo la fecha cuando faltan los demás).
- R9: [x] MT:155 (mensaje vacío, sin `navigation` ni encabezados de año).
- R10: [x] MF:71 (cuerpo exacto del `POST`, diálogo cerrado y toast «Mantenimiento añadido»).
- R11: [x] FO:133, FO:139 (vacío → null; «1.234,56» y «1,234.56» → 1234.56) · MF:71 (cuerpo con `cost: 1234.56`, `odometer: null`). El esquema se construye con `createMaintenanceRecordSchema.shape` (`form.ts:13-22`).
- R12: [x] FO:147 · MF:97 (dos `role=alert`, `aria-invalid` en título y km, diálogo abierto y ningún `POST`).
- R13: [x] FO:154 · MF:111 (los 8 campos, checkbox incluido) · MT:179 (abre desde la fila con los valores del registro).
- R14: [x] MF:125 (`PATCH /vehicles/v1/maintenance/r1` con los 8 campos, `odometer: null`, categoría y checkbox cambiados, diálogo cerrado y toast).
- R15: [x] MT:192 (cancelar: 0 `DELETE`; confirmar: 1 `DELETE` a la ruta del registro, toast y lista recargada).
- R16: [x] FO:178 · MF:152 (mensaje de conflicto en el `alert`, `aria-invalid` en km, diálogo abierto) · captura `*-form-km-error.png` con un 409 real.
- R17: [x] FO:187 · MF:167 (mensaje de fecha futura y `aria-invalid` en la fecha).
- R18: [x] FO:193 (400 con `errors`, 500, `TypeError` y `undefined` → raíz) · MF:182 (mensaje genérico, fecha y km sin `aria-invalid`) · MT:220 (borrado 500 → toast «Algo ha ido mal», el registro sigue y no hay toast de éxito).
- R19: [x] MF:194 (`isInvalidated` en `vehicles.detail('v1')` y en `vehicles.maintenance('v1')` tras el alta) · MT:192 (2 `GET` tras el borrado). Las tres mutaciones comparten `useMaintenanceMutation` (`queries.ts:17-25`), que invalida `['vehicles']`; eso cubre la ficha (km actuales), las lecturas del odómetro y el listado.
- R20: [x] LO:13 (las claves aplanadas de es y en coinciden en todo el fichero).
- R21: [x] Capturas en claro, oscuro, 375 px claro y 375 px oscuro. He abierto `light-timeline.png`, `dark-filter-oil.png`, `mobile-375-timeline.png` y `mobile-375-dark-form-km-error.png`: no hay desbordamiento, todo es legible en ambos modos y el error de km se ve bajo su campo.
- R22: [x] MT:163 (activo: el botón abre el formulario vacío; `sold`: no hay botón y editar/borrar siguen disponibles).

## Tasks
- T1–T14: [x] (las 14 marcadas).

## Checkpoints
- C1: [x] harness 0 · [x] una sola feature activa (#6 in_progress) · [x] rama `feat/maintenance-timeline-web`.
- C2: [x] están los 3 ficheros · [x] EARS con tabla de acceptance completa · [x] tasks `[x]` · [x] cada R tiene un test que he abierto y leído (ver arriba).
- C3: [x] el diff se limita a los archivos de la tabla de `design.md` (más `progress/`) · [x] sin refactors ajenos.
- C4: [x] API/BD: no aplica (sin cambios) · [x] web: dominio en `features/maintenance/`, `queryOptions` en `maintenanceQuery`, textos en es/en, reutiliza `Badge`, `Card`, `FormField`, `Dialog`/`AlertDialog`, `Select` y `Textarea` · [x] lógica pura (`timeline.ts`, `form.ts`) con tests unitarios.
- C5: [x] sin `any`, `@ts-ignore` ni `console.log` · [x] fechas `YYYY-MM-DD` (`todayIso`, `max`, `date.slice(0,4)`); km sin conversión · [x] ficheros: no aplica.
- C6: [x] `pnpm harness --full` en verde · [x] los tests afirman resultados concretos y solo simulan `fetch` con `mockApi` (no se mockea ningún hook) · [x] capturas referenciadas en `impl`.
- C7: [x] `impl_maintenance-timeline-web.md` completo · [x] `current.md` al día · [x] `PLAN.md`: no hace falta tocarlo (#6 no cierra la fase 3; quedan #7 y #8).

## Desviaciones declaradas: valoración
1. `useUpdateMaintenance` recibe `{ recordId, changes }` como variables: **aceptable**. El design no fijaba la firma, y es necesario para no llamar hooks de forma condicional.
2. `.unwrap()` en `odometer`/`cost` dentro del `.pipe()`: **aceptable**. Quita solo el `optional()` y conserva `int/min/max` y `nullable` del esquema compartido. FO:139 y FO:147 lo ejercitan.
3. La `Card` vive dentro de `MaintenanceSection`: **aceptable y mejor para testear**. El título y la condición del botón de alta quedan cubiertos por MT, y en la ruta sigue a ancho completo entre la rejilla y «Gestión».
4. `toast.dismiss()` en `afterEach` en los dos `*.test.tsx`: **aceptable**. Evita que sonner arrastre toasts de un test a otro sin tocar `setup.ts`. Aguanta orden aleatorio y repeticiones.
5. Al caer a «Todas» también se fija el estado local (`setSelected` durante el render, `maintenance-timeline.tsx:45`): **aceptable**. Es el patrón de estado derivado que admite React, y evita volver a la categoría antigua cuando reaparece. Lo prueba MT:132.
6. Mensajes de validación de zod en inglés: ver el aviso 1.

## Hallazgos
Ninguno bloqueante. Lo revisado sin encontrar problemas:
- Alta/edición: `PATCH` con todos los campos; vaciar descripción o taller envía `null` (vía `optionalText`).
- El formulario se monta solo con el diálogo abierto, así que siempre arranca con valores frescos.
- Tras editar, `openForm()` sin argumento limpia `editing`.
- Fallo al borrar → `toast.error`.
- Sin dependencias de router en los componentes.
- Los tests no dependen de la fecha del día: las respuestas son simuladas y la única fecha que se envía y se afirma es fija; no hay timers.

## Avisos para el humano (no bloquean)
1. **Mensajes de validación del cliente en inglés (criterio «Todos los textos están en es.json y en.json»).** Decisión explícita: **no bloquea esta feature**.
   - R20 traduce el criterio como «todos los textos *nuevos de la feature*». La feature no introduce ningún literal fuera de es/en.json (todos sus textos, errores de la API incluidos, salen de `maintenance.*`/`common.*`).
   - Los mensajes por defecto de zod («Too small: expected string to have >=1 characters») son un hueco transversal que ya existe en `vehicle-form.tsx` y `odometer-form.tsx`.
   - Arreglarlo aquí (p. ej. `z.config()` con el locale de zod enlazado al idioma de i18next, o mensajes propios en los esquemas compartidos) toca piezas comunes fuera del `design.md` de esta feature.
   - Aun así, en la UI en español el usuario verá en inglés el error de título vacío o de km no numérico. Recomiendo abrir una feature `sdd: false` del tipo «localizar mensajes de validación de zod» para todos los formularios.
2. En `mobile-375-timeline.png` la cabecera fija de la app aparece en medio de la captura. Es un artefacto de la captura por elemento de Playwright (la cabecera `fixed`/`sticky` se pinta sobre el área con scroll), no un fallo de maquetación. Si se quiere confirmar, basta un vistazo manual en un móvil.
3. Incidencia de T11 recogida en `impl`: la cuenta `demo@ikrive.test` sigue en la BD de desarrollo del humano, y su Vite en `:5174` puede necesitar recarga o reinicio.
4. `progress/explore_maintenance-timeline-web_patterns.md` está sin trackear. Decidir si se commitea con el resto del rastro o se descarta.

## Cambios requeridos
Ninguno.
