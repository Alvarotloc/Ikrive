# Implementación — pwa (#39)

Rama `feat/pwa`, sin commits (los hace el leader tras Gate 2). Tasks T1–T18 de `specs/pwa/tasks.md` marcadas.

## Cambios por archivo

### `apps/web`

| Archivo | Cambio |
|---|---|
| `package.json` | devDependency `vite-plugin-pwa@^2.0.0`; dependency `workbox-window@^7.4.1` (ver desviaciones). |
| `tsconfig.json` | `types: ["vite/client", "vite-plugin-pwa/client"]`. |
| `vite.config.ts` | `VitePWA({ registerType: 'prompt', injectRegister: false, manifest: pwaManifest, workbox: pwaWorkbox, includeAssets: [] })`. Importa `./src/features/pwa/config.ts` con extensión (evita el aviso de `configLoader: 'native'` de Vite 8). |
| `public/icons/icon-maskable-512.png` | **Nuevo.** 512×512, fondo `#143941`, `icon-512.png` reescalado al 80 % (410 px) y centrado. Generado con `sharp` desde un script en el scratchpad (no versionado). |
| `src/features/pwa/config.ts` | **Nuevo.** `pwaManifest`, `API_PATH` (`/^\/api\//`), `pwaWorkbox` (globs del app shell, `navigateFallback: 'index.html'`, denylist `/api/`, `cleanupOutdatedCaches`, sin `runtimeCaching`). |
| `src/features/pwa/config.test.ts` | **Nuevo.** 5 tests (R1, R2, R4, R5, R6). Lee la cabecera IHDR de los PNG para comprobar tamaños reales. |
| `src/features/pwa/service-worker.ts` | **Nuevo.** `createServiceWorkerController(register)`, singleton `serviceWorker` sobre `registerSW` de `virtual:pwa-register`, `useUpdateAvailable()` con `useSyncExternalStore`. |
| `src/features/pwa/service-worker.test.ts` | **Nuevo.** 4 tests con `register` falso (R3, R9, R10, R11). |
| `src/features/pwa/update-prompt.tsx` (+ `.test.tsx`) | **Nuevo.** Tarjeta `role="status"` fija abajo a la derecha (ancho completo abajo en móvil), «Más tarde» (`ghost`) y «Recargar» (primario). 4 tests. |
| `src/features/pwa/use-online-status.ts` | **Nuevo.** `useSyncExternalStore` sobre `navigator.onLine` + `online`/`offline`. |
| `src/features/pwa/offline-banner.tsx` (+ `.test.tsx`) | **Nuevo.** Franja `role="status"`, `bg-muted`, icono `WifiOff`. 2 tests. |
| `src/features/pwa/network-error.ts` (+ `.test.ts`) | **Nuevo.** `isNetworkError`: `TypeError` que no es `ApiError`. 1 test. |
| `src/features/pwa/route-error.tsx` (+ `.test.tsx`) | **Nuevo.** `RouteErrorScreen`: `Brand` + bloque `role="alert"` («Sin conexión» + descripción, o `common.error`) + «Reintentar» → `router.invalidate()`. 4 tests con el árbol de rutas real (`renderApp`). |
| `src/main.tsx` | `defaultErrorComponent: RouteErrorScreen` y `serviceWorker.register()` tras crear el router. |
| `src/routes/__root.tsx` | `<OfflineBanner />` antes del `Outlet` y `<UpdatePrompt />` tras el `Toaster`. |
| `src/routes/_app.tsx`, `login.tsx`, `register.tsx` | `errorComponent: RouteErrorScreen`. |
| `src/i18n/locales/{es,en}.json` | Namespace `pwa.update.{message,reload,dismiss}` y `pwa.offline.{banner,title,description,retry}`. |

### `apps/api`

| Archivo | Cambio |
|---|---|
| `src/plugins/static-spa.ts` | `setHeaders` de `@fastify/static`: `cache-control: no-cache` si el basename es `sw.js`, `manifest.webmanifest` o `index.html`. Vale también para el fallback de la SPA (`reply.sendFile('index.html')`). |
| `test/static-spa.test.ts` | **Nuevo.** 3 tests sobre un `WEB_DIST_DIR` temporal. |

### Raíz

- `pnpm-lock.yaml`: regenerado por `pnpm add`.

Sin cambios de BD, de `packages/shared` ni de `docker/`.

## Trazabilidad

| R | Test(s) |
|---|---|
| R1 | `apps/web/src/features/pwa/config.test.ts` › `declares the brand name, colours and standalone display`; verificación manual (`dist/manifest.webmanifest`) |
| R2 | `apps/web/src/features/pwa/config.test.ts` › `declares 192 and 512 icons and a maskable 512 icon` |
| R3 | `apps/web/src/features/pwa/service-worker.test.ts` › `registers the service worker immediately and only once`; verificación manual (`<link rel="manifest">` en `dist/index.html`, SW `/sw.js` activo con ámbito `/` en Chrome) |
| R4 | `apps/web/src/features/pwa/config.test.ts` › `precaches html, js, css, fonts, images and icons`; verificación manual (Cache Storage con `/index.html` y `.js`, `.css`, `.woff2`, `.png`, `.ico`) |
| R5 | `apps/web/src/features/pwa/config.test.ts` › `falls back to index.html for SPA navigations`; verificación manual (recarga offline en `/vehicles/123` sirve el app shell) |
| R6 | `apps/web/src/features/pwa/config.test.ts` › `never serves /api from the cache`; verificación manual (PDF público offline → `ERR_INTERNET_DISCONNECTED`, `fetch('/api/me')` offline → `TypeError`, ninguna entrada `/api/` en Cache Storage) |
| R7 | `apps/api/test/static-spa.test.ts` › `serves sw.js, the manifest and index.html with no-cache`, `serves the SPA fallback with no-cache` |
| R8 | `apps/api/test/static-spa.test.ts` › `serves the manifest as application/manifest+json` |
| R9 | `apps/web/src/features/pwa/service-worker.test.ts` › `reports an update when the new worker is waiting`; `apps/web/src/features/pwa/update-prompt.test.tsx` › `shows nothing until an update is waiting`, `shows the update notice with reload and later buttons` |
| R10 | `apps/web/src/features/pwa/service-worker.test.ts` › `applies the update by reloading through the new worker`; `apps/web/src/features/pwa/update-prompt.test.tsx` › `reloads with the new worker when clicking Recargar` |
| R11 | `apps/web/src/features/pwa/service-worker.test.ts` › `dismisses the update without applying it`; `apps/web/src/features/pwa/update-prompt.test.tsx` › `hides the notice when clicking Más tarde` |
| R12 | `apps/web/src/features/pwa/offline-banner.test.tsx` › `shows the offline notice while the browser is offline` |
| R13 | `apps/web/src/features/pwa/offline-banner.test.tsx` › `hides the offline notice when the connection comes back` |
| R14 | `apps/web/src/features/pwa/network-error.test.ts` › `detects fetch failures but not API errors`; `apps/web/src/features/pwa/route-error.test.tsx` › `shows the offline screen when the session cannot be fetched`, `shows the offline screen on the login page without network` |
| R15 | `apps/web/src/features/pwa/route-error.test.tsx` › `retries the route when clicking Reintentar` |
| R16 | `apps/web/src/features/pwa/network-error.test.ts` › `detects fetch failures but not API errors`; `apps/web/src/features/pwa/route-error.test.tsx` › `shows the generic error when the API fails with a non-network error` |
| R17 | `apps/web/src/i18n/locales.test.ts` › `es and en define the same keys` |

## Verificación manual (T17)

La sesión anterior se cortó y su scratchpad (capturas incluidas) se perdió; la verificación se repitió entera.

**Build** (`pnpm --filter @ikrive/web build`): `vite-plugin-pwa v2.0.0`, `generateSW`, precache de 75 entradas (1765 KiB), genera `dist/sw.js` y `dist/workbox-*.js`.
- `dist/manifest.webmanifest`: `name`/`short_name` «Ikrive», `start_url`/`scope`/`id` `/`, `display: standalone`, `theme_color #2d3a3a`, `background_color #f9fafb`, los 3 iconos (192 any, 512 any, 512 maskable). El plugin añade `lang: "en"` por defecto (ver desviaciones).
- `dist/index.html`: `<link rel="manifest" href="/manifest.webmanifest">`, sin script inline de registro.
- `dist/sw.js`: `precacheAndRoute` con `index.html`, 53 `.js`/`.css` de `assets/`, fuentes `.woff2`, iconos, `favicon.ico`; una sola ruta: `NavigationRoute(createHandlerBoundToURL("index.html"), { denylist: [/^\/api\//] })`; ningún `runtimeCaching`.

**API sirviendo `dist`** (`WEB_DIST_DIR`, puerto 3210, `DATA_DIR` temporal; el 3000 y el 5173 los usan otros procesos). Con `curl`:

| URL | Estado | `cache-control` | `content-type` |
|---|---|---|---|
| `/sw.js` | 200 | `no-cache` | `application/javascript` |
| `/manifest.webmanifest` | 200 | `no-cache` | `application/manifest+json` |
| `/`, `/index.html` | 200 | `no-cache` | `text/html` |
| `/vehicles/123` (fallback) | 200 | `no-cache` | `text/html` |
| `/assets/index-*.js` | 200 | `public, max-age=0` (sin cambios) | `application/javascript` |

La CSP de helmet no bloquea nada: `worker-src`/`manifest-src` caen a `'self'`.

**Chrome 156** (`/usr/bin/google-chrome`) con `playwright-core` 1.64.1 obtenido con `pnpm dlx playwright-core` (no se añadió como dependencia); script en el scratchpad. Datos: Ana, un Seat León y un enlace público de informe. En claro (1280×800), oscuro (1280×800, `colorScheme: dark`) y móvil (390×844, `isMobile`), todo OK:

1. SW `http://localhost:3210/sw.js` `activated`, ámbito `/`; tras recargar, la página está controlada por el SW.
2. Cache Storage: `/index.html` y ficheros `.js`, `.css`, `.woff2`, `.png`, `.ico` (71 entradas), ninguna bajo `/api/`.
3. `context.setOffline(true)` en mitad de la sesión → aparece la franja «Sin conexión…».
4. Navegación offline a `/vehicles/123` → el SW sirve el app shell y se ve la pantalla «Sin conexión» con «Reintentar» (más la franja).
5. Offline, abrir el PDF público `/api/public/reports/<token>` en una pestaña → `net::ERR_INTERNET_DISCONNECTED` (no sale `index.html` de la caché); `fetch('/api/me')` → `TypeError`.
6. Volver online y pulsar «Reintentar» → carga el dashboard. Online, el PDF público responde `application/pdf`.
7. Cambiar `dist/sw.js` y `registration.update()` → aviso «Hay una versión nueva de Ikrive». «Más tarde» lo oculta y el SW nuevo sigue en `waiting`; al recargar vuelve a salir; «Recargar» activa el SW nuevo y recarga (sin `waiting`, página controlada, sin aviso).
8. `/login` sin sesión, recargado offline → pantalla «Sin conexión».

Después se reconstruyó `dist` para quitar los cambios de prueba de `sw.js`.

**Docker** (la feature toca dependencias): en la sesión anterior, `docker build -f docker/Dockerfile` terminó bien; el contenedor respondió `/api/health` `ok` y sirvió `/sw.js` y `/manifest.webmanifest` con `no-cache` (el manifest como `application/manifest+json`) y `/icons/icon-maskable-512.png`. La imagen se borró después. Desde entonces no ha cambiado ni el código ni el lockfile, así que no se repitió.

### Capturas (fuera del repo)

`/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/57c503c9-57db-4e2f-8fda-9e62f6a46581/scratchpad/shots/`:

- `offline-banner-light.png`, `offline-banner-dark.png`, `offline-banner-mobile.png`: franja «Sin conexión» sobre el dashboard.
- `offline-screen-light.png`, `offline-screen-dark.png`, `offline-screen-mobile.png`: recarga offline en `/vehicles/123`.
- `update-prompt-light.png`, `update-prompt-dark.png`, `update-prompt-mobile.png`: aviso de versión nueva.
- `offline-login-light.png`: `/login` offline.

## `pnpm harness --full`

```
[OK]    46 features: 39 done, 6 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #39 pwa (in_progress)
[OK]    Rama actual: feat/pwa
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared  Test Files 17 passed (17)   Tests 117 passed (117)
apps/web         Test Files 50 passed (50)   Tests 342 passed (342)
apps/api         Test Files 31 passed (31)   Tests 296 passed (296)
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones e incidencias

1. **`workbox-window` como dependencia directa de `apps/web`.** El diseño daba por hecho que venía con el plugin. Con pnpm estricto, `vite build` falla en cuanto la app importa `virtual:pwa-register`: `Rolldown failed to resolve import "workbox-window" from "/@vite-plugin-pwa/virtual:pwa-register"`. La documentación de `vite-plugin-pwa` indica instalarlo en ese caso. Va en `dependencies` (es código que acaba en el bundle), con el mismo rango que pide el plugin (`^7.4.1` → 7.4.1, la versión que ya estaba en el lockfile).
2. **Tipo de `pwaWorkbox`.** `vite-plugin-pwa` no reexporta `GenerateSWOptions` y `workbox-build` no se puede importar desde `apps/web` con pnpm estricto. Se usa `VitePWAOptions['workbox']`, que es exactamente `Partial<GenerateSWOptions>`.
3. **`OfflineBanner` en el flujo de la página, no `fixed`.** La navegación (móvil y escritorio) es `sticky top-0`. Una franja `fixed` arriba, aunque el contenido tenga padding superior, la taparía en cuanto se hace scroll. Por eso la franja va en el flujo, encima del layout: empuja el contenido y nunca se superpone. El coste es que, con la página ya desplazada hacia abajo, la franja queda fuera de la vista hasta volver arriba. Si se prefiere que esté siempre visible, haría falta tocar el `top` de la navegación, que está fuera del alcance de `design.md`.
4. **`lang: "en"` en el manifest.** No lo declaramos (decisión 4 del diseño), pero `vite-plugin-pwa` lo añade por defecto. No contradice ningún requirement. Para quitarlo habría que declarar otro `lang`, que es justo lo que el diseño descartó.
5. **Incidencia de entorno (sin cambios de código).** Después de `pnpm add`, el `node_modules` del repo quedó incoherente con el lockfile, y en el proyecto `dom` `expect(promise).rejects.toThrow(msg)` fallaba siempre con «got ''»: 2 tests de `src/test/setup.test.tsx` y una reproducción mínima con `Promise.reject(new Error('abc'))`. Con el mismo código y el mismo lockfile instalados con `--frozen-lockfile` en un worktree limpio, los tests pasaban. Se resolvió reinstalando (`rm -rf node_modules apps/*/node_modules packages/*/node_modules && pnpm install --frozen-lockfile`) y el lockfile no cambió. Una instalación limpia en CI no debería verse afectada.
