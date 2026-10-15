# Implementación: web-component-testing (#9)

Feature `sdd: false`: guiada por los `acceptance` de `feature_list.json` (A1–A7 abajo).

## Decisiones

- **jsdom (no happy-dom).** jsdom es el entorno de referencia de Testing Library y user-event, y el más fiel al estándar (envío de formularios, `Request`/`Response`, accesibilidad que usa `getByRole`). happy-dom es más rápido, pero tiene huecos conocidos en esas APIs. Con pocos tests de componentes la velocidad no importa: hoy el proyecto `dom` tarda menos de 1 s.
- **Vitest 5 sin `environmentMatchGlobs`** (ya no existe). `apps/web/vitest.config.ts` hace `mergeConfig(viteConfig, …)` con dos `projects` que heredan la config de Vite (`extends: true`, así el alias `@` y el plugin de React siguen funcionando): `unit` (`src/**/*.test.ts`, node) y `dom` (`src/**/*.test.tsx`, jsdom, `setupFiles: src/test/setup.ts`). Los `*.test.ts` siguen corriendo en Node, sin cambios.
- **Sin MSW.** `mockApi(routes)` sustituye `fetch` con `vi.stubGlobal` y responde según `"MÉTODO /ruta"` (ruta relativa a `/api`). Basta porque todo el tráfico pasa por `lib/api-client.ts`, que usa `fetch`. Las rutas no declaradas responden 404 problem+json (p. ej. `GET /settings`: `useFormat` vuelve a `DEFAULT_USER_SETTINGS`). `setup.ts` lo restaura con `vi.unstubAllGlobals()` después de cada test.
- **i18n en español:** `setup.ts` importa `@/i18n` y ejecuta `changeLanguage('es')`, así el resultado no depende del idioma de la máquina ni de la CI. El wrapper añade `I18nextProvider`.
- **Tipos en el typecheck:** los `*.test.tsx` y `src/test/*` están en `src`, que `tsconfig.json` ya incluye. `setup.ts` importa `@testing-library/jest-dom/vitest`, que amplía `expect` con los matchers en todo el programa de tipos. He añadido `vitest.config.ts` a `include`. También `allowImportingTsExtensions` (válido con `noEmit`), porque el import es `./vite.config.ts` con extensión: así se evita el aviso del `configLoader: 'native'` de Vite.

## Archivos

| Archivo | Cambio |
|---|---|
| `apps/web/package.json`, `pnpm-lock.yaml` | devDependencies: `@testing-library/react` ^16.3.3, `@testing-library/dom` ^10.4.2 (peer de la anterior), `@testing-library/user-event` ^14.6.8, `@testing-library/jest-dom` ^7.0.1, `jsdom` ^30.1.2 |
| `apps/web/vitest.config.ts` | Nuevo: proyectos `unit` y `dom` |
| `apps/web/tsconfig.json` | `include` + `vitest.config.ts`; `allowImportingTsExtensions: true` |
| `apps/web/src/test/setup.ts` | Nuevo: matchers de jest-dom, i18n en `es`, `cleanup` + `unstubAllGlobals` + `restoreAllMocks` en `afterEach` |
| `apps/web/src/test/render.tsx` | Nuevo: `createTestQueryClient()` (sin reintentos en queries ni mutations), `renderWithProviders(ui, { queryClient? })` → `{ user, queryClient, ...render }`, `mockApi(routes)` → `vi.fn` de `fetch` |
| `apps/web/src/features/vehicles/odometer-form.test.tsx` | Nuevo: 409 → error de odómetro hacia atrás en el campo |
| `apps/web/src/components/form-field.test.tsx` | Nuevo: error con `role="alert"`, y sin error no hay alerta |
| `CONTRIBUTING.md` | Sección Tests: cuándo escribir tests de componentes, dónde van, helper, ejemplos, config |
| `docs/verification.md` | Nivel 3: capa «componentes web»; anti-patrón: no mockear el componente ni sus hooks, solo `fetch` |
| `progress/current.md` | Bitácora |

No he tocado código de producción en `apps/web/src` ni `specs/maintenance-timeline-web/`, ni el estado de ninguna feature.

## Trazabilidad acceptance → evidencia

| # | Acceptance | Evidencia |
|---|---|---|
| A1 | devDependencies de Testing Library + entorno DOM | `apps/web/package.json` (las 4 libs + `jsdom`) |
| A2 | `*.test.tsx` en DOM; los `*.test.ts` siguen pasando | `apps/web/vitest.config.ts`. La salida verbose muestra `|unit| numbers.test.ts` (15 tests) y `|dom| *.test.tsx` (3 tests) |
| A3 | Helper de render con QueryClientProvider + i18n + fetch simulado | `apps/web/src/test/render.tsx` › `renderWithProviders`, `mockApi`; `apps/web/src/test/setup.ts` |
| A4 | OdometerForm muestra el error de hacia atrás con 409 | `apps/web/src/features/vehicles/odometer-form.test.tsx` › `shows the backwards-odometer error on the field when the API answers 409`. Afirma el texto de `role="alert"`, `aria-invalid="true"` en el input y el cuerpo del POST (`value: 40000`) |
| A5 | FormField muestra su error con `role="alert"` | `apps/web/src/components/form-field.test.tsx` › `shows its error with role="alert"` (y `renders no alert without an error`) |
| A6 | `pnpm test` y `pnpm typecheck` los incluyen y pasan, también en CI | `apps/web` usa `vitest run` y `tsc --noEmit`, que ya llaman `pnpm -r test` y `pnpm -r typecheck` en `.github/workflows/ci.yml`. No requiere cambiar la CI. `pnpm install --frozen-lockfile` pasa con el lockfile actualizado |
| A7 | Documentación | `CONTRIBUTING.md` › Tests; `docs/verification.md` › nivel 3 y anti-patrones |

## Verificación

`pnpm harness --full` (resumen):

```
[OK]    pnpm lint        (biome check: 120 files, sin cambios)
[OK]    pnpm typecheck   (shared, api, web)
[OK]    pnpm test
  packages/shared  Test Files 2 passed, Tests 11 passed
  apps/web         Test Files 3 passed, Tests 18 passed   (unit: 15, dom: 3)
  apps/api         Test Files 7 passed, Tests 40 passed
[OK]    Arnés en verde.
```

Además: `pnpm --filter @ikrive/web build` OK (`vitest.config.ts` no afecta al build). `pnpm install --frozen-lockfile` OK.
Docker: `docker build -f docker/Dockerfile -t ikrive:dev .` OK. El contenedor arrancado con `AUTH_SECRET` responde a `GET /api/health` con `{"status":"ok","version":"0.0.0"}`.

Sin UI nueva, así que no hay capturas.

## Desviaciones

- Ninguna sobre los acceptance.
- Añadido `@testing-library/dom` además de las tres libs pedidas: es peer dependency obligatoria de `@testing-library/react` 16.
- `apps/web/tsconfig.json`: `allowImportingTsExtensions` (motivo arriba).

## Cambios tras Gate 2

- `apps/web/package.json`: el script `test` pasa de `vitest run --passWithNoTests` a `vitest run`, para que falle si no encuentra tests. `CONTRIBUTING.md` y `docs/verification.md` no mencionan el flag, así que no hubo que tocarlos.
- `pnpm harness --full`: en verde (lint, typecheck, test). Tests: web 3 archivos / 18 tests, api 7 / 40, shared 2 / 11.
