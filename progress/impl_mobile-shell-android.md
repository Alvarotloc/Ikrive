# Implementación — mobile-shell-android (#51)

Rama `feat/mobile-shell-android`, sin commits. T1–T18 hechas.

## Cambios por archivo

### Web (`apps/web`)

| Archivo | Cambio |
|---|---|
| `vite.config.ts` | `defineConfig(({ mode }) => …)`; `VitePWA({ …, disable: mode === 'native' })` |
| `vitest.config.ts` | `mergeConfig(viteConfig({ mode: 'test', command: 'serve' }), …)` |
| `package.json` | script `build:native` (`vite build --mode native --outDir dist-native`) |
| `src/lib/platform.ts` (+ test) | `isNativeApp()` = `import.meta.env.MODE === 'native'` |
| `src/main.tsx` | `if (!isNativeApp()) serviceWorker.register()` |
| `src/lib/server.ts` | exporta `normalizeServerUrl` (sin más cambios) |
| `src/lib/api-files.ts` | `apiFileKey = (url) => ['api-file', getServerUrl(), url]` |
| `src/features/mobile/check-server.ts` (+ test) | `parseServerInput`, `checkServer` (`fetch` directo, `credentials: 'omit'`, `AbortSignal.timeout(10 s)`, `healthSchema`) |
| `src/features/mobile/require-server.ts` | `requireServer()` → `/welcome`; `requireNative()` → `/login` |
| `src/features/mobile/use-change-server.ts` | `setServerUrl` → `queryClient.clear()` → `/login` |
| `src/features/mobile/server-link.tsx` | «Servidor: host · Cambiar servidor» (solo en la app) |
| `src/routes/welcome.tsx`, `src/routes/server.tsx` | pantallas nuevas (diseño de `design.md`); `routeTree.gen.ts` regenerado |
| `src/routes/_app.tsx`, `login.tsx`, `register.tsx` | `requireServer()` al principio de `beforeLoad`; `login.tsx` pinta `<ServerLink />` |
| `src/features/pwa/route-error.tsx` | en la app y con error de red, `Button variant="outline"` «Cambiar servidor» (`Link` a `/server`) junto a «Reintentar» |
| `src/components/warning.tsx` | movido desde `features/reports/warning.tsx` (`git mv`) para reutilizarlo en `/server`; imports actualizados en `sale-report-dialog.tsx` y `report-shares-section.tsx` |
| `src/i18n/locales/{es,en}.json` | bloque `mobile.*` (`welcome`, `server` con `insecure`, `serverLink`) |
| Tests | `features/mobile/{check-server,welcome,server-screen}.test.tsx`, `lib/platform.test.ts`; casos nuevos en `features/auth/login-page.test.tsx`, `features/pwa/route-error.test.tsx` y `components/api-image.test.tsx` |

### `apps/mobile` (nuevo)

| Archivo | Cambio |
|---|---|
| `package.json` | `@ikrive/mobile`, privado; `@capacitor/core` y `@capacitor/android` `8.6.0`, dev `@capacitor/cli` `8.6.0` (versiones exactas). Scripts `build:web`, `sync`, `test` (`node --test`); sin `build` ni `typecheck` |
| `capacitor.config.json` | `com.ikrive.app`, «Ikrive», `webDir: ../web/dist-native`, `androidScheme: https`, `allowMixedContent: true`; sin `server.url` ni `CapacitorHttp` |
| `android/` | generado con `cap add android` (Capacitor 8, Gradle 8.14.3, compile/target SDK 36, minSdk 24). `app/build.gradle`: `versionCode`/`versionName` desde `-PikriveVersionCode`/`-PikriveVersionName` (por defecto `1`/`0.0.0-dev`). `AndroidManifest.xml`: `android:usesCleartextTraffic="true"`. Iconos: `mipmap-*/ic_launcher.png` desde `icon-512.png`, `ic_launcher_round.png` (recorte circular) y `ic_launcher_foreground.png` (adaptativo, 108 dp) desde `icon-maskable-512.png`, fondo adaptativo `#143941` (color del borde del maskable). Se borran los drawables del icono por defecto de Capacitor, que ya no se usaban |
| `scripts/check-web-dir.mjs` | `findPwaArtifacts(dir)` + CLI (sale con 1 si encuentra algo) |
| `scripts/android-version.mjs` | `androidVersion(tag)` + CLI (`name code`) |
| `test/*.test.mjs` | `config`, `check-web-dir`, `android-version`, `release-workflow`, `docs` |

### Infra y docs

| Archivo | Cambio |
|---|---|
| `.github/workflows/release.yml` | job `android` (`contents: write`): comprobación de los 4 secretos → install → `build:web` → `cap sync` → `assembleRelease` con la versión del tag → `zipalign` + `apksigner sign/verify` (keystore en `$RUNNER_TEMP`, borrado con `trap`) → `sha256sum` → `gh release view || gh release create --verify-tag --generate-notes` + `gh release upload --clobber`. El job `image` no cambia |
| `.github/workflows/ci.yml` | `check`: paso `pnpm --filter @ikrive/mobile build:web`. Jobs nuevos `changes` (`dorny/paths-filter@v3`, solo lectura) y `android` (`needs: changes`, `if` sobre su salida): `assembleDebug` y artefacto `ikrive-debug-apk` (14 días) |
| `docker/Dockerfile` | `COPY apps/mobile/package.json apps/mobile/` antes de `pnpm install --frozen-lockfile` |
| `.dockerignore` | `**/dist-native`, `apps/mobile/android` |
| `.gitignore` | `dist-native/`, `*.keystore`, `*.jks` |
| `biome.json` | `"!apps/mobile/android"` en `files.includes` |
| `pnpm-lock.yaml` | importer `apps/mobile` |
| `docs/mobile.md` (nuevo) | instalación (Releases, `sha256sum -c`, orígenes desconocidos, actualizar), conectar, `TRUSTED_ORIGINS`/`https://localhost`, alcanzable (LAN/VPN/proxy), HTTP vs HTTPS, iPhone (PWA), limitaciones (ficheros hasta `mobile-native-files`), publicar (keystore, secretos, compilar en local) |
| `docs/self-hosting.md` | enlace desde la fila `TRUSTED_ORIGINS` y desde «Exposición a internet» |
| `README.md` | enlace en la lista de instalación; el roadmap sustituye la frase «se estudia una app Android» por la casilla «App móvil» |

## Trazabilidad

| R | Test(s) |
|---|---|
| R1 | `apps/mobile/test/config.test.mjs` › packages the native web build |
| R2 | `apps/mobile/test/check-web-dir.test.mjs` › finds service worker and manifest files · finds a manifest link in index.html · accepts a clean build; `apps/web/src/lib/platform.test.ts` › is native only in the native build mode; CI `check` › `pnpm --filter @ikrive/mobile build:web` (el build real); `release-workflow.test.mjs` › ci android job … (afirma el paso en `check`) |
| R3 | `config.test.mjs` › serves the app from https://localhost (y › keeps CapacitorHttp off) |
| R4 | `config.test.mjs` › allows http servers |
| R5 | `apps/web/src/features/mobile/welcome.test.tsx` › native app without a server: redirects every route to the welcome screen without calling the API |
| R6 | `welcome.test.tsx` › shows both modes and leads «Mi servidor» to the server screen |
| R7 | `welcome.test.tsx` › shows «En este teléfono» disabled as coming soon |
| R8 | `welcome.test.tsx` › web: redirects /welcome and /server to the login |
| R9 | `check-server.test.tsx` › requests /api/health without cookies nor Authorization; `server-screen.test.tsx` › disables the button while checking |
| R10 | `check-server.test.tsx` › adds https:// when the URL has no scheme · parseServerInput completes the scheme and normalizes |
| R11 | `check-server.test.tsx` › rejects an invalid URL without fetching; `server-screen.test.tsx` › shows the field error for an invalid URL |
| R12 | `check-server.test.tsx` › reports unreachable when fetch rejects; `server-screen.test.tsx` › shows «no responde» mentioning TRUSTED_ORIGINS when the server does not answer |
| R13 | `check-server.test.tsx` › reports notIkrive on a non-2xx status or a body that is not a health response; `server-screen.test.tsx` › shows «no es Ikrive» when /api/health is not Ikrive |
| R14 | `check-server.test.tsx` › returns the normalized URL when the server is Ikrive; `server-screen.test.tsx` › saves the server and shows its login |
| R15 | `apps/web/src/features/auth/login-page.test.tsx` › native app: shows the saved server and a link to change it · web: shows no server link |
| R16 | `apps/web/src/features/pwa/route-error.test.tsx` › native app: offers to change the server on a network error · web: offers only retry |
| R17 | `server-screen.test.tsx` › clears the query cache when the server changes |
| R18 | `apps/web/src/components/api-image.test.tsx` › server mode: does not reuse a file cached for another server |
| R19 | `apps/mobile/test/release-workflow.test.mjs` › signs the APK with apksigner |
| R20 | `release-workflow.test.mjs` › uploads the APK and its sha256 to the tag release |
| R21 | `apps/mobile/test/android-version.test.mjs` › maps v1.2.3 to 1.2.3 and 10203 · maps v0.1.0 to 100 · rejects tags that are not v<major>.<minor>.<patch>; `config.test.mjs` › reads the version from Gradle properties; `release-workflow.test.mjs` › passes the version from the tag to Gradle |
| R22 | `release-workflow.test.mjs` › release job checks the signing secrets before building |
| R23 | `apps/mobile/test/docs.test.mjs` › documents install, CORS and the iPhone alternative |
| R24 | `apps/web/src/i18n/locales.test.ts` (mismas claves en es/en) + los tests de pantalla en español |
| R25 | `check-server.test.tsx` › parseServerInput completes the scheme and normalizes; `server-screen.test.tsx` › warns that an http server is not encrypted without blocking the connection |

## Verificación

### `pnpm harness --full`

```
[OK]    55 features: 50 done, 4 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #51 mobile-shell-android (in_progress)
[OK]    Rama actual: feat/mobile-shell-android
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test        (web 60 ficheros / 399 tests, api 37 / 358, mobile 17 node:test)
[OK]    Arnés en verde.
```

`pnpm test:e2e`: 6 passed (la web y su build de producción no cambian).

### Builds de la web

- `pnpm --filter @ikrive/web build` → `dist/` sigue teniendo `sw.js`, `workbox-*.js`, `manifest.webmanifest` y `<link rel="manifest">`.
- `pnpm --filter @ikrive/mobile build:web` → `dist-native/` sin nada de eso: «No PWA artifacts in …/apps/web/dist-native». No hace falta el alias de `virtual:pwa-register` (alternativa descartada): `disable: true` basta.

### Docker

`docker build -f docker/Dockerfile -t ikrive:dev .` OK. `node docker/image-size.mjs ikrive:dev` → **233,5 MB** (< 250 MB). Contenedor: `/api/health` → `{"status":"ok",…}`, `Access-Control-Allow-Origin: https://localhost` con `Origin: https://localhost`, `docker/smoke.mjs` OK, `public/` con `sw.js` y manifiesto (la imagen sigue llevando la PWA), sin Capacitor en el runtime.

### Android en local

En la máquina hay JDK 17 y 25, y Capacitor 8 pide JDK 21 (Gradle 8.14.3 no arranca con 25: «Unsupported class file major version 69»). Por eso he compilado en un contenedor `eclipse-temurin:21-jdk` con el SDK local montado (`~/Android/Sdk`, build-tools 36):

- `./gradlew assembleDebug -PikriveVersionName=1.2.3 -PikriveVersionCode=10203` → `app-debug.apk` (5,3 MB). `aapt2 dump badging`: `versionCode='10203' versionName='1.2.3'`. La APK lleva `assets/public/index.html` sin `sw.js` ni manifiesto.
- Ensayo de los pasos de release con un keystore desechable: `assembleRelease` → `zipalign -p -f 4` → `apksigner sign` (v2 y v3) → `apksigner verify` → `sha256sum -c` OK, y `versionCode='200' versionName='0.2.0'`. El paso que comprueba los secretos, probado en bash: si falta alguno sale con 1 y dice cuáles faltan.
- **La APK debug, en un emulador Android 17 (AVD local)**, manejada por CDP (Playwright `connectOverCDP` sobre la WebView depurable):
  - Origen `https://localhost`, ningún service worker registrado y ningún `<link rel="manifest">`. La primera pantalla es `/welcome`.
  - Contra un servidor con `TRUSTED_ORIGINS=` vacío: «no responde… TRUSTED_ORIGINS…».
  - Con un host inexistente: «no responde».
  - Con `http://10.0.2.2:3197`: aparece el aviso de conexión sin cifrar. Conectar guarda el servidor y lleva a su login con «Servidor: 10.0.2.2:3197». Al registrar la cuenta se guarda el token y se llega al dashboard («Hola, Ana»), así que CORS, bearer y HTTP en claro funcionan en la WebView.
  - Con el servidor parado: «Sin conexión» con «Reintentar» y «Cambiar servidor». Al volver el servidor, «Reintentar» recupera el dashboard.

### Capturas (fuera del repo)

Web en modo nativo (`vite --mode native`, Chrome, `reducedMotion: reduce`), flujo real contra un contenedor con `TRUSTED_ORIGINS=http://localhost:5199`, en `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/8ac3528d-4ade-49bb-b0db-af76a71ad82a/scratchpad/shots51/`:

- `welcome-{light,dark,mobile,mobile-dark}.png`
- `server-http-warning-{light,dark,mobile,mobile-dark}.png`
- `server-unreachable-{light,dark,mobile,mobile-dark}.png`
- `login-server-{light,dark,mobile,mobile-dark}.png`

APK en el emulador, en `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/8ac3528d-4ade-49bb-b0db-af76a71ad82a/scratchpad/apk-shots/`: `1-welcome.png`, `2-server-cors-error.png`, `3-server-http-warning.png`, `4-login-with-server.png`, `5-dashboard.png` y `6-offline-change-server.png`.

## Desviaciones y notas

1. **`Warning` movido a `components/warning.tsx`.** El diseño lo deja a criterio («si encaja») y encaja. Está hecho con `git mv`, así que el rename queda en el índice; no hay commit.
2. **Subtítulos nuevos** (`mobile.welcome.subtitle`, `mobile.server.subtitle`): `AuthLayout` exige `subtitle`.
3. **`cap sync`** se ejecuta en los workflows como `pnpm --filter @ikrive/mobile exec cap sync android`, que es el mismo comando dentro del paquete.
4. **Versión en `release.yml`:** uso `version="$(node … )"` + `read -r name code <<< "$version"` en vez de `read … < <(…)`. Con la sustitución de procesos, un tag no válido no hacía fallar el paso y Gradle habría compilado `0.0.0-dev`. Con la sustitución de comandos, `bash -e` sí falla.
5. **Keystore PKCS12.** `keytool` crea PKCS12 por defecto, y ahí la clave usa la contraseña del almacén (con contraseñas distintas, `apksigner` falla con `BadPaddingException`, lo vi en el ensayo). `docs/mobile.md` lo explica en la tabla de secretos.
6. **Test extra** en `config.test.mjs`: «keeps CapacitorHttp off…» (nota de review #49 recogida en el diseño).
7. **Splash:** queda el de Capacitor por defecto (el splash propio está fuera de alcance según el diseño). Se ve un instante al abrir la app, y `docs/mobile.md` lo cita como limitación.
8. **Proyecto Android generado:** se conservan `ExampleUnitTest`/`ExampleInstrumentedTest` (paquete `com.getcapacitor.myapp`) y `capacitor.build.gradle`/`capacitor.settings.gradle`, como los deja `cap add`. `gradle-wrapper.jar` va versionado, como es habitual.
9. **El job `android` de CI** usa la acción de terceros `dorny/paths-filter@v3` (decisión 10). No he podido ejecutar los workflows; sus pasos se ensayaron en local tal como se describe arriba.

## Cómo probar en el móvil

### 1. Conseguir la APK debug

- **Del CI (lo más fácil):** antes de la prueba, el leader commitea y empuja `feat/mobile-shell-android` y abre el PR (el workflow CI solo corre en `pull_request` y en push a `main`; no tienes que hacerlo tú). Después: PR → pestaña *Checks* → workflow **CI** → job **android** → *Summary* → artefacto **`ikrive-debug-apk`** (dura 14 días). Se descarga como **zip**: descomprímelo para sacar `app-debug.apk` antes de `adb install -r app-debug.apk`, o copia el `.apk` al móvil e instálalo desde el gestor de archivos. También: `gh run download <run-id> -n ikrive-debug-apk` (este ya lo deja descomprimido).
- **O compilarla en local** (JDK 21 y SDK de Android). Como aquí solo hay JDK 17/25, la forma que he probado es con Docker:

  ```bash
  pnpm install
  pnpm --filter @ikrive/mobile build:web
  pnpm --filter @ikrive/mobile exec cap sync android
  docker run --rm -u $(id -u):$(id -g) -e HOME=/tmp -e GRADLE_USER_HOME=/tmp/gradle -e ANDROID_HOME=/sdk \
    -v ~/Android/Sdk:/sdk -v $PWD:/repo -w /repo/apps/mobile/android \
    eclipse-temurin:21-jdk ./gradlew assembleDebug
  # → apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
  ```

  Con un JDK 21 instalado basta con `cd apps/mobile/android && ./gradlew assembleDebug`.

### 2. Instalarla

- Con cable y depuración USB activada: `adb install -r app-debug.apk`.
- Sin cable: pásala al móvil, ábrela y permite **instalar apps desconocidas** para la app con la que la abres (Archivos/Chrome).
- La APK debug está firmada con la clave de depuración: si algún día instalas una de release, desinstala antes la debug, y al revés.

### 3. Servidor alcanzable y `TRUSTED_ORIGINS`

- El móvil tiene que llegar al servidor: misma Wi-Fi (`http://192.168.x.y:3000`), VPN/Tailscale o tu dominio con HTTPS.
- En el `.env` del servidor, `TRUSTED_ORIGINS` debe incluir `https://localhost`. El valor por defecto (`capacitor://localhost,https://localhost`) ya lo incluye; si lo cambiaste, añádelo y reinicia el contenedor.
- Comprobación desde el ordenador: `curl -si -H 'Origin: https://localhost' http://<servidor>/api/health | grep -i access-control-allow-origin` debe devolver `https://localhost`.

### 4. Checklist

- [ ] Al abrir por primera vez sale «Cómo quieres usar Ikrive» con «Mi servidor» y «En este teléfono» (gris, «Próximamente», no hace nada).
- [ ] «Mi servidor» → escribir una dirección sin esquema (`ikrive.example.com`) prueba `https://`.
- [ ] Escribir `http://192.168.x.y:3000` muestra el aviso amarillo de conexión sin cifrar, y «Conectar» sigue activo.
- [ ] Texto que no es una URL (`hola mundo`) → error bajo el campo.
- [ ] Una IP sin Ikrive o apagada → «El servidor no responde… TRUSTED_ORIGINS…» (tarda como mucho 10 s). Mientras comprueba, el botón dice «Comprobando…».
- [ ] Una web que no es Ikrive (p. ej. el router) → también «El servidor no responde… TRUSTED_ORIGINS…»: no devuelve CORS para `https://localhost` y la WebView bloquea la respuesta. «No es un servidor de Ikrive» solo aparece si el servidor responde con CORS para `https://localhost` pero no es Ikrive; ese caso (R13) está cubierto por tests y no hace falta probarlo en el móvil.
- [ ] Con el servidor bueno → login con «Servidor: … · Cambiar servidor» debajo.
- [ ] Iniciar sesión (o crear la cuenta): dashboard, vehículos, fotos y miniaturas de facturas se cargan.
- [ ] Cerrar la app del todo y volver a abrirla: sigues con la sesión iniciada en el mismo servidor.
- [ ] Cerrar sesión → login → «Cambiar servidor» → poner otro servidor (o el mismo con otra dirección): no se ve nada del anterior (ni fotos, ni vehículos) y pide login.
- [ ] Con el servidor parado (o sin red): «Sin conexión» con «Reintentar» y «Cambiar servidor»; al volver el servidor, «Reintentar» recupera la pantalla.
- [ ] Icono de la app en el lanzador (adaptativo, fondo verde oscuro) y nombre «Ikrive».
- [ ] En «Añadir al calendario», los enlaces a Google/Outlook abren el navegador del sistema (riesgo anotado en el diseño, sin requirement).
- [ ] Tema claro/oscuro desde Ajustes.
- **Fuera de alcance (#55 `mobile-native-files`):** descargar o abrir facturas, el export zip y el `.ics` no funcionan en la APK; es lo esperado.

## Gate 2: validación de URL en la WebView

**Fallo (probando la APK):** en `/server`, «hola mundo» mostraba «El servidor no responde…» en vez del error bajo el campo (R11). `parseServerInput` confiaba en que `new URL('https://hola mundo')` lanzase; lo hace en Node/jsdom, pero Chromium (la WebView) lo acepta con el host `hola%20mundo`, así que se hacía la petición y fallaba como `unreachable`.

**Arreglo:** la regla vive en `normalizeServerUrl`, que usan tanto `parseServerInput` (R11) como `setServerUrl`, para que lo que se valida en `/server` y lo que se guarda sigan la misma regla.

- `apps/web/src/lib/server.ts` — `normalizeServerUrl` rechaza (`TypeError`) cualquier espacio en blanco en la entrada y, tras parsear, un `hostname` que no sea nombre DNS/IPv4 (letras, dígitos, guiones y puntos; sin `%`) o IPv6 entre corchetes (`VALID_HOST`). Doc de `setServerUrl` actualizada.
- `apps/web/src/features/mobile/check-server.test.tsx` — nuevos: «accepts DNS names, IPv4 with port and bracketed IPv6» (`ikrive.example.com`, `192.168.1.10:3000`, `http://[::1]:3000`) y «rejects whitespace and escaped hosts even when the URL parser accepts them (Android WebView)» (`hola mundo`, `https://hola mundo`, `hola%20mundo` con un `URL` falso permisivo vía `vi.stubGlobal`, para no depender del parser de Node). «rejects an invalid URL without fetching» añade `hola mundo` y `hola%20mundo` sin `fetch`.
- `apps/web/src/lib/server.test.tsx` — nuevos: «rejects whitespace and hosts that are not a DNS name, an IPv4 or a bracketed IPv6» (no cambia el guardado) y «checks the parsed host, not only whether the URL parser throws» (con `URL` falso permisivo).

| R | Test |
|---|---|
| R11 | `check-server.test.tsx` › parseServerInput › accepts DNS names, IPv4 with port and bracketed IPv6; › rejects whitespace and escaped hosts even when the URL parser accepts them (Android WebView); checkServer › rejects an invalid URL without fetching |
| R11 (coherencia en guardado) | `server.test.tsx` › rejects whitespace and hosts that are not a DNS name, an IPv4 or a bracketed IPv6; › checks the parsed host, not only whether the URL parser throws |

**Desviación:** ninguna de alcance. Efecto colateral asumido: `setServerUrl` ya no acepta URLs con espacios (antes `new URL` los recortaba al final); ningún llamador los pasa (`parseServerInput` recorta antes).

## Harness (Gate 2 URL)

`pnpm harness --full`: verde (lint, typecheck; web 403 tests, api 358, mobile 17).
