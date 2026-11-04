# Requirements — pwa

> Feature 39 (fase 7). Ikrive instalable como PWA con `vite-plugin-pwa` (decisión de `docs/PLAN.md`): manifest, service worker (SW) que precachea el app shell, aviso de versión nueva y estado «sin conexión».
> **App shell** = `index.html` + los JS/CSS de `dist/assets` + fuentes, iconos y favicon de `public/`. **Petición a la API** = cualquier URL cuyo path empieza por `/api/` (incluidos `/api/auth/*` y el PDF público `GET /api/public/reports/:token`). **Error de red** = el `fetch` rechaza (`TypeError`) sin respuesta HTTP.

## Manifest e instalación

## R1
El sistema DEBE generar en el build un `manifest.webmanifest` con `name` y `short_name` «Ikrive», `start_url` y `scope` `/`, `display: 'standalone'`, `theme_color` `#2d3a3a` y `background_color` `#f9fafb`.

## R2
El sistema DEBE declarar en el manifest los iconos `icons/icon-192.png` (192×192) e `icons/icon-512.png` (512×512) con `purpose: 'any'` y `icons/icon-maskable-512.png` (512×512) con `purpose: 'maskable'`.

## R3
El sistema DEBE enlazar el manifest desde `index.html` (`<link rel="manifest">`) y registrar el SW generado (`sw.js`, ámbito `/`) al arrancar la web en producción.

## Service worker y caché

## R4
El sistema DEBE precachear en el SW el app shell, de modo que `index.html` y todos los ficheros `.js`, `.css`, `.woff2`, `.png` e `.ico` del build figuren en el manifiesto de precache.

## R5
CUANDO el navegador hace una navegación a una ruta de la SPA (p. ej. `/vehicles/123`), el SW DEBE responder con el `index.html` precacheado.

## R6
El SW NO DEBE responder desde caché ninguna petición a la API, ni `fetch` ni navegación (abrir el PDF público en una pestaña incluido): sin ruta de runtime caching para `/api/` y con `/api/` en `navigateFallbackDenylist`.

## R7
CUANDO la API sirve `sw.js`, `manifest.webmanifest` o `index.html` (directo o como fallback de una ruta de la SPA), el sistema DEBE enviar `cache-control: no-cache`.

## R8
CUANDO la API sirve `manifest.webmanifest`, el sistema DEBE enviarlo con `content-type: application/manifest+json`.

## Aviso de versión nueva

## R9
CUANDO el SW registrado detecta una versión nueva en espera, el sistema DEBE mostrar un aviso persistente «Hay una versión nueva de Ikrive» con los botones «Recargar» y «Más tarde».

## R10
CUANDO el usuario pulsa «Recargar» en el aviso, el sistema DEBE activar el SW nuevo y recargar la página (`updateSW(true)`).

## R11
CUANDO el usuario pulsa «Más tarde» en el aviso, el sistema DEBE ocultar el aviso sin activar el SW nuevo.

## Sin conexión

## R12
MIENTRAS el navegador está sin conexión (`navigator.onLine === false`), el sistema DEBE mostrar en todas las pantallas un aviso `role="status"` «Sin conexión».

## R13
CUANDO el navegador recupera la conexión (evento `online`), el sistema DEBE ocultar el aviso «Sin conexión».

## R14
SI la carga de una ruta (`_app`, `/login` o `/register`) falla por un error de red ENTONCES el sistema DEBE mostrar una pantalla «Sin conexión» con un botón «Reintentar» en lugar del error por defecto del router.

## R15
CUANDO el usuario pulsa «Reintentar» en la pantalla «Sin conexión», el sistema DEBE volver a cargar la ruta (`router.invalidate()`).

## R16
SI la carga de una ruta falla por un error que no es de red ENTONCES el sistema DEBE mostrar el mensaje genérico `common.error` con el botón «Reintentar», no la pantalla «Sin conexión».

## Textos

## R17
El sistema DEBE definir cada texto nuevo en `apps/web/src/i18n/locales/es.json` y `en.json` con las mismas claves.

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| El build genera un manifest con nombre, colores de la marca e iconos de 192 y 512 px (incluido maskable) y la app es instalable | R1, R2, R3, R7, R8 |
| El service worker precachea el app shell y los assets; las peticiones a /api, incluidos los PDF públicos, nunca se sirven de la caché | R4, R5, R6 |
| Si hay una versión nueva, la web muestra un aviso para recargar | R9, R10, R11, R7 |
| Sin conexión, la app carga y muestra un estado de «sin conexión» en lugar de pantallas rotas | R5, R12, R13, R14, R15, R16 |
| Todos los textos nuevos están en es.json y en.json | R17 |
| Tests cubren el registro del service worker y el aviso de actualización (con mocks) | R3, R9, R10, R11 (tests en `tasks.md`) |
| pnpm harness --full pasa en verde | última task de `tasks.md` |
