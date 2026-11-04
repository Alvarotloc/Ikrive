# Design — pwa

## Resumen

`vite-plugin-pwa` en modo `generateSW` + `registerType: 'prompt'`. La configuración (manifest y opciones de Workbox) vive en un módulo puro testeable que importa `vite.config.ts`. El registro va por `virtual:pwa-register` (vanilla, sin script inline → la CSP actual de helmet sigue valiendo) envuelto en un controlador propio con `useSyncExternalStore`, para testearlo inyectando un `register` falso. Sin conexión: aviso global por `online`/`offline` y `errorComponent` en las rutas que cargan la sesión. La API solo cambia cabeceras de caché del plugin de estáticos.

## Archivos

### `apps/web`

| Archivo | Cambio |
|---|---|
| `package.json` | devDependency `vite-plugin-pwa` (2.x, admite Vite 8; trae `workbox-build`/`workbox-window`). |
| `tsconfig.json` | `types: ["vite/client", "vite-plugin-pwa/client"]` (tipos de `virtual:pwa-register`). |
| `public/icons/icon-maskable-512.png` | **Nuevo.** Generado una vez desde `icon-512.png` con `sharp` (script en el scratchpad, no se versiona): lienzo 512×512 relleno de `#143941` (fondo del icono) y el logo reescalado al 80 % centrado, para que quepa en la zona segura. |
| `src/features/pwa/config.ts` | **Nuevo.** `pwaManifest` y `pwaWorkbox` (abajo). Sin imports de Vite para que el test unitario sea puro. |
| `src/features/pwa/config.test.ts` | **Nuevo.** Unit tests de R1, R2, R4, R6. |
| `vite.config.ts` | `VitePWA({ registerType: 'prompt', injectRegister: false, manifest: pwaManifest, workbox: pwaWorkbox, includeAssets: [] })`. `injectRegister: false` porque registramos nosotros; el plugin sigue inyectando `<link rel="manifest">`. |
| `src/features/pwa/service-worker.ts` | **Nuevo.** Controlador (abajo) + singleton `serviceWorker` y `useUpdateAvailable()`. |
| `src/features/pwa/service-worker.test.ts` | **Nuevo.** Registro y ciclo del aviso con `register` falso. |
| `src/features/pwa/update-prompt.tsx` (+ `.test.tsx`) | **Nuevo.** Aviso de versión nueva (R9–R11). Prop opcional `controller` (por defecto el singleton). |
| `src/features/pwa/use-online-status.ts` | **Nuevo.** `useSyncExternalStore` sobre `navigator.onLine` + eventos `online`/`offline`. |
| `src/features/pwa/offline-banner.tsx` (+ `.test.tsx`) | **Nuevo.** R12–R13. |
| `src/features/pwa/network-error.ts` (+ `.test.ts`) | **Nuevo.** `isNetworkError(error)`: `TypeError` que no es `ApiError`. |
| `src/features/pwa/route-error.tsx` (+ `.test.tsx`) | **Nuevo.** `RouteErrorScreen` (`ErrorComponentProps`): pantalla «Sin conexión» o genérica, ambas con «Reintentar» → `router.invalidate()`. |
| `src/main.tsx` | `serviceWorker.register()` tras crear el router; `defaultErrorComponent: RouteErrorScreen`. |
| `src/routes/__root.tsx` | Renderiza `<OfflineBanner />` y `<UpdatePrompt />` junto al `Toaster`. |
| `src/routes/_app.tsx`, `login.tsx`, `register.tsx` | `errorComponent: RouteErrorScreen` (los tests crean su propio router y no ven el `default` de `main.tsx`). |
| `src/i18n/locales/{es,en}.json` | Namespace `pwa` (abajo). |

### `apps/api`

| Archivo | Cambio |
|---|---|
| `src/plugins/static-spa.ts` | `setHeaders(res, path)` en `@fastify/static`: `cache-control: no-cache` si el basename es `sw.js`, `manifest.webmanifest` o `index.html` (R7). El `content-type` del manifest ya lo da la tabla MIME de `send` (`application/manifest+json`); el test lo fija (R8). |
| `test/static-spa.test.ts` | **Nuevo.** Con un `WEB_DIST_DIR` temporal como en `rate-limit.test.ts`. |

Sin cambios de BD, de `packages/shared` ni de `docker/` (el Dockerfile ya copia todo `apps/web/dist` a `/app/public`).

## Configuración del SW (`config.ts`)

```ts
export const pwaManifest: Partial<ManifestOptions> = {
  id: '/', name: 'Ikrive', short_name: 'Ikrive', start_url: '/', scope: '/',
  display: 'standalone', theme_color: '#2d3a3a', background_color: '#f9fafb',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

/** Paths the SW must never answer: every API request, public report PDFs included. */
export const API_PATH = /^\/api\//;

export const pwaWorkbox: Partial<GenerateSWOptions> = {
  globPatterns: ['**/*.{js,css,html,woff2,png,ico,webmanifest}'],
  navigateFallback: 'index.html',
  navigateFallbackDenylist: [API_PATH],
  cleanupOutdatedCaches: true,
  // No runtimeCaching: requests outside the precache go straight to the network.
};
```

`ManifestOptions` y `GenerateSWOptions` se importan como `import type` de `vite-plugin-pwa` (borrado en compilación). Sin `skipWaiting`/`clientsClaim`: el SW nuevo espera hasta que el usuario pulsa «Recargar».

## Controlador del SW (`service-worker.ts`)

```ts
type Register = typeof import('virtual:pwa-register').registerSW;

export interface ServiceWorkerController {
  register(): void;               // registerSW({ immediate: true, onNeedRefresh }) una sola vez
  subscribe(listener: () => void): () => void;
  updateAvailable(): boolean;     // snapshot
  applyUpdate(): Promise<void>;   // updateSW(true)
  dismiss(): void;                // updateAvailable → false
}
export function createServiceWorkerController(register: Register): ServiceWorkerController;
export const serviceWorker = createServiceWorkerController(registerSW);
export function useUpdateAvailable(controller = serviceWorker): boolean;
```

En dev el plugin sirve un `virtual:pwa-register` que no registra nada (`devOptions` desactivado), así que `pnpm dev` no instala SW. Si en Vitest el módulo virtual no se resuelve, el test unitario no lo necesita (inyecta `register`) y el componente recibe `controller`; como último recurso, `vi.mock('virtual:pwa-register')` en `setup*.ts`.

## Textos (`pwa.*`)

`update.message` «Hay una versión nueva de Ikrive», `update.reload` «Recargar», `update.dismiss` «Más tarde», `offline.banner` «Sin conexión. Algunos datos no se podrán cargar hasta que vuelva.», `offline.title` «Sin conexión», `offline.description` «No se puede contactar con el servidor. Comprueba tu conexión.», `offline.retry` «Reintentar». La pantalla genérica reutiliza `common.error`.

## UI

- `UpdatePrompt`: tarjeta fija abajo a la derecha (abajo a ancho completo en móvil), `role="status"`, `Button` de `components/ui` (primario «Recargar», `ghost` «Más tarde»). No usa un toast de `sonner` para no depender de su temporizador ni de tener `Toaster` en los tests.
- `OfflineBanner`: franja fija arriba, `bg-muted` + icono `WifiOff` de lucide, `role="status"`, no tapa la navegación móvil (añade padding superior mientras se muestra).
- `RouteErrorScreen`: centrada a pantalla completa, reutiliza el `Brand` de `components/brand.tsx`, `role="alert"`.
- Probar en claro, oscuro y móvil (capturas en `progress/impl_pwa.md`).

## Comportamiento sin conexión

1. Arranque en frío sin red: el SW sirve `index.html` y los assets; `_app.beforeLoad` → `GET /api/me` rechaza con `TypeError` (TanStack Query v5 empieza «online» y lanza la petición) → `errorComponent` → «Sin conexión» + «Reintentar». El aviso global también aparece.
2. Se pierde la red en mitad de la sesión: TanStack Query pausa las queries (`networkMode: 'online'`) y el aviso global explica por qué no cargan; al volver la red se reanudan solas.
3. `/api/*` jamás pasa por la caché del SW; la caché HTTP privada del navegador (p. ej. fotos con `immutable`) no cambia.

## Alternativas descartadas

- **`injectManifest` con un SW escrito a mano**: más control, pero más código propio y tests de SW reales; `generateSW` cubre precache + fallback de navegación, que es todo lo que se pide.
- **`registerType: 'autoUpdate'`**: recarga sin preguntar y podría tirar un formulario a medio rellenar; el acceptance pide un aviso.
- **`runtimeCaching` `NetworkOnly` para `/api/`**: redundante (sin ruta ya va a red) y no evita el problema real, que es el `navigateFallback` sirviendo `index.html` al abrir el PDF público en una pestaña; eso lo resuelve el `denylist`.
- **Cachear respuestas de la API para ver datos offline**: datos personales en Cache Storage y riesgo de datos obsoletos; además el acceptance prohíbe servir `/api` desde caché.
- **`useRegisterSW` de `virtual:pwa-register/react` directo en el componente**: obligaría a mockear el hook del componente bajo prueba (anti-patrón de `docs/verification.md`); el controlador inyectable deja el mock en la frontera (`registerSW`).

## Decisiones a validar

1. **Icono maskable nuevo** (`icon-maskable-512.png`), generado desde `icon-512.png`: el existente tiene esquinas transparentes y el logo se sale de la zona segura del 80 %, así que no sirve como maskable. Solo 512 maskable (no 192), suficiente para Android.
2. **`no-cache` explícito** en `sw.js`, `manifest.webmanifest` e `index.html` (R7). Hoy `@fastify/static` envía `public, max-age=0`, que ya revalida; se fija para que un cambio futuro de `maxAge` no rompa la detección de versiones. `/assets/*` (con hash) sigue igual; marcarlo `immutable` queda fuera.
3. `background_color` `#f9fafb` (tema claro) para la splash; el manifest no admite variante oscura.
4. Manifest sin `description` ni `lang`: es estático y no se traduce.

## Riesgos

- Resolución de `virtual:pwa-register` en Vitest (ver arriba). Lo verifica la task del controlador.
- Un SW viejo sirviendo un `index.html` que apunta a chunks borrados: `cleanupOutdatedCaches` y precache atómico de Workbox lo evitan; el aviso fuerza la versión nueva.
- Los tests no ejecutan un SW real: R4–R6 se verifican sobre la configuración y, además, con `pnpm --filter @ikrive/web build` inspeccionando `dist/sw.js` y `dist/manifest.webmanifest`, y con una prueba manual en Chrome (`playwright-core` vía `pnpm dlx`, sin dependencia nueva; `context.setOffline(true)`, recarga) documentada en `progress/impl_pwa.md`.

## Fuera de alcance

Datos offline / cola de escrituras, notificaciones push, `apple-mobile-web-app-*` extra, capturas `screenshots` del manifest, aviso «lista para usar sin conexión», `immutable` en `/assets/*`, APK con Capacitor.
