# Exploración infra: #51 mobile-shell-android

## 1. Monorepo, lint, typecheck, test y arnés
- `pnpm-workspace.yaml`: incluye `apps/*`, `packages/*` y `e2e`. **Un `apps/mobile` entra solo en el workspace.** `allowBuilds` solo lista better-sqlite3, esbuild, sharp y lefthook: si alguna dependencia de Capacitor tiene postinstall, habrá que añadirla ahí.
- Raíz `package.json`:
  - Versión `0.1.0`, `packageManager: pnpm@11.21.0`, `engines.node >=22`; `.nvmrc` = 24.
  - Scripts: `lint` = `biome check .`, `typecheck` = `pnpm -r typecheck`, `test` = `pnpm -r test`, `build` = `pnpm -r build`, `harness` = `node scripts/harness/check.mjs`.
  - No hay turbo ni nx.
  - **Consecuencia:** si `apps/mobile/package.json` declara `typecheck`, `test` o `build`, se ejecutan en el harness y en CI. Si no los declara, `pnpm -r` lo salta.
  - **Riesgo:** un script `build` que llame a `cap sync`/gradle se ejecutaría en CI (`pnpm build`, ci.yml:22) y en `test:e2e`. Conviene que se llame distinto (p. ej. `build:android`), o que `build` solo copie o sincronice sin necesitar el SDK de Android.
  - Si hay `test`, debe tener tests o usar `--passWithNoTests`, como `packages/shared`.
- `tsconfig.base.json` (NodeNext, strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`). Web extiende con Bundler/DOM (`apps/web/tsconfig.json`). Un `capacitor.config.ts` en mobile necesitaría su propio tsconfig con `extends: ../../tsconfig.base.json`.
- `biome.json`:
  - `files.includes` = `["**", "!**/migrations/meta", "!**/routeTree.gen.ts", "!**/components/ui"]`, con `vcs.useIgnoreFile: true` e `ignoreUnknown: true`.
  - Biome respeta `.gitignore`. Si `apps/mobile/android/` se versiona (lo normal en Capacitor), Biome analizará sus `.json` y `.js`, p. ej. `android/app/src/main/assets/public/**` (copia del build web) y `capacitor.config.json` generado.
  - **Recomendado:** ignorar `apps/mobile/android/app/src/main/assets` y `**/android/app/build` en `.gitignore`, o excluir `!apps/mobile/android` en biome.json.
  - lefthook (`lefthook.yml`) pasa biome solo a los ficheros staged `*.{js,ts,tsx,json,css}`.
- `scripts/harness/check.mjs:43-53`: con `--full` ejecuta `pnpm lint/typecheck/test` en la raíz. **No tiene ninguna lista de apps.**
- `scripts/harness/guard.mjs:9`: `PRODUCT_CODE = /^(apps|packages|docker)\//`.
  - **`apps/mobile/**` queda protegido automáticamente**, igual que el resto de apps.
  - **`.github/workflows/**`, `docs/**`, `.gitignore` y `.dockerignore` NO están protegidos**: se pueden editar sin feature in_progress, y los agentes spec-author, reviewer y leader también pueden.
- `scripts/harness/lib.mjs` solo valida feature_list y specs; no depende de las rutas de apps.

## 2. GitHub Actions
- `.github/workflows/ci.yml`: push a main y PR.
  - Job `check` (l.9-22): checkout@v4, pnpm/action-setup@v4 (sin versión: la toma de `packageManager`), setup-node@v4 con `node-version-file: .nvmrc` y `cache: pnpm`, `pnpm install --frozen-lockfile`, lint, typecheck, test y build.
  - Job `e2e` (l.24-45), con Playwright y upload-artifact@v4.
  - Job `docker` (l.47-109): buildx con build amd64/arm64, tamaño de imagen, smoke y nativos.
- `.github/workflows/release.yml`: `on: push: tags: ['v*.*.*']` (l.4-5; ojo, no `v*`).
  - `permissions: contents: read, packages: write` (l.7-9).
  - Un único job `image`: login en ghcr, `docker/metadata-action@v5` (semver `{{version}}`, `{{major}}.{{minor}}` y `latest`) y `build-push-action@v6` multiarch con `build-args: VERSION=${{ github.ref_name }}` (l.39).
  - **Hoy no crea ninguna GitHub Release ni sube assets.** La release v0.1.0 (único tag) se creó a mano; ver `progress/impl_release-v0-1-0.md` si hace falta.
- Encaje del job `apk`:
  - Puede ir en release.yml como job paralelo `android` (o en un workflow nuevo `release-android.yml` con el mismo trigger), con `permissions: contents: write` a nivel de job.
  - Pasos: checkout@v4 → pnpm/action-setup@v4 → setup-node@v4 (.nvmrc, cache pnpm) → `actions/setup-java@v4` (temurin 21, `cache: gradle`) → `android-actions/setup-android@v3` (opcional, ubuntu-latest ya trae SDK) → `pnpm install --frozen-lockfile` → build web (`pnpm --filter @ikrive/web build`) → `npx cap sync android` → decodificar el keystore de un secreto base64 (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) → `./gradlew assembleRelease` con signingConfig desde env/gradle properties (o `apksigner` sobre el unsigned) → renombrar a `ikrive-${ref_name}.apk` → `sha256sum > .apk.sha256` → `softprops/action-gh-release@v2` (o `gh release upload/create`) contra el tag.
  - Si la Release la crea el job, conviene que sea idempotente (crear o actualizar) para convivir con una Release creada a mano con las notas del CHANGELOG.

## 3. Versionado
- Todos los package.json están en `"version": "0.1.0"`: raíz y `apps/api/package.json:3`, `apps/web:3`, `packages/shared:3`, `e2e:3`. Con mobile serían 6.
- `CHANGELOG.md`: Keep a Changelog con `## [Unreleased]` y `## [0.1.0] - 2026-11-06`.
- Runtime: `apps/api/src/lib/version.ts:1` `APP_VERSION = process.env.IKRIVE_VERSION ?? '0.0.0-dev'`. Dockerfile:35-41 `ARG VERSION` → `ENV IKRIVE_VERSION`, sacado de `github.ref_name` (con la `v`, p. ej. `v0.1.0`).
- `/api/health` devuelve `{status:'ok', version}` (`packages/shared/src/schemas/common.ts:32-35` `healthSchema`; `apps/api/src/modules/health/routes.ts`). Sirve para validar que el servidor es Ikrive: `healthSchema.safeParse`.
- Android:
  - `versionName` = tag sin `v` (`${GITHUB_REF_NAME#v}`) o `apps/mobile/package.json` version.
  - `versionCode` = `major*10000 + minor*100 + patch` (0.1.0 → 100), calculado en build.gradle desde una propiedad o env (`-PversionName=… -PversionCode=…`) para no editar `android/app/build.gradle` en cada release.
  - Alternativa: `github.run_number`, aunque no es determinista por versión.

## 4. Docker, .dockerignore y .gitignore
- `docker/Dockerfile:13-17` copia solo los package.json de api, web, shared y e2e, y después `pnpm install --frozen-lockfile`.
  - **Riesgo:** al añadir apps/mobile al workspace, el lockfile incluirá su importer. Con `--frozen-lockfile` y sin `apps/mobile/package.json` copiado, pnpm normalmente tolera importers ausentes, pero hay que verificarlo en el job docker de CI.
  - Si falla, hay que añadir `COPY apps/mobile/package.json apps/mobile/`, lo que instalaría Capacitor CLI en la etapa de build. No llega al runtime porque solo se copian `api/dist` y `web/dist`.
  - Se puede limitar con `pnpm install --filter '!@ikrive/mobile'`.
- Línea 20: `COPY . .` copia todo el contexto. `.dockerignore` ya excluye `**/node_modules`, `**/dist`, `.git` y otros, pero no `apps/mobile`.
  - **Recomendado:** añadir `apps/mobile/android` (o `apps/mobile` entero salvo package.json) para no meter el proyecto Gradle ni sus builds en el contexto. Si se excluye `apps/mobile` entero, no se puede copiar su package.json.
  - Nota: la imagen sí debe incluir la PWA (web/dist); solo la APK va sin SW.
- `.gitignore` hoy cubre node_modules, dist, coverage, .env, data, playwright, .tanstack y .claude. Faltan entradas Android:
  - `apps/mobile/android/.gradle/`, `apps/mobile/android/build/`, `apps/mobile/android/app/build/`, `apps/mobile/android/local.properties`
  - `apps/mobile/android/app/src/main/assets/public/`, `apps/mobile/android/app/src/main/assets/capacitor.config.json`, `apps/mobile/android/app/src/main/res/xml/config.xml`, `apps/mobile/android/capacitor-cordova-android-plugins/`
  - `*.keystore`, `*.jks`, `.idea/`
  - Capacitor genera su propio `android/.gitignore` con parte de esto.

## 5. Docs
- `docs/self-hosting.md` tiene estas secciones: Instalación con docker compose (l.7), Actualizar (35), Variables de entorno (43), Copias de seguridad (66), Exposición a internet (108; l.115 «cookie o token de la app»), Proxy inverso con HTTPS (117), Si BASE_URL es local (136) y Lanzar jobs (142).
  - La única mención a CORS es la fila `TRUSTED_ORIGINS` de la tabla (l.51): por defecto `capacitor://localhost,https://localhost`; `https://localhost` es Android y `capacitor://localhost` iOS; vacía = ninguno.
  - No hay sección propia de app móvil.
- Encaje propuesto: una sección nueva `## App móvil` en self-hosting.md, después de «Exposición a internet» (la app necesita alcanzar el servidor por la red: HTTPS, VPN o Tailscale), o un doc nuevo `docs/mobile.md` enlazado desde self-hosting y README. Contenido:
  - Descargar la APK de Releases y verificar `sha256sum -c`.
  - Permitir «orígenes desconocidos».
  - `TRUSTED_ORIGINS` debe incluir `https://localhost`.
  - Con `http://` (sin TLS) Android bloquea el cleartext salvo `usesCleartextTraffic` o network security config. Es una decisión de spec relevante para BASE_URL locales.
  - iPhone: Safari → Compartir → «Añadir a pantalla de inicio» (PWA) o compilar con Xcode.
- `README.md`:
  - Features (l.10, «PWA instalable»), Instalación con Docker (30-47) con su lista de enlaces a self-hosting (41-47), donde se añadiría «App Android / iPhone».
  - Roadmap (66-76): l.76 dice «Después de la v0.1.0 se estudia una app Android…» y habría que actualizarla.
- `config-docs.test.ts` exige que cada variable de entorno esté documentada en self-hosting.md (ver review #49 R3). No aplica si no hay variables nuevas.

## 6. Pendientes de #49 y #50 para la app nativa
- `progress/review_mobile-auth-api.md:55-58` y `progress/history.md:487`:
  - (1) `https://localhost` por defecto pasa el CSRF de Better Auth para cualquier página en `https://localhost`; ya está documentado.
  - (2) **Peticiones sin `Origin`:** Better Auth acepta el login sin `Origin`, `Referer` ni `Sec-Fetch-*` (curl o `CapacitorHttp` nativo), sea cual sea `TRUSTED_ORIGINS`. La lista solo limita a WebView y navegador. **A tener en cuenta en #51:** si se activa `CapacitorHttp` (plugin que parchea fetch), las peticiones saldrían sin Origin y sin CORS. La decisión de spec más simple es mantener el fetch de la WebView (origen `https://localhost` en Android), y así CORS y `TRUSTED_ORIGINS` aplican.
  - (3) No hay `Vary: Origin` para orígenes no listados; sin impacto.
  - (4) `set-auth-token` aparece en otras respuestas; sin impacto.
  - Además: el comentario de `apps/api/src/app.ts:92` sobre el orden CORS/rate limit sobra.
- CORS sin credenciales (`plugins/cors.ts`, `credentials: false`): la app debe usar Bearer (ya lo hace `lib/server.ts` en modo servidor) y nunca `credentials: 'include'`.
- Pendientes de #50 (`progress/history.md:493-496`):
  - URL y token en `localStorage` (`ikrive.serverUrl`, `ikrive.sessionToken`) con costura única en `apps/web/src/lib/server.ts` (`getServerUrl`/`setServerUrl`, que valida http(s) y borra el token al cambiar), pensada para que #51 cambie de almacén (p. ej. `@capacitor/preferences`).
  - Sin UI para fijar la URL: la pone #51.
  - Caché de ficheros `['api-file', url]` en `apps/web/src/lib/api-files.ts:14`: hay que incluir el servidor en la clave o ejecutar `queryClient.clear()` al cambiarlo (acceptance de #51).
  - En la WebView, `blob:` y pestañas nuevas (`openApiFile`, `saveApiFile`, `openBlob` en `download.ts`) necesitarán ayuda nativa (Filesystem/Share/Browser).
  - La descarga desde el visor no tiene test.
  - «Añadir al calendario» enlaza a la web del servidor.
- Sin SW en la APK: `apps/web/src/main.tsx:26` llama a `serviceWorker.register()` sin condición (`features/pwa/service-worker.ts`, `virtual:pwa-register`), y `apps/web/vite.config.ts:15` usa VitePWA `registerType: 'prompt'`. Hay dos vías: no registrar si `Capacitor.isNativePlatform()`, o un modo o variable de build (p. ej. `vite build --mode mobile` con `VitePWA({disable: true})`) para que la APK no lleve `sw.js` ni manifest. Esto toca `apps/web`, que también está protegido por guard.
