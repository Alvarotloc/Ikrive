# Review — #39 pwa

**Veredicto:** APPROVED

Revisado sobre `feat/pwa` (commit del spec `5c0a604` + cambios sin commitear). `git diff main...HEAD` solo contiene el spec y el cambio de estado en `feature_list.json`; el resto es árbol de trabajo (14 modificados + 13 nuevos en `apps/web/src/features/pwa/`, `apps/api/test/static-spa.test.ts` y el icono maskable).

## Trazabilidad requirements ↔ tests
- R1: [x] `apps/web/src/features/pwa/config.test.ts` › `declares the brand name, colours and standalone display` (`toMatchObject` con name, short_name, start_url, scope, display, theme_color y background_color exactos) + build manual (`dist/manifest.webmanifest`).
- R2: [x] `config.test.ts` › `declares 192 and 512 icons and a maskable 512 icon` (`toEqual` de los 3 iconos con su `purpose` y además lee la cabecera IHDR de cada PNG en `public/`, así que comprueba que los ficheros existen y miden lo que dicen).
- R3: [x] `apps/web/src/features/pwa/service-worker.test.ts` › `registers the service worker immediately and only once` (una sola llamada, `immediate: true`). `main.tsx` llama a `serviceWorker.register()`. El `<link rel="manifest">` y el SW `/sw.js` con ámbito `/` se comprobaron a mano (build + Chrome), como prevén `design.md` › Riesgos y T17.
- R4: [x] `config.test.ts` › `precaches html, js, css, fonts, images and icons` (index.html, .js, .css, .woff2, .png y .ico casan con `globPatterns`) + `dist/sw.js` y Cache Storage revisados a mano.
- R5: [x] `config.test.ts` › `falls back to index.html for SPA navigations` (`navigateFallback: 'index.html'`, `/vehicles/123`, `/` y `/login` fuera del denylist) + recarga offline en Chrome.
- R6: [x] `config.test.ts` › `never serves /api from the cache` (`/api/me`, `/api/auth/get-session` y `/api/public/reports/abc` en el denylist; `runtimeCaching` indefinido) + manual: PDF público offline → `ERR_INTERNET_DISCONNECTED` y ninguna entrada `/api/` en Cache Storage.
- R7: [x] `apps/api/test/static-spa.test.ts` › `serves sw.js, the manifest and index.html with no-cache` (200 + `no-cache` en `/sw.js`, `/manifest.webmanifest`, `/index.html` y `/`; `/assets/app.js` se queda en `public, max-age=0`) y `serves the SPA fallback with no-cache` (`/vehicles/123` → 200, cuerpo del index y `no-cache`).
- R8: [x] `static-spa.test.ts` › `serves the manifest as application/manifest+json` (content-type y cuerpo).
- R9: [x] `service-worker.test.ts` › `reports an update when the new worker is waiting` (snapshot a true + notifica al suscriptor); `update-prompt.test.tsx` › `shows nothing until an update is waiting` y `shows the update notice with reload and later buttons` (`role="status"` con el texto y los dos botones).
- R10: [x] `service-worker.test.ts` › `applies the update…` y `update-prompt.test.tsx` › `reloads with the new worker when clicking Recargar` (`updateSW` llamado exactamente una vez con `true`).
- R11: [x] `service-worker.test.ts` › `dismisses the update without applying it` y `update-prompt.test.tsx` › `hides the notice when clicking Más tarde` (el aviso desaparece y `updateSW` no se llama).
- R12: [x] `apps/web/src/features/pwa/offline-banner.test.tsx` › `shows the offline notice while the browser is offline` (`role="status"` con el texto).
- R13: [x] `offline-banner.test.tsx` › `hides the offline notice when the connection comes back` (pasa online → offline → online con eventos reales).
- R14: [x] `apps/web/src/features/pwa/route-error.test.tsx` › `shows the offline screen when the session cannot be fetched` (`/`) y `…on the login page without network` (`/login`, sin formulario) con el árbol real (`renderApp`) y `GET /me` lanzando `TypeError`; `network-error.test.ts` › `detects fetch failures but not API errors`.
- R15: [x] `route-error.test.tsx` › `retries the route when clicking Reintentar` (la segunda respuesta de `/me` es 200 → se ve «Hola, Ana» y desaparece «Sin conexión»).
- R16: [x] `route-error.test.tsx` › `shows the generic error when the API fails with a non-network error` (500 → «Algo ha ido mal», sin «Sin conexión», con «Reintentar»); `network-error.test.ts`.
- R17: [x] `apps/web/src/i18n/locales.test.ts:13` › `es and en define the same keys`. He revisado el namespace `pwa` en los dos idiomas: tienen las mismas 7 claves y están traducidas.

## Tasks
- T1..T18: [x] (todas marcadas en `specs/pwa/tasks.md`).

## Checkpoints
- C1: [x] `pnpm harness` en verde, una sola feature activa (#39 `in_progress`) y rama `feat/pwa`.
- C2: [x] Están los 3 ficheros del spec, el EARS cubre todos los acceptance, las tasks están `[x]` y he leído todos los tests citados.
- C3: [x] El diff coincide con la tabla de `design.md`. Las desviaciones (abajo) están declaradas y justificadas. No hay refactors ajenos.
- C4: [x] Web: el código está en `features/pwa/`, los textos en es/en y reutiliza `Brand` y `Button`. API: solo cambian cabeceras en `plugins/static-spa.ts`, sin dominio nuevo, BD ni `packages/shared` (no aplican propiedad, AppError ni migraciones).
- C5: [x] No hay `any`, `@ts-ignore`, `console.log` de depuración ni TODOs. El `console.log("ikrive")` de `static-spa.test.ts` es solo el contenido de un fichero de prueba. No hay fechas ni subidas.
- C6: [x] He ejecutado `pnpm harness --full` y termina con EXIT 0: shared 117, web 342 y api 296 tests. Los tests afirman resultados concretos y solo simulan la frontera (`registerSW` falso y `mockApi`). Hay 10 capturas y existen en `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/57c503c9-57db-4e2f-8fda-9e62f6a46581/scratchpad/shots/`: claro, oscuro y móvil del aviso de versión, de la franja y de la pantalla «Sin conexión». Las he abierto y se ven bien.
- C7: [x] `progress/impl_pwa.md` está completo (archivos, mapa R→test y salidas). `progress/current.md` está al día. `docs/PLAN.md` no necesita cambios: la fase 7 sigue abierta (#40–#42 pendientes) y no cambia ninguna decisión.

## Comprobaciones específicas pedidas
- **`/api` nunca desde la caché del SW:** [x] No hay `runtimeCaching`. `precacheAndRoute` solo responde a URLs precacheadas, que salen de `dist` y ninguna está bajo `/api/`. La única `NavigationRoute` tiene `denylist: [/^\/api\//]`, así que el PDF público abierto en una pestaña va a la red. Lo verifican el test y la prueba manual.
- **CSP:** [x] Con `injectRegister: false` el plugin no mete scripts inline en `index.html`. La CSP de helmet (`apps/api/src/app.ts:84`) no declara `worker-src` ni `manifest-src`, así que se aplican sus valores de respaldo: `script-src 'self'` y `default-src 'self'`. `sw.js` y `workbox-*.js` se sirven desde el mismo origen, y el SW pasado a Chrome se registró sin violaciones.
- **Capturas:** [x] están las 10 en la ruta indicada. `offline-screen-light.png` y `offline-login-light.png` son el mismo fichero (md5 idéntico). Tiene sentido, porque las dos rutas pintan el mismo `RouteErrorScreen`.
- **Lockfile / reinstalación:** [x] He comparado con `LC_ALL=C` las claves `packages:` del lockfile contra `HEAD`. No desaparece ningún paquete ni cambia ninguna versión: solo hay 268 entradas nuevas (`vite-plugin-pwa`, `workbox-*` y sus dependencias). La reinstalación de `node_modules` solo afectó al entorno local.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
1. **`workbox-window` en `dependencies` de `apps/web`.** Es la solución correcta con pnpm estricto (lo recomienda la documentación del plugin) y va al bundle. No cambia la imagen Docker, porque `pnpm --filter @ikrive/api deploy --prod` no incluye las dependencias de la web.
2. **`OfflineBanner` en el flujo de la página en vez de `fixed` (se aparta de `design.md` › UI).** R12 se cumple, pero la franja deja de verse al desplazarse hacia abajo. Además, en escritorio la barra lateral (`md:h-dvh`) y `RouteErrorScreen` (`min-h-dvh`) suman la altura de la franja y la página tiene unos 37 px de scroll de más mientras se está offline. Si se quiere la franja siempre visible, habría que ajustar el `top` de la navegación sticky, que queda fuera del alcance de esta feature.
3. **`lang: "en"` en el manifest.** Lo añade el plugin por defecto y choca con la decisión 4 del diseño («sin `lang`») en una app que arranca en español. No viola ningún requirement. Si molesta, se puede declarar `lang: 'es'` en una feature aparte.
4. **`pwaWorkbox` tipado como `VitePWAOptions['workbox']`** en lugar de `Partial<GenerateSWOptions>`. El tipo es equivalente y la desviación está justificada.
5. **`isNetworkError` trata cualquier `TypeError` como un error de red.** Un `TypeError` de programación lanzado en un loader mostraría «Sin conexión» en vez del error genérico. Es lo que fija el diseño y en la práctica es poco probable.
6. **R14 nombra `/register`, pero los tests solo cubren `/` y `/login`.** `register.tsx` tiene el mismo `errorComponent`, así que el riesgo es mínimo.
7. **En móvil, `UpdatePrompt` es una franja fija abajo** que tapa el final del contenido hasta que se pulsa «Más tarde» o «Recargar». Es lo previsto en el diseño.
