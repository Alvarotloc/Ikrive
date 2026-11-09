# Exploración de la web para #51 mobile-shell-android

## 1. Build de apps/web y build sin PWA para Capacitor
- **Configuración de Vite** (`apps/web/vite.config.ts`):
  - Plugins en L10-22: `tanstackRouter({autoCodeSplitting:true})`, `react()`, `tailwindcss()` y `VitePWA({registerType:'prompt', injectRegister:false, manifest: pwaManifest, workbox: pwaWorkbox, includeAssets: []})`.
  - No hay `base`, así que vale `/`. El alias `@` → `src` está en L23. El proxy `/api` → `:3000` (L24-27) solo actúa en dev.
  - `vitest.config.ts` hace `mergeConfig(viteConfig, …)`, de modo que cualquier cambio de plugins afecta también a los tests.
- **Configuración de la PWA** (`apps/web/src/features/pwa/config.ts`):
  - `pwaManifest` en L4-18. `API_PATH` en L21.
  - `pwaWorkbox` (generateSW, navigateFallback `index.html`) en L24-30.
- **Registro del service worker:**
  - `src/features/pwa/service-worker.ts:1` importa `registerSW` de `virtual:pwa-register`, y L47 define `export const serviceWorker = createServiceWorkerController(registerSW)`.
  - `src/main.tsx:8` lo importa y `main.tsx:26` llama a `serviceWorker.register()`.
  - `src/routes/__root.tsx:5,20` pinta `<UpdatePrompt />`, que lee el mismo controlador (`features/pwa/update-prompt.tsx:3`). También pinta `<OfflineBanner />` (L4,14), que no depende del SW.
  - En `tsconfig.json:10` está `types: ["vite/client","vite-plugin-pwa/client"]`.
- **Variables de entorno:** no se usa ninguna `VITE_*` ni `import.meta.env` en `apps/web/src`. No hay `.env` de la web.
- **Rutas absolutas en los assets:** `index.html` L85-89 (favicon, icons, preload de fonts) y `src/fonts.css` usan `url("/fonts/…")`. Funcionan en Capacitor porque se sirve desde la raíz (`https://localhost/`), siempre que se mantenga `base: '/'`.
- **Qué haría falta para un build sin PWA:**
  - Un modo de Vite, por ejemplo `vite build --mode capacitor` o `--mode native`, con `outDir` propio (por ejemplo `dist-native`, o el `webDir` de `apps/mobile`).
  - En ese modo, quitar `VitePWA` del array de plugins: así no se generan `sw.js`, `manifest.webmanifest` ni `registerSW.js`.
  - Problema: sin el plugin, `virtual:pwa-register` no resuelve y el build falla en `service-worker.ts:1`. Hay dos salidas:
    - (a) un alias en ese modo de `virtual:pwa-register` a un stub no-op (`registerSW = () => async () => {}`);
    - (b) que `main.tsx` haga `if (import.meta.env.MODE !== 'capacitor') serviceWorker.register()` con un `import()` dinámico, y que `UpdatePrompt` no se pinte en nativo.
  - La opción (a) es la más pequeña y mantiene `UpdatePrompt` siempre oculto.
  - Otra alternativa es un `define` (por ejemplo `__NATIVE__`, o `import.meta.env.VITE_NATIVE` en un `.env.capacitor`) para eliminar código muerto.
- **Workspace y CI:**
  - `pnpm-workspace.yaml` incluye `apps/*`, así que `apps/mobile` entra solo.
  - El `build` raíz es `pnpm -r build` (`package.json:13`) y los scripts `typecheck`/`test` son `pnpm -r`. Si `apps/mobile` define `build`, `typecheck` o `test`, el harness (`scripts/harness/check.mjs` L43-52: lint, typecheck, test) y `test:e2e` los ejecutarán. Conviene no definirlos o que sean ligeros, sin Gradle.
- **Docker:** `docker/Dockerfile` L13-18 copia solo los `package.json` de api, web, shared y e2e antes de `pnpm install --frozen-lockfile`. Con `apps/mobile` en el lockfile, la instalación falla, o hay que añadir `COPY apps/mobile/package.json apps/mobile/`. Otra opción es filtrar con `pnpm install --filter` / `--frozen-lockfile`. Hay que verificarlo, porque es un riesgo real para la imagen.
- **Biome:** `biome check .` usa el `.gitignore` (`biome.json` L3). Habría que ignorar `apps/mobile/android/**` (build, gradle) o añadirlo a `.gitignore` y `includes`.
- **Release:** `.github/workflows/release.yml` se dispara con tags `v*.*.*` (L4-5) y solo tiene el job `image`, con `permissions: contents: read, packages: write`. Para subir la APK a la Release hace falta un job nuevo con `contents: write`. No hay ningún job Android previo.

## 2. Enrutado y guard de autenticación
- **Contexto del router:** `src/routes/__root.tsx` define `RouterContext { queryClient }` (L7-9). El router se crea en `main.tsx:18-24` con `context: { queryClient }`.
- **Guard:** está en `src/routes/_app.tsx:9-14`, `beforeLoad` → `ensureQueryData(meQuery)`; sin usuario, `throw redirect({ to: '/login' })`. `errorComponent: RouteErrorScreen` en L21.
- **`meQuery`:** está en `src/features/auth/queries.ts:7-18`. Devuelve `null` si la respuesta es 401 y re-lanza cualquier otro error, incluidos los de red. `staleTime` es de 5 minutos.
- **Login y registro:**
  - `src/routes/login.tsx:19-25`: en `beforeLoad`, si hay `me` redirige a `/`. Tras el sign-in hace `fetchQuery({...meQuery, staleTime: 0})` y navega a `/` (L38-40).
  - `src/routes/register.tsx:22-28` sigue el mismo patrón.
- **Pantalla «elige modo» propuesta:**
  - Una ruta nueva de primer nivel (fuera de `_app`), por ejemplo `src/routes/welcome.tsx` o `start.tsx`, con su subpaso «Mi servidor» (URL), quizá `/server`.
  - Su `beforeLoad` redirige a `/login` si ya hay servidor configurado.
  - Hay que añadir la comprobación `if (isNativeApp() && getServerUrl() === null) throw redirect({ to: '/welcome' })` al principio de `_app.tsx` `beforeLoad` y de `login.tsx` / `register.tsx` `beforeLoad`, **antes** de `ensureQueryData(meQuery)`. Si no, `meQuery` pediría `/api/me` al origen de la WebView (`https://localhost/api/me`), que no existe.
  - Lo ideal es un helper común, por ejemplo `requireServer()` en `lib/` o `features/mobile/`.
  - `routeTree.gen.ts` se regenera solo con el plugin.
- **Detectar la app nativa:**
  - `Capacitor.isNativePlatform()` de `@capacitor/core`, que habría que añadir como dependencia de `apps/web`. También se puede leer `window.Capacitor?.isNativePlatform?.()` sin importar nada.
  - Alternativa: el flag de build del punto 1 (`import.meta.env.MODE === 'capacitor'`).
  - Recomendación: encapsularlo en un `isNativeApp()` en `lib/` (por ejemplo `lib/platform.ts`), fácil de stubear en los tests.
  - Los tests de app completa usan `src/test/render-app.tsx` (`renderApp(path)` con el route tree real y memory history).
- **Riesgo con un servidor caído:** en modo servidor, si el servidor guardado no responde, `meQuery` lanza `TypeError` y `login`/`_app` muestran `RouteErrorScreen` (`features/pwa/route-error.tsx:11-29`), que solo ofrece «Reintentar». El usuario queda atrapado. En nativo, esa pantalla debería ofrecer también «Cambiar servidor».
- **Dónde poner «Cambiar servidor»:**
  - En la pantalla de login (enlace bajo el formulario, junto a `auth.noAccount`).
  - En la navegación, junto a «Cerrar sesión»: `features/navigation/app-navigation.tsx`, `useLogout()` en L28 (Sidebar) y L79 (MobileNavMenu).
  - O como una sección en `routes/_app/settings.tsx` (secciones en L164-194).

## 3. GET /api/health y CORS
- **Respuesta:** `apps/api/src/modules/health/routes.ts:6-9` responde `200 { status: 'ok', version: APP_VERSION }`. El esquema es `healthSchema` en `packages/shared/src/schemas/common.ts:32-36` (`status: z.literal('ok'), version: z.string()`) y está exportado desde `@ikrive/shared`, igual que el tipo `Health`.
  - Para validar que la URL es un Ikrive: `fetch(`${url}/api/health`)` directo, sin `apiFetch`, porque la URL aún no está guardada, y luego `healthSchema.safeParse(await res.json())`.
  - Errores a distinguir: red / `TypeError` (no responde, o CORS); respuesta no ok o JSON inválido (no es Ikrive).
  - El endpoint no se registra en `app.ts` con una ruta propia: va dentro del grupo con `prefix: '/api'` (`app.ts` L206/L231).
- **CORS:** el plugin está en `apps/api/src/plugins/cors.ts:22-41` y se registra en `app.ts:93` con `origins: config.TRUSTED_ORIGINS`.
  - Solo aplica a URLs `/api/*` (`lib/http.ts:18`) y a orígenes incluidos en la lista.
  - Usa `credentials: false`, métodos GET/POST/PUT/PATCH/DELETE, cabeceras permitidas `authorization` y `content-type`, y expone `set-auth-token` y `content-disposition`.
- **Orígenes de confianza:** `TRUSTED_ORIGINS` tiene por defecto `capacitor://localhost,https://localhost` (`apps/api/src/config.ts:29-38`). También se usa en Better Auth `trustedOrigins` (`apps/api/src/auth.ts:21-24`).
  - Así que sí: `/api/health` responde con `Access-Control-Allow-Origin` a `https://localhost` (Android) y `capacitor://localhost`.
  - Tests en `apps/api/test/mobile-auth.test.ts` ~L384-397: a un origen no permitido o con la lista vacía responde 200 sin cabeceras CORS, y en ese caso `fetch` desde la app falla como error de red. El mensaje de error debería mencionar la configuración CORS / `TRUSTED_ORIGINS`.
  - La variable está documentada en `docs/self-hosting.md:51` y `.env.example:28-30`.
- **Ojo con HTTP en claro:** la WebView de Android sirve la app en `https://localhost`. Un servidor `http://192.168.x.x` es contenido mixto y está bloqueado, y además Android bloquea el tráfico en claro por defecto. El spec debe decidir entre exigir https o configurar `android.allowMixedContent` / `usesCleartextTraffic` en `capacitor.config` y documentarlo. `setServerUrl` acepta http y https (`apps/web/src/lib/server.ts:29-41`).

## 4. queryClient y la limpieza de caché
- **Instancia única:** `src/main.tsx:14-16` (`retry: 1`, `refetchOnWindowFocus: false`), pasada por el contexto del router y por `QueryClientProvider`.
- **Usos:** a través de `context.queryClient` en `beforeLoad`/`loader` de las rutas, y de `useQueryClient` en los `features/*/queries.ts`.
- **Limpieza:** el único `queryClient.clear()` está en `src/features/auth/use-logout.ts:19`: `signOut` → `setSessionToken(null)` en `finally` → `clear()` → navegar a `/login`.
- **Cambio de servidor:** `setServerUrl` (`lib/server.ts:21-27`) borra el token, pero **no** toca la caché de queries; quedarían `me`, `vehicles`, `['api-file', url]`, etc. del servidor anterior.
- **Clave de la caché de ficheros:** `apiFileKey = (url) => ['api-file', url]` en `src/lib/api-files.ts:14`, usada en `useApiFileSrc` L20-40 con `staleTime: Infinity`. Las URLs son rutas `/api/…` relativas, iguales en servidores distintos.
- **Solución recomendada (las dos cosas):**
  - (a) Una única función `changeServer(url | null)` (por ejemplo en `features/mobile/` o `lib/`) que haga `setServerUrl` + `queryClient.clear()` + `navigate`, usada desde la pantalla de modo y desde «Cambiar servidor».
  - (b) Defensa en profundidad: `apiFileKey = (url) => ['api-file', getServerUrl(), url]`.
  - Test: cambiar de servidor y comprobar que no se reutiliza el blob ni `me`.
- **Las claves centralizadas** están en `src/lib/query-keys.ts` (`me`, `settings`, `config`, …).

## 5. Patrones de formularios y pantallas, e i18n
- **Formulario de referencia:** `src/routes/login.tsx` y `register.tsx` usan `zodResolver(schema)` + `useForm`, con `<form noValidate className="grid gap-4">` y `FormField` + `Input`. El error del servidor va en `useState` y se pinta como `<p className="text-sm text-destructive" role="alert">`. El botón submit se deshabilita con `isSubmitting`.
- **Componentes reutilizables:**
  - `FormField`: `src/components/form-field.tsx` (props `id`, `label`, `error`, `labelAction`). Enlaza el error con el control vía `FormFieldContext` (`components/form-field-context.ts`).
  - Componentes de UI en `src/components/ui/`: button, card, input, label, dialog, sheet, select, …
  - `Brand` en `components/brand.tsx`.
- **Layout:** `AuthLayout` (`src/features/auth/auth-layout.tsx`) recibe `title`, `subtitle` y `children`, con un panel de marca a la izquierda en `lg`. Es reutilizable tal cual para «elige modo» y «Mi servidor».
- **Mensajes de zod:** se traducen globalmente en `src/i18n/zod.ts` (`configureZodMessages`). Para la URL vale `z.url()` o un `string` + `refine` con `setServerUrl` / `normalizeServerUrl`; hoy `normalizeServerUrl` no se exporta.
- **i18n:**
  - Ficheros: `src/i18n/locales/{es,en}.json`. Claves de primer nivel: app, nav, auth, dashboard, settings, units, locales, weekdays, common, validation, vehicles, odometer, maintenance, fuel, schedules, notifications, notificationChannels, calendarFeed, stats, saleReport, reportShares, dataPortability, adminUsers, pwa.
  - Claves relevantes:
    - `auth.*`: login, register, email, password, noAccount, haveAccount, loginSubtitle, eyebrow, headline, pitch, proof[], accountDisabled.
    - `common.*`: save, loading, error, cancel, copy, fileError.
    - `pwa.offline.*`: banner, title, description, retry.
  - Habría que crear un bloque nuevo (por ejemplo `mobile.*` o `serverSetup.*`): modos, «próximamente», URL, errores (no responde / no es Ikrive / CORS) y «Cambiar servidor».
  - `src/i18n/locales.test.ts` comprueba que es y en tienen las mismas claves.
- **Tests:** helpers en `src/test/` (`render.tsx` con `mockApi`, `renderWithProviders`, `createTestQueryClient`; `render-app.tsx`). Cualquier `fetch` sin mock falla (`test/setup.ts`).

## 6. Pendientes de #50 que el spec de #51 debe recoger
- **Clave de la caché de ficheros sin servidor:** `['api-file', url]` no incluye el servidor (review_web-api-base-url.md, «Avisos»). Ya figura en los `acceptance` de #51.
- **`openBlob` en la WebView** (`src/lib/download.ts` L16-28: `<a target="_blank" rel="noopener">` + `blob:`, revocado a los 60 s): en Capacitor no hay pestañas, y abrir un PDF de factura (`openApiFile`, `maintenance-attachments.tsx` ~L185-200 y `attachment-viewer.tsx:78`) no funcionará. Ver `specs/web-api-base-url/design.md:117`. Hace falta un plugin nativo (por ejemplo `@capacitor/filesystem` + `@capacitor/share`, o un file-opener). La costura única es `lib/api-files.ts` (`saveApiFile`/`openApiFile`) / `lib/download.ts`.
- **`<a download>` con `blob:` en la WebView de Android** no descarga sin ayuda nativa (`design.md:118`). Afecta a `downloadBlob`: facturas (`saveApiFile`), export (`data-section.tsx:84`, `saveApiFile('/api/me/export','ikrive-export.zip')`) y el `.ics` de «Añadir al calendario» (`calendar/actions.ts`, aunque eso es de #52). Además, el export en modo servidor va entero a memoria (`design.md:116`).
- **Enlaces externos** `target="_blank"` (Google/Outlook Calendar en `features/schedules/add-to-calendar.tsx:89,95`): en la WebView deberían abrirse en el navegador del sistema (`@capacitor/browser` o el comportamiento por defecto de Capacitor para navegaciones externas). Hay que verificarlo. El enlace del evento ya usa `getServerUrl() ?? window.location.origin` (L56).
- **Almacenamiento:** `localStorage` (`ikrive.serverUrl`, `ikrive.sessionToken`) persiste en la WebView. Según `design.md:100`, si se prefiere `@capacitor/preferences` o un almacén seguro, solo cambia `lib/server.ts`, aunque hoy su API es síncrona.
- **No es tarea de #51:** `features/pwa/config.ts` `API_PATH` no cambia porque la APK no lleva SW (`design.md:21`).
- **Deuda menor:** la descarga desde el visor (`attachment-viewer.tsx`, `saveApiFile`) no tiene test propio.

## Rutas clave
- `apps/web/vite.config.ts`, `apps/web/src/main.tsx`
- `apps/web/src/features/pwa/{service-worker.ts,config.ts,route-error.tsx}`
- `apps/web/src/routes/{__root.tsx,_app.tsx,login.tsx,register.tsx}`
- `apps/web/src/features/auth/{queries.ts,use-logout.ts,auth-layout.tsx}`
- `apps/web/src/lib/{server.ts,api-files.ts,download.ts,api-client.ts,auth-client.ts,query-keys.ts}`
- `apps/web/src/components/form-field.tsx`, `apps/web/src/features/navigation/app-navigation.tsx`
- `apps/api/src/modules/health/routes.ts`, `apps/api/src/plugins/cors.ts`, `apps/api/src/config.ts`
- `packages/shared/src/schemas/common.ts`
- `.github/workflows/release.yml`, `docker/Dockerfile`, `biome.json`, `docs/self-hosting.md`
- `specs/web-api-base-url/design.md`, `progress/review_web-api-base-url.md`
