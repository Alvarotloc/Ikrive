# Review — #58 dependabot-actions (`sdd: false`)

**Veredicto:** APPROVED

Sin spec (`sdd: false`): se revisa contra los `acceptance` de `feature_list.json`. Cambios sin commitear en `feat/dependabot-actions`: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `progress/current.md` y los nuevos `.github/dependabot.yml`, `apps/mobile/test/actions-pinning.test.mjs` y `progress/impl_dependabot-actions.md`.

## Trazabilidad acceptance ↔ tests
- A1 (dependabot.yml: github-actions, `/`, semanal, un grupo con todo): [x] `.github/dependabot.yml` lo cumple. Lo cubre `apps/mobile/test/actions-pinning.test.mjs` › `dependabot keeps the github-actions up to date weekly in a single grouped PR`, que comprueba `version: 2`, que el único ecosistema es `['github-actions']`, `directory: /`, `interval: weekly` y un grupo con el patrón `'*'`.
- A2 (todo `uses:` fijado por SHA de 40 hex del tag anterior, sin subir de mayor, con `# vX.Y.Z`): [x] Lo he verificado por mi cuenta con `gh api` (`git/ref/tags/<tag>`, desreferenciando con `git/tags/<sha>` mientras `object.type == tag`). En las 11 acciones el SHA es el commit del tag `vX.Y.Z` del comentario **y** el mismo commit al que apunta hoy el tag mayor anterior (`v3`/`v4`/`v5`/`v6`), así que no sube de mayor:
  - actions/checkout v4.4.0, actions/setup-node v4.4.0, actions/setup-java v4.9.1, actions/upload-artifact v4.6.2, pnpm/action-setup v4.3.0 (tag anotado)
  - docker/setup-qemu-action v3.7.0, docker/setup-buildx-action v3.12.0, docker/build-push-action v6.19.2, docker/login-action v3.7.0, docker/metadata-action v5.10.0
  - dorny/paths-filter v3.0.4 (ya estaba fijado y no cambia)
  - `grep` no encuentra ningún `uses:` en `.github/workflows/` sin el formato `@<40hex> # vX.Y.Z`. Los 30 `uses:` que había en `main` están todos convertidos.
- A3 (un test recorre todos los workflows y falla si un `uses:` externo no está fijado o no lleva comentario): [x] `actions-pinning.test.mjs` › `every external action in the workflows is pinned by full SHA with its version`. Recorre todos los `*.yml|*.yaml` y exige que haya al menos un workflow y al menos una acción externa. Prueba de mutación en el scratchpad con su misma regex: rechaza `@v4`, un SHA sin comentario, un SHA de 39 hex y el comentario `# v6`. Acepta la forma correcta y se salta `./local`.
- A4 (un test comprueba github-actions, schedule semanal y un grupo en dependabot.yml): [x] es el mismo test que en A1.
- A5 (CI verde en el PR): sin comprobar aquí, por indicación del leader, que lo hará tras el push. No bloquea.
- A6 (`pnpm harness --full` en verde): [x] lo he ejecutado yo: lint, typecheck y test en OK, «Arnés en verde». El test nuevo se ejecuta con `node --test` de `apps/mobile`: 2 de 2 pasan.

## Tasks
- No hay `tasks.md` (`sdd: false`). La checklist de `progress/current.md` tiene marcados los 4 primeros puntos. El de CI queda pendiente, con justificación.

## Checkpoints
- C1: [x] el arnés está en verde, hay una sola feature activa y la rama es `feat/dependabot-actions`.
- C2: [x] no aplica (`sdd: false`). Cada acceptance tiene un test abierto y leído.
- C3: [x] el diff solo toca workflows, dependabot.yml, el test nuevo y `progress/`. Los workflows solo cambian de ref de `uses:`, sin otras ediciones.
- C4: [x] no aplica (no toca API, web ni BD).
- C5: [x] no hay `console.log`, código comentado ni TODOs.
- C6: [x] `pnpm harness --full` está en verde, los tests afirman resultados concretos y no hay UI.
- C7: [x] `impl_dependabot-actions.md` incluye archivos, tabla de SHA, mapa acceptance→test y salida. `current.md` está al día. PLAN.md no necesita cambios.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- La regex del test exige el formato exacto `uses: owner/repo@sha # vX.Y.Z`. Un `uses:` entre comillas o una imagen `docker://…` en el futuro haría fallar el test aunque estuviera fijada. Ahora no hay ninguno de los dos casos.
- El test no comprueba que el SHA corresponda de verdad al tag del comentario, solo el formato. La correspondencia la he verificado a mano con `gh api`, y en adelante la mantendrá Dependabot.
