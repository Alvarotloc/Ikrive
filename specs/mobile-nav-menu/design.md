# Design — mobile-nav-menu

Solo `apps/web`. Sin cambios en la API, la BD, `packages/shared` ni dependencias: el panel se construye con el `Dialog` de `radix-ui`, que ya usa `components/ui/dialog.tsx`.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| web/lib | `apps/web/src/lib/use-media-query.ts` (nuevo) | `useMediaQuery(query)` con `useSyncExternalStore` sobre `window.matchMedia` (suscripción a `change`). Exporta `DESKTOP_QUERY = '(min-width: 48rem)'`, el mismo umbral que `md:` en Tailwind 4. |
| web/ui | `apps/web/src/components/ui/dialog.tsx` | Exportar `overlayClassName` para reutilizarlo. |
| web/ui | `apps/web/src/components/ui/sheet.tsx` (nuevo) | Panel lateral sobre `Dialog` de Radix: `Sheet = Root`, `SheetTrigger`, `SheetClose`, `SheetTitle` y `SheetContent` (Portal + Overlay con `overlayClassName` + Content `fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col gap-2 border-l bg-card p-5 text-card-foreground shadow-float focus:outline-none`). |
| web/feature | `apps/web/src/features/auth/use-logout.ts` (nuevo) | `useLogout()`: el `logout` que hoy vive en `_app.tsx` (`authClient.signOut()`, `queryClient.clear()`, `navigate({ to: '/login' })`), con `useQueryClient()` en vez del contexto de la ruta. Lo usan la barra lateral y el panel. |
| web/feature | `apps/web/src/features/navigation/nav-items.ts` (nuevo) | El array `navItems` que hoy está en `_app.tsx`, sin cambios. |
| web/feature | `apps/web/src/features/navigation/app-navigation.tsx` (nuevo) | `AppNavigation`: `useMediaQuery(DESKTOP_QUERY) ? <Sidebar /> : <MobileHeader />`. `Sidebar` es el `<aside>` actual de `_app.tsx` movido tal cual (mismas clases). `MobileHeader` es la cabecera nueva con `MobileNavMenu`. |
| web/feature | `apps/web/src/features/navigation/app-navigation.test.tsx` (nuevo) | Tests de componente (abajo). |
| web/route | `apps/web/src/routes/_app.tsx` | El `<aside>` se sustituye por `<AppNavigation />`. Se quitan `navItems`, `logout` y los imports que dejan de usarse. El contenedor (`glow-shell … md:grid-cols-[16rem_1fr]`) y `<main>` no cambian. |
| web/test | `apps/web/src/test/render.tsx` | Helper `mockMediaQuery(matches: boolean)`: `vi.stubGlobal('matchMedia', …)` con un `MediaQueryList` mínimo. jsdom no implementa `matchMedia`; el setup ya llama a `vi.unstubAllGlobals()`. |
| i18n | `apps/web/src/i18n/locales/{es,en}.json` | `nav.openMenu` («Abrir menú» / «Open menu»), `nav.closeMenu` («Cerrar menú» / «Close menu»), `nav.menu` («Menú» / «Menu»). Las opciones reutilizan `nav.dashboard`, `nav.vehicles`, `nav.odometer`, `nav.settings`, `nav.logout`. |

## Tipos y firmas

```ts
// lib/use-media-query.ts
export const DESKTOP_QUERY = '(min-width: 48rem)';
export function useMediaQuery(query: string): boolean;

// features/auth/use-logout.ts
export function useLogout(): () => Promise<void>;

// features/navigation/app-navigation.tsx (sin props; necesita RouterProvider y QueryClientProvider)
export function AppNavigation(): JSX.Element;
```

## UI

- **Cabecera móvil** (`<header>` sticky, mismas clases de fondo/borde que el `aside` actual en móvil: `sticky top-0 z-10 flex items-center justify-between border-b bg-card/90 px-4 py-3 backdrop-blur`): a la izquierda el `Link` a `/` con `Brand`; a la derecha `NotificationBell` y el disparador.
- **Disparador:** `SheetTrigger asChild` + `Button variant="ghost" size="icon"` con el icono `Menu` de lucide y `aria-label={t('nav.openMenu')}`. Radix pone `aria-expanded`, `aria-controls` y `aria-haspopup="dialog"`.
- **Panel** (lado derecho, junto al botón): `SheetTitle` visible «Menú» (`font-display`) y un `SheetClose` con icono `X` y `aria-label={t('nav.closeMenu')}`; debajo `<nav aria-label={t('nav.menu')}>` con las cuatro opciones de `navItems` (icono + texto siempre visible, `activeOptions={{ exact: to === '/' }}`, mismas clases `data-[status=active]:…` que la barra lateral, altura mínima 44 px para el dedo) y, separado por un borde, el botón «Cerrar sesión» (`Button variant="ghost"`, icono `LogOut`, `justify-start`). El `Link` de TanStack ya pone `aria-current="page"` en la opción activa. `aria-describedby={undefined}` en el `Content` para que Radix no avise por la falta de descripción.
- **Modo oscuro:** solo tokens (`bg-card`, `border`, `bg-accent`, `overlayClassName`); nada específico.
- **Escritorio:** el `<aside>` actual movido sin tocar sus clases. Las variantes sin `md:` que ya no se usan por debajo de `md` quedan inertes, pero no se limpian para no arriesgar la apariencia (R12).

## Foco y cierre (decisión pedida)

- **Foco atrapado, Escape, clic fuera y vuelta del foco** (R6, R7, R9, R10) los da el `Dialog` modal de Radix: `FocusScope` con `trapped` y `loop`, `DismissableLayer` (Escape y `pointerdown` fuera, incluido el overlay), `onCloseAutoFocus` que devuelve el foco al `Trigger`, además de `aria-modal`, `hideOthers` (el resto de la página queda fuera del árbol accesible) y bloqueo de scroll. Es el mismo primitivo que ya usan los formularios en diálogo de la app, así que no se escribe un focus trap propio ni se añade dependencia.
- **Estado controlado:** `const [open, setOpen] = useState(false)` en `MobileNavMenu`, pasado a `Sheet open/onOpenChange`.
- **Elegir una opción** (R5): `onClick={() => setOpen(false)}` en cada `Link`; navega y cierra en el mismo clic.
- **Cambio de ruta ajeno al panel** (R8, p. ej. «atrás» en Android): `useEffect(() => router.subscribe('onBeforeNavigate', () => setOpen(false)), [router])` con `useRouter()`. Se elige la suscripción al router frente a un `useEffect` sobre `pathname` porque cierra antes de que cargue la ruta nueva (sin panel encima de la página que cambia), cubre también cambios de `search` y evita la dependencia «innecesaria» que biome marca en `useExhaustiveDependencies`. Al cerrarse así el foco vuelve igualmente al disparador, que sigue montado en la cabecera.
- **Paso a escritorio con el panel abierto:** `MobileHeader` se desmonta y el panel con él; no hace falta código extra.

## Tests (`app-navigation.test.tsx`, dom)

Router en memoria como en `notification-bell.test.tsx`: raíz con `<AppNavigation /><Outlet />` y rutas `/`, `/vehicles`, `/odometer`, `/settings` y `/login`, cada una con un texto propio. `mockApi` con `GET /settings`, `GET /notifications` (lista vacía) y, en el test de logout, `POST /auth/sign-out`. `mockMediaQuery(false)` para móvil y `mockMediaQuery(true)` para escritorio.

- `shows only the brand, the bell and the menu button below md`: botón «Abrir menú» con `aria-expanded="false"`, campana y marca; sin enlaces «Vehículos»/«Ajustes» ni «Cerrar sesión» visibles fuera de un diálogo.
- `opens the menu with every destination and highlights the active route`: arranca en `/vehicles`, pulsa el botón → `aria-expanded="true"`, `getByRole('dialog', { name: 'Menú' })` con los cuatro enlaces y «Cerrar sesión», cada uno con su texto y un `svg`; «Vehículos» tiene `aria-current="page"` y los demás no.
- `navigates and closes the menu when choosing an option`: pulsa «Ajustes» → se ve la página de ajustes, no hay `dialog` y el foco está en «Abrir menú».
- `closes the menu with Escape and returns focus to the button`.
- `closes the menu when clicking outside`: clic en el overlay (`document.querySelector('[data-state="open"]:not([role="dialog"])')` o equivalente); si user-event se queja de `pointer-events: none` en `body`, se usa `pointerEventsCheck: 0` solo en ese test.
- `closes the menu when the route changes`: con el panel abierto, `act(() => router.navigate({ to: '/odometer' }))` → no hay `dialog`.
- `keeps focus inside the menu while open`: Tab y Mayús+Tab más veces que elementos enfocables; tras cada pulsación `document.activeElement` está dentro del `dialog`.
- `logs out from the menu`: «Cerrar sesión» → `fetch` recibe `POST /api/auth/sign-out`, se ve la página `/login` y la caché de `queryClient` está vacía.
- `shows the sidebar and no menu button from md up`: con `mockMediaQuery(true)`, `queryByRole('button', { name: 'Abrir menú' })` es `null` y se ven los cuatro enlaces con texto, «Cerrar sesión» y la campana.

R14 lo cubre el test existente `es and en define the same keys` (`apps/web/src/i18n/locales.test.ts`). La igualdad visual de R12 se confirma además con capturas de escritorio antes y después.

## Alternativas descartadas

- **Solo CSS (`md:hidden` / `hidden md:flex`) para elegir cabecera o barra lateral.** No necesita JS, pero jsdom no aplica Tailwind: R1, R12 y R13 solo serían comprobables mirando clases, y el botón seguiría en el DOM (oculto) en escritorio. `useSyncExternalStore` lee `matchMedia` de forma síncrona en el primer render, así que no hay parpadeo en una SPA sin SSR.
- **`DropdownMenu` (ya existe en `components/ui/`).** Daría `role="menu"` con flechas, semántica que la APG de ARIA desaconseja para navegación del sitio, y no es modal: no atrapa el foco como pide el acceptance.
- **Focus trap propio o una librería de drawer (vaul, etc.).** Duplica lo que el `Dialog` de Radix ya resuelve y probado en la app; una dependencia nueva no aporta nada.

## Decisiones a validar (Gate 1)

1. **Panel lateral derecho** (sheet de 18 rem, máx. 85 % del ancho) con overlay, en vez de un desplegable bajo la cabecera.
2. **«Odómetro» usa el texto existente `nav.odometer`** («Kilómetros» / «Mileage»), igual que la barra lateral; no se renombra.
3. **Botón «Cerrar menú» (X) dentro del panel**, además de Escape y el clic fuera, para lectores de pantalla en móvil. No está en el acceptance; es un detalle de diseño sin requirement propio.
4. **El viewport se decide en JS** (`matchMedia('(min-width: 48rem)')`) en vez de con CSS, para que el botón no exista en escritorio y sea testeable.
5. **`logout` se extrae a `useLogout()`** sin cambiar su comportamiento.

## Riesgos

- `authClient.signOut()` usa el `fetch` global en el momento de la llamada; si better-fetch lo capturase al importar, el test de logout no vería el stub. Mitigación: comprobarlo en T9 y, si pasa, stubear antes de importar con `vi.hoisted`.
- Radix bloquea el `pointer-events` del `body` con el modal abierto; el clic fuera en jsdom se hace sobre el overlay (ver tests).
- Si alguien cambia el breakpoint `md` en `index.css`, `DESKTOP_QUERY` tiene que cambiar con él (comentario junto a la constante).

## Fuera de alcance

- Animaciones de entrada/salida del panel.
- Cambios en la barra lateral de escritorio, la campana o las páginas.
- Gestos (deslizar para cerrar).
