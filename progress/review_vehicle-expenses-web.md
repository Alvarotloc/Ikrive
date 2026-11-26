# Review — #88 vehicle-expenses-web

**Veredicto:** APPROVED

Revisado: `git diff main...HEAD` (spec + `feature_list.json`), `git diff` y los ficheros sin trackear (`apps/web/src/features/expenses/*`, `features/stats/category-spending{,.test}.ts`, `e2e/tests/expenses.spec.ts`, `progress/impl_vehicle-expenses-web.md`). `pnpm harness --full` ejecutado por el reviewer: verde (web 112 ficheros / 803 tests, api 40 / 401, lint y typecheck OK, exit 0).

## Trazabilidad requirements ↔ tests

Abreviaturas como en `impl_vehicle-expenses-web.md`: EX `features/expenses/expenses.test.ts`, EF `features/expenses/form.test.ts`, FD `features/expenses/expense-form.test.tsx`, ES `features/expenses/expenses-section.test.tsx`, CS `features/stats/category-spending.test.ts`, VS `features/stats/vehicle-stats-section.test.tsx`, LM `features/mobile/local-mode.test.tsx`, LO `i18n/locales.test.ts`, E2E `e2e/tests/expenses.spec.ts`.

- R1: [x] EX › `sorts by date and creation time, newest first` (orden exacto con empate de fecha y entrada intacta) · ES › `lists the vehicle's expenses newest first` (orden de nombres `Lavado, Parking, Peajes, Seguro…`, con `parking` creado después de `tolls` el mismo día). Montaje en la ficha cubierto por LM (`renderApp('/vehicles/…')`) y por `camera-restore-handler.test.tsx`.
- R2: [x] ES › `shows category, title or category name, date and amount of each expense` (badge `SPAN` + `STRONG` con la categoría si no hay título, `fecha · importe` formateados) · EX › `names an expense by its title or its category`.
- R3: [x] ES › `shows the empty message without filter when there are no expenses` (texto exacto, sin `navigation` ni `list`).
- R4: [x] ES › `offers only the present categories and filters the list` (chips `Todas, Seguro, Peajes, Parking, Varios` en orden canónico, `aria-pressed`) · EX › `lists present categories in canonical order`.
- R5: [x] ES › mismo test (tras pulsar «Peajes» solo queda `['Peajes']`) · E2E.
- R6: [x] ES › `falls back to all when the filtered category loses its last expense` (borra el último peaje filtrado → «Todas» pulsada, chip desaparece) · EX › `falls back to all when the category has no expenses`.
- R7: [x] ES › `shows the add button only for active vehicles` (activo lo muestra y abre el diálogo; `sold`/`archived` no, editar/borrar siguen).
- R8: [x] FD › `opens with today, insurance and empty fields` (valor y `max` = `todayIso()`, `insurance`, textos vacíos) · EF › `defaults to today and insurance`.
- R9: [x] FD › `creates an expense, closes the dialog and shows a toast` (cuerpo exacto del POST con `1.234,56` → `1234.56` y `description: null`, diálogo cerrado, toast) · EF › `parses Spanish and English amounts`, `turns blank texts into null` · E2E.
- R10: [x] FD › `shows field errors without calling the API when the form is invalid` (vacío y 0 en importe, título de 121; `aria-invalid`, `role="alert"`, 0 POST) · EF › `rejects a blank, zero or malformed cost`, `rejects a title or description that is too long` (cubre los 2000 de la descripción).
- R11: [x] FD › `prefills the form and sends every field with PATCH when editing` (valores precargados, PATCH con todos los campos y `title: null`, toast, cierre) · ES › `opens the form prefilled when editing an expense`.
- R12: [x] FD › `shows the future-date error on the date field on a 400 without errors` (mensaje, `aria-invalid` en fecha, diálogo abierto) · EF › `maps a 400 without errors to the date field`.
- R13: [x] FD › `shows the generic error when saving fails for another reason` (500 → `common.error` en `alert`, fecha no marcada, diálogo abierto) · EF › `maps any other error to the generic message`.
- R14: [x] ES › `deletes an expense only after confirming` (Cancelar → 0 DELETE; confirmar → 1 DELETE, toast, fila fuera) · E2E.
- R15: [x] ES › `shows the generic error when deleting fails` (toast de error y fila presente).
- R16: [x] ES › `refreshes the list and the stats after saving` (GET expenses 1→2 y GET stats 1→2 con un observador de `statsQuery`).
- R17: [x] VS › `shows the key figures in the user's units and currency` (ayuda con `· otros gastos …`) · VS › `leaves the purchase out of the total breakdown when there is no purchase price` · E2E (`otros gastos 435,60 €` y `420,00 €` tras borrar).
- R18: [x] VS › `shows the key figures…` («Otros gastos por mi» con su valor) · VS › `explains what is missing for each empty figure` («—» y la ayuda de `pending.costPerDistance`).
- R19: [x] VS › `shows expense categories next to maintenance in the category breakdown` (ticks del eje `Seguro, Neumáticos, Aceite, Varios` en orden y las dos series en la leyenda) · VS › `shows the expense categories even without maintenance spending` · CS › `merges…`, `keys and labels each row in its own namespace` (los dos `other`: «Otros» / «Varios»).
- R20: [x] VS › `explains what is missing for each empty chart` (texto exacto, sin `svg`) · CS › `returns no rows without spending`.
- R21: [x] VS › `stacks other expenses in the spending per month` (3 `.recharts-bar` y leyenda `Combustible, Mantenimiento, Otros gastos`) · VS › `explains what is missing for each empty chart` (texto vacío nuevo).
- R22: [x] LM › `vehicle page adds an expense on the device and counts it in the total cost` (alta por la UI, `local.expenses.list` con el gasto, fila visible, «Coste total» 98,50 € y `fetchMock` sin llamadas).
- R23: [x] LO › `es and en define the same keys` (preexistente) · LO › `defines a label for every expense category` (no vacías en ambos idiomas, `other` = «Varios» / «Miscellaneous», decisión de Gate 1).

## Tasks
- T1..T16: [x] (todas marcadas en `specs/vehicle-expenses-web/tasks.md`; los tests extra que añade el implementer están declarados en el informe).

## Checkpoints
- C1: [x] `pnpm harness` OK, una sola feature activa (#88 `in_progress`), rama `feat/vehicle-expenses-web`.
- C2: [x] Spec con los tres ficheros, EARS con un `DEBE` por requirement y tabla de acceptance completa; tasks `[x]`; cada R<n> con test leído.
- C3: [x] El diff solo toca los ficheros de la tabla de `design.md` (más `progress/`). Las dos desviaciones (color e `interval`/`height`) quedan dentro de `stats-charts.tsx`, previsto en el diseño; no hay refactors ajenos.
- C4: [x] Sin cambios de API/BD (fuera de alcance). Web: dominio en `features/expenses/`, `queryOptions` sobre `dataSource()` (no `api` directo), invalidación en `queries.ts`, textos en `es.json` y `en.json`, `Badge stamp`, `Card`, `FormField`, `AlertDialog` reutilizados.
- C5: [x] Sin `any` ni `@ts-ignore`; fechas `YYYY-MM-DD` (`todayIso`, `input type="date"`); sin `console.log` ni TODOs; sin ficheros subidos.
- C6: [x] `pnpm harness --full` en verde (ejecutado por el reviewer). Los tests afirman cuerpos, órdenes, textos y conteos de peticiones; solo se simula `fetch` y el modo local usa SQLite en memoria. Capturas claro/oscuro/móvil referenciadas en el informe.
- C7: [x] `impl_vehicle-expenses-web.md` con archivos, mapa R→test y verificación; `progress/current.md` al día; la feature no cierra la fase 9 (quedan #89–#93), así que `docs/PLAN.md` no cambia.

## Hallazgos

Ninguno bloqueante.

### Desviaciones declaradas

1. **`COLORS.expenses = var(--color-warning)` en lugar de `--color-deep`** (`apps/web/src/features/stats/stats-charts.tsx`). El diseño (Riesgos) permite cambiar a otro token existente si `--color-deep` no contrasta, y el informe lo demuestra con medidas (1,15:1 contra la tarjeta en oscuro, 1,09:1 frente a combustible en claro). Revisé los tokens de `index.css`: `--color-success` (`#355647` / `#a8d9cd`) se confunde con combustible y mantenimiento en los dos temas; `--color-muted-foreground` es el color de los ejes y en oscuro queda muy cerca de combustible; `--color-destructive` comunica error, peor que aviso. `--color-warning` es el único token existente que se distingue de las dos series verdes y de la tarjeta, y en la captura `final-dark-stats.png` se lee bien. Que sea un token semántico en una serie de datos no viola nada: en la gráfica no hay ningún estado de aviso con el que se pueda confundir. **Aceptado.** Hay una nota en «Avisos».
2. **`interval={0}` en el eje Y y prop opcional `height` en `ChartFigure`.** Sin `interval={0}`, Recharts se saltaba etiquetas con 9 filas y R19 pide la etiqueta de cada categoría, así que el cambio hace falta para cumplir el spec. `height` es opcional y por defecto vale `CHART_HEIGHT`, así que las otras tres gráficas no cambian. Además, `initialDimension` usa la misma altura. **Aceptado.**

### Badge de categoría de ancho variable (observación del leader)

`expenses-section.tsx` usa en la fila exactamente las mismas clases que `maintenance-timeline.tsx:181-183` y `fuel-logs-section.tsx:77-79` (`grid-cols-[auto_1fr_auto]`, `min-w-20`). En mantenimientos pasa lo mismo con «INSPECCIÓN», «NEUMÁTICOS» o «REPARACIÓN», que también superan `min-w-20`. Es coherente con la ficha y no viola el spec (R2 solo pide el `Badge stamp`) ni el diseño, que pide la fila de dos líneas de repostajes. En móvil el badge va en su propia línea y no desalinea nada (`final-mobile-section.png`). **No bloquea**: si se quiere arreglar, tiene que hacerse en las tres secciones a la vez, en otra feature.

## Avisos para el humano (no bloquean)
- **Alineación de títulos en escritorio:** «IMPUESTOS» desplaza unos 18 px el título de su fila (`final-light-section.png`). Mantenimientos tiene el mismo comportamiento. Una feature de pulido podría dar a la columna del badge un ancho común (p. ej. `subgrid` o un `min-w` mayor) en repostajes, mantenimientos y gastos.
- **Color ámbar de la serie:** si más adelante `--color-warning` se usa en estadísticas para avisos de verdad (umbrales, alertas), convendría un token propio `--chart-*` en `index.css`. Hoy no hay conflicto.
- **Importe 0:** sale el genérico «El valor no es válido.» (`positive()` produce un `too_small` exclusivo que `i18n/zod.ts` no traduce). Cumple R10; ya pasa con otros campos `positive()`.
- **Singular/plural en inglés:** `tax` es «Tax» y las demás van en plural («Tolls», «Fines»); en español es «Impuestos». Detalle de copy.
- **Radio superior en «Gasto por mes»:** ahora el radio lo lleva la serie de gastos. En un mes sin gastos, el segmento superior (mantenimiento o combustible) se queda sin esquinas redondeadas. Antes pasaba lo mismo con mantenimiento; es solo cosmético.
- **E2E con fechas fijas** (`2026-10-01`, `2026-10-15`): sirven mientras sean pasadas, y ya lo son.

## Cambios requeridos
Ninguno.
