# Implementación — docker-image-slim

Rama `feat/docker-image-slim`. Tasks T1–T13 marcadas en `specs/docker-image-slim/tasks.md`. Sin commits.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `apps/api/package.json`, `pnpm-lock.yaml` | `"pdfkit": "0.20.1"` en `dependencies`. El lockfile solo añade el importer; sigue habiendo una única `pdfkit@0.20.1`. |
| `apps/api/src/modules/reports/pdf/font-files.ts` | Nuevo. `REPORT_FONT_FILES` (4 `.woff`) y el tipo `ReportFontFamily`, sin imports. |
| `apps/api/src/modules/reports/pdf/fonts.ts` | `resolveReportFont(family, file, bundledDir = new URL('./fonts/', import.meta.url))`: primero `fonts/` junto al módulo y, si no está, `@fontsource/<family>/files/<file>`. `registerReportFonts` construye las fuentes a partir de `REPORT_FONT_FILES`. |
| `apps/api/tsup.config.ts` | `RUNTIME_EXTERNALS`, `OPTIONAL_UNBUNDLED`, `runtimeManifest()` y `createBuildOptions(outDir)`: entradas absolutas `{ server, job }`, `noExternal` con regex negativa + `external`, banner `createRequire`, `metafile: true`, `sourcemap: true`. `onSuccess` copia migraciones y fuentes y escribe `dist/package.json` con las versiones instaladas (busca el `package.json` subiendo desde el entry). Las rutas se resuelven respecto a `apps/api` (`import.meta.url`), así que el build funciona igual con cualquier cwd. |
| `apps/api/test/report-fonts.test.ts` | Nuevo (R4, R5). |
| `apps/api/test/build.test.ts` | Nuevo. Ejecuta `build()` de tsup en un directorio temporal (`config: false`) y comprueba el metafile, `package.json`, migraciones, fuentes y la versión fijada de pdfkit (R1, R2, R3, R6). Tarda ~0,8 s. |
| `docker/prune-runtime.mjs` | Nuevo. Poda `better-sqlite3` (`deps/`, `src/`, `binding.gyp`, prebuilds distintos de `linuxmusl-${arch}`), los builds `pdfkit.{standalone,browser,old}*` y todos los `*.map`. |
| `docker/Dockerfile` | Tres etapas: `build` (`--platform=$BUILDPLATFORM`, borra `*.map` y `metafile-*.json`), `natives` (`node:24-alpine`, `npm install` de `dist/package.json` + poda) y `runtime` (`node:24-alpine`, mismos `ENV`, `USER node`, `HEALTHCHECK` y `CMD`; sin `/app/package.json`). |
| `docker/image-size.mjs` | Nuevo. Suma `docker history --human=false`, imprime `ikrive image <img>: N MB` y sale con 1 si `>= max·10⁶` (2 si los argumentos no son válidos). |
| `docker/smoke.mjs` | Nuevo. Comprobaciones `health` (reintenta 30 s), `sign-up`, `create vehicle`, `spa index`, `upload photo`, `serve photo` y `report pdf`. Al primer fallo imprime `✗ <nombre>: <detalle>` y sale con 1. |
| `.github/workflows/ci.yml` | Job `docker`: setup-node, QEMU, buildx; builds `ikrive:ci` (amd64) e `ikrive:ci-arm64` con `load: true`; `image-size.mjs` para las dos; comprobación de `node_modules`; contenedor + smoke + `job.js reminders` + `id -u` = 1000; nativos en arm64; `docker logs ikrive-smoke` si algo falla. |
| `docs/PLAN.md` | Quito el pendiente de los 670 MB. Añado la fila «Imagen» en Stack (base, `RUNTIME_EXTERNALS` y tamaño), actualizo la fila CI/CD y añado `smoke.mjs`/`image-size.mjs` en «Verificación». |
| `CONTRIBUTING.md` | Un párrafo tras la estructura sobre `RUNTIME_EXTERNALS` y cómo añadir un externo. |

## Trazabilidad

| R | Evidencia |
|---|---|
| R1 | `apps/api/test/build.test.ts` › `bundles every dependency except the runtime externals` |
| R2 | `apps/api/test/build.test.ts` › `writes a runtime package.json with the exact versions of the externals` y `runtimeManifest lists only the runtime externals` |
| R3 | `apps/api/test/build.test.ts` › `copies the migrations and the report fonts` |
| R4 | `apps/api/test/report-fonts.test.ts` › `uses the bundled font file when it exists next to the module`; en la imagen, `report pdf` de `smoke.mjs` (sin `@fontsource` instalado) |
| R5 | `apps/api/test/report-fonts.test.ts` › `falls back to the @fontsource package when there is no bundled font`; además `test/reports.test.ts` sigue en verde |
| R6 | `apps/api/test/build.test.ts` › `pins pdfkit to the version required by @react-pdf/font` |
| R7 | CI › paso `No bundled packages in node_modules`; en local, la misma orden → `R7 ok` |
| R8 | CI › `Image size (< 250 MB)` › `node docker/image-size.mjs ikrive:ci`; en local, 233,4 MB |
| R9 | CI › `Image size (< 250 MB)` › `node docker/image-size.mjs ikrive:ci-arm64`; en local (QEMU), `ikrive:dev-arm64` → 228,0 MB |
| R10 | `docs/PLAN.md` › Stack › fila «Imagen» (amd64 233,4 MB y arm64 228,0 MB, ambos medidos en local) |
| R11 | `Dockerfile` `USER node`; CI › `Smoke test` › `test "$(docker exec ikrive-smoke id -u)" = 1000`; en local → `1000` |
| R12 | `docker/smoke.mjs` › `health` (CI › `Smoke test`) |
| R13 | `docker/smoke.mjs` › `sign-up`, `create vehicle` |
| R14 | `docker/smoke.mjs` › `spa index` |
| R15 | `docker/smoke.mjs` › `upload photo`, `serve photo` |
| R16 | `docker/smoke.mjs` › `report pdf` |
| R17 | CI › `Smoke test` › `docker exec ikrive-smoke node dist/job.js reminders` |
| R18 | `docker/smoke.mjs` › `check()` (`✗ <nombre>` + `exit 1`); en local se forzaron dos fallos (ver abajo) |
| R19 | CI › `Build linux/amd64` y `Build linux/arm64` con `docker/Dockerfile`; en local se han construido las dos plataformas |
| R20 | CI › `Native modules on linux/arm64` (better-sqlite3 `:memory:` + sharp `.webp()`); en local, el mismo script contra `ikrive:dev-arm64` (QEMU) → `natives ok` |
| R21 | CI › `Container logs` (`if: failure()`) |

## Verificación local (T11)

```
$ docker build -f docker/Dockerfile -t ikrive:dev .         → exit 0
$ node docker/image-size.mjs ikrive:dev
ikrive image ikrive:dev: 233.4 MB                           → exit 0
$ node docker/image-size.mjs ikrive:dev 200
✗ ikrive:dev is 233.4 MB, the limit is 200 MB               → exit 1
  capas: node_modules 40,5 MB, api dist 9,8 MB, web dist 2,0 MB (+ base node:24-alpine)
$ docker run --rm --entrypoint sh ikrive:dev -c 'for p in better-auth fastify drizzle-orm drizzle-kit esbuild vitest; do test ! -e node_modules/$p || exit 1; done; echo R7 ok'
R7 ok
$ docker run -d --name ikrive-smoke -p 3000:3000 -e AUTH_SECRET=… -e BASE_URL=http://127.0.0.1:3000 ikrive:dev
$ node docker/smoke.mjs http://127.0.0.1:3000
✓ health
✓ sign-up
✓ create vehicle
✓ spa index
✓ upload photo
✓ serve photo
✓ report pdf
smoke test passed                                           → exit 0
$ docker exec ikrive-smoke node dist/job.js reminders
{"job":"reminders","evaluated":0,"created":0,"failed":0}    → exit 0
$ docker exec ikrive-smoke id -u
1000
# Fallo forzado 1 (URL equivocada):
$ node docker/smoke.mjs http://127.0.0.1:3999
✗ health: no healthy /api/health after 30s (fetch failed)   → exit 1
# Fallo forzado 2 (segunda ejecución sobre el mismo contenedor, el usuario ya existe):
✓ health
✗ sign-up: 422 application/json; charset=utf-8 {"message":"User already exists. Use another email.",…}  → exit 1
```

`node_modules` de la imagen: `better-sqlite3`, `sharp` + `@img/*`, `pdfkit` y sus transitivas (`fontkit`, `@swc/helpers`, `brotli`, `linebreak`…). En los logs del contenedor solo aparece el WARN de rate limiting de Better Auth por no conocer la IP del cliente, que no tiene que ver con esta feature.

## `pnpm harness --full`

```
[OK]    46 features: 40 done, 5 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #40 docker-image-slim (in_progress)
[OK]    Rama actual: feat/docker-image-slim
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test      (shared 117, web 342, api 303 tests)
[OK]    Arnés en verde.
```

## Desviaciones y notas

1. **arm64 (resuelto en la vuelta 1):** en la primera pasada no había QEMU/binfmt en el host. El humano lo registró y se ha verificado en local (ver «Vuelta 1»). La fila «Imagen» de `PLAN.md` ya tiene el tamaño arm64 medido.
2. **`metafile-esm.json` fuera de la imagen:** con `metafile: true`, tsup escribe ese fichero (1,2 MB) en `dist/`. La etapa `build` lo borra junto a los `*.map`, igual que hace con los sourcemaps (decisión 4 del diseño).
3. **Caché `gha` por plataforma:** los dos `build-push-action` del job usan `scope=ci-amd64` y `scope=ci-arm64` para no pisarse la caché entre sí. `release.yml` no cambia.
4. **Fuera del alcance de la poda:** el tarball de `pdfkit` trae un directorio `.yarn/` (3,7 MB) que no aparece en el diseño, así que no lo borro. Se podría añadir a `prune-runtime.mjs` si hace falta más margen.
5. `build.test.ts` llama a `build()` con `config: false` para que tsup no mezcle sus opciones con las de `tsup.config.ts`.

## Vuelta 1 — cambios pedidos en `review_docker-image-slim.md`

Con binfmt arm64 ya registrado en el host (`docker run --rm --platform linux/arm64 alpine uname -m` → `aarch64`):

```
$ docker buildx build --platform linux/arm64 --load -f docker/Dockerfile -t ikrive:dev-arm64 .   → exit 0
$ docker image inspect ikrive:dev-arm64 --format '{{.Architecture}}'
arm64
$ node docker/image-size.mjs ikrive:dev-arm64                     # R9
ikrive image ikrive:dev-arm64: 228.0 MB                            → exit 0
$ docker run --rm --platform linux/arm64 ikrive:dev-arm64 node -e "<script del paso 'Native modules on linux/arm64'>"   # R20
natives ok                                                         → exit 0
$ docker run --rm --platform linux/arm64 --entrypoint sh ikrive:dev-arm64 -c 'uname -m; id -u; ls node_modules/better-sqlite3/prebuilds; <comprobación R7>'
aarch64
1000
linuxmusl-arm64.node
R7 ok
$ docker run -d --platform linux/arm64 --name ikrive-smoke-arm64 -p 3001:3000 -e AUTH_SECRET=… -e BASE_URL=http://127.0.0.1:3001 ikrive:dev-arm64
$ node docker/smoke.mjs http://127.0.0.1:3001
✓ health
✓ sign-up
✓ create vehicle
✓ spa index
✓ upload photo
✓ serve photo
✓ report pdf
smoke test passed                                                  → exit 0
$ docker exec ikrive-smoke-arm64 node dist/job.js reminders
{"job":"reminders","evaluated":0,"created":0,"failed":0}           → exit 0
$ docker exec ikrive-smoke-arm64 id -u
1000
```

La imagen arm64 es más pequeña que la amd64 (228,0 MB frente a 233,4 MB). Ambas se miden con el mismo script (suma de capas sin comprimir). No he investigado de dónde sale la diferencia (puede venir de la base `node:24-alpine` o de los binarios nativos de cada arquitectura). Las dos están por debajo del límite de 250 MB.

Cambios:
- `docs/PLAN.md`, fila «Imagen»: «arm64 pendiente…» → «arm64 228,0 MB» (R10).
- `apps/api/test/build.test.ts`: `afterAll` borra `outDir` (`ikrive-build-*`), un aviso no bloqueante del review.
- `apps/api/test/report-fonts.test.ts`: registra los directorios `ikrive-fonts-*` y los borra en `afterAll`, otro aviso no bloqueante.

`pnpm harness --full` → `[OK] Arnés en verde.` (api 303, web 342 tests).

### Corrección del leader (2026-11-04)

Al volver a ejecutar `node docker/image-size.mjs ikrive:dev-arm64` sale **228.0 MB**, no 176,0 MB. Coincide con la suma manual de `docker history`: base alpine aarch64 9,3 MB + node 161,2 MB + `node_modules` 40,2 MB + dist 9,8 MB + SPA 2,0 MB… La cifra de 176,0 MB era errónea. He corregido `docs/PLAN.md` y este informe. arm64 sigue por debajo de 250 MB, pero con unos 22 MB de margen.
