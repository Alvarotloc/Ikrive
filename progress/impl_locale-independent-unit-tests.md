# Implementación: #20 `locale-independent-unit-tests`

Arreglo menor (`sdd: false`, sin spec), guiado por la `description` y los `acceptance` de `feature_list.json`.

## Cambios por archivo

- `apps/web/src/test/setup-unit.ts` (nuevo): importa `@/i18n` y hace `await i18n.changeLanguage('es')`, igual que `src/test/setup.ts` del proyecto `dom` (sin Testing Library ni jest-dom, que no aplican en Node).
- `apps/web/vitest.config.ts`: el proyecto `unit` declara `setupFiles: ['./src/test/setup-unit.ts']`.
- `CONTRIBUTING.md` › Tests: la línea de configuración menciona `setup-unit.ts` y dice que ambos setups fijan i18n a `es`, así que los tests corren siempre en español sea cual sea el idioma del sistema (en CI, en-US).

Sin cambios en `src/i18n/index.ts`, `src/i18n/locale.ts` ni en ningún test.

## Trazabilidad acceptance → evidencia

| Acceptance | Evidencia |
|---|---|
| 1. El proyecto `unit` tiene un `setupFiles` que fija `es`, como el `dom` | `apps/web/vitest.config.ts` › proyecto `unit` › `setupFiles: ['./src/test/setup-unit.ts']`; `apps/web/src/test/setup-unit.ts` |
| 2. `pnpm --filter web test` verde con en_US y con es_ES | `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`: 18 archivos, 144 tests OK. `LANG=es_ES.UTF-8 LC_ALL=es_ES.UTF-8`: 18 archivos, 144 tests OK. Control: sin el cambio en `vitest.config.ts`, en en_US fallan 2 (`src/i18n/zod.test.ts` › translates an empty required text into Spanish; `src/features/schedules/form.test.ts` › requires an interval in months or distance) |
| 3. No cambia el código de la app ni los textos esperados | `git diff` no toca `apps/web/src/i18n/` ni ningún `*.test.ts(x)` |
| 4. La documentación indica que los tests corren siempre en español | `CONTRIBUTING.md` › Tests › línea «Configuración en `apps/web/vitest.config.ts`…» |
| 5. `pnpm harness --full` verde | Ver abajo |

## `pnpm harness --full`

```
[OK]    20 features: 14 done, 5 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #20 locale-independent-unit-tests (in_progress)
[OK]    Rama actual: feat/locale-independent-unit-tests
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test        (api: 9 archivos / 62 tests; web: 18 archivos / 144 tests)
[OK]    Arnés en verde.
```

## Desviaciones

Ninguna. Se ha usado un setup propio para `unit` en lugar de reutilizar `src/test/setup.ts` porque este importa Testing Library/jest-dom, pensados para jsdom.
