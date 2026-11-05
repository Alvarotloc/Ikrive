# Review — #47 dockerignore-e2e-artifacts

**Veredicto:** APPROVED

Feature `sdd: false` (sin spec): revisada contra los `acceptance` de `feature_list.json`, `CONTRIBUTING.md`, `docs/` y `CHECKPOINTS.md`.

## Trazabilidad acceptance ↔ evidencia
- A1 `.dockerignore` excluye `**/test-results`, `**/playwright-report` y `e2e/.auth`: [x] `.dockerignore:20-22`.
- A2 Tras `pnpm test:e2e`, el contexto no incluye esos directorios: [x] Con `e2e/.auth`, `e2e/test-results`, `e2e/playwright-report` y `apps/api/data` presentes en disco, he listado el contexto (build `FROM busybox; COPY . /ctx` con un Dockerfile del scratchpad): 865 ficheros. La única coincidencia con `test-results|playwright-report|.auth|/data/|.db|.env|node_modules|/dist/|tanstack|tsbuildinfo|coverage` es `/ctx/.env.example` (plantilla versionada, debe entrar).
- A3 `docker build` y smoke test en verde: [x] `docker build -f docker/Dockerfile` OK; contenedor con las variables de CI → `node docker/smoke.mjs`: health, sign-up, create vehicle, spa index, upload photo, serve photo, report pdf → `smoke test passed`; `node dist/job.js reminders` OK; `id -u` = 1000.
- A4 `pnpm harness --full` en verde: [x] web 342/342, api 303/303, «Arnés en verde».

## Patrones `**/` frente a ficheros versionados
- `git ls-files` filtrado por todos los patrones (`node_modules`, `dist`, `coverage`, `.tanstack`, `data`, `*.tsbuildinfo`, `*.db`, `*.db-*`, `.env*`, `playwright-report`, `test-results`, `e2e/.auth`): **0 coincidencias**.
- Comparación exacta (`comm`, `LC_ALL=C`) de `git ls-files` con el contexto listado: **ningún fichero versionado falta en el contexto**. `**/data`, `**/*.db-*` y `**/.tanstack` no excluyen nada que necesite el build (`apps/web/src/routeTree.gen.ts` está versionado y entra).

## Tasks
- No aplica (sin `tasks.md`, `sdd: false`).

## Checkpoints
- C1: [x] harness en verde; una sola feature `in_progress` (#47); rama `feat/dockerignore-e2e-artifacts`.
- C2: [x] N/A por `sdd: false`; los 4 `acceptance` tienen evidencia ejecutable (arriba).
- C3: [x] El diff de producto es solo `.dockerignore` (más `feature_list.json` → `in_progress` y `progress/`). La ampliación a datos/secretos/higiene con `**/` está justificada en el informe como petición del leader y es coherente con la description.
- C4: [x] N/A (sin código).
- C5: [x] N/A (sin código).
- C6: [x] `harness --full` verde; sin tests nuevos, justificado (cambio de configuración verificado con listado de contexto + smoke, nivel 6 de `docs/verification.md`); sin UI.
- C7: [x] `progress/impl_dockerignore-e2e-artifacts.md` con archivos, evidencia y salida; `progress/current.md` describe la sesión; `docs/PLAN.md` no cambia (no cierra fase ni decisión).

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- Mejora real además del objetivo: antes entraban en el contexto la BD de desarrollo (`apps/api/data/ikrive.db{,-wal,-shm}`) y sus uploads; ahora no.
- Siguen entrando en el contexto ficheros no versionados ajenos al build: `.agents/**` (skills locales) y `.claude/settings.local.json`. No llegan a la imagen final (solo se copian `dist`), pero si se quiere un contexto mínimo podrían añadirse `.agents` y `.claude` en una feature aparte.
- Documentación: no hace falta tocar `docs/` ni `CONTRIBUTING.md`; `.dockerignore` queda autodocumentado por secciones. Opcionalmente, `CONTRIBUTING.md:62` (sesión en `e2e/.auth/admin.json`) podría indicar que está excluida de git y del contexto Docker.

## Cambios requeridos
Ninguno.

## Vuelta 1

**Veredicto:** APPROVED

Petición del humano en Gate 2: excluir también `.claude` y `.agents` del contexto de Docker.

### Verificación
- `.dockerignore:24-26`: nuevo bloque «Local agent tooling» con `.claude` y `.agents` (solo en la raíz, que es donde están). El resto del fichero no ha cambiado respecto a la revisión anterior.
- Listado del contexto (`FROM busybox; COPY . /ctx` con un Dockerfile en el scratchpad, con artefactos E2E y `apps/api/data` en disco): **639 ficheros**, 0 rutas bajo `.claude/` o `.agents/`. La única coincidencia con `test-results|playwright-report|.auth|/data/|.db|.env|node_modules|/dist/|tanstack` sigue siendo `.env.example` (esperado).
- `comm -23` de `git ls-files` contra el contexto: los únicos ficheros versionados que dejan de entrar son los 8 de `.claude/` (`settings.json`, `agents/{implementer,leader,reviewer,spec-author}.md`, `skills/sdd-{new,next,status}/SKILL.md`). `.agents/` no tiene ficheros versionados.
- Nada del build los necesita: `docker/Dockerfile` solo copia manifests, `COPY . .`, y en la imagen final `dist`, `public` y `node_modules` nativos; ni `docker/`, ni `scripts/`, ni los `package.json` referencian `.claude` o `.agents`.
- `docker build -f docker/Dockerfile` OK; contenedor con las variables de CI → `node docker/smoke.mjs`: health, sign-up, create vehicle, spa index, upload photo, serve photo, report pdf → `smoke test passed`; `node dist/job.js reminders` → `{"job":"reminders","evaluated":0,"created":0,"failed":0}`; `id -u` = 1000. Imagen y contenedor temporales eliminados.
- `pnpm harness --full`: lint y typecheck OK; e2e 1/1, shared 117/117, web 342/342, api 303/303 → «Arnés en verde».

### Checkpoints
- C1–C7: [x] sin cambios respecto a la revisión anterior. El diff de producto sigue siendo solo `.dockerignore`; `progress/current.md` e `impl` documentan la vuelta.

### Hallazgos
Ninguno.

### Cambios requeridos
Ninguno.
