# Review — #27 mobile-nav-menu

**Veredicto:** APPROVED

## Trazabilidad requirements ↔ tests

Todos en `apps/web/src/features/navigation/app-navigation.test.tsx` › `AppNavigation`, salvo R14.

- R1: [x] `:84` › `shows only the brand, the bell and the menu button below md` (marca, campana y botón presentes; ninguno de los 4 enlaces ni «Cerrar sesión»; sin `dialog`)
- R2: [x] `:84` (`aria-expanded="false"` en el botón «Abrir menú») + `:95` (`aria-expanded="true"` con el panel abierto, sobre la referencia tomada antes de abrir) + `:114` (vuelve a `false` al cerrar)
- R3: [x] `:95` › `opens the menu with every destination…` (`dialog` con nombre «Menú», 4 enlaces y «Cerrar sesión», cada uno con texto y `svg`)
- R4: [x] `:95` (`aria-current="page"` solo en «Vehículos», ausente en los demás). El resaltado visual lo da `data-status=active`, que TanStack pone a la vez; confirmado en la captura `after-mobile-375-dark-open.png`
- R5: [x] `:114` › `navigates and closes the menu when choosing an option` (se ve «Página de ajustes», no hay `dialog`)
- R6: [x] `:126` › `closes the menu with Escape…`
- R7: [x] `:136` › `closes the menu when clicking outside` (clic sobre el overlay, comprobado que está fuera del `dialog`)
- R8: [x] `:150` › `closes the menu when the route changes` (`router.navigate` externo → se ve la página nueva, no hay `dialog`)
- R9: [x] `:161` › `keeps focus inside the menu while open` (12 Tab y 12 Mayús+Tab con 6 enfocables; `activeElement` dentro del `dialog` tras cada pulsación)
- R10: [x] `:114`, `:126`, `:136`, `:150` (foco en «Abrir menú» tras cada tipo de cierre)
- R11: [x] `:177` › `logs out from the menu` (exactamente un `POST /api/auth/sign-out`, página `/login` visible, `dashboard-probe` presente antes y `undefined` después)
- R12: [x] `:196` › `shows the sidebar and no menu button from md up` (4 enlaces con texto, «Cerrar sesión», campana) + `Sidebar` con las mismas clases que el `<aside>` de `main` (comparado en el diff) + capturas de escritorio antes/después idénticas píxel a píxel
- R13: [x] `:196` (`queryByRole('button', { name: 'Abrir menú' })` es `null`)
- R14: [x] `apps/web/src/i18n/locales.test.ts` › `es and en define the same keys`; `nav.openMenu`, `nav.closeMenu` y `nav.menu` están en ambos idiomas

## Tasks
- T1..T11: [x]

## Checkpoints
- C1: [x] `pnpm harness` OK; una sola feature activa (#27 `in_progress`); rama `feat/mobile-nav-menu`.
- C2: [x] requirements/design/tasks presentes, EARS con un `DEBE`/`NO DEBE` por R, tabla que cubre los acceptance; tasks `[x]`; cada R con su test leído.
- C3: [x] El diff coincide con la tabla de archivos de `design.md`. Única excepción: una línea `mockMediaQuery(true)` en `settings-page.test.tsx` y `use-user-locale.test.tsx`, justificada en `impl_mobile-nav-menu.md` (montan el `routeTree` completo y jsdom no tiene `matchMedia`); no cambia lo que comprueban.
- C4: [x] Sin cambios de API/BD/shared. Web: código en `features/navigation/` y `features/auth/`, primitivo en `components/ui/sheet.tsx` reutilizando `overlayClassName`, `Button` y `Brand`; textos en `es.json` y `en.json`.
- C5: [x] Sin `any`, `@ts-ignore`, `console.log` ni TODOs. No aplican fechas ni ficheros.
- C6: [x] `pnpm harness --full` en verde ejecutado por mí (shared 75, api 194, web 260; exit 0). Tests con resultados concretos y solo `fetch` simulado. Capturas claro/oscuro/móvil (cerrado y abierto) y escritorio antes/después referenciadas en el informe.
- C7: [x] `impl_mobile-nav-menu.md` con archivos, mapa R→test y salida; `progress/current.md` describe la sesión; no se cierra fase ni cambia ninguna decisión de `PLAN.md`.

## Hallazgos

Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- Las capturas están en el scratchpad de la sesión (`/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/95448a3a-7dcd-46aa-9af8-9a4a6730df97/scratchpad/shots/`), que es efímero: si quieres conservarlas, cópialas antes de cerrar la sesión.
- El informe cuenta que, durante la depuración, un test envió un `POST /api/auth/sign-out` sin cookie al `pnpm dev` real de `localhost:3000`. No tuvo efecto, pero muestra que `authClient` puede saltarse `mockApi` en cualquier test que lo use sin el shim `vi.hoisted`. Podría valer la pena llevar ese shim a `src/test/setup` en otra feature.
- `pnpm test` en web saca muchos avisos `Not implemented: Window's scrollTo()` de jsdom (ruido, sin fallos).
- El `Sidebar` conserva variantes sin `md:` que ya no se aplican por debajo de `md`; el diseño lo prevé (R12) para no tocar el aspecto de escritorio.

## Cambios requeridos

Ninguno.
