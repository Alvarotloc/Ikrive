# Design — release-v0-1-0

## Resumen

Tres bloques sin cambios de BD, HTTP ni UI:

1. **Capturas**: una segunda config de Playwright en el paquete `e2e/` (`screenshots.config.ts`, `testDir: ./screenshots`) que reutiliza `server.mjs` y `tests/fixtures.ts`. `pnpm screenshots` = `pnpm build && pnpm --filter @ikrive/e2e screenshots`. Escribe en `docs/screenshots/*.png` (versionadas).
2. **Docs**: nueva guía `docs/self-hosting.md` (español, como el README). El README queda en presentación + capturas + arranque rápido + enlaces; la tabla de variables y «Lanzar los jobs a mano» se **mueven** a la guía (no se duplican).
3. **Release**: `CHANGELOG.md`, versiones `0.1.0`, `docs/PLAN.md` fase 7 hecha.

Guardas en Vitest (corren en `pnpm test`) solo para lo que debe seguir siendo cierto en versiones futuras; lo específico de la v0.1.0 (R13–R16) se verifica en la revisión (reviewer / Gate 2), no con tests automáticos, para que la siguiente release no rompa la suite.

## Archivos

### `e2e/`

| Archivo | Cambio |
|---|---|
| `screenshots.config.ts` | Nuevo. Mismo `webServer` que `playwright.config.ts` (`node server.mjs`, `reuseExistingServer: false`, `gracefulShutdown`), `testDir: './screenshots'`, `workers: 1`, `retries: 0`, `locale: 'es-ES'`, `timezoneId: 'Europe/Madrid'`, `serviceWorkers: 'block'`, sin `storageState`. Un solo proyecto `screenshots` (Desktop Chrome, viewport 1280×800). Para no duplicar, el bloque `webServer`/`baseURL` se extrae a `e2e/server-config.ts` y lo importan las dos configs. |
| `server-config.ts` | Nuevo: `export const port`, `baseURL`, `webServer` (lo que hoy está inline en `playwright.config.ts`). |
| `playwright.config.ts` | Importa `baseURL` y `webServer` de `server-config.ts`. Sin cambio de comportamiento. |
| `screenshots/readme.spec.ts` | Nuevo. Un `test.describe.serial`: `beforeAll` registra al primer usuario por API (`/api/auth/sign-up/email`) y siembra datos con `page.request` (R2); un test por captura (R3). |
| `screenshots/seed.ts` | Nuevo. `seedDemoData(request, today)`: vehículo (p. ej. Toyota Corolla, matrícula fija), lecturas de odómetro, 3–4 mantenimientos (uno con adjunto `PNG_8x8`), una programación por fecha próxima, 4–6 repostajes con depósito lleno → consumo y coste/km visibles. Fechas = `today` ± días, para que «próximos» y estadísticas tengan sentido en cualquier ejecución. |
| `no-fixed-waits.test.ts` | Recorre `tests/` **y** `screenshots/` (R4). Test nuevo: `screenshot script does not use fixed waits`. |
| `release.test.ts` | Nuevo (Vitest, `*.test.ts` de la raíz del paquete). Guardas de R3, R5–R7, R9–R12; ver «Tests». |
| `package.json` | Script `screenshots` = `playwright test -c screenshots.config.ts`; `version` 0.1.0. |
| `tsconfig.json` | Sin cambios (`**/*.ts` ya incluye `screenshots/`). |

`pnpm test:e2e` no ve `screenshots/` porque `playwright.config.ts` tiene `testDir: './tests'`; `pnpm test` solo incluye `*.test.ts` (R5).

### Capturas (R3)

| Fichero | Pantalla | Modo |
|---|---|---|
| `dashboard.png` | `/` (inicio) | claro, 1280×800 |
| `vehicles.png` | `/vehicles` | claro |
| `vehicle-detail.png` | `/vehicles/:id` (dossier + timeline de mantenimiento) | claro |
| `vehicle-stats.png` | sección de estadísticas del detalle (`locator.screenshot`) | claro |
| `settings.png` | `/settings` | claro |
| `vehicle-detail-dark.png` | `/vehicles/:id` | `colorScheme: 'dark'` (tema `system` por defecto → clase `dark`) |
| `mobile-dashboard.png` | `/` | `devices['Pixel 7']` |

Cada captura espera con aserciones web-first a que el contenido sembrado sea visible (p. ej. el modelo del vehículo, `t('stats.metrics.consumption')`) antes de `page.screenshot({ path, animations: 'disabled' })`. Ruta destino: `join(import.meta.dirname, '../../docs/screenshots', name)`. Sin `fullPage` salvo en `vehicle-detail.png`, para contener el peso.

### Docs y raíz

| Archivo | Cambio |
|---|---|
| `package.json` (raíz) | `"version": "0.1.0"`; script `"screenshots": "pnpm build && pnpm --filter @ikrive/e2e screenshots"` (R1). |
| `apps/api/package.json`, `apps/web/package.json`, `packages/shared/package.json` | `version` 0.1.0 (R15). |
| `apps/api/src/config.ts` | Separar `envObjectSchema = z.object({...})` del `.transform(...)` y exportar `ENV_VARIABLES = Object.keys(envObjectSchema.shape)` para el test de R8. Sin cambio de comportamiento. |
| `docs/self-hosting.md` | Nueva guía: Instalación (R7), Variables de entorno (R8), Copias de seguridad › volumen / export (R9, R10), Exposición a internet (R11), Lanzar los jobs a mano (movido del README). |
| `README.md` | Capturas (R6), arranque rápido de 4 líneas, enlaces a la guía (R12), estado y roadmap (R13). Desarrollo: añade `pnpm test:e2e` y `pnpm screenshots`. |
| `CHANGELOG.md` | Nuevo (R14). `## [0.1.0] - 2026-11-06` con `### Added` agrupado por área (vehículos y odómetro, mantenimiento y adjuntos, recordatorios y notificaciones, repostajes y estadísticas, informe de venta, export/import, PWA, administración de usuarios, imagen Docker). Fuente: `progress/history.md` y `docs/PLAN.md`. |
| `docs/PLAN.md` | Fase 7 «✅ Hecha» (R16); quitar el pendiente obsoleto «Aún no existe repositorio remoto» (ya hay `origin`); Verificación: mencionar `pnpm screenshots`. |
| `docs/verification.md`, `CONTRIBUTING.md` › Tests | Una línea: cómo regenerar las capturas y que no forman parte de `pnpm test:e2e`. |

### Contenido de la guía (puntos que debe cubrir)

- **Variables (R8)**: `NODE_ENV`, `HOST`, `PORT`, `BASE_URL`, `AUTH_SECRET` (≥ 32 caracteres; obligatoria en producción), `DATA_DIR` (`./data` en código, `/data` en la imagen), `DISABLE_SIGNUP`, `REMINDERS_ENABLED`, `MAX_UPLOAD_MB`, `REPORT_MAX_ANNEX_MB`, `IMPORT_MAX_MB`, `LOG_LEVEL` (valores admitidos), `WEB_DIST_DIR`, `TZ`, `IKRIVE_VERSION`. Fijadas por la imagen: `NODE_ENV`, `HOST`, `DATA_DIR`, `WEB_DIST_DIR`, `IKRIVE_VERSION`. Booleanos: `true`/`false`/`1`/`0`. Una configuración inválida impide arrancar (`Invalid configuration`).
- **Volumen (R9)**: `docker compose stop`, copiar `./data` (`ikrive.db`, `ikrive.db-wal`/`-shm` si existen, `uploads/`), `docker compose start`. Restaurar = parar, sustituir la carpeta, arrancar (las migraciones corren al arrancar). Propietario uid 1000 (`USER node`).
- **Export (R10)**: Ajustes › exportar (zip con `data.json` y adjuntos/fotos, por usuario); importar en Ajustes en otra cuenta o instancia; `IMPORT_MAX_MB`; repetir el mismo zip → rechazo (409). No sustituye al volumen: no incluye cuentas, sesiones, canales de notificación ni enlaces públicos (comprobar contra `dataExportSchema` al redactar).
- **Internet (R11)**: ejemplo mínimo con Caddy (`ikrive.example.com { reverse_proxy ikrive:3000 }`) y mención a Nginx/Traefik; `BASE_URL=https://…` (cookies `__Secure-`); como la API confía en el proxy (`trustProxy: true`), el puerto 3000 no debe exponerse directamente y el proxy tiene que sobrescribir `X-Forwarded-For` (si no, se elude el rate limit por IP); con `BASE_URL` local la web avisa y el enlace no funciona fuera de la red → descargar el PDF; Tailscale/VPN como alternativa privada (sin enlaces públicos para terceros). Revocar enlaces desde la web; los tokens de cuentas desactivadas dejan de servirse.

## Tests

| Test | Archivo | Cubre |
|---|---|---|
| `documents every environment variable` — cada `ENV_VARIABLES` + `TZ` + `IKRIVE_VERSION` aparece como `` `CLAVE` `` en una fila de tabla de `docs/self-hosting.md` | `apps/api/test/config-docs.test.ts` | R8 |
| `screenshot script does not use fixed waits` | `e2e/no-fixed-waits.test.ts` | R4 |
| `screenshots are not part of the e2e suite or vitest` — `playwright.config.ts` usa `testDir: './tests'`, `vitest.config.ts` solo `*.test.ts`, y el script `test:e2e` raíz no referencia `screenshots` | `e2e/release.test.ts` | R5 |
| `readme shows every generated screenshot` — los 7 nombres de R3 aparecen en `screenshots/readme.spec.ts` y como `docs/screenshots/<n>.png` en el README, y existen en disco | `e2e/release.test.ts` | R3, R6 |
| `self-hosting guide covers install, backups and internet exposure` — contiene `docker compose`, `DISABLE_SIGNUP`, `docker compose pull`, `/data`, `ikrive.db`, `uploads`, `/api/me/export`, `IMPORT_MAX_MB`, `X-Forwarded-For`, `/api/public/reports/`, `/api/calendar/` | `e2e/release.test.ts` | R7, R9, R10, R11 |
| `readme links the guide without the env table` — enlaza `docs/self-hosting.md` y no contiene `REPORT_MAX_ANNEX_MB` | `e2e/release.test.ts` | R12 |
| Revisión manual (reviewer / Gate 2), sin test automático: README sin «desarrollo temprano» y sin `- [ ]` en el roadmap; `CHANGELOG.md` con `## [0.1.0] - 2026-11-06` y `### Added`; los 5 `package.json` en `0.1.0`; fila de la fase 7 «✅ Hecha» en `docs/PLAN.md` | evidencia en `progress/impl_release-v0-1-0.md` y en el informe del reviewer | R13, R14, R15, R16 |
| Ejecución real de `pnpm screenshots` (dos veces, sobre `DATA_DIR` nuevo) | evidencia en `progress/impl_release-v0-1-0.md` | R1, R2, R3 |

Son guardas de contenido, no prueban la calidad de la redacción: eso es Gate 2. R13–R16 no tienen test porque solo valen para la v0.1.0 y fallarían en la siguiente release.

## Fuera de la implementación (tras «merge» en Gate 2, lo hace el leader con el humano)

1. `git tag -a v0.1.0 -m "v0.1.0"` sobre el merge en `main` y `git push origin v0.1.0` → `release.yml` publica `ghcr.io/alvarotloc/ikrive:0.1.0`, `0.1` y `latest`.
2. GitHub Release con el texto de la sección `[0.1.0]` del CHANGELOG (opcional).
3. Ajustar la fecha de `## [0.1.0]` (2026-11-06) si el tag cae otro día.

## Alternativas descartadas

- **Capturas dentro de `pnpm test:e2e`** (un spec más en `tests/`): reescribiría `docs/` en cada ejecución de CI y de desarrollo y compartiría el admin con datos de otros tests en paralelo → capturas no deterministas. Se descarta por una config aparte.
- **Script suelto con `playwright-core` contra `/usr/bin/google-chrome`** (como la revisión visual): no reutiliza `webServer`, `server.mjs` ni los helpers, y depende del Chrome del sistema.
- **Mantener la tabla de variables en el README y la guía**: dos copias que se desincronizan. El README enlaza.
- **Tests automáticos para R13–R16** (versión, CHANGELOG, fase 7, estado del README): fallarían en la siguiente release; se verifican en la revisión.
- **Leer las claves de entorno parseando `config.ts` como texto** en el test: frágil; se exporta `ENV_VARIABLES`.

## Riesgos

- **Peso del repo**: 7 PNG versionados; viewport 1280×800 y `fullPage` solo en una. Regenerarlas cambia binarios: solo al cambiar la UI.
- **Capturas no idénticas byte a byte** entre ejecuciones (fechas relativas, fuentes del sistema). «Reproducible» = mismo script, mismo resultado visual con datos propios; no se compara pixel a pixel.
- **`ghcr.io/${{ github.repository }}`** tiene mayúsculas (`Alvarotloc/Ikrive`); `docker/metadata-action` las pasa a minúsculas. Se comprueba al publicar, fuera de la implementación.
- **`IKRIVE_VERSION`** en la imagen vale `github.ref_name` (`v0.1.0`, con `v`), distinto de `package.json` (`0.1.0`). No se cambia aquí; se documenta tal cual.

## Fuera de alcance

- Crear o empujar el tag, publicar la imagen o la GitHub Release.
- Traducir la documentación al inglés.
- Cambios funcionales en API o web, o en `.env.example` más allá de un comentario que enlace la guía.
- Comparación visual automática de capturas.

## Decisiones a validar

1. **Guía aparte** (`docs/self-hosting.md`) y README reducido, moviendo la tabla de variables y la sección de jobs. Alternativa: todo en el README.
2. **Lista de capturas** de R3 (7 ficheros, incluida `settings.png`). ¿Falta alguna pantalla (p. ej. informe de venta, admin de usuarios)?
3. **Capturas versionadas** en `docs/screenshots/` (no en un artefacto de CI).
4. **Idioma de las capturas**: `es-ES`, como el README.
5. **Fecha del CHANGELOG**: 2026-11-06 (fijada por el humano en Gate 1); el leader la corrige si el tag se hace otro día.
6. **Export en `config.ts`** (`ENV_VARIABLES`): único cambio en código de producción, sin efecto en ejecución.
