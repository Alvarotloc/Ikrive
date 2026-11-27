# Review — #97 list-badge-column-alignment

**Veredicto:** APPROVED

Feature `sdd: false`, sin spec. He revisado contra la description y los `acceptance` de `feature_list.json`, `CONTRIBUTING.md` › Diseño, `docs/` y `CHECKPOINTS.md`. Diff revisado entero: `git diff main...HEAD` (solo el commit que añade #97 al backlog) más los cambios sin commitear (4 componentes, `badge-list.ts` nuevo, E2E nuevo, `feature_list.json` → `in_progress`, `progress/`).

## Trazabilidad acceptance ↔ evidencia
- A1 (en escritorio los títulos empiezan en la misma x, es y en, en los cuatro listados): [x] `e2e/tests/list-alignment.spec.ts:21` › `lines up the titles of each list of the vehicle page`. Siembra etiquetas largas (IMPUESTOS, NEUMÁTICOS, REPOSTAJE/TALLER) y cortas, con mantenimientos en dos años, y comprueba `toHaveCount` por listado (así no puede pasar sin filas) y que el conjunto de x de los `strong` tiene tamaño 1. El implementer dice que falla sin el cambio y da las cifras. Para en solo hay mediciones (`after-measurements.json`) y capturas: la tabla del informe cuadra con las capturas que he abierto (`after-expenses-en-light.png` con MISCELLANEOUS, `after-maintenance-es-dark.png` con dos años).
- A2 (móvil sin cambios): [x] He comprobado que las 8 capturas móviles tienen el mismo md5 antes y después. Además el E2E comprueba a 412 px que el badge queda encima del título en gastos, repostajes y mantenimientos.
- A3 (solución común sin anchos por idioma): [x] `apps/web/src/components/ui/badge-list.ts`: columna `auto` + `subgrid`, usada en los cuatro listados. No hay anchos fijos.
- A4 (capturas antes y después en claro, oscuro y móvil): [x] 48 PNG en `shots-97/`, referenciados en el informe.
- A5 (`pnpm harness --full` en verde): [x] Lo he ejecutado y pasa en verde (web 803, api 401, shared 313, db 3).

## Tasks
- No hay `tasks.md` (`sdd: false`). Los pasos del plan de `progress/current.md` están todos hechos.

## Checkpoints
- C1: [x] Arnés en verde, una sola feature activa (#97 `in_progress`), rama `feat/list-badge-column-alignment`.
- C2: [x] No aplica el spec (`sdd: false`). Cada acceptance tiene evidencia concreta (ver arriba).
- C3: [x] El diff solo toca los cuatro listados citados, la utilidad compartida, el E2E y `progress/`. No hay refactors ajenos.
- C4: [x] Web: la utilidad va en `components/ui/`, cerca de `Badge`. No hay textos nuevos (no hace falta i18n) y se sigue usando `Badge stamp`. Sin cambios de API ni de BD.
- C5: [x] Sin `any`, `@ts-ignore`, `console.log` ni TODOs. Comentarios en inglés y con sentido.
- C6: [x] `pnpm harness --full` en verde. He ejecutado `pnpm test:e2e` (build de producción + Playwright): 8 passed, el nuevo incluido. CI lo ejecuta (`.github/workflows/ci.yml:43`, job `e2e`). Las capturas de claro, oscuro y móvil están en el informe.
- C7: [x] `impl_list-badge-column-alignment.md` tiene archivos, mapa acceptance → evidencia y la salida de la verificación. `current.md` está al día. `PLAN.md` no necesita cambios (no cierra fase ni cambia decisiones).

## Hallazgos
No hay hallazgos bloqueantes. Lo que me pediste verificar:

1. **Semántica, accesibilidad y orden del DOM en mantenimientos.** El árbol sigue siendo `section > h3 + ol > li`. Solo se añade un `div` genérico que envuelve los años. `grid`/`subgrid` no cambia el árbol de accesibilidad (a diferencia de `display: contents`), y tampoco cambian roles, `aria-label`, orden del DOM ni orden de tabulación. Al `h3` se le añade `sm:col-span-full`. El cambio de `gap-1` a `gap-y-1` en `section` no afecta a móvil (allí es una sola columna) y en escritorio hace que se herede el `gap-x-3` de la lista. El `div` con `grid gap-y-5` reproduce la separación que antes daba `CardContent grid gap-5`. Las capturas móviles idénticas lo confirman.
2. **Robustez del E2E.** Compara x redondeadas *entre filas del mismo listado*, no contra valores absolutos, así que no depende de fuentes, antialiasing ni del ancho exacto de las etiquetas. La ruta `heading h2 → ../..` depende de la estructura de `Card`, pero es estable y la usan ya otros tests. El test es determinista (datos propios con `uniquePlate`).
3. **Otros usos del patrón.** He buscado `grid-cols-[auto_1fr…` y `Badge variant="stamp"` en `apps/web/src`. `schedules-section.tsx` ya alinea con una columna fija (`9rem`, dos badges apilados), y `report-shares`, `channels`, `dossier` y `user-row` no usan el badge como columna inicial de una lista. No falta ningún listado que debiera entrar.

## Avisos para el humano (no bloquean)
- **Soporte de `subgrid`.** `grid-template-columns: subgrid` llega en Chrome/Android WebView 117, Safari 16 (incluido el PWA en iOS) y Firefox 71. Tailwind v4 ya exige como base Chrome 111 / Safari 16.4 / Firefox 128 (oklch, `@property`, cascade layers), así que el único hueco es Chrome/WebView 111–116. El proyecto no tiene `browserslist` ni `build.target`, y la APK declara `minSdkVersion = 24` (`apps/mobile/android/variables.gradle`). En Android 7+ la WebView se actualiza desde Play, y `docs/mobile.md` no documenta una WebView mínima. **Si no hay soporte**, el navegador descarta la declaración `sm:grid-cols-subgrid` y se aplica la plantilla base de cada fila: en gastos, repostajes y mantenimientos, la disposición móvil (badge y acciones arriba, texto debajo) también a anchos grandes; en odómetro, la rejilla por fila de antes (desalineada, como hoy). Los grupos por año de mantenimientos quedan en una columna. No se pierde contenido ni funcionalidad. Además, a 640 px o más la APK casi nunca llega a ese caso.
- El E2E solo cubre `es`. La alineación en `en` se apoya en las mediciones y capturas del informe. Como la solución no depende del idioma (columna `auto`), lo acepto.
- En odómetro, en móvil, los títulos siguen sin alinearse (badge en línea). Es a propósito, para cumplir A2.
- Como propone el implementer, al cerrar la feature conviene añadir `badge-list` (`badgeListClassName` / `badgeListRowClassName`) a la lista de piezas reutilizables de `CONTRIBUTING.md` › Diseño.

## Cambios requeridos
Ninguno.
