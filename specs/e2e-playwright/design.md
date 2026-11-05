# Design — e2e-playwright

## Resumen

Paquete de workspace nuevo `e2e/` (`@ikrive/e2e`) con `@playwright/test`. `pnpm test:e2e` hace `pnpm build` y lanza Playwright, cuyo `webServer` arranca `e2e/server.mjs`: crea un `DATA_DIR` temporal y ejecuta **el mismo bundle que la imagen** (`node apps/api/dist/server.js`, `NODE_ENV=production`, `WEB_DIST_DIR=apps/web/dist`). En local, Node resuelve los tres externos de runtime (`better-sqlite3`, `sharp`, `pdfkit`) desde `apps/api/node_modules`, así que no hace falta Docker. Un proyecto `setup` registra al primer usuario por la UI y guarda la sesión; los demás tests la reutilizan y crean sus propios datos. Nuevo job `e2e` en `ci.yml`.

Sin cambios de BD, HTTP, `packages/shared`, `apps/api/src` ni `apps/web/src`.

## Archivos

### `e2e/` (nuevo paquete)

| Archivo | Contenido |
|---|---|
| `package.json` | `@ikrive/e2e`, `private`, `type: module`. Scripts: `test:e2e` = `playwright test`, `typecheck` = `tsc --noEmit`, `test` = `vitest run` (solo `*.test.ts`, R12/R14). devDeps: `@playwright/test`. **No** tiene `build`. |
| `tsconfig.json` | Extiende `../tsconfig.base.json`, `types: ["node"]`, incluye `**/*.ts`. |
| `vitest.config.ts` | `include: ['*.test.ts']` (nunca `tests/**/*.spec.ts`). |
| `playwright.config.ts` | Ver abajo. |
| `server.mjs` | Wrapper del servidor E2E (R2, R3). Ver abajo. |
| `tests/fixtures.ts` | `test` extendido y helpers. Ver abajo. |
| `tests/auth.setup.ts` | `registers the first user as admin` (R4). |
| `tests/vehicles.spec.ts` | `creates a vehicle from the form` (R5). |
| `tests/maintenance.spec.ts` | `adds a maintenance record with an attachment` (R6). |
| `tests/fuel-stats.spec.ts` | `adds two full-tank fuel logs and shows the average consumption` (R7). |
| `tests/sale-report.spec.ts` | `downloads the sale report pdf` (R8). |
| `tests/data-portability.spec.ts` | `exports and re-imports the user data` (R9, R10). |
| `no-fixed-waits.test.ts` | Vitest: `e2e tests do not use fixed waits` — lee `tests/**/*.ts` y falla si encuentra `waitForTimeout(`, `setTimeout(` o `sleep(` (R12). |

### Raíz y resto

| Archivo | Cambio |
|---|---|
| `package.json` | Script `"test:e2e": "pnpm build && pnpm --filter @ikrive/e2e test:e2e"` (R1). `pnpm test` (`pnpm -r test`) solo corre el Vitest del paquete (R14). |
| `pnpm-workspace.yaml` | Añade `e2e` a `packages`. |
| `pnpm-lock.yaml` | Importer `e2e`. |
| `docker/Dockerfile` | Etapa `build`: `COPY e2e/package.json e2e/` junto a los demás `package.json`, para que `pnpm install --frozen-lockfile` case con el lockfile. El runtime no cambia (el job `docker` lo comprueba). |
| `.gitignore` | `e2e/.auth/` (sesión guardada). `playwright-report/` y `test-results/` ya están. |
| `.github/workflows/ci.yml` | Job `e2e` (abajo). |
| `docs/verification.md`, `CONTRIBUTING.md` › Tests, `docs/PLAN.md` (Stack «Calidad» sin «pendiente», «Verificación») | R17. |

## `e2e/server.mjs`

1. `dataDir = mkdtempSync(join(tmpdir(), 'ikrive-e2e-'))` (R3) e imprime `e2e DATA_DIR=<ruta>`.
2. `spawn(process.execPath, ['apps/api/dist/server.js'], { cwd: <raíz del repo>, stdio: 'inherit', env })` con `NODE_ENV=production`, `HOST=127.0.0.1`, `PORT=$E2E_PORT` (por defecto `3100`, para no chocar con `pnpm dev`), `BASE_URL=http://127.0.0.1:<port>`, `AUTH_SECRET` fijo de prueba (≥ 32), `DATA_DIR`, `WEB_DIST_DIR=<raíz>/apps/web/dist`, `REMINDERS_ENABLED=false`, `LOG_LEVEL=warn` (R2).
3. Si falta `apps/api/dist/server.js` o `apps/web/dist/index.html`, sale con 1 y `run pnpm build first`.
4. Reenvía `SIGINT`/`SIGTERM` al hijo y, al salir este, borra `dataDir` (`rmSync recursive`) y sale con su código.

Se usa un wrapper y no `mkdtemp` en `playwright.config.ts` porque la config se evalúa también en cada worker: cada proceso crearía su propio directorio.

## `playwright.config.ts`

```ts
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,                       // un flake es un fallo (R11)
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL,                         // http://127.0.0.1:${E2E_PORT ?? 3100}
    locale: 'es-ES', timezoneId: 'UTC',
    serviceWorkers: 'block',         // la PWA no debe servir assets cacheados ni mostrar el aviso de actualización
    trace: 'retain-on-failure', screenshot: 'only-on-failure', // R13
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/admin.json' }, dependencies: ['setup'] },
  ],
  webServer: { command: 'node server.mjs', url: `${baseURL}/api/health`, reuseExistingServer: false, timeout: 60_000 },
});
```

`reuseExistingServer: false`: siempre BD nueva; si el puerto está ocupado Playwright falla en vez de reutilizar un servidor con datos.

## `tests/fixtures.ts`

- `t(key, vars?)`: lee `apps/web/src/i18n/locales/es.json` (import JSON) e interpola `{{var}}`. Los localizadores usan `getByRole`/`getByLabel` con los textos de i18n, no copias literales ni selectores CSS.
- Fixture `clientIp` (auto, por test): `extraHTTPHeaders: { 'x-forwarded-for': '10.<worker>.<n>.<m>' }` único por test. Con `trustProxy: true`, `@fastify/rate-limit` (300/min) y el de Better Auth (sign-in/up 3 cada 10 s en producción) cuentan por IP; así cada test es un cliente aparte y la suite no comparte cupo (R11).
- `uniquePlate(testInfo)`: matrícula derivada de `testInfo.testId` (R11).
- `createVehicle(request, data)`: `POST /api/vehicles` con `page.request` (comparte la cookie de la sesión) y devuelve el vehículo; lo usan R6–R10 para sembrar datos sin repetir el flujo de R5.
- `PNG_8x8`: el mismo PNG en base64 de `docker/smoke.mjs`, pasado a `setInputFiles({ name: 'factura.png', mimeType: 'image/png', buffer })`. Sin binarios en el repo.

Esperas: solo aserciones web-first (`expect(locator).toBeVisible()`, `toHaveURL`, `toHaveText`), `page.waitForEvent('download')` y `waitForResponse` cuando haga falta (R12).

## Tests

| Test | Pasos y aserciones |
|---|---|
| `auth.setup.ts` › `registers the first user as admin` | Sin `storageState`. `/register` → nombre, email, contraseña → enviar. `toHaveURL('/')`, enlace de navegación `t('nav.users')` visible; `/admin/users` muestra el email con `t('adminUsers.roles.admin')`. Guarda `storageState` en `e2e/.auth/admin.json`. |
| `creates a vehicle from the form` | `/vehicles/new`, marca/modelo/matrícula única, guardar → `toHaveURL(/\/vehicles\/[^/]+$/)` y la ficha muestra los tres; `/vehicles` muestra la matrícula. |
| `adds a maintenance record with an attachment` | Vehículo por API. Ficha → nuevo mantenimiento (título, fecha, coste) + `factura.png` en el `AttachmentPicker` → guardar. El historial muestra el título y `factura.png`. |
| `adds two full-tank fuel logs and shows the average consumption` | Vehículo por API. Dos repostajes con depósito lleno (p. ej. 10 000 km/40 L y 10 500 km/30 L, fechas pasadas) → la sección lista los dos y la métrica `t('stats.metrics.consumption')` muestra `6,0` (30 L / 500 km) y ya no `t('stats.pending.consumption')`. |
| `downloads the sale report pdf` | Vehículo por API. Diálogo del informe → `waitForEvent('download')` + `t('saleReport.download')`. `suggestedFilename()` acaba en `.pdf` y los 5 primeros bytes son `%PDF-`. |
| `exports and re-imports the user data` | Vehículo por API. `/settings` → `t('dataPortability.export')` → descarga `.zip` que empieza por `PK` (R9). `setInputFiles` en `t('dataPortability.fileInput')` con ese fichero → `t('dataPortability.confirm')` → `t('dataPortability.summaryTitle')` visible y en `/vehicles` la matrícula aparece 2 veces (R10). El import añade, no sobrescribe (data-import-api R10), así que no afecta a otros tests en paralelo; por eso se cuenta solo su matrícula. |

Independencia (R11): ningún test usa datos de otro; todos dependen solo de la sesión del setup. Se comprueba ejecutando cada fichero en solitario (`pnpm --filter @ikrive/e2e test:e2e tests/<f>.spec.ts`) y la suite con `--repeat-each=3` (resultado en `progress/impl_e2e-playwright.md`).

## Job `e2e` en `ci.yml`

```yaml
e2e:
  runs-on: ubuntu-latest
  needs: check
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with: { node-version-file: .nvmrc, cache: pnpm }
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @ikrive/e2e exec playwright install --with-deps chromium
    - run: pnpm test:e2e
    - if: failure()
      uses: actions/upload-artifact@v4
      with:
        name: e2e-results
        path: |
          e2e/test-results/
          e2e/playwright-report/
        retention-days: 14
```

Corre en paralelo con `docker` (ambos `needs: check`), mismos `checkout`/`pnpm`/`setup-node` que `check`. `CI=true` activa `forbidOnly`, 2 workers y el reporter `github`.

## Alternativas descartadas

- **E2E contra la imagen Docker (`ikrive:ci`)**: es lo más fiel, pero exige Docker en local y reconstruir la imagen para cada cambio. El bundle de `dist/` es el mismo que va en la imagen y la imagen ya tiene su smoke test (`docker/smoke.mjs`).
- **`pnpm dev` (Vite + tsx)**: no prueba el build de producción ni que la API sirva la SPA, que es lo que pide la feature.
- **Registrar al admin por API en un `globalSetup`**: más rápido, pero deja sin cubrir el flujo de registro en la UI. El proyecto `setup` es el patrón oficial de Playwright y su traza aparece en el informe.
- **Playwright como devDependency de la raíz**: `pnpm -r typecheck` no incluye la raíz, los E2E quedarían sin typecheck.
- **Variable `RATE_LIMIT_MAX` para desactivar el rate limit en E2E**: cambia código de producto solo por los tests y prueba una configuración distinta a la real.

## Riesgos

- **Rate limit**: si el truco de `x-forwarded-for` dejara de funcionar (p. ej. `trustProxy` pasa a `false`), los tests empezarían a recibir 429. Aparecería como fallo claro en la traza.
- **Tiempo de CI**: `pnpm build` + instalación de Chromium (~1–2 min). Sin caché de navegadores de momento.
- **Textos de i18n**: los tests leen las claves de `es.json`, así que un cambio de texto no los rompe; renombrar o borrar una clave sí, en ejecución (localizador sin resultados, visible en la traza).
- **Dockerfile**: olvidar el `COPY e2e/package.json` rompe `pnpm install --frozen-lockfile` en el build de la imagen.

## Decisiones a validar

1. **`pnpm test:e2e` ejecuta `pnpm build` cada vez** para no probar un `dist/` viejo. Más lento en local; para iterar, `pnpm --filter @ikrive/e2e test:e2e` usa el `dist/` existente.
2. **Paquete de workspace `e2e/` en la raíz** (no en `apps/` ni `packages/`), y el `COPY` correspondiente en el Dockerfile.
3. **Una IP de cliente por test con `x-forwarded-for`** para no chocar con los rate limits en producción, en lugar de exponer una variable para desactivarlos.
4. **Sesión compartida del admin** creada por el proyecto `setup`; cada test crea su propio vehículo. Ningún test registra más usuarios.
5. **`retries: 0`** también en CI, `serviceWorkers: 'block'`, `locale: 'es-ES'`, `timezoneId: 'UTC'`, solo Chromium y puerto `3100` (`E2E_PORT`).
6. **Artefactos solo si falla**, con 14 días de retención.

## Fuera de alcance

- Otros navegadores (Firefox, WebKit) y viewport móvil.
- Flujos no listados en el `acceptance`: alertas/notificaciones, canales, enlaces públicos del informe, gestión de usuarios más allá de ver el rol, PWA offline.
- Regresión visual (capturas comparadas).
- Ejecutar los E2E contra la imagen Docker o en `release.yml`.
