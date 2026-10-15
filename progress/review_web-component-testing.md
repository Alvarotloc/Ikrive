# Review — #9 web-component-testing

**Veredicto:** APPROVED

Feature `sdd: false`: sin `specs/`. Se juzga contra los `acceptance` de `feature_list.json` (A1–A7), `CONTRIBUTING.md`, `docs/` y `CHECKPOINTS.md`. Se han dejado fuera, como se pidió, `specs/maintenance-timeline-web/`, `progress/explore_maintenance-timeline-web_patterns.md` y el cambio de estado de #6 en `feature_list.json`.

## Trazabilidad acceptance ↔ evidencia
- A1: [x] `apps/web/package.json`: `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2 (peer obligatoria de react 16), `user-event` 14.6.8, `jest-dom` 7.0.1 y `jsdom` 30.1.2. Las versiones instaladas en `node_modules` coinciden. `pnpm install --frozen-lockfile --offline` dice «Already up to date». El diff de `pnpm-lock.yaml` solo cambia los sufijos de resolución de peers de `vitest`/`better-auth` (ahora incluyen jsdom). No actualiza nada ajeno.
- A2: [x] `apps/web/vitest.config.ts`: `mergeConfig(viteConfig, { test: { projects: [unit, dom] } })` con `extends: true`. He comprobado con `vitest run --reporter verbose` que corren los 15 tests de `|unit| numbers.test.ts` (node) y los 3 de `|dom| *.test.tsx` (jsdom). Total 18, igual que antes más los 3 nuevos. No se salta nada. Los dos globs (`src/**/*.test.ts` y `src/**/*.test.tsx`) no se solapan y cubren todos los ficheros de test que hay hoy.
- A3: [x] `apps/web/src/test/render.tsx` › `renderWithProviders` (QueryClient nuevo sin reintentos + `I18nextProvider`, devuelve `user`) y `mockApi` (sustituye `fetch` con `vi.stubGlobal`, devuelve problem+json en errores y 404 en rutas no declaradas). `src/test/setup.ts` pone el idioma en `es` y hace `cleanup`, `unstubAllGlobals` y `restoreAllMocks` en `afterEach`.
- A4: [x] `apps/web/src/features/vehicles/odometer-form.test.tsx` › `shows the backwards-odometer error on the field when the API answers 409`. El test afirma comportamiento real:
  - `odometer-form.tsx:49-58` distingue 409 → `odometer.errors.backwards`, 400 → `future` y el resto → `common.error`. El test afirma el texto exacto de `backwards` dentro de `role="alert"`, así que un mapeo equivocado lo hace fallar. La clave existe en `es.json:235` y `en.json:235`.
  - Afirma además `aria-invalid="true"` en el input (el error va al campo) y que el cuerpo del POST a `/api/vehicles/v1/odometer` tiene `value: 40000`.
  - No se mockea ni el componente ni `useAddOdometerReading`: la petición pasa de verdad por `api-client` hasta el `fetch` simulado.
- A5: [x] `apps/web/src/components/form-field.test.tsx` › `shows its error with role="alert"` comprueba el texto concreto. `renders no alert without an error` cubre el caso negativo.
- A6: [x] `pnpm harness --full` en verde: lint, typecheck (incluye `src/**/*.test.tsx`, `src/test/*` y `vitest.config.ts`) y test (web 18/18). La CI usa `pnpm -r test` y `pnpm -r typecheck`, así que no hace falta tocarla.
- A7: [x] `CONTRIBUTING.md` › Tests y `docs/verification.md` (nivel 3 y nuevo anti-patrón). Lo que dicen coincide con la config y los helpers reales: rutas relativas a `/api`, 404 en rutas no declaradas, proyectos `unit`/`dom`, español y sin reintentos.

## tsconfig
- `allowImportingTsExtensions: true` es válido porque ya está `noEmit: true`. `tsc --noEmit` pasa. El build de producción (`vite build`) no usa `tsc` y sale OK: `pnpm --filter @ikrive/web build` funciona. No afecta a `apps/api` ni a `packages/shared`, que tienen su propio tsconfig.
- Añadir `vitest.config.ts` a `include` hace que la config también pase por el typecheck.

## Tasks
- No aplica (sin `tasks.md`). Los pasos del plan de `progress/current.md` están todos hechos.

## Checkpoints
- C1: [x] El arnés está en verde. Solo #9 está `in_progress` (#6 está en `spec_ready`, que no cuenta como activa). La rama es `feat/web-component-testing`.
- C2: [x] No aplica por ser `sdd: false`. Cada acceptance tiene evidencia que he abierto y leído (arriba).
- C3: [x] El diff solo toca la infraestructura de tests de `apps/web`, el lockfile, los docs y `progress/`. No cambia código de producción en `apps/web/src`.
- C4: [x] Sin cambios de API, BD ni dominio. Los helpers de test van en `src/test/` y los tests junto a cada componente.
- C5: [x] Sin `any`, sin `@ts-ignore`, sin `console.log` y sin código comentado.
- C6: [x] `pnpm harness --full` en verde. Los tests afirman resultados concretos. No hay UI nueva, así que no hacen falta capturas.
- C7: [x] `progress/impl_web-component-testing.md` incluye los archivos tocados, el mapa A→evidencia y la verificación. `progress/current.md` está al día. `docs/PLAN.md` no necesita cambios, porque la feature no cierra fase ni cambia decisiones.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- `apps/web/package.json` mantiene `vitest run --passWithNoTests`. Si un cambio futuro rompe los `include` de los proyectos, el comando seguiría en verde sin ejecutar nada. Ahora mismo no pasa (corren 18 tests), pero convendría quitar el flag de `apps/web`, que ya tiene tests.
- En `odometer-form.test.tsx`, la petición se busca comparando `String(input) === '/api/...'`. Funciona porque `api-client` llama a `fetch` con un string. Si algún día pasa un `Request`, habría que adaptar la búsqueda (el `mockApi` ya acepta ambos casos).
- Al hacer commit hay que excluir los archivos de #6 que indica `progress/current.md`.

## Cambios requeridos
Ninguno.

## Re-revisión tras Gate 2

**Veredicto:** APPROVED

Delta revisado: el humano pidió en Gate 2 quitar `--passWithNoTests` del script `test` de `apps/web`.

- [x] `apps/web/package.json`: `"test": "vitest run"`. El flag ya no está.
- [x] `pnpm --filter @ikrive/web test`: 3 archivos y 18 tests pasan (los mismos 3 archivos y 18 tests de la revisión anterior).
- [x] No hay otros cambios desde la revisión anterior. Los únicos archivos modificados después de `review_web-component-testing.md` son `apps/web/package.json` (el cambio pedido), `progress/impl_web-component-testing.md` (sección «Cambios tras Gate 2»), `progress/current.md` (anotación de Gate 2) y `feature_list.json` (#9 vuelve a `in_progress`; #6 sigue en `spec_ready`). No se ha tocado código, tests ni docs.
- [x] Ni `CONTRIBUTING.md`, ni `docs/`, ni `AGENTS.md`, ni `specs/` mencionan `--passWithNoTests`. Solo aparece en tres sitios: `progress/` (registro histórico), `progress/explore_maintenance-timeline-web_patterns.md` (exploración de #6, ahora desactualizada) y `packages/shared/package.json` (fuera de alcance; no se pidió cambiarlo).
- [x] `pnpm harness --full` en verde: lint, typecheck y test (shared 11, web 18, api 40).
- C1–C7 siguen como en la revisión anterior.

Avisos (no bloquean):
- `progress/explore_maintenance-timeline-web_patterns.md:62` todavía cita `"test": "vitest run --passWithNoTests"`. Conviene tenerlo en cuenta cuando se relance el spec-author de #6.
- `packages/shared/package.json` mantiene `--passWithNoTests`. Ahí también hay tests (11), así que se podría quitar en otra feature si el humano quiere.
