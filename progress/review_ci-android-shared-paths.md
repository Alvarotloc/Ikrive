# Review — #69 ci-android-shared-paths

**Veredicto:** APPROVED

Feature `sdd: false`: sin `specs/`, se valida contra los `acceptance` de `feature_list.json`, `CONTRIBUTING.md` y `CHECKPOINTS.md`.

## Trazabilidad acceptance ↔ evidencia

- A1 (el filtro `android` incluye `packages/shared/**`): [x] `.github/workflows/ci.yml:137`, dentro de `filters.android` del job `changes` (`dorny/paths-filter`).
- A2 (cubre todos los paquetes del workspace de los que depende la APK): [x] verificado leyendo los `package.json`: `apps/mobile` no depende de `@ikrive/*` (su `build:web` compila `@ikrive/web`), `apps/web` → `@ikrive/db` y `@ikrive/shared`, `packages/db` → `@ikrive/shared`, `packages/shared` → ninguno. El cierre transitivo es `apps/mobile`, `apps/web`, `packages/db` y `packages/shared`, y el filtro cubre los cuatro. `packages/` solo contiene `db` y `shared`.
- A3 (YAML válido y el resto de jobs sin cambios): [x] `yaml.safe_load` OK; el diff de `ci.yml` es solo +1 línea.
- A4 (`pnpm harness --full` en verde): [x] lo he ejecutado y termina con «Arnés en verde» (lint, typecheck, test: web 520 y api 368).

No hay test automatizado. Está justificado: es un cambio de configuración de CI y no hay nada que se pueda probar con tests dentro del repo.

## Tasks

- No aplica (sin `tasks.md`). El plan de `progress/current.md` (pasos 1–3) está cumplido.

## Checkpoints

- C1: [x] harness OK; solo una feature activa (#69 `in_progress`); rama `feat/ci-android-shared-paths`.
- C2: [x] N/A por ser `sdd: false`; los `acceptance` tienen trazabilidad en `impl_ci-android-shared-paths.md`.
- C3: [x] el diff solo toca `ci.yml` (1 línea) y el estado del arnés (`feature_list.json`, `progress/current.md`, `progress/impl_*.md`). No hay refactors ni cambios de otras features.
- C4: [x] N/A (no toca API, BD ni web).
- C5: [x] N/A (no hay código TypeScript).
- C6: [x] `pnpm harness --full` en verde; no hay tests nuevos ni UI.
- C7: [x] `impl_ci-android-shared-paths.md` incluye los archivos tocados, la trazabilidad y la salida de la verificación; `current.md` describe la sesión activa; `docs/PLAN.md` no necesita cambios.

## Hallazgos

Ninguno.

## Avisos para el humano (no bloquean)

- El filtro tampoco vigila ficheros de la raíz que afectan al build de la APK: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` y `.nvmrc`. Por ejemplo, un cambio solo en `tsconfig.base.json` no recompilaría la APK en el PR. Queda fuera de los `acceptance` de #69; si interesa, se puede abrir como feature aparte.
- Cuando se añada un paquete nuevo en `packages/`, habrá que añadirlo también a este filtro a mano. Usar `'packages/**'` lo evitaría.

## Cambios requeridos

Ninguno.
