# Design — docker-image-slim

## Resumen

Hoy `pnpm deploy --prod` copia 360 MB de `node_modules` (275 paquetes: `vitest`, `jsdom`, 4 versiones de `esbuild`, `rolldown`, `drizzle-kit`… arrastrados por los peers de better-auth) sobre `node:24-bookworm-slim`, que **ya pesa 249 MB por sí sola**. Medido en local: `ikrive:dev` = 630 MB (suma de capas).

Dos cambios, y hacen falta los dos:

1. **Bundle completo con tsup**: todo dentro de `dist/` salvo `better-sqlite3`, `sharp` y `pdfkit`. El build escribe `dist/package.json` con esas tres dependencias fijadas y copia las fuentes del PDF a `dist/fonts/`.
2. **Runtime sobre `node:24-alpine`** (181 MB). Con bookworm-slim el objetivo de 250 MB es imposible.

**Prototipo** (en el scratchpad, sin tocar el repo): bundle de tsup (9,4 MB sin sourcemaps) + `npm install` de los tres externos en alpine con poda + SPA → **233 MB en amd64**. Arranca, aplica migraciones, sirve la SPA, procesa la foto (`image/webp`), corre `node dist/job.js reminders` y ejecuta como uid 1000. El PDF también se generó con el bundle una vez resueltas las fuentes (falla sin el cambio de R4).

## Archivos

### `apps/api`

| Archivo | Cambio |
|---|---|
| `tsup.config.ts` | Exporta `RUNTIME_EXTERNALS = ['better-sqlite3', 'sharp', 'pdfkit'] as const`, `OPTIONAL_UNBUNDLED = ['@opentelemetry/api']`, `runtimeManifest(versions)` y `createBuildOptions(outDir = 'dist')`; el `default` es `defineConfig(createBuildOptions())`. Ver abajo. |
| `package.json` | Añade `"pdfkit": "0.20.1"` (la versión exacta que fija `@react-pdf/font@4.1.2`; pnpm la deduplica). El resto de `dependencies` no cambia: se siguen usando en dev/tests y el bundle las incorpora. |
| `src/modules/reports/pdf/font-files.ts` | **Nuevo.** `REPORT_FONT_FILES`: lista `{ family, weight, file }` de los 4 `.woff`, sin imports, para que la usen `fonts.ts` y `tsup.config.ts` sin cargar react-pdf al leer la config. |
| `src/modules/reports/pdf/fonts.ts` | `resolveReportFont(family, file, bundledDir = new URL('./fonts/', import.meta.url))`: si existe `bundledDir/file` (bundle) lo devuelve (R4); si no, `require.resolve('@fontsource/<family>/files/<file>')` como hoy (R5). |
| `test/build.test.ts` | **Nuevo.** Ejecuta `build(createBuildOptions(tmp))` de tsup en un directorio temporal (timeout amplio, ~2 s) y analiza el metafile (R1–R3, R6). |
| `test/report-fonts.test.ts` | **Nuevo.** R4, R5 con un `bundledDir` temporal. |

### `docker/`

| Archivo | Cambio |
|---|---|
| `Dockerfile` | Tres etapas (abajo). |
| `prune-runtime.mjs` | **Nuevo.** Poda `node_modules` en la etapa `natives`: de `better-sqlite3` borra `deps/`, `src/`, `binding.gyp` y los `prebuilds/*.node` que no son `linuxmusl-${process.arch}`; borra `**/*.map` y los builds de `pdfkit` que no usa el bundle (`js/pdfkit.standalone.js`, `js/pdfkit.browser*`, `js/pdfkit.old*`). |
| `image-size.mjs` | **Nuevo.** `node docker/image-size.mjs <imagen> [maxMB=250]`: suma `docker history --human=false --format '{{.Size}}'`, imprime `ikrive image <imagen>: 233.2 MB` y sale con 1 si `>= max·10⁶` (R8, R9). |
| `smoke.mjs` | **Nuevo.** `node docker/smoke.mjs <baseUrl>` sin dependencias (fetch/FormData de Node ≥ 22). Espera a `/api/health` (reintentos ~30 s) y ejecuta en orden las comprobaciones de R12–R16 con un PNG 8×8 embebido en base64 y cabecera `origin: <baseUrl>`. Cada comprobación se llama `check('<nombre>', fn)`; al primer fallo imprime `✗ <nombre>: <detalle>` y `process.exit(1)` (R18). |

`release.yml` **no cambia**: mismo Dockerfile, mismas plataformas, y además se acelera (ver etapa `build`).

### `.github/workflows/ci.yml` (job `docker`)

1. `actions/checkout`, `actions/setup-node` (`.nvmrc`), `docker/setup-qemu-action@v3`, `docker/setup-buildx-action@v3`.
2. `build-push-action` `platforms: linux/amd64`, `load: true`, `tags: ikrive:ci`, caché `gha` como hoy.
3. Ídem `linux/arm64`, `tags: ikrive:ci-arm64` (R19).
4. `node docker/image-size.mjs ikrive:ci` y `… ikrive:ci-arm64` (R8, R9).
5. Sin paquetes empaquetados: `docker run --rm --entrypoint sh ikrive:ci -c 'for p in better-auth fastify drizzle-orm drizzle-kit esbuild vitest; do test ! -e node_modules/$p || exit 1; done'` (R7).
6. `docker run -d --name ikrive-smoke -p 3000:3000 -e AUTH_SECRET=<32+ chars de prueba> -e BASE_URL=http://127.0.0.1:3000 ikrive:ci`, luego `node docker/smoke.mjs http://127.0.0.1:3000` (R12–R16), `docker exec ikrive-smoke node dist/job.js reminders` (R17) y `test "$(docker exec ikrive-smoke id -u)" = 1000` (R11).
7. arm64: `docker run --rm --platform linux/arm64 ikrive:ci-arm64 node -e "<abre better-sqlite3 :memory:, sharp crea 1×1 y .webp().toBuffer()>"` (R20).
8. `if: failure()` → `docker logs ikrive-smoke` (R21).

### Docs

- `docs/PLAN.md`: quita el pendiente de 670 MB; en la tabla de Stack, fila «Imagen»: `node:24-alpine`, API empaquetada con tsup salvo `better-sqlite3`/`sharp`/`pdfkit`, tamaño medido amd64/arm64 (salida de `image-size.mjs` en CI) (R10). En «Verificación», añade `node docker/smoke.mjs`.
- `CONTRIBUTING.md`: una línea en `docker/` sobre los externos de runtime y cómo añadir uno (`RUNTIME_EXTERNALS`).

Sin cambios de BD, HTTP, `packages/shared` ni `apps/web`.

## Build (`tsup.config.ts`)

```ts
export const RUNTIME_EXTERNALS = ['better-sqlite3', 'sharp', 'pdfkit'] as const;
export const OPTIONAL_UNBUNDLED = ['@opentelemetry/api'] as const;
export function runtimeManifest(versions: Record<string, string>): { type: 'module'; private: true; dependencies: Record<string, string> };
export function createBuildOptions(outDir?: string): Options;
```

- `noExternal: [/^(?!(better-sqlite3|sharp|pdfkit)(\/|$))/]` **y** `external: [...RUNTIME_EXTERNALS]`. Comprobado en el prototipo: `noExternal: [/.*/]` gana a `external` (sharp acaba dentro y peta), y sin `external` explícito tsup empaqueta `pdfkit` porque no es dependencia directa.
- `banner.js`: `import { createRequire as __ikriveCreateRequire } from 'node:module'; const require = __ikriveCreateRequire(import.meta.url);`. Sin él, el ESM falla con «Dynamic require of "fs" is not supported» en las deps CJS (yauzl, pino…).
- `metafile: true` (lo usa el test), `sourcemap: true` como hoy (el Dockerfile borra los `.map`).
- `onSuccess`: copia `src/db/migrations` → `<outDir>/migrations`, `REPORT_FONT_FILES` → `<outDir>/fonts/`, y escribe `<outDir>/package.json` con `runtimeManifest()`; la versión de cada externo se lee del `package.json` instalado, resuelto desde `apps/api` (`createRequire`, subiendo desde el entry porque `pdfkit` no exporta `./package.json`).

`test/build.test.ts`:
- `bundles every dependency except the runtime externals`: todos los imports `external: true` del metafile son `isBuiltin()` (`node:module`), están en `RUNTIME_EXTERNALS` o en `OPTIONAL_UNBUNDLED`; y los tres externos aparecen (R1).
- `writes a runtime package.json with the exact versions of the externals` (R2) — además test unitario puro de `runtimeManifest`.
- `copies the migrations and the report fonts` (R3).
- `pins pdfkit to the version required by @react-pdf/font` (R6).

## Dockerfile

```dockerfile
ARG NODE_VERSION=24
# Platform-independent output: runs natively on the builder, even for arm64 releases.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim AS build
#   …igual que hoy hasta los builds de web y api…
RUN find apps/api/dist -name '*.map' -delete

FROM node:${NODE_VERSION}-alpine AS natives
WORKDIR /out
COPY --from=build /repo/apps/api/dist/package.json ./
COPY docker/prune-runtime.mjs /tmp/
RUN npm install --omit=dev --no-audit --no-fund --no-package-lock && node /tmp/prune-runtime.mjs /out/node_modules

FROM node:${NODE_VERSION}-alpine AS runtime
#   ARG VERSION, ENV, WORKDIR /app iguales
COPY --from=natives --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
COPY --from=build --chown=node:node /repo/apps/web/dist ./public
#   mkdir /data, VOLUME, USER node, EXPOSE, HEALTHCHECK y CMD ["node","dist/server.js"] iguales
```

- `dist/package.json` da `"type": "module"` a `dist/`; Node resuelve los externos subiendo a `/app/node_modules`. `/app/package.json` desaparece.
- `better-sqlite3@13` trae prebuilds N-API para `linuxmusl-x64` y `linuxmusl-arm64` y `sharp@0.35` publica `@img/sharp-linuxmusl-*`: no se compila nada en ninguna arquitectura.
- El usuario `node` de alpine también es uid 1000 (R11); `docker compose exec ikrive node dist/job.js …` del README sigue funcionando.

## Alternativas descartadas

- **Solo bundle sobre `bookworm-slim`**: la base ya pesa 249 MB; borrar npm/corepack en una capa posterior no reduce el tamaño (las capas se suman).
- **Distroless (`gcr.io/distroless/nodejs24-debian13`, 159 MB)**: más pequeña, pero sin shell (`docker compose exec … sh` y el paso R7 dejan de funcionar), usuario `nonroot` 65532 (rompe los volúmenes de uid 1000 salvo forzar `USER 1000`), node fuera del `PATH` habitual y sin fijar la versión de Node con `NODE_VERSION`. Queda como plan B si alpine se queda sin margen.
- **`alpine` + copiar solo el binario `node`** (~140 MB): imagen no oficial, hay que mantener a mano las librerías de sistema. No compensa con 17 MB de margen.
- **Empaquetar `pdfkit`**: carga sus 14 fuentes estándar con un `require('#standard-fonts/…')` (subpath imports) en tiempo de ejecución; el bundle peta al arrancar (comprobado). Un plugin de esbuild que lo reescriba es frágil ante actualizaciones de react-pdf.
- **Dejar `@fontsource/*` como externos**: 2,2 MB y cero código, pero es un asset y no código no empaquetable; copiar 4 `.woff` (~100 KB) a `dist/fonts` sigue el patrón de `dist/migrations`.
- **Cargar los `.woff` con el loader `file` de esbuild**: tsx y Vitest no saben importar `.woff`.

## Riesgos

- **Margen de 17 MB**: una dependencia nativa nueva o un bump de Node puede romper el límite. R8/R9 lo detectan en el PR; el plan B es distroless.
- **`npm install` sin lockfile** en la etapa `natives`: los tres externos van con versión exacta, pero sus dependencias transitivas (`node-addon-api`, `fontkit`, `@img/*`…) se resuelven en el build. El smoke test lo cubre en cada PR.
- **musl**: Node, sharp y better-sqlite3 tienen builds musl oficiales; cualquier nativo futuro debe tenerlo también.
- **Imports dinámicos de deps empaquetadas** que no ve esbuild (como el de `pdfkit`): solo los detecta el smoke test. Por eso R16 genera un PDF real y R17 ejecuta el CLI de jobs.
- **Tiempo de CI**: construir arm64 en cada PR añade minutos (QEMU), pero solo para la etapa `natives` (`npm install` de prebuilds); `build` corre nativo gracias a `$BUILDPLATFORM`.

## Decisiones a validar

1. **Cambiar la base de runtime a `node:24-alpine`.** El `acceptance` habla de bundle, pero sin cambiar la base el objetivo de 250 MB es inalcanzable (base 249 MB).
2. **Métrica de tamaño** = suma de capas sin comprimir (`docker history`), umbral 250 000 000 bytes. Comprimida (lo que se descarga de GHCR) serían ~70 MB.
3. **`pdfkit` como tercer externo de runtime** y dependencia directa fijada a `0.20.1`.
4. **Sin sourcemaps en la imagen** (16 MB): el proceso no usa `--enable-source-maps` y las trazas de producción ya apuntan al bundle.
5. **CI construye también arm64 en cada PR** y prueba allí los nativos (R19, R20), en lugar de fiarse solo de `release.yml` al etiquetar.

## Fuera de alcance

- Minificar el bundle o hacer tree-shaking manual de better-auth.
- Cambiar `release.yml`, publicar en GHCR o etiquetar.
- E2E con Playwright contra la imagen (feature aparte de la fase 7).
