# Review — #42 release-v0-1-0

**Veredicto:** APPROVED

Revisado: `git diff main...HEAD` (spec), `git diff` y los ficheros sin trackear (`CHANGELOG.md`, `docs/self-hosting.md`, `docs/screenshots/*.png`, `e2e/server-config.ts`, `e2e/screenshots.config.ts`, `e2e/screenshots/{readme.spec,seed}.ts`, `e2e/release.test.ts`, `apps/api/test/config-docs.test.ts`, `progress/impl_release-v0-1-0.md`).

## Trazabilidad requirements ↔ tests

- R1: [x] `e2e/release.test.ts:20` › `screenshots are not part of the e2e suite or vitest` comprueba que el script raíz es exactamente `pnpm build && pnpm --filter @ikrive/e2e screenshots`. `e2e/screenshots.config.ts` reutiliza `webServer` (`node server.mjs`, `DATA_DIR` temporal) y `readme.spec.ts:10` escribe en `docs/screenshots`. El design deja la ejecución real como evidencia: hay dos ejecuciones 7/7 en el impl, y los PNG existen y tienen fecha de hoy.
- R2: [x] `e2e/screenshots/seed.ts`: `signUpDemoUser` crea el primer usuario por `/api/auth/sign-up/email` y `seedDemoData` crea el vehículo, 3 lecturas, 4 mantenimientos (uno con adjunto), una regla y 5 repostajes. Todas las fechas usan `shiftDays(today, -n)`. `screenshots.config.ts` no tiene proyecto `setup` ni `dependencies`. La evidencia es la ejecución real, como dice el design.
- R3: [x] `e2e/release.test.ts:30` › `readme shows every generated screenshot` comprueba que cada uno de los 7 nombres aparece en el spec y en el README y que existe en disco. Los 7 PNG existen y los he abierto.
- R4: [x] `e2e/no-fixed-waits.test.ts:61` › `screenshot script does not use fixed waits` comprueba que `screenshots/` contiene ficheros (`files.length > 0`) y que no hay ninguna espera fija (`offenders` igual a `[]`).
- R5: [x] `e2e/release.test.ts:20` comprueba `testDir: './tests'` y `include: ['*.test.ts']`, y que `test:e2e` (raíz y e2e) no menciona `screenshots`. En el arnés, e2e solo ejecuta los 6 tests de Vitest.
- R6: [x] `e2e/release.test.ts:30` comprueba que cada captura aparece como `docs/screenshots/<n>.png` en el README y existe en disco.
- R7: [x] `e2e/release.test.ts:40` busca `docker compose`, `DISABLE_SIGNUP` y `docker compose pull`. He leído la guía a mano: §Instalación cubre los pasos 1–5 y §Actualizar.
- R8: [x] `apps/api/test/config-docs.test.ts:12` › `documents every environment variable` usa `ENV_VARIABLES` (las claves reales de `envObjectSchema`) más `TZ` e `IKRIVE_VERSION`, y comprueba que cada una tiene una fila de tabla. He contrastado los valores por defecto y las descripciones a mano (ver Avisos).
- R9: [x] `e2e/release.test.ts:40` (`/data`, `ikrive.db`, `uploads`). La guía para el contenedor, menciona WAL/SHM, explica cómo restaurar y da el uid 1000. Lo de «SQLite vuelca el WAL» es cierto: `server.ts:26-32` cierra `db.$client` con SIGTERM.
- R10: [x] `e2e/release.test.ts:40` (`/api/me/export`, `IMPORT_MAX_MB`). La guía recoge el rechazo del duplicado con 409 y el mensaje es literal de `es.json:624`. Las etiquetas «Descargar mis datos» e «Importar datos» coinciden con `es.json:590,592`.
- R11: [x] `e2e/release.test.ts:40` (`X-Forwarded-For`, `/api/public/reports/`, `/api/calendar/`). Las rutas existen (`report-shares/routes.ts:62`, `calendar/routes.ts:46`). La guía cubre `BASE_URL` local, Caddy, Nginx/Traefik, puerto 3000 y VPN.
- R12: [x] `e2e/release.test.ts:59` comprueba que el README enlaza la guía y no contiene `REPORT_MAX_ANNEX_MB`. El README enlaza la configuración, las copias, internet y los jobs.
- R13: [x] **Manual**, por decisión del humano. `grep -i "desarrollo temprano\|- \[ \]" README.md` no da resultados. Las 7 líneas del roadmap están en `- [x]`. Estado: «**v0.1.0**, la primera versión estable».
- R14: [x] **Manual**. `CHANGELOG.md:9` es `## [0.1.0] - 2026-11-06` y `:13` es `### Added`, con 9 subsecciones por área. Sigue el formato Keep a Changelog (`[Unreleased]` y enlaces de comparación).
- R15: [x] **Manual**. `"version": "0.1.0"` en `package.json`, `apps/api/package.json`, `apps/web/package.json`, `packages/shared/package.json` y `e2e/package.json`.
- R16: [x] **Manual**. `docs/PLAN.md:45` es `| 7. Pulido y release v0.1.0 | ✅ Hecha |`.
- R17: [x] Ejecuté `pnpm harness --full` en esta revisión: exit 0 (lint, typecheck, test: shared 119, API 336, web 346, e2e 6).

## Tasks
- T1..T16: [x]

## Checkpoints
- C1: [x] Arnés en verde, una sola feature activa (#42) y la rama es `feat/release-v0-1-0`.
- C2: [x] Están los 3 ficheros del spec, en EARS y con la tabla de acceptance completa. Las tasks están `[x]`. Cada R tiene un test o, en R1/R2 y R13–R16, la verificación que el design aprobó en Gate 1.
- C3: [x] El diff solo toca lo que dice el design. El comentario de `.env.example` está permitido por el design. No hay refactors ajenos.
- C4: [x] N/A en API, BD y web. El único cambio en producción es `config.ts`: separa el schema y exporta `ENV_VARIABLES`, y el comportamiento no cambia (`loadConfig` sigue con el mismo `transform`).
- C5: [x] Sin `any`, `@ts-ignore` ni `console.log`. Las fechas del seed van en `YYYY-MM-DD`.
- C6: [x] El arnés está en verde. Los tests nuevos afirman contenido concreto. Las capturas incluyen claro, oscuro y móvil, y están referenciadas en el impl.
- C7: [x] El impl está completo, `current.md` está al día y `docs/PLAN.md` está actualizado.

## Comprobaciones pedidas por el leader
- **Tabla de variables frente a `config.ts` y el Dockerfile:** es correcta. Los defaults coinciden con el schema: `BASE_URL`, `DISABLE_SIGNUP=false`, `REMINDERS_ENABLED=true`, `MAX_UPLOAD_MB=20`, `REPORT_MAX_ANNEX_MB=100`, `IMPORT_MAX_MB=1024`, `LOG_LEVEL=info` con sus 7 valores, `PORT=3000`, `NODE_ENV=development`, `HOST=0.0.0.0` y `DATA_DIR=./data`. Lo que la guía marca como fijado por la imagen coincide con el `ENV` del Dockerfile: `NODE_ENV=production`, `HOST`, `DATA_DIR=/data`, `WEB_DIST_DIR=/app/public` e `IKRIVE_VERSION=${VERSION}`. `IKRIVE_VERSION` vale `0.0.0-dev` por defecto (`lib/version.ts`) y `release.yml` lo construye con `build-args: VERSION=${{ github.ref_name }}`, es decir `v0.1.0`. La guía dice que se muestra en la instancia y se guarda en los exports: es cierto (`health/routes.ts`, `data-export/service.ts:190`). Las etiquetas `:0.1.0` y `:0.1` existen en `release.yml` (semver `{{version}}` y `{{major}}.{{minor}}`).
- **Capturas:** las 7 existen y las he abierto. Tienen datos coherentes: consumo 4,87 L/100 km, coste/km, gráficas pintadas, regla «Próximo», el tema oscuro aplicado y la vista móvil Pixel 7 con menú de cabecera.
- **Tags:** `git tag -l` está vacío y `git ls-remote --tags origin` también. No se ha creado ningún tag.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
1. **Matrícula cortada en `dashboard.png` y `vehicles.png`:** el chip «4821 LKP» se sale por el borde derecho de la tarjeta. Es un problema de layout que ya existía en la tarjeta de vehículo a 1280 px (en móvil se ve bien), pero queda visible en la portada del README. Conviene arreglarlo en una feature aparte y regenerar las capturas con `pnpm screenshots`.
2. **`vehicle-detail.png` (fullPage):** el fondo de la barra lateral se acaba a los ~800 px y el resto de la columna queda gris. Es un efecto del `fullPage` con la barra lateral fija, solo estético. Sale en el `<details>` del README.
3. **`IKRIVE_VERSION`:** un `docker build` local sin `--build-arg VERSION` da `0.0.0` (el `ARG` por defecto del Dockerfile), no el `0.0.0-dev` que pone la tabla. El matiz es menor.
4. **`.env.example`** mantiene `# DATA_DIR=./data`. Si alguien lo descomenta dentro de la imagen, los datos quedan fuera del volumen. La guía ya dice que no se cambie, pero el comentario de `.env.example` podría decir `/data`. Esto ya venía de antes de esta feature.
5. **Restauración:** `rm -rf data` puede necesitar `sudo` si el usuario del host no es el uid 1000. La guía solo menciona `chown` después.
6. Fuera de la implementación (después del «merge»): crear el tag `v0.1.0` y ajustar la fecha del CHANGELOG si el tag cae otro día.

## Cambios requeridos
Ninguno.
