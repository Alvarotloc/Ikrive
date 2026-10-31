# Implementación — mobile-nav-menu (#27)

Rama `feat/mobile-nav-menu`. Tasks T1–T11 marcadas en `specs/mobile-nav-menu/tasks.md`. Sin commits.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `apps/web/src/lib/use-media-query.ts` (nuevo) | `useMediaQuery(query)` con `useSyncExternalStore` sobre `matchMedia` (evento `change`) y `DESKTOP_QUERY = '(min-width: 48rem)'`, con un comentario que lo liga al breakpoint `md`. |
| `apps/web/src/test/render.tsx` | Helper `mockMediaQuery(matches)` (`vi.stubGlobal('matchMedia', …)` con un `MediaQueryList` mínimo). |
| `apps/web/src/components/ui/dialog.tsx` | `overlayClassName` exportado. |
| `apps/web/src/components/ui/sheet.tsx` (nuevo) | `Sheet`, `SheetTrigger`, `SheetClose`, `SheetTitle`, `SheetContent` sobre el `Dialog` de `radix-ui` (Portal + Overlay + Content lateral derecho, clases del diseño). |
| `apps/web/src/features/auth/use-logout.ts` (nuevo) | `useLogout()`: `authClient.signOut()`, `queryClient.clear()` (vía `useQueryClient`) y `navigate({ to: '/login' })`. |
| `apps/web/src/features/navigation/nav-items.ts` (nuevo) | `navItems` movido sin cambios desde `_app.tsx`. |
| `apps/web/src/features/navigation/app-navigation.tsx` (nuevo) | `AppNavigation` (elige con `useMediaQuery(DESKTOP_QUERY)`), `Sidebar` (el `<aside>` de antes con las mismas clases, ahora con `useLogout`), `MobileHeader` (marca + campana + menú) y `MobileNavMenu` (estado controlado, disparador «Abrir menú», panel con título «Menú», botón «Cerrar menú», `<nav aria-label="Menú">` con las cuatro opciones con icono + texto que cierran al hacer clic, «Cerrar sesión», y `router.subscribe('onBeforeNavigate', …)` para cerrar en cualquier navegación). |
| `apps/web/src/features/navigation/app-navigation.test.tsx` (nuevo) | 9 tests de componente (abajo). |
| `apps/web/src/routes/_app.tsx` | El `<aside>` pasa a `<AppNavigation />`; fuera `navItems`, `logout` y los imports que dejaron de usarse. Contenedor y `<main>` sin cambios. |
| `apps/web/src/i18n/locales/{es,en}.json` | `nav.openMenu`, `nav.closeMenu`, `nav.menu`. |
| `apps/web/src/features/settings/settings-page.test.tsx`, `use-user-locale.test.tsx` | `mockMediaQuery(true)` en su helper de render (ver desviaciones). |

## Trazabilidad

Todos los tests están en `apps/web/src/features/navigation/app-navigation.test.tsx` › `AppNavigation`, salvo R14.

| R | Test |
|---|---|
| R1 | `shows only the brand, the bell and the menu button below md` |
| R2 | `shows only the brand, the bell and the menu button below md` (`aria-expanded="false"`), `opens the menu with every destination and highlights the active route` (`aria-expanded="true"`) |
| R3 | `opens the menu with every destination and highlights the active route` |
| R4 | `opens the menu with every destination and highlights the active route` (`aria-current="page"` solo en «Vehículos») |
| R5 | `navigates and closes the menu when choosing an option` |
| R6 | `closes the menu with Escape and returns focus to the button` |
| R7 | `closes the menu when clicking outside` |
| R8 | `closes the menu when the route changes` |
| R9 | `keeps focus inside the menu while open` |
| R10 | `closes the menu with Escape and returns focus to the button`, `navigates and closes the menu when choosing an option`, `closes the menu when clicking outside`, `closes the menu when the route changes` (foco en «Abrir menú») |
| R11 | `logs out from the menu` (`POST /api/auth/sign-out`, página `/login`, caché vacía) |
| R12 | `shows the sidebar and no menu button from md up` + capturas de escritorio antes/después idénticas píxel a píxel |
| R13 | `shows the sidebar and no menu button from md up` |
| R14 | `apps/web/src/i18n/locales.test.ts` › `es and en define the same keys` |

## Revisión visual (T10)

Build del SPA servido por una API aislada (puerto 3419, BD temporal en el scratchpad, usuario sembrado), playwright-core + `/usr/bin/google-chrome`, página `/vehicles`. No se tocó el `pnpm dev` que ya estaba corriendo.

Capturas en `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/95448a3a-7dcd-46aa-9af8-9a4a6730df97/scratchpad/shots/`:

- Escritorio 1280×800 antes/después: `before-desktop-light.png`, `after-desktop-light.png`, `before-desktop-dark.png`, `after-desktop-dark.png`. **Iguales píxel a píxel** en claro y oscuro (`ImageChops.difference(...).getbbox() == None`).
- Móvil 375 px antes: `before-mobile-375-light.png`, `before-mobile-375-dark.png`.
- Móvil 375 px después, panel cerrado: `after-mobile-375-light.png`, `after-mobile-375-dark.png`.
- Móvil 375 px después, panel abierto: `after-mobile-375-light-open.png`, `after-mobile-375-dark-open.png`.

Comprobado en el navegador real: `aria-expanded="true"` al abrir, cuatro enlaces, `aria-current` en «Vehículos», al elegir «Ajustes» navega, el panel se cierra y el foco vuelve a «Abrir menú». Sin desbordamiento horizontal ni errores de consola en ninguna variante. Tras la primera ronda, el texto de «Cerrar sesión» se alineó con el de las opciones (`gap-3` en el botón).

## `pnpm harness --full`

```
[OK]    27 features: 26 done, 0 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #27 mobile-nav-menu (in_progress)
[OK]    Rama actual: feat/mobile-nav-menu
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared  Tests  75 passed (75)
apps/api         Tests  194 passed (194)
apps/web         Tests  260 passed (260)
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones y notas

1. **`mockMediaQuery(true)` en `settings-page.test.tsx` y `use-user-locale.test.tsx`.** No están en la tabla de archivos del diseño. Montan el `routeTree` completo, así que renderizan `_app` → `AppNavigation` → `matchMedia`, que jsdom no tiene. Fallaban 8 tests. Se arreglan con una línea en el helper de render de cada archivo, que fija el layout de escritorio (el mismo que veían antes). No cambia lo que comprueban.
2. **Riesgo de `fetch` confirmado (previsto en el diseño).** `createAuthClient` pasa `customFetchImpl: fetch` a better-fetch al importarse, así que el `fetch` que stubea `mockApi` en cada test no recibía la petición de `signOut`. Durante la depuración, la petición de jsdom llegó al API de desarrollo real en `localhost:3000` (un `sign-out` sin cookie, sin efecto). Se aplicó la mitigación del diseño: `vi.hoisted` en `app-navigation.test.tsx` instala, antes de cualquier import, un `fetch` que delega en el `globalThis.fetch` vigente en cada llamada. No se tocó código de producción.
3. **Disparador oculto con el panel abierto.** Radix (`hideOthers`) saca el resto de la página del árbol accesible mientras el modal está abierto, así que `aria-expanded="true"` se comprueba sobre una referencia al botón tomada antes de abrir. Es el comportamiento esperado.
4. **Clic fuera.** Se hace sobre el overlay con `userEvent.setup({ pointerEventsCheck: 0 })`, solo en ese test, como prevé el diseño.
