# Review — #51 mobile-shell-android

**Veredicto:** APPROVED

## Tercera revisión (Gate 2: validación de URL en la WebView)
Diff sin commitear revisado: `apps/web/src/lib/server.ts`, `apps/web/src/lib/server.test.tsx` y `apps/web/src/features/mobile/check-server.test.tsx`.
- **R11:** [x] `normalizeServerUrl` rechaza cualquier espacio en blanco **antes** de parsear y, después, un `hostname` que no cumpla `VALID_HOST` (DNS/IPv4 sin `%`, o IPv6 entre corchetes). Así la validación ya no depende de si `new URL` lanza. `checkServer('hola mundo')` y `checkServer('hola%20mundo')` devuelven `invalid` sin `fetch` (`check-server.test.tsx` › `rejects an invalid URL without fetching`). El test con `URL` falso permisivo (`vi.stubGlobal`, que `setup.ts:40` restaura con `vi.unstubAllGlobals()`) reproduce el comportamiento de Chromium y afirma `null`/`TypeError`. Con ese stub, `hola%20mundo` solo se rechaza por la comprobación del host, así que el test no depende del parser de Node.
- **R10:** [x] sin cambios en `parseServerInput`: el `https://` se sigue añadiendo antes de normalizar, y el nuevo test `accepts DNS names, IPv4 with port and bracketed IPv6` confirma que la regla no rechaza entradas válidas sin esquema (`ikrive.example.com`, `192.168.1.10:3000`).
- **R14:** [x] la forma normalizada no cambia (`origin + pathname` sin barras finales). Los tests de `server-screen` y `check-server` que guardan y navegan siguen en verde.
- **R6:** [x] no se toca (`/welcome`). Siguen en verde.
- **#50 (`setServerUrl`):** comparte `normalizeServerUrl`, así que también rechaza espacios y hosts escapados con `TypeError` sin tocar el valor guardado (nuevo test en `server.test.tsx`). Los únicos llamadores son `use-change-server.ts:13`, que recibe la URL ya normalizada por `checkServer` (idempotente), y `test/render.tsx`. El resto de tests de `server.test.tsx` y de #50 siguen pasando. El efecto colateral (ya no se recortan espacios finales en `setServerUrl`) está anotado en el impl y no afecta a ningún llamador.
- **Alcance:** el cambio se limita a la validación de R11. `impl_` está actualizado con el mapa R→test.
- `pnpm harness --full` en verde, ejecutado por mí: web 60 ficheros / 403 tests, api 37 / 358, mobile 17.
- Aviso nuevo (no bloquea): `VALID_HOST` rechaza hostnames con `_` (p. ej. nombres de servicio de Docker como `ikrive_app`). Un navegador acepta esos nombres, pero no son nombres DNS válidos y desde un móvil no tiene sentido usarlos. Si alguien lo pide, se puede añadir `_` a la clase.

## Segunda revisión
- **Cambio requerido 1:** resuelto. En el Checklist, la línea del router (`impl_` l.184) ahora espera «El servidor no responde… TRUSTED_ORIGINS…» y explica que es por CORS. Deja claro que «no es un servidor de Ikrive» solo aparece si el servidor responde con CORS para `https://localhost`, y que R13 está cubierto por tests.
- **Cambio requerido 2:** resuelto. En «Del CI» (l.150) se añade el paso previo: el leader commitea, empuja `feat/mobile-shell-android` y abre el PR, porque el workflow solo corre en `pull_request` y en push a `main`. También dice que el artefacto llega como zip y hay que descomprimirlo, y que `gh run download` ya lo deja descomprimido.
- **Extra `docs/mobile.md`:** nueva sección «CORS: `TRUSTED_ORIGINS`» (l.24-34) con el párrafo sobre webs que no son Ikrive, que aparecen como «no responde». Es correcto (`check-server.ts`: un TypeError da `unreachable`), lo cubre R23 y recoge el aviso «R13 en la práctica» de la primera revisión. `docs.test.mjs` sigue pasando.
- **Sin regresiones:** desde la primera revisión el código no ha cambiado (el estado de `git status` es el mismo). `pnpm harness --full` en verde: web 60 ficheros / 399 tests, api 37 / 358, mobile 17.

## Primera revisión (histórico)

El código, los tests, los workflows y la infra estaban bien y `pnpm harness --full` estaba en verde. Rechacé solo porque la sección «Cómo probar en el móvil» de `progress/impl_mobile-shell-android.md` (entregable de T17) tenía un resultado esperado incorrecto y le faltaba un paso previo.

## Trazabilidad requirements ↔ tests
- R1: [x] `apps/mobile/test/config.test.mjs` › `packages the native web build` (`webDir` resuelve a `apps/web/dist-native`)
- R2: [x] `apps/mobile/test/check-web-dir.test.mjs` (3 tests: detecta `sw.js`/`registerSW.js`/`workbox-*`/manifiesto y `<link rel="manifest">`, y acepta un build limpio) + paso `build:web` en el job `check` de CI, que afirma `release-workflow.test.mjs` › `ci android job…`. Lo he comprobado sobre los builds que hay en disco: `dist-native` limpio y `dist` con `sw.js`, `workbox`, el manifiesto y el link (la web conserva la PWA).
- R3: [x] `config.test.mjs` › `serves the app from https://localhost` (`androidScheme: https`, sin `server.url` y hostname `localhost`)
- R4: [x] `config.test.mjs` › `allows http servers` (`allowMixedContent` y `usesCleartextTraffic="true"` dentro de `<application>`)
- R5: [x] `apps/web/src/features/mobile/welcome.test.tsx:13` › `native app without a server: redirects every route…` (`/`, `/login` y `/register` acaban en `/welcome` y `fetch` no se llama)
- R6: [x] `welcome.test.tsx:27` › `shows both modes and leads «Mi servidor» to the server screen`
- R7: [x] `welcome.test.tsx:38` › `shows «En este teléfono» disabled as coming soon` (`disabled`, `aria-disabled` y «Próximamente»)
- R8: [x] `welcome.test.tsx:49` › `web: redirects /welcome and /server to the login`
- R9: [x] `check-server.test.tsx:35` › `requests /api/health without cookies nor Authorization` (URL, `credentials: 'omit'`, sin `authorization` aunque haya un token del servidor anterior, `signal` presente) + `server-screen.test.tsx` › `disables the button while checking`. Ver el aviso sobre los 10 s.
- R10: [x] `check-server.test.tsx:20` › `adds https:// when the URL has no scheme` (comprueba la URL pedida) + `parseServerInput…`
- R11: [x] `check-server.test.tsx:27` (`invalid` y ningún fetch) + `server-screen.test.tsx:186` (mensaje en el campo, `aria-invalid`, sin fetch y servidor sin guardar)
- R12: [x] `check-server.test.tsx:49` (TypeError y timeout real con `timeoutMs` pequeño) + `server-screen.test.tsx:199` (alerta con «no responde» y `TRUSTED_ORIGINS`; el servidor guardado no cambia)
- R13: [x] `check-server.test.tsx:70` (500, `{}` y HTML) + `server-screen.test.tsx:217` (alerta y el servidor guardado no cambia)
- R14: [x] `check-server.test.tsx:81` + `server-screen.test.tsx:246` (URL normalizada guardada, ruta `/login` y `GET` a `https://ikrive.example.com/api/me`)
- R15: [x] `apps/web/src/features/auth/login-page.test.tsx` › `native app: shows the saved server and a link to change it` (texto «Servidor: ikrive.example.com» y el enlace navega a `/server` con el valor precargado) · `web: shows no server link`
- R16: [x] `apps/web/src/features/pwa/route-error.test.tsx` › `native app: offers to change the server on a network error` · `web: offers only retry`
- R17: [x] `server-screen.test.tsx:260` › `clears the query cache when the server changes` (el `me` sembrado ya no está, el login no redirige y no queda ninguna query `api-file`)
- R18: [x] `apps/web/src/components/api-image.test.tsx` › `server mode: does not reuse a file cached for another server` (misma caché sin `clear()`: dos peticiones a dos hosts y dos `blob:`)
- R19: [x] `apps/mobile/test/release-workflow.test.mjs` › `signs the APK with apksigner` (zipalign, sign con las contraseñas por `env:`, verify, `trap` que borra el keystore, sin `signingConfig`) + trigger `v*.*.*`
- R20: [x] `release-workflow.test.mjs` › `uploads the APK and its sha256 to the tag release` (`contents: write`, `sha256sum`, `view || create --verify-tag`, `upload --clobber`)
- R21: [x] `android-version.test.mjs` (3 tests, casos límite incluidos) + `config.test.mjs` › `reads the version from Gradle properties` + `release-workflow.test.mjs` › `passes the version from the tag to Gradle`
- R22: [x] `release-workflow.test.mjs` › `release job checks the signing secrets before building` (los 4 secretos, `exit 1`, y que `pnpm install`, `build:web`, `assembleRelease` y `gh release` van después)
- R23: [x] `apps/mobile/test/docs.test.mjs` › `documents install, CORS and the iPhone alternative`
- R24: [x] `apps/web/src/i18n/locales.test.ts` (mismas claves en es/en) + bloque `mobile.*` revisado en los dos idiomas
- R25: [x] `server-screen.test.tsx:283` › `warns that an http server is not encrypted…` (sin aviso con `https` ni sin esquema; con `http:` hay aviso, «Conectar» sigue habilitado y guarda `http://…`)

## Tasks
- T1..T18: [x]

## Checkpoints
- C1: [x] harness en verde, una sola feature activa (#51 `in_progress`) y rama `feat/mobile-shell-android`.
- C2: [x] spec completo y en EARS; tasks `[x]`; cada R tiene un test que he abierto y leído.
- C3: [x] el diff se ciñe a `design.md`. Mover `Warning` a `components/` lo autoriza el diseño. README (instalación y roadmap) y `docs/self-hosting.md`, según el diseño.
- C4: [x] código web en `features/mobile/`, textos en es/en y componentes reutilizados (`AuthLayout`, `FormField`, `Badge`, `Warning`). Ni API ni BD.
- C5: [x] sin `any` ni `@ts-ignore` nuevos (los `as any` están en `routeTree.gen.ts`, que es generado). Los `console.log` y `console.error` de los scripts son la salida de sus CLI.
- C6: [x] `pnpm harness --full` en verde (web 399, api 358, mobile 17). Capturas en claro, oscuro y móvil en `scratchpad/shots51/` y de la APK en `scratchpad/apk-shots/` (existen; he revisado una).
- C7: [x] `impl_` con archivos, mapa R→test y verificación; `current.md` al día; PLAN sin cambios de fase.

### Puntos pedidos por el leader
- **La web no cambia:** `isNativeApp()` depende del flag de build (`MODE === 'native'`), así que en la web `requireServer` no hace nada y `/welcome` y `/server` redirigen a `/login`. `main.tsx` registra el service worker igual que antes. `VitePWA` solo se desactiva en modo `native`, y `dist/` conserva `sw.js`, el manifiesto y el `<link>`. `vitest.config.ts` se adaptó a la config como función. Bien.
- **CI:** `check`, `e2e` y `docker` no tienen `if` (lo afirma un test). `changes` tiene solo permisos de lectura. `android` lleva `needs` + `if`. **Release:** `contents: write` solo en el job `android`; el `image` mantiene sus permisos. Los secretos se comprueban antes de instalar o compilar. Las contraseñas pasan a `apksigner` por `env:`, no en la línea de comandos. El keystore va a `$RUNNER_TEMP` con un `trap` que lo borra. `view || create` + `--clobber` hace que se pueda reejecutar sin problema. Un tag no válido hace fallar el paso, porque la sustitución de comandos lo propaga con `bash -e`.
- **Ignores:** `dist-native/`, `*.keystore` y `*.jks` en `.gitignore`. El `android/.gitignore` de Capacitor cubre `build/`, `.gradle/`, `local.properties`, `assets/public`, `capacitor.config.json`/`plugins.json` copiados, `res/xml/config.xml`, `capacitor-cordova-android-plugins` y `*.apk`. Con `git status --ignored` he comprobado que todo lo generado aparece ignorado y que los 51 ficheros versionables de `android/` son fuente. `.dockerignore` excluye `apps/mobile/android` y `**/dist-native`. biome excluye `apps/mobile/android`. El Dockerfile copia solo `apps/mobile/package.json` para el lockfile, y el runtime no lleva Capacitor.

## Hallazgos (primera revisión, resueltos)
1. `progress/impl_mobile-shell-android.md` › «Cómo probar en el móvil» › 4. Checklist: «Una web que no es Ikrive (p. ej. el router) → «no es un servidor de Ikrive»». En la APK eso no va a pasar. La WebView pide `/api/health` con `Origin: https://localhost`, y un router o cualquier web que no sea Ikrive no devuelve `Access-Control-Allow-Origin`. El `fetch` se rechaza por CORS (TypeError), así que `checkServer` devuelve `unreachable` y la app muestra «El servidor no responde… TRUSTED_ORIGINS…» (`check-server.ts:35-41`). Además, si se escribe sin esquema, se prueba `https://` y el router suele fallar ya en TLS. El humano marcaría R13 como roto cuando la app funciona según el diseño. R13 solo se puede ver en dispositivo con un servidor que responda con CORS permisivo para `https://localhost` y un cuerpo que no sea `healthSchema` (o con un estado no 2xx que lleve CORS). Afecta a T17 (instrucciones de prueba de la APK debug).
2. Misma sección, «1. Conseguir la APK debug › Del CI (lo más fácil)»: da por hecho que existe un PR, pero la rama no tiene commits (el propio impl dice «Rama … sin commits») y nadie la ha empujado. No dice que antes hay que commitear y empujar `feat/mobile-shell-android` y abrir el PR (o empujar la rama: el workflow solo corre en `pull_request` y en push a `main`, así que hace falta el PR). Tampoco dice que el artefacto es un zip que hay que descomprimir antes del `adb install -r app-debug.apk`. Afecta a T17.

## Avisos para el humano (no bloquean)
- `VALID_HOST` rechaza hostnames con `_` (ver tercera revisión).
- **R9, límite de 10 s:** el test comprueba que hay `signal` y que con `timeoutMs` pequeño se aborta, pero no que el valor por defecto sea 10 000 ms. Coincide con lo que pedía T3; el código usa `timeoutMs = 10_000`.
- **`ci.yml` sin bloque `permissions`:** el nuevo job `android` (como `check`, `e2e` y `docker`, que ya existían) recibe los permisos por defecto del `GITHUB_TOKEN`. Conviene `permissions: contents: read` a nivel de workflow en otra feature o en un `chore`.
- **`dorny/paths-filter@v3`** está fijada por tag y no por SHA. Es el mismo criterio que el resto de acciones del repo, aunque esta es de terceros.
- **No empujes ningún tag hasta #55 (`mobile-native-files`, decisión 1).** El job `android` de `release.yml` corre con cualquier `v*.*.*`. Si los secretos no están, el workflow Release sale en rojo, aunque la imagen se publica igual. Si están, publica la APK.
- **R13 en la práctica:** casi cualquier servidor que no sea Ikrive aparecerá como «no responde» y no como «no es Ikrive», por CORS. Ya está documentado en `docs/mobile.md`.
- `AndroidManifest.xml` mantiene `android:allowBackup="true"` (lo pone Capacitor por defecto). La copia de seguridad de Android puede incluir el `localStorage` de la WebView con el token de sesión. Se puede valorar `false` más adelante.
- Quedan `ExampleUnitTest` y `ExampleInstrumentedTest` en el paquete `com.getcapacitor.myapp`, tal como los deja `cap add` (está anotado en el impl).
- Si marcas `android` de CI como check obligatorio, cuando se salta cuenta como correcto. Está en el diseño.

## Cambios requeridos (primera revisión, resueltos)
1. En `progress/impl_mobile-shell-android.md` › Checklist, corregir la línea del router: con una web que no es Ikrive, en la APK lo esperado es «El servidor no responde… TRUSTED_ORIGINS…» (CORS). Dejar claro que «no es un servidor de Ikrive» solo aparece si el servidor responde con CORS para `https://localhost`, o quitar esa casilla porque R13 ya está cubierto por tests.
2. En la misma sección, apartado «Del CI», añadir el paso previo: commitear y empujar `feat/mobile-shell-android` y abrir el PR para que corra el job `android`. Indicar también que el artefacto `ikrive-debug-apk` se descarga como zip y hay que descomprimirlo antes de `adb install -r app-debug.apk`.
