# Implementación — #47 dockerignore-e2e-artifacts

`sdd: false`, sin spec: guiada por la description y los `acceptance` de `feature_list.json`.

## Cambios por archivo

- `.dockerignore`: reescrito y agrupado por motivo (dependencias/salidas de build, VCS, datos y secretos locales, artefactos E2E).
  - E2E: `**/playwright-report`, `**/test-results`, `e2e/.auth` (antes solo `playwright-report`/`test-results` en la raíz y sin `.auth`).
  - Datos y secretos con `**/` (revisión extra pedida): `data` → `**/data`, `*.db` → `**/*.db` + `**/*.db-*` (WAL/SHM), `.env` → `**/.env`, `**/.env.local`, `**/.env.*.local` (alineado con `.gitignore`; `.env.example` sigue entrando, es plantilla versionada).
  - Higiene alineada con `.gitignore`: `coverage` → `**/coverage`, más `**/*.tsbuildinfo` y `**/.tanstack` (scratch del plugin de TanStack Router).
  - Comprobado que ningún archivo versionado coincide con los nuevos patrones (`git ls-files`: solo `.env.example`, que no se excluye).

## Hallazgo relevante

Con el `.dockerignore` anterior el contexto de build incluía, además de los artefactos E2E, **la BD de desarrollo y sus uploads**: `apps/api/data/ikrive.db{,-wal,-shm}` y `apps/api/data/uploads/**` (el patrón `data` solo cubría la raíz). Ahora quedan fuera.

## Verificación por acceptance

| Acceptance | Evidencia |
|---|---|
| `.dockerignore` excluye `**/test-results`, `**/playwright-report` y `e2e/.auth` | `.dockerignore` |
| Tras `pnpm test:e2e`, el contexto no incluye esos directorios | `pnpm test:e2e` (6 passed) → existen `e2e/.auth/admin.json`, `e2e/playwright-report/index.html`, `e2e/test-results/…`. Build temporal (`FROM busybox; COPY . /ctx; find /ctx -type f`) fuera del repo. **Antes:** aparecían `e2e/.auth/admin.json`, `e2e/playwright-report/index.html`, `e2e/test-results/.last-run.json`, `e2e/test-results/…/ikrive-export-*.zip`, `apps/api/data/ikrive.db*`, `apps/api/data/uploads/*`, `apps/web/.tanstack/tmp/*`. **Después:** 864 archivos; la única coincidencia con `test-results|playwright-report|.auth|/data/|.db|.env|node_modules|/dist/|tanstack` es `/ctx/.env.example` (esperado). |
| `docker build` y smoke test en verde | `docker build -f docker/Dockerfile` OK; contenedor lanzado como en CI (`AUTH_SECRET`, `BASE_URL`) → `node docker/smoke.mjs`: health, sign-up, create vehicle, spa index, upload photo, serve photo, report pdf → `smoke test passed`; `node dist/job.js reminders` OK; `id -u` = 1000. Imagen y contenedor temporales eliminados. |
| `pnpm harness --full` en verde | Ver abajo. |

No hay tests automatizados nuevos: el cambio es solo de configuración de Docker y se verifica con el build de listado de contexto y el smoke test.

## `pnpm harness --full`

```
apps/web test:  Test Files  50 passed (50) · Tests 342 passed (342)
apps/api test:  Test Files  33 passed (33) · Tests 303 passed (303)
[OK]    pnpm test
── Resumen ──
[OK]    Arnés en verde.
```

## Desviaciones

- Alcance ampliado ligeramente (pedido por el leader): patrones `**/` para datos/secretos (`data`, `*.db`, `*.db-*`, `.env`, `.env.local`, `.env.*.local`) y para `coverage`, `*.tsbuildinfo`, `.tanstack`. Ningún cambio en `docker/Dockerfile` ni en código.
- Nota operativa: un primer intento de smoke falló por usar yo un nombre de variable incorrecto (`BETTER_AUTH_SECRET` en vez de `AUTH_SECRET`); repetido con la invocación de CI, en verde. No es un problema del cambio.

## Vuelta 1

Petición del humano en Gate 2 (a partir del aviso de `progress/review_dockerignore-e2e-artifacts.md`): excluir también `.claude` y `.agents` del contexto de build.

### Cambios

- `.dockerignore`: nuevo bloque al final, `# Local agent tooling (SDD agents, skills, hooks, local permissions): not needed to build`, con `.claude` y `.agents` (solo raíz, que es donde viven). Cubre `.claude/settings.local.json` (permisos locales) y los agentes/skills/hooks versionados.

### Verificación

- `docker/Dockerfile` no referencia esos directorios: las fases `build` copian manifests + `COPY . .` y solo compilan `apps/web` y `apps/api`; la imagen final copia únicamente `dist`, `public` y `node_modules` nativos.
- Listado del contexto (build `FROM busybox; COPY . /ctx; find /ctx -type f` con Dockerfile en el scratchpad, con artefactos E2E y `apps/api/data` presentes en disco): **639 ficheros** (antes 864–865). Ninguna ruta bajo `/ctx/.claude` ni `/ctx/.agents`; la única coincidencia con `test-results|playwright-report|.auth|/data/|.db|.env|node_modules|/dist/|tanstack` sigue siendo `/ctx/.env.example`.
- `comm` de `git ls-files` contra el contexto: los únicos ficheros versionados que ya no entran son los de `.claude/` (`settings.json`, `agents/*` ×4, `skills/sdd-{new,next,status}/*`), es decir, exactamente lo pretendido.
- `docker build -f docker/Dockerfile` OK. Contenedor con las variables de CI (`AUTH_SECRET`, `BASE_URL`; puerto host 3999 porque el 3000 estaba ocupado en local) → `node docker/smoke.mjs`: health, sign-up, create vehicle, spa index, upload photo, serve photo, report pdf → `smoke test passed`; `node dist/job.js reminders` → `{"job":"reminders","evaluated":0,"created":0,"failed":0}`; `id -u` = 1000. Imagen y contenedor temporales eliminados.

### `pnpm harness --full`

```
[OK]    pnpm lint
[OK]    pnpm typecheck
e2e test:             Test Files  1 passed (1)   · Tests 1 passed (1)
packages/shared test: Test Files 17 passed (17)  · Tests 117 passed (117)
apps/web test:        Test Files 50 passed (50)  · Tests 342 passed (342)
apps/api test:        Test Files 33 passed (33)  · Tests 303 passed (303)
[OK]    pnpm test
[OK]    Arnés en verde.
```

### Desviaciones

Ninguna. Sin cambios en `docker/Dockerfile` ni en código.
