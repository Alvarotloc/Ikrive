# Review — #56 ci-workflow-permissions

**Veredicto:** APPROVED

Feature `sdd: false` (sin spec): el criterio son los `acceptance` de #56 en `feature_list.json`.

## Trazabilidad acceptance ↔ tests
- A1 (`permissions: contents: read` a nivel de workflow; `changes` declara el suyo): [x] `apps/mobile/test/ci-workflow.test.mjs` › `ci.yml limits the GITHUB_TOKEN to contents: read at workflow level` (exige que el bloque superior contenga **exactamente** `contents: read`) y › `the changes job declares the extra pull-requests: read it needs`.
- A2 (`dorny/paths-filter` por SHA completo + `# v3.x.y`): [x] › `dorny/paths-filter is pinned by full commit SHA with its version` (todas las apariciones, SHA de 40 hex y comentario `# v3.x.y`); también `release-workflow.test.mjs` › `ci android job only runs when …`, actualizado.
- A3 (test que lo comprueba): [x] los 3 tests anteriores. Prueba de mutación en el scratchpad: quitar el bloque superior, volver a `@v3` o añadir `pull-requests: write` al bloque superior hace fallar exactamente 1 test en cada caso.
- A4 (CI en verde en el PR): [ ] solo se puede verificar al abrir el PR; queda para el leader tras Gate 2 (está justificado en `impl_`).
- A5 (`pnpm harness --full`): [x] en verde (mobile, web 403/403, api 358/358).

## Verificación del SHA
- `gh api repos/dorny/paths-filter/git/ref/tags/v3.0.4` → tag ligero → commit `0e4a8c6effa4802afeda77dc8d303f8176d7dfad`. ✔
- `git/ref/tags/v3` → tag anotado `15192bc…` → `git/tags/15192bc…` → mismo commit `0e4a8c6…`. Es decir, `v3` == `v3.0.4` hoy: el comportamiento no cambia. ✔

## Permisos por job (con `contents: read` heredado)
- `check`: checkout + comandos locales. OK.
- `e2e`: `actions/upload-artifact@v4` usa `ACTIONS_RUNTIME_TOKEN`, no `GITHUB_TOKEN`. OK.
- `docker`: `push: false`, sin login a ghcr → no necesita `packages: write`; la caché `type=gha` usa el token de runtime. OK.
- `changes`: bloque propio `contents: read` + `pull-requests: read` (paths-filter lista los ficheros del PR por la API). OK.
- `android`: checkout, build, `upload-artifact`. OK.
Ningún job comenta en PRs, crea releases ni escribe en el repo.

## Tasks
- No aplica (sin `tasks.md`); el `impl_` cubre cada acceptance.

## Checkpoints
- C1: [x] harness OK, una sola feature activa (#56), rama `feat/ci-workflow-permissions`.
- C2: [x] N/A por `sdd: false`; trazabilidad acceptance → test hecha arriba.
- C3: [x] diff limitado a `ci.yml`, los dos tests de `apps/mobile/test/`, `feature_list.json` (estado) y `progress/`.
- C4: [x] N/A (sin código de API/web).
- C5: [x] sin `console.log`, TODOs ni código comentado.
- C6: [x] `pnpm harness --full` en verde; los tests afirman valores concretos (sin BD). Sin UI → sin capturas.
- C7: [x] `impl_` con archivos, mapa y salida; `current.md` actualizado; `PLAN.md` no necesita cambios.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- `dorny/paths-filter` ya tiene una major nueva (`v4.0.3` es la última release). El acceptance pedía `v3.x.y` y fijar a `v3.0.4` no cambia el comportamiento; si se quiere subir a v4, que sea una feature aparte.
- Las acciones `actions/*`, `pnpm/*`, `docker/*` siguen fijadas por tag de major (`@v4`, `@v3`, `@v6`). Queda fuera del alcance de #56 (pedía solo `dorny`, que es la de terceros menos confiable), pero sería coherente fijarlas por SHA más adelante.
- El test del job `changes` recorta `ci.yml` desde `\n  changes:\n` hasta el final del fichero, así que en teoría lo podría satisfacer un bloque igual de otro job posterior. Riesgo mínimo hoy.
- Un `pull_request` desde un fork ya recibe un token de solo lectura, así que el cambio protege sobre todo los `push` a `main` y las PRs de ramas propias.

## Cambios requeridos
Ninguno.

---

# Segunda pasada (Gate 2) — #56 ci-workflow-permissions

**Veredicto:** APPROVED

Petición del humano: acotar el test del job `changes` a su propio bloque (era el aviso 3).

## Test acotado
`apps/mobile/test/ci-workflow.test.mjs` › `the changes job declares the extra pull-requests: read it needs` extrae ahora con `/\n {2}changes:\n((?:(?: {3,}.*| *)\n)*)/` solo las líneas del job (las que tienen 3 o más espacios de sangría y las vacías). Se para en la siguiente clave o comentario con 2 espacios de sangría. Primero comprueba que el job existe y luego exige `permissions` a 4 espacios con `contents: read` y `pull-requests: read`.

Mutaciones sobre copias de `ci.yml` en el scratchpad, ninguna en el repo:
- original → 3/3 ok
- bloque movido de `changes` a `android` → falla el test 2 (con el recorte anterior era un falso positivo)
- bloque anidado dentro de un step de `changes` (a 8 espacios) → falla
- sin `pull-requests: read` → falla
- `pull-requests: write` → falla
- `permissions` solo en un comentario después de `changes` → falla
- job `changes` renombrado → falla («ci.yml has a changes job»)
- `changes` como último job del fichero → 3/3 ok

En todos los casos que fallan, falla exactamente el test 2. Los demás siguen en verde.

## Alcance
Desde la primera pasada solo ha cambiado el test 2 de `ci-workflow.test.mjs`, junto con `impl_` y `current.md` en `progress/`. `ci.yml`, `release-workflow.test.mjs` y `feature_list.json` (solo el estado `in_progress`) siguen igual que en la primera revisión. No hay nada fuera de lo pedido.

## `pnpm harness --full`
En verde: lint, typecheck y test (web 403/403, api 358/358, mobile ok).

## Checkpoints
- C1–C7: [x], igual que en la primera pasada. El diff no cambia más allá del test.

## Avisos para el humano (no bloquean)
- Los avisos 1, 2 y 4 de la primera pasada siguen vigentes. El humano ya ha decidido que quedan fuera de #56.
- A4 (CI en verde en el PR) solo se podrá verificar cuando se abra el PR.

## Cambios requeridos
Ninguno.
