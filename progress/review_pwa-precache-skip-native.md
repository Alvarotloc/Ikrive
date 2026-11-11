# Review — #60 pwa-precache-skip-native

**Veredicto:** APPROVED

`sdd: false`: sin `specs/`; se valida contra `description` + `acceptance` de `feature_list.json` (ampliados por el humano a todo el código exclusivo de la app), `CONTRIBUTING.md`, `docs/` y `CHECKPOINTS.md`. Diff revisado: cambios sin commitear en `apps/web/src/features/pwa/config.ts`, `config.test.ts`, `apps/web/vite.config.ts`, `feature_list.json`, `progress/current.md` y el nuevo `progress/impl_pwa-precache-skip-native.md` (sin commits en `main..HEAD`).

## Trazabilidad acceptance ↔ tests

- A1 (chunks de todo el código exclusivo de la app con prefijo propio): [x] `apps/web/src/features/pwa/config.test.ts` › `names the chunks of native-only code with their own folder` (los 3 `lib/native-*.ts` y los 6 paquetes Capacitor → `assets/native/[name]-[hash].js`) y › `keeps the default name for web chunks, mixed chunks and empty chunks` (`download.ts`, `platform.ts`, `actions.ts`, `native-other.ts`, radix, workbox-window, `\0vite/preload-helper.js`, chunk mixto y vacío → `assets/[name]-[hash].js`). Build real reproducido: 8 chunks en `assets/native/`.
- A2 (precache sin esos chunks y con el resto): [x] › `does not precache the native-only chunks and still precaches the rest` (afirma `globIgnores` exacto y casos positivos/negativos, incluidos `assets/native-like-*.js`, `assets/web-*.js`, `assets/dist-*.js`) + test existente `precaches html, js, css…`. `sw.js` real reproducido.
- A3 (build nativo sin cambios): [x] › `renames the chunks in the web build only, not in the native build` (afirma `chunkFileNames === nativeChunkFileNames` en `production` y `undefined` en `native`). Build nativo reproducido byte a byte.
- A4 (test de la exclusión en la config PWA): [x] los anteriores.
- A5 (`pnpm harness --full` verde): [x] ejecutado por mí: lint, typecheck y test OK (web 454, api 368…).

## Verificación reproducida (en el scratchpad, sin tocar `apps/`)

1. **Chunks en `assets/native/`:** `vite build --outDir <scratch>/web` → `dist-BbtsWifC` (@capacitor/core), `native-{files,calendar,notifications}-*`, 4 `web-*` (fallbacks web de los plugins). Comparado con el build web de `main` (config de `main` en el scratchpad): mismo número de ficheros, y la diferencia del precache entre `main` (94 URLs) y la rama (86) son exactamente esos 8. Ningún chunk de `assets/` contiene `registerPlugin`/`Capacitor`. Ningún chunk web importa estáticamente nada de `./native/`: solo aparecen en `import()` dinámicos y en `__vite__mapDeps` de `_app`, `api-files`, `settings` y `_vehicleId`, que solo se ejecutan bajo `isNativeApp()`. `index.html` no referencia `native/` (sin modulepreload).
2. **`sw.js`:** 0 apariciones de `assets/native/`; 86 entradas; sigue precacheando `assets/dist-zvMMak_h.js` (chunk propio de la UI), `preload-helper`, `index`, CSS, iconos, etc.
3. **Rutas relativas:** los chunks nativos importan `../preload-helper-*.js`, `../index-*.js` y `./dist-*.js`; los web usan `import(\`./native/…\`)`; `__vite__mapDeps` lista `assets/native/…` y el preload helper los resuelve como `'/' + dep` (base `/`). No hay `base` configurado ni despliegue en subpath, así que no aplica. Además comprobé con un script en el scratchpad que `apps/api/src/plugins/static-spa.ts` (`wildcard: false`) sirve `/assets/native/*.js` con 200 y `application/javascript`.
4. **Build nativo:** `vite build --mode native` con la config de `main` y con la de la rama → `diff -r` idéntico (71 ficheros en `assets/`).

## Tasks
- N/A (`sdd: false`); el plan de `progress/current.md` está cubierto por completo.

## Checkpoints
- C1: [x] harness verde; una sola feature `in_progress` (#60); rama `feat/pwa-precache-skip-native`.
- C2: [x] N/A por `sdd: false`; cada acceptance tiene test concreto (abierto y leído).
- C3: [x] solo config PWA, su test y `vite.config.ts`; sin refactors ajenos.
- C4: [x] código en `features/pwa/`; sin API/BD/UI/i18n afectados.
- C5: [x] TS estricto sin `any`/`@ts-ignore`; sin `console.log` ni TODOs.
- C6: [x] `pnpm harness --full` verde; tests con resultados concretos; sin UI → sin capturas.
- C7: [x] `impl_*.md` con archivos, trazabilidad y salida; `current.md` al día; `PLAN.md` no requiere cambios.

## Hallazgos

Ninguno bloqueante.

## Avisos para el humano (no bloquean)

1. **Carpeta en vez de prefijo de nombre:** desviación razonable y más segura que la propuesta original: ningún chunk web puede caer en `assets/native/` por nombre, y el test lo cubre (`assets/native-like-*.js` no se ignora). Cumple el espíritu de «prefijo propio» (prefijo de ruta).
2. **`NATIVE_ONLY_MODULES` a mano** (`apps/web/src/features/pwa/config.ts:33`): el regex de scopes ya cubre cualquier plugin `@capacitor/*` y `@capacitor-community/*` nuevo sin tocar nada. Los huecos son (a) un `lib/native-<nuevo>.ts` y (b) un plugin de otro scope (como pasó con `@ebarooni`); en ambos casos el fallo es benigno (el chunk vuelve a precachearse, como antes de esta feature). Recomiendo, en una feature aparte o como seguimiento menor, un test que (i) recorra `src/lib/native-*.ts` y (ii) las `dependencies` de `apps/mobile/package.json` (salvo `@capacitor/android`/`cli`) y afirme que `nativeChunkFileNames` las manda a `assets/native/`. Eso es mejor que una línea en `CONTRIBUTING.md`, porque falla solo.
3. **Riesgo en la dirección peligrosa:** si en el futuro el código web importara estáticamente algo de `@capacitor/*` (p. ej. `Capacitor.isNativePlatform()` en `platform.ts`) y Rolldown lo dejara en un chunk propio, ese chunk iría a `assets/native/`, se cargaría online pero **no** offline desde la PWA. Hoy no ocurre (verificado en el build). Merece una frase en el JSDoc de `NATIVE_ONLY_MODULES` o en `CONTRIBUTING.md`: «la web no debe importar Capacitor de forma estática».
4. El test importa `vite.config.ts` (instancia los plugins en jsdom); funciona y es barato, solo tenerlo en cuenta si algún plugin futuro tiene efectos al construirse.

## Cambios requeridos

Ninguno.
