# Implementación: #97 list-badge-column-alignment

Feature `sdd: false`: no hay spec. Guía: `acceptance` de `feature_list.json` y plan de `progress/current.md`.

## Causa

Cada fila (`li`) de los cuatro listados era su propia rejilla `grid-cols-[auto_1fr_auto]` (en odómetro, a todos los anchos; en el resto, desde `sm`). La columna `auto` del badge se calculaba **por fila**: con `min-w-20` (80 px) solo las etiquetas cortas comparten ancho, y las que pasan de 80 px («IMPUESTOS», «INSPECCIÓN», «NEUMÁTICOS», «REPOSTAJE», «MISCELLANEOUS», «INSURANCE», «INSPECTION») empujan su título a la derecha.

## Solución

Una utilidad compartida, `apps/web/src/components/ui/badge-list.ts`, con dos clases:

- `badgeListClassName` (`sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-3`): desde `sm` la lista es una rejilla de tres columnas (badge, texto, acciones).
- `badgeListRowClassName` (`sm:col-span-full sm:grid sm:grid-cols-subgrid`): desde `sm` cada fila ocupa las columnas de la lista con CSS `subgrid`. La columna del badge mide lo que la etiqueta más larga de **toda la lista**, sea cual sea el idioma, así que todos los títulos empiezan en la misma x. No hay anchos fijos por idioma.

Por debajo de `sm` las clases no hacen nada: cada fila conserva su rejilla de siempre (en otros gastos, repostajes y mantenimientos, el badge y las acciones en la primera línea y el texto debajo; en odómetro, el badge en línea como hasta ahora).

**Listado agrupado (mantenimientos):** la alineación es **por listado completo**, no por año. Los grupos `section` y su `ol` también llevan `badgeListRowClassName` (subgrid anidado) dentro de un `div` con `badgeListClassName`, así que la columna del badge se comparte entre todos los años. El `h3` del año ocupa la fila entera (`sm:col-span-full`). Está documentado en el JSDoc de `badge-list.ts` y en un comentario en `maintenance-timeline.tsx`.

Como efecto, en escritorio todos los badges de una lista se estiran al ancho de la columna (el badge ya tenía `sm:justify-self-auto` + `justify-center`, en odómetro estira siempre), así que también tienen el mismo ancho entre sí. No cambian textos, roles, `aria-label`, orden del DOM ni comportamiento.

Otros usos de `Badge variant="stamp"` revisados: `schedules-section.tsx` ya alinea con una columna fija `sm:grid-cols-[9rem_1fr_auto]` (dos badges apilados, otro patrón, fuera del alcance de esta feature); `user-row`, `channels-section`, `report-shares-section` y `dossier` no usan el badge como columna inicial de una fila de lista.

## Archivos

| Archivo | Cambio |
|---|---|
| `apps/web/src/components/ui/badge-list.ts` (nuevo) | `badgeListClassName` y `badgeListRowClassName`, con JSDoc (también la decisión de agrupar por listado completo). |
| `apps/web/src/features/expenses/expenses-section.tsx` | `ol` con `badgeListClassName`; `li` con `badgeListRowClassName` en lugar de `sm:grid-cols-[auto_1fr_auto]`. |
| `apps/web/src/features/fuel/fuel-logs-section.tsx` | Igual. |
| `apps/web/src/features/maintenance/maintenance-timeline.tsx` | Los grupos por año van dentro de un `div` `grid gap-y-5` + `badgeListClassName`; `section` (`gap-1` pasa a `gap-y-1` para no fijar un gap de columna distinto en el subgrid) y `ol` con `badgeListRowClassName`; `h3` con `sm:col-span-full`; `li` como en gastos. |
| `apps/web/src/features/vehicles/odometer-timeline.tsx` | `ol` con `badgeListClassName`; `li` conserva `grid-cols-[auto_1fr_auto]` (móvil) y añade `badgeListRowClassName`. |
| `e2e/tests/list-alignment.spec.ts` (nuevo) | E2E: siembra un vehículo con etiquetas cortas y largas en los cuatro listados (mantenimientos en dos años) y comprueba que en escritorio (1440 px) todos los títulos de cada listado tienen la misma x, y que en móvil (412 px) el badge queda encima del título en gastos, repostajes y mantenimientos. |
| `progress/current.md` | Bitácora. |

## Tests / trazabilidad

| Acceptance | Evidencia |
|---|---|
| Títulos alineados en escritorio, es y en, en los cuatro listados | `e2e/tests/list-alignment.spec.ts › lines up the titles of each list of the vehicle page` (es). Comprobado que **falla sin el cambio** (`odometer.title: 439, 456, 456, 439, …`, tamaño 2) y pasa con él. Para en: mediciones de abajo. |
| Móvil sin cambios | Mismo E2E (badge encima del título) + capturas móviles antes/después **idénticas píxel a píxel** (md5) y mediciones móviles idénticas en es y en. |
| Solución común sin anchos por idioma | `apps/web/src/components/ui/badge-list.ts`, usado por los cuatro listados; columna `auto` + `subgrid`. |
| Capturas antes/después claro, oscuro, móvil | Rutas abajo. |
| `pnpm harness --full` en verde | Salida abajo. |

Los tests existentes (componentes y E2E `expenses`, `maintenance`, `fuel-stats`, `vehicles`…) pasan sin tocarlos. jsdom no calcula layout, por eso la protección es un E2E (no corre en `pnpm test`; se ejecuta con `pnpm test:e2e`). Suite E2E completa: 8 passed.

## Mediciones (x del título por fila, px, viewport 1440 px)

Datos sembrados por `shoot.mjs` (scratchpad). Escritorio en claro; oscuro da las mismas cifras.

| Listado | Idioma | Antes | Después |
|---|---|---|---|
| Odómetro | es | Manual 439.3 · Repostaje ×3 456.5 · Taller ×4 439 | todas 456.5 |
| Odómetro | en | Manual 439.3 · Fuel ×3 439 · Service ×4 439 | todas 439.3 |
| Repostajes | es | Lleno 439 · Parcial 439 · Lleno 439 | todas 439 |
| Repostajes | en | Full 439 · Partial 439 · Full 439 | todas 439 |
| Otros gastos | es | Parking 440 · Varios 439 · Peajes 439 · Seguro 439 · **Impuestos 459.5** | todas 459.5 |
| Otros gastos | en | Parking 440 · **Miscellaneous 495.4** · Tolls 439 · **Insurance 458.5** · Tax 439 | todas 495.4 |
| Mantenimientos (2026 + 2025) | es | Batería 439 · Frenos 439 · **Neumáticos 470.2** · **Inspección 464.2** · Aceite 439 | todas 470.2 |
| Mantenimientos (2026 + 2025) | en | Battery 439 · Brakes 439 · Tires 439 · **Inspection 462.2** · Oil 439 | todas 462.2 |

Móvil (Pixel 7): sin cambios. Gastos, repostajes y mantenimientos: título en x = 45 en todas las filas con el badge encima, antes y después. Odómetro: badge en línea, igual que antes (es 137.3 / 154.5 / 137; en 137.3 / 137). En odómetro no se alinea en móvil a propósito: el acceptance pide que la disposición móvil no cambie.

Mediciones completas: `before-measurements.json` y `after-measurements.json` en la carpeta de capturas.

## Capturas

Carpeta: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/7244f005-ff0e-4807-8abd-a19fb5981aa6/scratchpad/shots-97/`

Nombre: `{before|after}-{odometer|fuel|expenses|maintenance}-{es|en}-{light|dark|mobile}.png` (48 PNG). Por ejemplo:

- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/7244f005-ff0e-4807-8abd-a19fb5981aa6/scratchpad/shots-97/before-maintenance-es-light.png`
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/7244f005-ff0e-4807-8abd-a19fb5981aa6/scratchpad/shots-97/after-maintenance-es-light.png`
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/7244f005-ff0e-4807-8abd-a19fb5981aa6/scratchpad/shots-97/after-expenses-en-dark.png`
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/7244f005-ff0e-4807-8abd-a19fb5981aa6/scratchpad/shots-97/after-maintenance-es-mobile.png`

Las capturas son de la tarjeta de cada listado. En móvil, la cabecera fija de la app tapa parte de algunas tarjetas largas (pasa igual antes y después y no afecta a las mediciones).

Servidor: build de producción (`pnpm build`) con `e2e/server.mjs` en `E2E_PORT=3197` y un `DATA_DIR` temporal, reiniciado tras reconstruir la web. Ya está parado (puerto 3197 libre; su `DATA_DIR` se borra al salir). Script: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/7244f005-ff0e-4807-8abd-a19fb5981aa6/scratchpad/shoot.mjs`.

## `pnpm harness --full`

```
[OK]    97 features: 91 done, 5 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #97 list-badge-column-alignment (in_progress)
[OK]    Rama actual: feat/list-badge-column-alignment
[OK]    pnpm lint
[OK]    pnpm typecheck
e2e test:            Tests    6 passed (6)
packages/shared test: Tests 313 passed (313)
packages/db test:     Tests   3 passed (3)
apps/web test:        Tests 803 passed (803)
apps/api test:        Tests 401 passed (401)
[OK]    pnpm test
[OK]    Arnés en verde.
```

`pnpm --filter @ikrive/e2e test:e2e` (suite completa, con el nuevo spec): 8 passed.

## Desviaciones

- Ninguna sobre los acceptance. Decisiones propias: (1) en mantenimientos se alinea el listado completo (años incluidos), no cada grupo; (2) en odómetro la alineación solo aplica desde `sm`, para no cambiar la disposición móvil; (3) la columna central pasa de `1fr` a `minmax(0,1fr)` en la rejilla compartida para que un título largo no ensanche la lista (los textos ya tenían `min-w-0` y `break-words`).
- Se propone, para quien cierre la feature, añadir `badge-list` a la lista de piezas reutilizables de `CONTRIBUTING.md` › Diseño. No lo he tocado porque queda fuera del alcance de la feature.
- No se ha commiteado nada.
