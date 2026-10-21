# Review — #20 locale-independent-unit-tests

**Veredicto:** APPROVED

Feature `sdd: false`, sin spec: se revisa contra la `description` y los `acceptance` de `feature_list.json`, `CONTRIBUTING.md`, `docs/` y `CHECKPOINTS.md`.

## Trazabilidad acceptance ↔ evidencia
- A1: [x] `apps/web/vitest.config.ts`: el proyecto `unit` declara `setupFiles: ['./src/test/setup-unit.ts']`. `apps/web/src/test/setup-unit.ts` hace `await i18n.changeLanguage('es')`, igual que `src/test/setup.ts` del proyecto `dom`.
- A2: [x] He ejecutado `pnpm --filter web test` con `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`: 18 archivos, 144 tests OK. Con `LANG=es_ES.UTF-8 LC_ALL=es_ES.UTF-8`: 18 archivos, 144 tests OK. He comprobado que el entorno inglés es real: `navigator.language` vale `en-US` en Node. Prueba de control: con `vitest.config.ts` tal como está en `main` (lo aparté con stash y después lo restauré), `vitest run --project unit` en en_US falla en 2 tests: `zod.test.ts` › translates an empty required text into Spanish y `schedules/form.test.ts` › requires an interval in months or distance. Así que el arreglo es lo que corrige el fallo.
- A3: [x] El diff no toca `src/i18n/index.ts`, `src/i18n/locale.ts` ni ningún `*.test.ts(x)`.
- A4: [x] `CONTRIBUTING.md` › Tests: «Ambos setups fijan i18n a `es`: los tests corren siempre en español sea cual sea el idioma del sistema…».
- A5: [x] `pnpm harness --full` en verde (lo ejecuté con locale en_US).

## Tasks
- No aplica (no hay spec).

## Checkpoints
- C1: [x] El arnés está sano, hay una sola feature activa (#20) y la rama es `feat/locale-independent-unit-tests`.
- C2: [x] No aplica (`sdd: false`): los acceptance se verifican uno a uno en la sección anterior.
- C3: [x] El diff solo toca `vitest.config.ts`, el nuevo `setup-unit.ts`, `CONTRIBUTING.md` y `progress/`. No hay refactors.
- C4: [x] No hay cambios de arquitectura ni de la app.
- C5: [x] Sin `any`, `console.log` ni TODOs. El setup no lleva Testing Library, lo que es correcto porque el proyecto `unit` corre en Node.
- C6: [x] `pnpm harness --full` está en verde. No hay tests nuevos ni UI.
- C7: [x] Existen `impl_locale-independent-unit-tests.md` (con archivos, evidencia y salida) y `current.md` actualizado. `PLAN.md` no necesita cambios.

## Hallazgos
Ninguno.

## Avisos para el humano (no bloquean)
- En esta máquina no está instalado el locale `en_US.UTF-8` (`locale -a` solo lista `es_ES.utf8`). Aun así, el ICU de Node usa la variable `LANG` y `navigator.language` resulta `en-US`, así que la prueba reproduce lo que pasa en CI.
- Los cambios siguen sin commitear (incluido `setup-unit.ts`, que no está trackeado): hay que añadirlos antes del merge.

## Cambios requeridos
Ninguno.
