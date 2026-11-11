# Implementación: #60 pwa-precache-skip-native

`sdd: false` (sin spec). Guía: `acceptance` de `feature_list.json` y el plan de `progress/current.md`.

## Cambios por archivo

- `apps/web/src/features/pwa/config.ts`
  - `NATIVE_CHUNKS_DIR = 'assets/native/'`: carpeta propia de los chunks del código exclusivo de la app. El resto de chunks se escriben directamente en `assets/`, así que ningún chunk propio puede caer ahí por su nombre (a diferencia de un patrón como `web-*.js` o `native-*.js`).
  - `nativeChunkFileNames(chunk)`: `chunkFileNames` del build web. Un chunk va a `assets/native/[name]-[hash].js` solo si **todos** sus módulos son exclusivos de la app: `src/lib/native-{files,calendar,notifications}.ts` y `node_modules/{@capacitor,@capacitor-community,@ebarooni}/…` (core, plugins y sus `web.js`). Un chunk mixto o vacío conserva el nombre por defecto de Vite (`assets/[name]-[hash].js`), así nunca se excluye código que la web use.
  - `pwaWorkbox.globIgnores: ['assets/native/**']`; `globPatterns` y lo demás sin cambios.
- `apps/web/vite.config.ts`: `build.rolldownOptions.output.chunkFileNames = nativeChunkFileNames` solo si `mode !== 'native'`; en `--mode native` `build` es `{}` (como antes).
- `apps/web/src/features/pwa/config.test.ts`: 4 tests nuevos (ver tabla).

## Trazabilidad

| Acceptance | Prueba |
|---|---|
| Chunks nativos con prefijo propio | `config.test.ts › names the chunks of native-only code with their own folder`; `› keeps the default name for web chunks, mixed chunks and empty chunks`; build web real (abajo) |
| Precache sin esos chunks y con el resto | `config.test.ts › does not precache the native-only chunks and still precaches the rest`; `› precaches html, js, css, fonts, images and icons` (existente); `sw.js` real (abajo) |
| Build nativo sin cambios | `config.test.ts › renames the chunks in the web build only, not in the native build`; diff del build nativo antes/después (abajo) |
| Test de la exclusión | los anteriores |
| `pnpm harness --full` en verde | salida abajo |

## Verificación del build

`pnpm --filter @ikrive/web build`:

```
dist/assets/native/web-B5-alc6s.js                     0.36 kB   (@capacitor/share web)
dist/assets/native/native-notifications-Cedxo8yw.js    0.97 kB   (lib/native-notifications + @capacitor/local-notifications)
dist/assets/native/native-files-DGOXk9qM.js            2.34 kB   (lib/native-files + filesystem/share/file-opener)
dist/assets/native/native-calendar-D1WESiVw.js         2.69 kB   (lib/native-calendar + @ebarooni/capacitor-calendar)
dist/assets/native/web-kI98L_az.js                     4.43 kB   (@capacitor/local-notifications web)
dist/assets/native/dist-BbtsWifC.js                    7.74 kB   (@capacitor/core)
dist/assets/native/web-bx5xUALB.js                     8.47 kB   (@capacitor/filesystem web)
dist/assets/native/web-nQZ4a5Ff.js                     9.41 kB   (@ebarooni/capacitor-calendar web)
```

8 chunks, ~36,4 kB. Son los mismos 8 que antes estaban en `assets/` (`native-*`, los cuatro `web-*` y `dist-BbtsWifC`); en `assets/` ya no queda ningún chunk con `registerPlugin`/`Capacitor`.

- Precache: antes **94 entradas (1823.44 KiB)**, ahora **86 entradas (1788.00 KiB)**.
- `dist/sw.js`: 0 apariciones de `assets/native/`; 86 URLs. El único `dist-*` precacheado es `assets/dist-zvMMak_h.js` (chunk propio de la UI, importa react-dom; no es Capacitor), que sigue en el precache como debe.
- Las importaciones entre carpetas se resuelven bien: `native-files-*.js` importa `../preload-helper-*.js` y `../index-*.js`; `__vite__mapDeps` usa `assets/native/…`.
- Build nativo: `vite build --mode native` con la config de `HEAD` y con la nueva, en dos carpetas del scratchpad → `diff -r` **idéntico** (71 ficheros en `assets/`).

## `pnpm harness --full`

```
[OK] lint · [OK] typecheck · [OK] test
web 454 (68 ficheros) · api 368 · shared 119 · mobile 27 · e2e (unit) OK
[OK] Arnés en verde.
```

## Desviaciones

- El «prefijo propio» es una carpeta (`assets/native/`) en lugar de un prefijo en el nombre del fichero: es un prefijo de ruta que ningún chunk propio puede tener, mientras que cualquier prefijo de nombre (p. ej. `native-`) podría coincidir con el de un fichero fuente futuro.
- Si en el futuro se añade otro módulo exclusivo de la app o un plugin de otro scope, hay que añadirlo a `NATIVE_ONLY_MODULES` en `features/pwa/config.ts`; si no, su chunk seguiría precacheándose (no rompe nada). No se ha documentado fuera del JSDoc por no salir del alcance; candidato a una línea en `CONTRIBUTING.md`.
