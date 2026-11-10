# Implementación — #61 dependabot-major-updates

Feature `sdd: false`: sin spec; guía = `acceptance` de `feature_list.json` (A1–A5).

## Cambios por archivo

- `.github/dependabot.yml`: el grupo `github-actions` (patterns `'*'`) añade `update-types: [minor, patch]`. Las mayores quedan fuera del grupo y Dependabot abre un PR por acción y versión mayor (comportamiento documentado de `groups.<name>.update-types`). Comentario explicativo en la cabecera.
- `apps/mobile/test/ci-workflow.test.mjs`: el test de `dorny/paths-filter` sigue exigiendo SHA de 40 hex, pero el comentario pasa de `# v3.x.y` a `# vX.Y.Z` (cualquier mayor). Comentario sobre por qué.
- `apps/mobile/test/release-workflow.test.mjs` (línea 79): misma relajación de `v3` a `v\d+` en la aserción del job `changes`.
- `apps/mobile/test/actions-pinning.test.mjs`: el antiguo test «single grouped PR» se divide en:
  - `dependabot keeps the github-actions up to date weekly` (version, ecosistema, directory, schedule; sin cambios de fondo).
  - `dependabot groups minor and patch updates and leaves majors in their own PRs`: un único grupo `github-actions`, `patterns: ['*']` y `update-types` exactamente `{minor, patch}`.
- `CONTRIBUTING.md`: nueva subsección «PRs de Dependabot» bajo «Flujo de trabajo».
- `progress/current.md`: línea en la bitácora.

## Trazabilidad

| Acceptance | Archivo › test |
|---|---|
| A1 paths-filter SHA + `# vX.Y.Z` sin fijar mayor | `apps/mobile/test/ci-workflow.test.mjs` › `dorny/paths-filter is pinned by full commit SHA with its version`; `apps/mobile/test/release-workflow.test.mjs` › `ci android job only runs when mobile, web, the lockfile or the workflow change`; (pin general) `actions-pinning.test.mjs` › `every external action in the workflows is pinned by full SHA with its version` |
| A2 grupo minor/patch, mayores aparte | `.github/dependabot.yml` |
| A3 test de la configuración de grupos | `apps/mobile/test/actions-pinning.test.mjs` › `dependabot groups minor and patch updates and leaves majors in their own PRs` (verificado que falla si se quita `update-types`) |
| A4 doc sobre PRs de Dependabot | `CONTRIBUTING.md` › «PRs de Dependabot» |
| A5 harness | abajo |

## `pnpm harness --full`

```
[OK]    pnpm lint
[OK]    pnpm typecheck
e2e 6 · apps/mobile 25 · packages/shared 119 · apps/web 423 · apps/api 368 — todos pasan
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones

- La nota de CONTRIBUTING no dice que `docker` y `e2e` «no corren en el PR»: en `ci.yml` sí corren en `pull_request` (docker construye amd64/arm64 sin publicar, smoke test incluido). Lo que realmente no se ejecuta en el PR es `release.yml` (solo con tag `v*.*.*`): `docker/login-action`, `docker/metadata-action`, la publicación en GHCR y la firma del APK. La nota lo describe así, y pide revisar a mano el job que use la acción si no se ha ejecutado o no cubre el cambio.
- No se toca `.github/workflows/*`: las subidas de versión las traerá Dependabot (PR #43 se cerrará/recreará con la nueva config).
