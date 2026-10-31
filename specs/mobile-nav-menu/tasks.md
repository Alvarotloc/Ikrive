# Tasks — mobile-nav-menu

- [ ] T1 — `apps/web/src/lib/use-media-query.ts` (`useMediaQuery` con `useSyncExternalStore` y `DESKTOP_QUERY = '(min-width: 48rem)'`, con comentario sobre el breakpoint `md`) y el helper `mockMediaQuery(matches)` en `apps/web/src/test/render.tsx`. Cubre: R1, R12, R13.
- [ ] T2 — Exportar `overlayClassName` en `apps/web/src/components/ui/dialog.tsx` y crear `apps/web/src/components/ui/sheet.tsx` (`Sheet`, `SheetTrigger`, `SheetClose`, `SheetTitle`, `SheetContent`) sobre el `Dialog` de `radix-ui`. Cubre: R3, R6, R7, R9, R10.
- [ ] T3 — Extraer `useLogout()` a `apps/web/src/features/auth/use-logout.ts` y `navItems` a `apps/web/src/features/navigation/nav-items.ts`, sin cambiar su comportamiento. Cubre: R11, R12.
- [ ] T4 — Claves `nav.openMenu`, `nav.closeMenu` y `nav.menu` en `apps/web/src/i18n/locales/es.json` y `en.json`; el test existente `es and en define the same keys` de `apps/web/src/i18n/locales.test.ts` sigue en verde. Cubre: R14.
- [ ] T5 — `apps/web/src/features/navigation/app-navigation.tsx`: `AppNavigation` (elige con `useMediaQuery(DESKTOP_QUERY)`), `Sidebar` (el `<aside>` actual movido tal cual, con `useLogout`) y `MobileHeader` + `MobileNavMenu` (estado controlado, `SheetTrigger` con `aria-label` «Abrir menú», panel con título, botón cerrar, `<nav>` con las cuatro opciones con icono y texto que cierran al hacer clic, «Cerrar sesión» con `useLogout`, y `router.subscribe('onBeforeNavigate', …)` para cerrar al cambiar de ruta). Cubre: R1, R2, R3, R4, R5, R8, R11, R12, R13.
- [ ] T6 — `apps/web/src/routes/_app.tsx`: sustituir el `<aside>` por `<AppNavigation />` y quitar `navItems`, `logout` e imports sin uso. Cubre: R1, R12.
- [ ] T7 — Tests en `apps/web/src/features/navigation/app-navigation.test.tsx` (router en memoria, `mockApi`, `mockMediaQuery(false)`):
  - `shows only the brand, the bell and the menu button below md`.
  - `opens the menu with every destination and highlights the active route`.

  Cubre: R1, R2, R3, R4.
- [ ] T8 — Tests de cierre y foco en `app-navigation.test.tsx`:
  - `navigates and closes the menu when choosing an option`.
  - `closes the menu with Escape and returns focus to the button`.
  - `closes the menu when clicking outside`.
  - `closes the menu when the route changes`.
  - `keeps focus inside the menu while open`.

  Cubre: R5, R6, R7, R8, R9, R10.
- [ ] T9 — Test `logs out from the menu` en `app-navigation.test.tsx` (`POST /auth/sign-out` en `mockApi`, página `/login` visible y caché vacía). Cubre: R11.
- [ ] T10 — Test `shows the sidebar and no menu button from md up` en `app-navigation.test.tsx` (`mockMediaQuery(true)`), y revisión visual con `pnpm dev` y playwright-core: capturas de escritorio antes/después (claro y oscuro) y de móvil con el panel cerrado y abierto (claro y oscuro). Rutas en `progress/impl_mobile-nav-menu.md`. Cubre: R12, R13, R1, R3.
- [ ] T11 — Ejecutar `pnpm harness --full` y documentar trazabilidad en `progress/impl_mobile-nav-menu.md`. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14.
