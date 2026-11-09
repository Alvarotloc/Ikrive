# Implementación: #56 ci-workflow-permissions

Arreglo menor (`sdd: false`, sin spec): guía = `acceptance` de #56 en `feature_list.json`.

## Cambios por archivo

- `.github/workflows/ci.yml`
  - Bloque `permissions: contents: read` de nivel superior (con comentario), entre `on:` y `jobs:`, al estilo de `release.yml`.
  - `dorny/paths-filter@v3` → `dorny/paths-filter@0e4a8c6effa4802afeda77dc8d303f8176d7dfad # v3.0.4`.
    SHA resuelto con `gh api repos/dorny/paths-filter/git/ref/tags/v3` (tag anotado `15192bc…`, desreferenciado con `git/tags/<sha>` → commit `0e4a8c6…`) y comprobado con `git/ref/tags/v3.0.4` (tag ligero → mismo commit). `v3` apunta hoy a `v3.0.4`, así que el comportamiento no cambia.
  - Job `changes`: mantiene su propio bloque (`contents: read`, `pull-requests: read`).
- `apps/mobile/test/ci-workflow.test.mjs` (nuevo, `node:test`, mismo estilo que `release-workflow.test.mjs`):
  - `ci.yml limits the GITHUB_TOKEN to contents: read at workflow level`: el bloque `permissions` de nivel superior existe y contiene exactamente `contents: read`.
  - `the changes job declares the extra pull-requests: read it needs`.
  - `dorny/paths-filter is pinned by full commit SHA with its version`: todo `uses: dorny/paths-filter@` lleva SHA de 40 hex y comentario `# v3.x.y`.
- `apps/mobile/test/release-workflow.test.mjs`: la aserción que esperaba `dorny/paths-filter@v3` ahora espera `@<sha 40 hex> # v3.x.y`.

## Revisión de permisos por job

Ningún job aparte de `changes` necesita más que `contents: read`:
- `check`: checkout, install, lint/typecheck/test/build. Solo lectura.
- `e2e`: `actions/upload-artifact` usa el token de runtime de Actions, no el `GITHUB_TOKEN`.
- `docker`: `push: false` (no hay push a ghcr, no hace falta `packages: write`); la caché `type=gha` usa el token de runtime, no los permisos del `GITHUB_TOKEN`.
- `android`: build + `upload-artifact`. Solo lectura.
- Ningún job comenta en el PR.

## Trazabilidad

| Acceptance | Evidencia |
|---|---|
| A1 `permissions: contents: read` a nivel de workflow; `changes` declara el suyo | `.github/workflows/ci.yml`; `apps/mobile/test/ci-workflow.test.mjs` › `ci.yml limits the GITHUB_TOKEN to contents: read at workflow level`, › `the changes job declares the extra pull-requests: read it needs` |
| A2 `dorny/paths-filter` fijado por SHA con `# v3.x.y` | `.github/workflows/ci.yml`; `apps/mobile/test/ci-workflow.test.mjs` › `dorny/paths-filter is pinned by full commit SHA with its version`; `release-workflow.test.mjs` › `ci android job only runs when …` |
| A3 test que lo comprueba | `apps/mobile/test/ci-workflow.test.mjs` (3 tests) |
| A4 CI en verde en el PR | Pendiente: solo verificable al abrir el PR (lo hace el leader tras Gate 2). |
| A5 `pnpm harness --full` en verde | Ver abajo. |

## `pnpm harness --full`

```
[OK]    57 features: 51 done, 5 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #56 ci-workflow-permissions (in_progress)
[OK]    Rama actual: feat/ci-workflow-permissions
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test        (mobile 20/20, web 403/403, api 358/358)
[OK]    Arnés en verde.
```

## Desviaciones

Ninguna. Sin UI, así que no hay capturas.

## Cambios de Gate 2

Petición del humano (aviso 3 del reviewer): acotar el test del job `changes` a su propio bloque.

- `apps/mobile/test/ci-workflow.test.mjs` › `the changes job declares the extra pull-requests: read it needs`: ya no recorta `ci.yml` desde `changes:` hasta el final. Ahora extrae con `/\n {2}changes:\n((?:(?: {3,}.*| *)\n)*)/` solo las líneas del job (indentadas 3+ espacios o en blanco), hasta la siguiente clave o comentario con 2 espacios de indentación o hasta el final del fichero. Además, comprueba que el job existe y que el bloque `permissions` está a 4 espacios dentro de ese tramo. No se ha tocado nada más.
- Prueba de mutación (en el scratchpad, sin tocar el repo): copia de `ci.yml` sin `permissions` en `changes` y con el mismo bloque en `android`:
  - test nuevo: `not ok 2 - the changes job declares…` (2 pass, 1 fail);
  - el recorte anterior (`ci.slice(ci.indexOf('\n  changes:\n'))`) sobre la misma mutación: 3 pass, 0 fail, que confirma el falso positivo.
  - Caso límite: `changes` como último job del fichero → el test nuevo pasa (3/3).
- `pnpm harness --full`: en verde (mobile 20/20, web 403/403, api 358/358).
