# Sesión actual

> Estado vivo. Se actualiza mientras se trabaja, no al final. Al cerrar la feature, su resumen pasa a `history.md` y este archivo vuelve a la plantilla.

- **Feature:** #58 dependabot-actions (`sdd: false`)
- **Rama:** `feat/dependabot-actions`
- **Estado:** in_progress
- **Inicio:** 2026-11-09

## Plan

Guiado por los `acceptance` de `feature_list.json`:

- [ ] `.github/dependabot.yml`: ecosistema `github-actions` en `/`, schedule semanal, un grupo con todas las actualizaciones
- [ ] Todo `uses:` externo de `ci.yml` y `release.yml` fijado por SHA de 40 hex del tag actual (sin subir de mayor) con comentario `# vX.Y.Z`
- [ ] Test en `apps/mobile/test/` que falla si un `uses:` externo no está fijado por SHA o le falta el comentario
- [ ] Test de que `dependabot.yml` tiene github-actions, schedule semanal y un grupo
- [ ] CI verde en el PR y `pnpm harness --full` en verde

## Bitácora

- 2026-11-09: rama creada, feature en `in_progress`, implementer lanzado.

## Notas del humano

_—_

## Próximo paso

Implementer → reviewer → Gate 2.
