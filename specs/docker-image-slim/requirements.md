# Requirements — docker-image-slim

> Feature 40 (fase 7). La API se empaqueta con tsup en un bundle y la imagen final solo instala los paquetes que no se pueden empaquetar. Objetivo: de ~630–670 MB a < 250 MB.
> **Externos de runtime** = `RUNTIME_EXTERNALS`: `better-sqlite3` y `sharp` (binarios nativos) y `pdfkit` (carga sus fuentes estándar con un `require('#standard-fonts/…')` dinámico que el bundler no puede seguir; ver `design.md`).
> **Tamaño de la imagen** = suma en bytes de las capas de `docker history --human=false --format '{{.Size}}'` (sin comprimir, la misma magnitud que mostraba `docker images` con los ~670 MB). **250 MB** = 250 000 000 bytes.
> **Smoke test** = `docker/smoke.mjs` ejecutado en CI contra un contenedor recién arrancado con `/data` vacío.

## Bundle de la API

## R1
CUANDO se ejecuta `pnpm --filter @ikrive/api build`, el sistema DEBE generar en `dist/` un bundle ESM cuyos imports externos sean solo módulos integrados de Node, los paquetes de `RUNTIME_EXTERNALS` y los opcionales que se cargan con `import()` dentro de un `try` (lista `OPTIONAL_UNBUNDLED`, p. ej. `@opentelemetry/api`).

## R2
CUANDO se ejecuta el build de la API, el sistema DEBE escribir `dist/package.json` con `"type": "module"` y en `dependencies` exactamente los paquetes de `RUNTIME_EXTERNALS`, cada uno con la versión exacta instalada en el workspace.

## R3
CUANDO se ejecuta el build de la API, el sistema DEBE copiar a `dist/fonts/` los cuatro `.woff` que registra el informe PDF (Outfit 600/700, Plus Jakarta Sans 400/600), además de las migraciones a `dist/migrations/` como hoy.

## R4
CUANDO el informe PDF registra sus fuentes y existe el fichero en el directorio `fonts/` junto al módulo en ejecución (bundle de `dist/`), el sistema DEBE usar ese fichero.

## R5
SI el fichero de la fuente no existe en `fonts/` junto al módulo (ejecución desde `src/` con tsx o Vitest) ENTONCES el sistema DEBE resolverlo desde el paquete `@fontsource/<familia>` como hoy.

## R6
El sistema DEBE declarar `pdfkit` como dependencia directa de `apps/api` con la misma versión que exige `@react-pdf/font`.

## Imagen Docker

## R7
La imagen final NO DEBE contener en `/app/node_modules` ningún paquete empaquetado en el bundle ni herramientas de build (`better-auth`, `fastify`, `drizzle-orm`, `drizzle-kit`, `esbuild`, `vitest`).

## R8
CUANDO CI construye la imagen para `linux/amd64`, el sistema DEBE hacer fallar el job si su tamaño es de 250 MB o más.

## R9
CUANDO CI construye la imagen para `linux/arm64`, el sistema DEBE hacer fallar el job si su tamaño es de 250 MB o más.

## R10
El sistema DEBE anotar en `docs/PLAN.md` el tamaño medido de la imagen (amd64 y arm64) y retirar el pendiente de los ~670 MB.

## R11
El contenedor DEBE ejecutarse con el usuario `node` (uid 1000), para que los volúmenes `/data` existentes sigan siendo escribibles.

## Smoke test en CI

## R12
CUANDO el smoke test arranca el contenedor con `/data` vacío, el sistema DEBE responder `200` con `status: "ok"` en `GET /api/health`.

## R13
CUANDO el smoke test registra un usuario (`POST /api/auth/sign-up/email`) y crea un vehículo (`POST /api/vehicles` → `201`) sobre la base de datos recién creada, el sistema DEBE completar ambas operaciones, lo que demuestra que las migraciones se aplicaron al arrancar.

## R14
CUANDO el smoke test pide `GET /`, el sistema DEBE responder `200` `text/html` con el `index.html` de la SPA (`<div id="root">`).

## R15
CUANDO el smoke test sube un PNG a `PUT /api/vehicles/:id/photo`, el sistema DEBE responder `200` y servir después `GET /api/vehicles/:id/photo` como `image/webp`.

## R16
CUANDO el smoke test pide `GET /api/vehicles/:id/report.pdf`, el sistema DEBE responder `200` `application/pdf` con un cuerpo que empieza por `%PDF-`.

## R17
CUANDO el smoke test ejecuta `node dist/job.js reminders` dentro del contenedor, el sistema DEBE terminar con código 0.

## R18
SI alguna comprobación del smoke test falla ENTONCES el sistema DEBE terminar `docker/smoke.mjs` con un código distinto de 0 y un mensaje que nombra la comprobación fallida.

## R21
SI falla algún paso del job `docker` de CI ENTONCES el sistema DEBE imprimir `docker logs` del contenedor del smoke test.

## Multi-arch

## R19
CUANDO CI se ejecuta, el sistema DEBE construir la imagen con `docker/Dockerfile` para `linux/amd64` y `linux/arm64`, las mismas plataformas que publica `release.yml`.

## R20
CUANDO CI ejecuta la imagen `linux/arm64` (QEMU), el sistema DEBE cargar los módulos nativos: `better-sqlite3` abre una base `:memory:` y `sharp` codifica una imagen.

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| La API se empaqueta en un bundle y la imagen final solo instala los módulos nativos y lo que no se pueda empaquetar | R1, R2, R3, R4, R5, R6, R7 |
| La imagen pesa menos de 250 MB (comprobado en CI) y el tamaño queda anotado en docs/PLAN.md | R8, R9, R10 |
| El contenedor arranca, aplica las migraciones, sirve la SPA, genera un informe PDF y procesa la subida de una imagen (smoke test en CI) | R11, R12, R13, R14, R15, R16, R17, R18, R21 |
| El build multi-arch de release.yml sigue funcionando | R19, R20 |
| pnpm harness --full pasa en verde | última task de `tasks.md` |
