# Design — mobile-shell-android

Tres piezas: (1) un **build nativo** de la misma SPA, sin PWA, que sabe que es la app; (2) dos **pantallas nuevas** (`/welcome`, `/server`) y unos guards que, solo en la app, llevan a elegir servidor antes de tocar la API; (3) **`apps/mobile`** (Capacitor + proyecto Android) y el job de release que firma y publica la APK. La web y la imagen Docker no cambian de comportamiento.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| web | `vite.config.ts` | `defineConfig(({ mode }) => …)`; `VitePWA({ …, disable: mode === 'native' })` (R2). `vitest.config.ts` pasa a `mergeConfig(viteConfig({ mode: 'test', command: 'serve' }), …)` |
| web | `package.json` | script `build:native`: `vite build --mode native --outDir dist-native` |
| web | `src/lib/platform.ts` (nuevo) | `isNativeApp()` (ver Tipos) |
| web | `src/main.tsx` | `if (!isNativeApp()) serviceWorker.register()` (defensa extra a R2) |
| web | `src/lib/server.ts` | exportar `normalizeServerUrl` (hoy privada); sin más cambios |
| web | `src/lib/api-files.ts` | `apiFileKey = (url) => ['api-file', getServerUrl(), url]` (R18) |
| web | `src/features/mobile/check-server.ts` (nuevo) | `parseServerInput` y `checkServer` (R9–R13, R25) |
| web | `src/features/mobile/use-change-server.ts` (nuevo) | `useChangeServer` (R14, R17) |
| web | `src/features/mobile/require-server.ts` (nuevo) | `requireServer()` para los `beforeLoad` (R5) y `requireNative()` (R8) |
| web | `src/features/mobile/server-link.tsx` (nuevo) | servidor guardado + enlace «Cambiar servidor» (R15) |
| web | `src/routes/welcome.tsx`, `src/routes/server.tsx` (nuevos) | pantallas (R6–R8, R9–R14, R25) |
| web | `src/routes/_app.tsx`, `login.tsx`, `register.tsx` | `requireServer()` al principio de `beforeLoad`, antes de `meQuery` (R5); `login.tsx` pinta `<ServerLink />` en la app (R15) |
| web | `src/features/pwa/route-error.tsx` | en la app y con error de red, botón «Cambiar servidor» → `/server` (R16) |
| web | `src/i18n/locales/{es,en}.json` | bloque `mobile.*` (R24) |
| mobile | `apps/mobile/package.json` (nuevo, `@ikrive/mobile`, `private`) | deps exactas `@capacitor/core`, `@capacitor/android`; dev `@capacitor/cli`. Scripts: `build:web` (build nativo + `check-web-dir`), `sync` (`cap sync android`), `test` (`node --test`). **Sin** `build` ni `typecheck`: `pnpm -r build/typecheck` (CI, harness, Docker, E2E) no deben necesitar el SDK de Android |
| mobile | `apps/mobile/capacitor.config.json` (nuevo) | ver «Capacitor» |
| mobile | `apps/mobile/android/` (nuevo, `cap add android`, versionado) | `app/build.gradle`: `versionName`/`versionCode` desde las propiedades `-PikriveVersionName`/`-PikriveVersionCode` (por defecto `0.0.0-dev`/`1`) (R21); `AndroidManifest.xml`: `android:usesCleartextTraffic="true"` (R4); iconos generados una vez desde `apps/web/public/icons/icon-512.png` e `icon-maskable-512.png` |
| mobile | `apps/mobile/scripts/check-web-dir.mjs` (nuevo) | `findPwaArtifacts(dir): string[]` + CLI que sale con 1 si hay alguno (R2) |
| mobile | `apps/mobile/scripts/android-version.mjs` (nuevo) | `androidVersion(tag) → { name, code }` + CLI que imprime `name code` (R21) |
| mobile | `apps/mobile/test/*.test.mjs` (nuevos) | `node:test`, ver `tasks.md` |
| infra | `.github/workflows/release.yml` | job `android` (ver «Release») (R19–R22) |
| infra | `.github/workflows/ci.yml` | job `check`: paso `pnpm --filter @ikrive/mobile build:web` (R2 sobre el build real). Jobs nuevos `changes` (detección de cambios) y `android` (`needs: changes`, solo si hay cambios relevantes): `cap sync` + `./gradlew assembleDebug` y la APK debug como artefacto (decisión 10) |
| infra | `docker/Dockerfile` | `COPY apps/mobile/package.json apps/mobile/` antes de `pnpm install --frozen-lockfile` (el lockfile tendrá su importer) |
| infra | `.dockerignore` | `apps/mobile/android`, `**/dist-native` |
| infra | `.gitignore` | `dist-native/`, `*.keystore`, `*.jks`; el resto de Android lo cubre el `android/.gitignore` que genera Capacitor (`build/`, `.gradle/`, `local.properties`, `assets/public`, `capacitor.config.json` copiado…) |
| infra | `biome.json` | `"!apps/mobile/android"` en `files.includes` |
| infra | `pnpm-workspace.yaml` | solo si alguna dependencia de Capacitor pide `allowBuilds` |
| docs | `docs/mobile.md` (nuevo) | instalación, verificación, CORS/HTTP, iPhone, limitaciones, publicar (keystore y secretos) (R23); enlazado desde `docs/self-hosting.md` (fila `TRUSTED_ORIGINS` y «Exposición a internet») y `README.md` (instalación y roadmap) |

Sin cambios en la API, la BD ni `packages/shared` (se reutiliza `healthSchema`).

## Tipos y firmas

```ts
// lib/platform.ts — flag de build: solo el build nativo es la app. Se lee en cada llamada (tests: vi.stubEnv('MODE', 'native')).
export const isNativeApp = (): boolean => import.meta.env.MODE === 'native';

// features/mobile/check-server.ts
export type ServerCheck =
  | { ok: true; url: string }                                   // URL normalizada
  | { ok: false; reason: 'invalid' | 'unreachable' | 'notIkrive' };
/** Completa `https://` si no hay esquema y normaliza con `normalizeServerUrl`; null si no es http(s) válida.
 *  La usan checkServer (R10, R11) y el aviso de HTTP de /server (R25: parseServerInput(value)?.startsWith('http:')). */
export function parseServerInput(input: string): string | null;
/** Completa `https://` si falta (R10), normaliza con `normalizeServerUrl` ('invalid' si lanza, sin fetch: R11),
 *  y hace `fetch(`${url}/api/health`, { credentials: 'omit', signal: AbortSignal.timeout(timeoutMs) })`
 *  directamente, NO con `apiFetch` (no debe mandar el token del servidor anterior: R9).
 *  Rechazo de fetch → 'unreachable' (R12); !res.ok, JSON inválido o !healthSchema.safeParse → 'notIkrive' (R13). */
export function checkServer(input: string, timeoutMs?: number /* 10_000 */): Promise<ServerCheck>;

// features/mobile/use-change-server.ts
/** setServerUrl(url) (borra el token si cambia, #50) → queryClient.clear() → navigate('/login'). */
export function useChangeServer(): (url: string) => Promise<void>;

// features/mobile/require-server.ts
/** beforeLoad de _app/login/register: si isNativeApp() && getServerUrl() === null → throw redirect('/welcome'). */
export function requireServer(): void;
/** beforeLoad de welcome/server: si !isNativeApp() → throw redirect('/login'). */
export function requireNative(): void;
```

```ts
// scripts (ESM, sin dependencias)
export function findPwaArtifacts(dir: string): string[];          // nombres encontrados; [] = limpio
export function androidVersion(tag: string): { name: string; code: number };
// 'v1.2.3' → { name: '1.2.3', code: 10203 }; lanza si no es v<maj>.<min>.<patch> (minor/patch < 100)
```

## Capacitor

`capacitor.config.json`: `appId: "com.ikrive.app"`, `appName: "Ikrive"`, `webDir: "../web/dist-native"` (R1), `server.androidScheme: "https"` (R3), `android.allowMixedContent: true` (R4). Sin `server.url` (la app carga sus assets locales) y **sin `CapacitorHttp`**: las peticiones salen del `fetch` de la WebView con `Origin: https://localhost`, así CORS y `TRUSTED_ORIGINS` aplican (nota de review #49). Sin plugins nativos en esta feature: la web no importa `@capacitor/core` (el flag es de build).

## Release (job `android` en `release.yml`)

`permissions: contents: write` solo en el job. Pasos: checkout → pnpm/node (`.nvmrc`) → `actions/setup-java@v4` (temurin 21, cache gradle) → comprobar que existen `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` o `exit 1` (R22) → `pnpm install --frozen-lockfile` → `pnpm --filter @ikrive/mobile build:web` → `cap sync android` → `read name code < <(node scripts/android-version.mjs "$GITHUB_REF_NAME")` → `./gradlew assembleRelease -PikriveVersionName=$name -PikriveVersionCode=$code` (R21) → keystore decodificado a `$RUNNER_TEMP` → `zipalign -p 4` + `apksigner sign` + `apksigner verify` de build-tools (R19) → `ikrive-$TAG.apk` y `sha256sum ikrive-$TAG.apk > ikrive-$TAG.apk.sha256` → `gh release view "$TAG" || gh release create "$TAG" --verify-tag --title "$TAG" --generate-notes`; `gh release upload "$TAG" … --clobber` (R20). El job `image` no cambia.

## Impacto en UI

- **`/welcome`** con `AuthLayout` (título «Cómo quieres usar Ikrive»): dos tarjetas-botón grandes (≥44 px, radio 12). «Mi servidor» (icono `Server`) es un `Link` a `/server`; «En este teléfono» (icono `Smartphone`) es un `<button disabled aria-disabled>` con `Badge` «Próximamente» (R7).
- **`/server`** con `AuthLayout`: formulario como `login.tsx` (`useForm` + `FormField` + `Input type="url" inputMode="url" autoCapitalize="none" autoCorrect="off"`, placeholder `https://ikrive.example.com`). Botón «Conectar», deshabilitado y con texto «Comprobando…» mientras dura (R9). Errores: URL inválida en el campo (`aria-invalid`, R11); «no responde» / «no es Ikrive» como `<p role="alert">` (R12, R13). Mientras el valor del campo se normalice a `http:` (`useWatch` + `parseServerInput`), aviso bajo el campo con el estilo de `features/reports/warning.tsx` (`bg-warning/15`, icono `TriangleAlert`; se reutiliza el componente moviéndolo a `components/` si encaja): «Conexión sin cifrar: tu contraseña y el token viajarán en claro. Usa HTTPS o una VPN.» (`mobile.server.insecure`). No bloquea: «Conectar» sigue habilitado (R25). Enlace «Volver» a `/welcome`. El campo empieza con el servidor guardado, si hay.
- **`/login`** en la app: bajo el formulario, «Servidor: ikrive.example.com · Cambiar servidor» (R15). En la web, nada nuevo.
- **`RouteErrorScreen`** en la app con error de red: botón `outline` «Cambiar servidor» junto a «Reintentar» (R16).
- Claro/oscuro/móvil: solo tokens existentes. Las pantallas se ven en la web con `pnpm dev --mode native` (Vite carga el flag igual) para las capturas.

## Decisiones a validar (Gate 1)

1. **Ficheros nativos fuera de esta feature — ACEPTADA en Gate 1.** En la WebView de Android, `<a download href="blob:…">` no descarga y `openBlob` (`target="_blank"` con `blob:`) no abre el PDF: en la APK no funcionarán **descargar/abrir facturas, el export zip ni el `.ics`**. Van a la feature nueva `mobile-native-files` (el leader la añade al backlog justo después de #51), que cambia solo la costura `lib/download.ts` / `lib/api-files.ts` por `@capacitor/filesystem` + `@capacitor/share` (o un file-opener) en la app. Mientras, `docs/mobile.md` lo lista como limitación conocida. **No se publica ningún tag con APK hasta tener `mobile-native-files`**: el job `android` de `release.yml` se implementa y prueba aquí, pero el primer tag tras #51 espera a esa feature.
2. **HTTP permitido** (R4): `allowMixedContent` + `usesCleartextTraffic`, porque el autoalojamiento en LAN sin TLS es habitual y `setServerUrl` ya acepta `http:`. La contraseña y el token viajan en claro en ese caso: `/server` muestra un aviso no bloqueante cuando la URL normalizada es `http:` recomendando HTTPS o VPN (R25, pedido en Gate 1) y `docs/mobile.md` lo repite. Alternativa: exigir `https:` en la app (más seguro, deja fuera a muchos servidores caseros).
3. **Sin esquema → `https://`** (R10): comodidad al teclear en el móvil; no se prueba `http://` a ciegas.
4. **Detección por flag de build** (`MODE === 'native'`) y no `Capacitor.isNativePlatform()` en tiempo de ejecución: no añade dependencias a la web, es determinista y el mismo flag quita la PWA.
5. **`applicationId` `com.ikrive.app`** y nombre «Ikrive»: no se puede cambiar después sin que sea otra app.
6. **Almacenamiento:** se mantiene `localStorage` de #50 (persiste en la WebView). `@capacitor/preferences` o un almacén seguro quedan fuera.
7. **Las dos defensas de caché** (R17 y R18), aunque el acceptance pide una: `clear()` cubre `me`, vehículos, etc.; la clave con servidor protege si en el futuro se cambia de servidor por otra vía.
8. **Firma con `apksigner` en el workflow**, no `signingConfig` en Gradle: las contraseñas no pasan por Gradle ni por ficheros del repo. **Tú creas el keystore y los 4 secretos antes del primer tag** (pasos en `docs/mobile.md`) y lo guardas: perderlo impide actualizar la app instalada.
9. **Release:** `gh` CLI (sin acción de terceros con permiso de escritura); crea la Release si no existe (con notas generadas) y, si ya la creaste a mano, solo sube los dos ficheros. Trigger `v*.*.*` (el del workflow actual; el acceptance dice `v*`).
10. **CI con job `android`** (`assembleDebug` sin firmar, ~4–6 min, APK debug como artefacto): sin él, el proyecto Gradle solo se compila al etiquetar; además te da una APK para probar en Gate 2. **Solo corre si cambian `apps/mobile/**`, `apps/web/**`, `pnpm-lock.yaml` o `.github/workflows/ci.yml`** (pedido en Gate 1). `paths:` solo existe a nivel de workflow (`on.push.paths`/`on.pull_request.paths`), así que en `ci.yml` saltaría también `check`, `e2e` y `docker`; por eso un job `changes` (`permissions: contents: read, pull-requests: read`) con `dorny/paths-filter@v3` (solo lectura) expone `outputs.android` y `android` lleva `needs: changes` + `if: needs.changes.outputs.android == 'true'`. Descartado: un `android.yml` aparte con `paths:` (otro workflow que mantener, duplicaría el setup) y un `git diff` a mano (casos de push inicial, `before` vacío y fork que `paths-filter` ya resuelve). El job saltado cuenta como correcto si se marca como check obligatorio.
11. **«Cambiar servidor» solo en login y en la pantalla de error**, no dentro de la app con sesión: para cambiar, se cierra sesión primero.

## Alternativas descartadas

- **Alias de `virtual:pwa-register` a un stub y quitar `VitePWA` del array en modo nativo:** funciona, pero `disable: true` del propio plugin hace lo mismo (los módulos virtuales siguen resolviendo como no-op) sin stub propio. Si al implementar `disable` dejara algún artefacto, `check-web-dir` lo detecta y se pasa a esta alternativa.
- **`Capacitor.isNativePlatform()` en tiempo de ejecución:** añade `@capacitor/core` al bundle de la web y obliga a mockear un módulo en los tests (decisión 4).
- **`capacitor.config.ts`:** obliga a tener TypeScript y un `tsconfig` en `apps/mobile` y entraría en `pnpm typecheck`; el JSON basta.
- **`webDir` propio (`apps/mobile/www`) con copia:** un paso más y otra carpeta que ignorar; Capacitor acepta la ruta relativa al build nativo.

## Riesgos

- **No hay emulador en CI:** la app solo se prueba de verdad en un dispositivo. El implementer cubre la lógica con Vitest/`node:test` y deja en `progress/impl_mobile-shell-android.md` cómo probar la APK debug del job `android` (contra un servidor con `https://` y otro con `http://` en LAN). Conviene que lo pruebes antes de Gate 2.
- **El workflow de release solo corre de verdad al empujar un tag:** sus pasos van probados por partes (scripts con tests, `build:web` y `assembleDebug` en CI). La primera release puede pedir un ajuste; la imagen Docker se publica en un job independiente.
- **Docker:** con `apps/mobile` en el lockfile, `pnpm install --frozen-lockfile` necesita su `package.json`; instala la CLI de Capacitor solo en la etapa `build` (no llega al runtime). Comprobar `docker build` y el límite de 250 MB.
- **`vite.config.ts` como función:** `vitest.config.ts` y cualquier otro import de la config deben adaptarse; si no, fallan los tests de la web.
- **`AbortSignal.timeout`** en la WebView: soportado desde Chrome 103; Capacitor exige WebView más reciente.
- **Enlaces externos** (`target="_blank"` a Google/Outlook Calendar): Capacitor abre en el navegador del sistema las navegaciones a otros hosts; se comprueba a mano con la APK debug, sin requirement.

## Fuera de alcance

- Guardar/abrir ficheros con APIs nativas: feature `mobile-native-files`, justo después de #51; hasta tenerla no se publica ningún tag con APK (decisión 1), calendario y notificaciones (#52), modo «En este teléfono» (#53, #54), iOS.
- Botón atrás de Android, splash propio, deep links, Play Store, actualizaciones dentro de la app.
- Cambios en la API (CORS y token ya están en #49).
