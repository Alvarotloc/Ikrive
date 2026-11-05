# Review — #40 docker-image-slim (vuelta 2)

**Veredicto:** APPROVED

Los dos cambios pedidos en la vuelta 1 están resueltos: la imagen arm64 se ha construido y ejecutado (R9, R19, R20) y `docs/PLAN.md` anota el tamaño medido de las dos arquitecturas (R10). Desde la vuelta 1, el código solo cambia en la limpieza de directorios temporales de dos tests. No hay regresiones.

## Verificación propia (reviewer, 2026-11-04)
- He reconstruido las dos imágenes: `docker build -f docker/Dockerfile -t ikrive:dev .` y `docker buildx build --platform linux/arm64 --load … -t ikrive:dev-arm64 .`. Las dos salen de caché, con la misma fecha de creación que antes y posterior a la última modificación de `apps/` y `docker/`.
- `node docker/image-size.mjs ikrive:dev` → **233.4 MB**, exit 0.
- `node docker/image-size.mjs ikrive:dev-arm64` → **228.0 MB**, exit 0. Lo he comprobado sumando a mano `docker history --human=false` (228 028 416 B): rootfs aarch64 9,3 MB, node 161,2 MB, `node_modules` 40,2 MB, api dist 9,8 MB y web dist 2,0 MB. **La corrección del leader es correcta y la cifra de 176,0 MB era errónea.** Con límite 200 → `✗ … 228.0 MB, the limit is 200 MB`, exit 1.
- Script del paso `Native modules on linux/arm64` contra `ikrive:dev-arm64` → `natives ok arm64`, exit 0.
- En arm64: `uname -m` = `aarch64`, `id -u` = 1000, prebuild único `linuxmusl-arm64.node`, comprobación R7 OK. En `node_modules` solo están `better-sqlite3`, `sharp`/`@img`, `pdfkit` y sus transitivas.
- `node docker/smoke.mjs` contra contenedores nuevos de **amd64 y arm64**: las 7 comprobaciones ✓ y `smoke test passed`. `node dist/job.js reminders` termina con exit 0 y `id -u` da 1000 en las dos imágenes.
- `pnpm harness --full` → en verde (api 303, web 342, shared OK). Los tests ya no dejan directorios `ikrive-build-*`/`ikrive-fonts-*`: los que hay en `/tmp` son de antes de las 17:46.

## Trazabilidad requirements ↔ tests
- R1: [x] `apps/api/test/build.test.ts` › `bundles every dependency except the runtime externals`. Comprueba en el metafile que los externos son solo builtins, `RUNTIME_EXTERNALS` u `OPTIONAL_UNBUNDLED`, y que existen `server.js` y `job.js`.
- R2: [x] `build.test.ts` › `writes a runtime package.json…` (`type: module` y versiones exactas instaladas) y `runtimeManifest lists only the runtime externals` (filtra los paquetes y lanza un error si falta uno).
- R3: [x] `build.test.ts` › `copies the migrations and the report fonts`.
- R4: [x] `apps/api/test/report-fonts.test.ts` › `uses the bundled font file…`. En la imagen, `smoke.mjs` › `report pdf` lo cubre sin `@fontsource`.
- R5: [x] `report-fonts.test.ts` › `falls back to the @fontsource package…` (ruta concreta que existe).
- R6: [x] `build.test.ts` › `pins pdfkit to the version required by @react-pdf/font`.
- R7: [x] Paso de CI `No bundled packages in node_modules`. En local da `R7 ok` en amd64 y arm64.
- R8: [x] CI › `image-size.mjs ikrive:ci`. En local 233,4 MB, y sale con 1 si supera el límite.
- R9: [x] CI › `image-size.mjs ikrive:ci-arm64`. En local, con QEMU, `ikrive:dev-arm64` = 228,0 MB < 250 MB, medido por mí.
- R10: [x] `docs/PLAN.md` › Stack › fila «Imagen»: «amd64 233,4 MB; arm64 228,0 MB (antes ~670 MB)». Se ha retirado el pendiente de los 670 MB.
- R11: [x] `USER node` y CI `id -u` = 1000. En local da 1000 en las dos imágenes.
- R12–R16: [x] Comprobaciones de `docker/smoke.mjs` (estado, content-type y cuerpo concretos). Pasan en amd64 y arm64.
- R17: [x] CI `docker exec ikrive-smoke node dist/job.js reminders`. En local termina con exit 0.
- R18: [x] `smoke.mjs` › `check()` imprime `✗ <nombre>` y sale con exit 1. En la vuelta 1 se forzaron dos fallos.
- R19: [x] El job `docker` construye `linux/amd64` y `linux/arm64` con `docker/Dockerfile`. Las dos plataformas se han construido en local.
- R20: [x] Paso de CI `Native modules on linux/arm64`. El mismo script se ha ejecutado en arm64 con QEMU y da `natives ok`.
- R21: [x] Paso `Container logs` con `if: failure()` y `|| true`.

## Tasks
- T1..T13: [x]. T12 ya está completa, con el tamaño arm64 medido.

## Checkpoints
- C1: [x] El arnés pasa, hay una sola feature `in_progress` y la rama es `feat/docker-image-slim`.
- C2: [x] Todos los R tienen evidencia real y el spec se cumple tal como está escrito.
- C3: [x] El diff se limita a lo que dice `design.md`. En la vuelta 1 solo se ha añadido la limpieza de directorios temporales en dos tests, que era un aviso de la revisión anterior. `release.yml` no cambia.
- C4: [x] No hay cambios de BD, HTTP, web ni i18n, así que no aplica.
- C5: [x] No hay `any`, `@ts-ignore`, logs de depuración ni TODOs.
- C6: [x] `pnpm harness --full` en verde, ejecutado por mí. Los tests afirman resultados concretos. No hay UI.
- C7: [x] `impl_docker-image-slim.md` documenta la vuelta 1 y la corrección del leader. `PLAN.md` está actualizado.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- El margen en arm64 es de unos 22 MB y en amd64 de unos 16,6 MB. Si un `RUNTIME_EXTERNALS` nuevo o una subida de `node:24-alpine` engorda la imagen, CI fallará. Una vía de margen ya identificada es podar el `.yarn/` de `pdfkit` (3,7 MB).
- `docker image inspect --format '{{.Size}}'` devuelve 307 MB en arm64 y 312 MB en amd64 con el almacén de imágenes actual, que puede contar también capas comprimidas. Esto no afecta al cumplimiento: el spec define el tamaño como la suma de `docker history` y así lo mide CI.
- El job `docker` todavía no se ha ejecutado en GitHub Actions. La verificación es local, con QEMU. El primer push confirmará que funcionan la caché `gha` con scope y los tiempos de QEMU.
- `docs/PLAN.md` sigue diciendo «Aún no existe repositorio remoto en GitHub», pero `origin` ya existe. Esto no es de esta feature.
- La caché `gha` de CI (`scope=ci-*`) no se comparte con `release.yml`.

## Cambios requeridos
Ninguno.
