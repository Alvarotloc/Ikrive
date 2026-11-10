# Review — #61 dependabot-major-updates

**Veredicto:** APPROVED

Feature `sdd: false`: no hay `specs/`; los criterios son los `acceptance` (A1–A5) de `feature_list.json`.

## Trazabilidad acceptance ↔ tests
- A1: [x] `apps/mobile/test/ci-workflow.test.mjs:30` › `dorny/paths-filter is pinned by full commit SHA with its version` (ref `^[0-9a-f]{40}$` + `^ # v\d+\.\d+\.\d+$`); `apps/mobile/test/release-workflow.test.mjs:79` (misma regla, sin fijar la mayor); el pin general `apps/mobile/test/actions-pinning.test.mjs:11` › `every external action…` sigue exigiendo SHA de 40 hex + `# vX.Y.Z` a **todas** las acciones externas de `.github/workflows/*`. Con grep no queda ningún test fijado a una mayor concreta (`v3`, `v4`…).
- A2: [x] `.github/dependabot.yml`: `groups.github-actions` con `patterns: ['*']` + `update-types: [minor, patch]`. Es la sintaxis oficial (`groups.<name>.update-types`); lo que el grupo no recoge (las mayores) sale en PRs individuales, uno por dependencia y versión.
- A3: [x] `apps/mobile/test/actions-pinning.test.mjs:39` › `dependabot groups minor and patch updates and leaves majors in their own PRs`. Comprobado con una réplica de la lógica en el scratchpad: pasa con la config actual y falla si falta `update-types`, si se añade `major` o si se añade un segundo grupo.
- A4: [x] `CONTRIBUTING.md` › «PRs de Dependabot». Menores/parches: integrar si CI pasa. Mayores: changelog + jobs que la usan. La corrección del implementer es correcta: `ci.yml` se dispara en `pull_request` y tiene los jobs `check`, `e2e` y `docker` (`push: false`) sin condición. `release.yml` solo se dispara con `tags: ['v*.*.*']`, y `docker/login-action` y `docker/metadata-action` solo aparecen allí.
- A5: [x] `pnpm harness --full` en verde (lo he ejecutado yo).

## Tasks
- N/A (`sdd: false`, sin `tasks.md`).

## Checkpoints
- C1: [x] harness OK, una sola feature activa, rama `feat/dependabot-major-updates`.
- C2: [x] N/A por `sdd: false`; los acceptance tienen un test real o un artefacto verificable.
- C3: [x] El diff solo toca dependabot.yml, tres tests de `apps/mobile/test`, CONTRIBUTING y `progress/`. No hay cambios en los workflows ni refactors.
- C4: [x] N/A (no hay API, web ni BD).
- C5: [x] Sin `console.log`, código comentado ni TODOs.
- C6: [x] harness --full en verde; los tests afirman valores concretos.
- C7: [x] `impl_dependabot-major-updates.md` incluye los archivos, el mapa A→test y la salida. `current.md` está al día. PLAN.md no cambia.

## Hallazgos
- Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- El acceptance A4 citaba «docker, e2e» como jobs que no corren en el PR. La nota de CONTRIBUTING lo corrige y es la versión fiel a `ci.yml`, así que aceptar la desviación es lo correcto.
- La nota dice que `android` corre en el PR, pero ese job depende de `dorny/paths-filter`. En un PR de Dependabot que toque `ci.yml` sí corre, porque el filtro incluye `.github/workflows/ci.yml`. En uno que solo toque `release.yml` no corre. La regla de la nota («si el job que la usa no se ha ejecutado… revísalo a mano») ya cubre este caso.
- El PR #43 abierto tendrá que cerrarse o recrearse (`@dependabot recreate`) para que se aplique la nueva agrupación.

## Cambios requeridos
- Ninguno.
