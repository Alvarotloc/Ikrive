# Implementación: #58 dependabot-actions (`sdd: false`)

## Cambios por archivo

- `.github/dependabot.yml` (nuevo): `version: 2`, un único `updates` con `package-ecosystem: github-actions`, `directory: /`, `schedule.interval: weekly` y el grupo `github-actions` con `patterns: ['*']` (todas las actualizaciones en un PR). Ni npm ni Docker.
- `.github/workflows/ci.yml`, `.github/workflows/release.yml`: cada `uses:` externo pasa de tag mayor a SHA de commit de 40 hex con comentario `# vX.Y.Z`. Misma versión mayor, nada más cambia. `dorny/paths-filter` se queda como estaba (v3.0.4).
- `apps/mobile/test/actions-pinning.test.mjs` (nuevo, node:test):
  - recorre todos los `*.yml|*.yaml` de `.github/workflows/` y exige que cada `uses:` externo (cualquiera que no empiece por `./`) cumpla `owner/repo[/path]@<40 hex> # vX.Y.Z`;
  - comprueba que `dependabot.yml` solo declara `github-actions`, con `directory: /`, schedule semanal y un grupo con el patrón `'*'`.
- Tests existentes: no hizo falta tocarlos. `ci-workflow.test.mjs` y `release-workflow.test.mjs` no esperaban tags `@vN` (solo comprobaban el pin de dorny, que se mantiene).

## Resolución de SHA

Con `gh api repos/<repo>/git/ref/tags/<tag>`. Los tags anotados (solo `pnpm/action-setup@v4`) se desreferenciaron al commit con `gh api repos/<repo>/git/tags/<sha>`. La versión exacta sale de buscar con `git/matching-refs/tags/vN.` el tag `vX.Y.Z` que apunta al mismo commit. En todos los casos hubo exactamente una coincidencia.

| Acción | Tag anterior | SHA | Versión |
|---|---|---|---|
| actions/checkout | v4 | 11d5960a326750d5838078e36cf38b85af677262 | v4.4.0 |
| actions/setup-node | v4 | 49933ea5288caeca8642d1e84afbd3f7d6820020 | v4.4.0 |
| actions/setup-java | v4 | cf277c60eb25467037889841efdb72551f06f6c3 | v4.9.1 |
| actions/upload-artifact | v4 | ea165f8d65b6e75b540449e92b4886f43607fa02 | v4.6.2 |
| pnpm/action-setup | v4 (tag anotado) | b906affcce14559ad1aafd4ab0e942779e9f58b1 | v4.3.0 |
| docker/setup-qemu-action | v3 | c7c53464625b32c7a7e944ae62b3e17d2b600130 | v3.7.0 |
| docker/setup-buildx-action | v3 | 8d2750c68a42422c14e847fe6c8ac0403b4cbd6f | v3.12.0 |
| docker/build-push-action | v6 | 10e90e3645eae34f1e60eeb005ba3a3d33f178e8 | v6.19.2 |
| docker/login-action | v3 | c94ce9fb468520275223c153574b00df6fe4bcc9 | v3.7.0 |
| docker/metadata-action | v5 | c299e40c65443455700f0fdfc63efafe5b349051 | v5.10.0 |
| dorny/paths-filter | ya fijado | 0e4a8c6effa4802afeda77dc8d303f8176d7dfad | v3.0.4 (sin cambios) |

## Trazabilidad (acceptance → test)

| Acceptance | Verificación |
|---|---|
| dependabot.yml: github-actions, `/`, semanal, un grupo | `apps/mobile/test/actions-pinning.test.mjs` › `dependabot keeps the github-actions up to date weekly in a single grouped PR` |
| Todo `uses:` de ci.yml/release.yml por SHA + `# vX.Y.Z`, sin subir de mayor | `actions-pinning.test.mjs` › `every external action in the workflows is pinned by full SHA with its version` + tabla de arriba |
| Test que recorre todos los workflows | `actions-pinning.test.mjs` › `every external action ...`. Prueba de mutación: con `docker/login-action@v3` puesto a mano en release.yml el test falla; luego se restauró |
| Test de dependabot.yml | `actions-pinning.test.mjs` › `dependabot keeps ...` |
| CI verde en el PR | Pendiente: lo verifica el leader tras el push |
| `pnpm harness --full` verde | Ver abajo |

## `pnpm harness --full`

```
[OK]    pnpm lint
[OK]    pnpm typecheck
e2e 6 passed · packages/shared 119 passed · apps/mobile 22 passed · apps/web 403 passed · apps/api 368 passed
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones

Ninguna.
