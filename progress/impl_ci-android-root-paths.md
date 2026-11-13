# impl — ci-android-root-paths (#70, sdd: false)

## Cambios por archivo

- `.github/workflows/ci.yml` (solo el filtro `android` del job `changes`):
  - `packages/db/**` y `packages/shared/**` → `packages/**` (un paquete nuevo también dispara el job).
  - Añadidos los ficheros raíz: `.nvmrc`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`.
  - Orden: `apps/*` → `packages/**` → ficheros raíz (alfabético, junto a `pnpm-lock.yaml`) → `.github/workflows/ci.yml` al final, como antes.
  - El comentario sobre el job `changes` no cambia: sigue siendo exacto. Ningún otro job se toca.
- `apps/mobile/test/release-workflow.test.mjs`: el test del filtro afirmaba `packages/db/**`, que ya no existe (rompía `pnpm test`). Ahora exige las 9 rutas nuevas y además que no haya entradas `packages/<nombre>/**` enumeradas una a una. Título y comentario actualizados.
- `progress/current.md`: línea en la bitácora.

## Revisión de ficheros raíz (criterio 3)

Añadidos (afectan al build de la APK):

| Fichero | Por qué |
|---|---|
| `.nvmrc` | `actions/setup-node` del job `android` usa `node-version-file: .nvmrc`. |
| `package.json` | `packageManager` fija la versión de pnpm (`pnpm/action-setup`); `engines`; devDeps raíz (`typescript`, etc.) instaladas en el workspace. |
| `pnpm-workspace.yaml` | Define los paquetes del workspace y `allowBuilds` (scripts de instalación nativos); cambia lo que instala `pnpm install`. |
| `tsconfig.base.json` | `apps/web/tsconfig.json` lo extiende, y Vite lee el tsconfig para transformar TS/JSX en `build:native`. |

Descartados:

| Fichero | Por qué no |
|---|---|
| `.npmrc` | No existe en el repo. |
| `biome.json` | Solo lint/format (`pnpm lint`), no interviene en `build:native`, `cap sync` ni Gradle. |
| `lefthook.yml` | Git hooks locales; no afecta al build. |
| `.editorconfig` | Solo editor. |
| `.env` / `.env.example` | Vite usa `envDir` por defecto = `apps/web` (no hay `envDir` en `vite.config.ts`); `.env` además está en `.gitignore`. |
| `.dockerignore`, `docker/`, `docker-compose.yml` | Solo imagen Docker. |
| `scripts/` | Solo contiene `scripts/harness/` (arnés). Los scripts que usa la APK (`check-web-dir.mjs`, `android-version.mjs`) están en `apps/mobile/scripts/`, ya cubiertos por `apps/mobile/**`. |
| `e2e/` | Paquete del workspace, pero la APK no lo usa; un cambio en sus dependencias se refleja en `pnpm-lock.yaml`, ya vigilado. |
| `.github/workflows/release.yml` | Otro workflow; no cambia el job `android` de CI. |

## Trazabilidad (acceptance → verificación)

| Acceptance | Dónde | Test |
|---|---|---|
| 1. `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc` en el filtro | `ci.yml` › `changes` | `apps/mobile/test/release-workflow.test.mjs` › `ci android job only runs when mobile, web, packages, the root build files or the workflow change` |
| 2. `packages/**` en vez de enumerar | `ci.yml` › `changes` | mismo test (incluye `packages/**` y `doesNotMatch` de `packages/<nombre>/**`) |
| 3. Revisión de otros ficheros raíz | este informe | — (revisión documentada arriba) |
| 4. YAML válido, resto de jobs igual | `ci.yml` | `yaml.safe_load` OK; `git diff` solo toca el bloque `filters`; el mismo test comprueba que `check`, `e2e`, `docker` no tienen `if:` |
| 5. Harness verde | — | `pnpm harness --full` |

## `pnpm harness --full`

```
[OK]    70 features: 65 done, 4 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #70 ci-android-root-paths (in_progress)
[OK]    Rama actual: feat/ci-android-root-paths
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test
[OK]    Arnés en verde.
```

(La primera ejecución falló en `apps/mobile test` porque el test seguía exigiendo `packages/db/**`; corregido como se describe arriba.)

## Desviaciones

- Se ha tocado `apps/mobile/test/release-workflow.test.mjs` además de `ci.yml`: el test cubre el contrato del filtro y había que adaptarlo al nuevo criterio (no es un cambio funcional de la app).
