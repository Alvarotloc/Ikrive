# Review — #70 ci-android-root-paths

**Veredicto:** APPROVED

Feature `sdd: false`: sin `specs/`. Validada contra los `acceptance` de `feature_list.json`, `CONTRIBUTING.md` y `CHECKPOINTS.md`.

## Trazabilidad acceptance ↔ verificación

- A1 (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc` en el filtro): [x] `.github/workflows/ci.yml:136-141`; `apps/mobile/test/release-workflow.test.mjs:74` › `ci android job only runs when mobile, web, packages, the root build files or the workflow change`, que exige cada ruta literal `- '<ruta>'` dentro del bloque del job `changes`.
- A2 (`packages/**` en lugar de enumerar): [x] mismo test: exige `- 'packages/**'` y `assert.doesNotMatch(changes, /- 'packages\/[\w-]+\/\*\*'/)` impide volver a enumerar paquetes.
- A3 (revisión de otros ficheros raíz): [x] documentada en `progress/impl_ci-android-root-paths.md`; la he comprobado yo (ver abajo).
- A4 (YAML válido, resto de jobs igual): [x] `yaml.safe_load` carga `check, e2e, docker, changes, android`; `git diff` solo toca 7 líneas del bloque `filters`; el test sigue comprobando que `check`, `e2e`, `docker` no tienen `if:`.
- A5 (harness verde): [x] `pnpm harness --full` en verde (ejecutado por mí).

## Comprobación independiente de qué lee el build de la APK

Pasos del job `android`: `pnpm/action-setup` (lee `packageManager` de `package.json`), `setup-node` con `node-version-file: .nvmrc`, `pnpm install --frozen-lockfile` (`package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`), `pnpm --filter @ikrive/mobile build:web` → `vite build --mode native` de `apps/web` + `apps/mobile/scripts/check-web-dir.mjs`, `cap sync android`, Gradle en `apps/mobile/android`.

- `apps/web/tsconfig.json` extiende `../../tsconfig.base.json` → bien añadido.
- `apps/web` depende de `@ikrive/db` y `@ikrive/shared`, y `apps/web/src/lib/data-source/local/migrations.ts` importa `packages/db/migrations/**` → cubierto por `packages/**`.
- `apps/web` no importa nada de `apps/api`, `e2e/`, `scripts/`, `docs/` ni ficheros raíz distintos de los anteriores (grep de rutas relativas que salen del paquete).
- `vite.config.ts` no define `root` ni `envDir` → los `.env` se leen de `apps/web`, no de la raíz; descartar `.env`/`.env.example` es correcto.
- Gradle y `capacitor.config.json` solo referencian rutas dentro de `apps/mobile` y `../web/dist-native`.
- No existe `.npmrc` en la raíz. `biome.json`, `lefthook.yml`, `.editorconfig`, `docker*`, `scripts/harness`, `release.yml` no intervienen. La lista de descartes está bien justificada.

## Cambio en `apps/mobile/test/release-workflow.test.mjs`

Necesario: el test anterior exigía `- 'packages/db/**'`, que ya no existe en el filtro, así que `pnpm test` fallaría. Correcto: amplía la lista a las 9 rutas, añade el `doesNotMatch` anti-enumeración y mantiene intactas el resto de aserciones. Es el test que ya cubría el contrato del filtro desde #69; tocarlo está dentro del alcance.

## Tasks

- N/A (`sdd: false`, sin `tasks.md`).

## Checkpoints

- C1: [x] harness OK, una sola feature activa (#70 `in_progress`), rama `feat/ci-android-root-paths`.
- C2: [x] N/A por `sdd: false`; los `acceptance` tienen verificación concreta (arriba).
- C3: [x] diff limitado a `ci.yml` (filtro), su test, `feature_list.json` (estado), `progress/`.
- C4: [x] N/A (sin cambios de API, BD ni web).
- C5: [x] sin `any`, `console.log` ni TODOs.
- C6: [x] `pnpm harness --full` en verde; el test afirma rutas concretas. Sin UI.
- C7: [x] `progress/impl_ci-android-root-paths.md` con archivos, trazabilidad y salida; `progress/current.md` describe la sesión; `docs/PLAN.md` no requiere cambios.

## Hallazgos

Ninguno bloqueante.

## Avisos para el humano (no bloquean)

- El test comprueba la presencia de las rutas, pero no que no haya rutas de más; es suficiente para los `acceptance`.
- `e2e/` está en el workspace pero queda fuera del filtro a propósito: un cambio en sus dependencias ya se refleja en `pnpm-lock.yaml`, que sí se vigila.

## Cambios requeridos

Ninguno.
