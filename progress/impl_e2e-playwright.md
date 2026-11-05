# Implementación — e2e-playwright (#41)

Rama `feat/e2e-playwright`. Tasks T1–T16 marcadas en `specs/e2e-playwright/tasks.md`. Sin cambios en `apps/`, `packages/`, BD ni HTTP.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `e2e/package.json` | Paquete `@ikrive/e2e` (privado, ESM). Scripts `test:e2e` (`playwright test`), `typecheck`, `test` (`vitest run`). devDep `@playwright/test@^1.64.1`. Sin `build`. |
| `e2e/tsconfig.json` | Extiende `tsconfig.base.json` con `module: ESNext` / `moduleResolution: Bundler` (como `apps/api` y `packages/shared`; con `NodeNext` exigía extensiones en los imports relativos), `types: ["node"]`. |
| `e2e/vitest.config.ts` | `include: ['*.test.ts']`: `pnpm test` nunca carga `tests/**/*.spec.ts` (R14). |
| `e2e/server.mjs` | Crea `DATA_DIR` con `mkdtempSync(tmpdir()/ikrive-e2e-)`, comprueba `dist/`, lanza `node apps/api/dist/server.js` con `NODE_ENV=production`, `HOST=127.0.0.1`, `PORT=E2E_PORT‖3100`, `BASE_URL`, `AUTH_SECRET` de prueba, `WEB_DIST_DIR=apps/web/dist`, `REMINDERS_ENABLED=false`, `LOG_LEVEL=warn`; reenvía `SIGINT`/`SIGTERM` y borra el directorio al salir el hijo (R2, R3). |
| `e2e/playwright.config.ts` | Según el design (fullyParallel, `retries: 0`, workers 2 en CI, reporters, `locale es-ES`, `timezoneId UTC`, `serviceWorkers: 'block'`, `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`, `outputDir: test-results`, `webServer` sobre `/api/health` sin reutilizar). Proyectos `setup`, `chromium` y `data-portability` (ver desviaciones). `gracefulShutdown: SIGTERM` en `webServer`. |
| `e2e/tests/fixtures.ts` | `t()` sobre `es.json` con `{{var}}`, `literal()` (escape para RegExp), `ADMIN_STORAGE_STATE`, `test` extendido que sobrescribe `extraHTTPHeaders` con un `x-forwarded-for` único por test (`10.<worker>.<n>.<m>`), `uniquePlate(testInfo)`, `createVehicle(page.request, …)` y `PNG_8x8`. |
| `e2e/tests/auth.setup.ts` | `registers the first user as admin` (R4). |
| `e2e/tests/vehicles.spec.ts` | `creates a vehicle from the form` (R5). |
| `e2e/tests/maintenance.spec.ts` | `adds a maintenance record with an attachment` (R6). |
| `e2e/tests/fuel-stats.spec.ts` | `adds two full-tank fuel logs and shows the average consumption` (R7). |
| `e2e/tests/sale-report.spec.ts` | `downloads the sale report pdf` (R8). |
| `e2e/tests/data-portability.spec.ts` | `exports and re-imports the user data` (R9, R10). |
| `e2e/no-fixed-waits.test.ts` | Vitest `e2e tests do not use fixed waits`: recorre `tests/**/*.ts` y lista las líneas con `waitForTimeout(`, `setTimeout(` o `sleep(` (R12). |
| `package.json` | Script `test:e2e` = `pnpm build && pnpm --filter @ikrive/e2e test:e2e` (R1). |
| `pnpm-workspace.yaml`, `pnpm-lock.yaml` | Workspace `e2e` e importer en el lockfile. |
| `docker/Dockerfile` | `COPY e2e/package.json e2e/` en la etapa `build` (el runtime no cambia). |
| `.gitignore` | `e2e/.auth/`. |
| `.github/workflows/ci.yml` | Job `e2e` (`needs: check`): install, `playwright install --with-deps chromium`, `pnpm test:e2e`, `upload-artifact@v4` `e2e-results` (`e2e/test-results/`, `e2e/playwright-report/`, 14 días) con `if: failure()` (R15, R16). |
| `docs/verification.md` | Nivel 4 «E2E» (comando, servidor, iteración sin rebuild, artefactos, fuera de `pnpm test`, instalación del navegador) y anti-patrón de esperas fijas (R17). |
| `CONTRIBUTING.md` | `e2e/` en «Estructura» y, en «Tests», cómo funciona y cómo añadir un E2E (R17). |
| `docs/PLAN.md` | Stack «Calidad» sin «pendiente», «CI/CD» con el job `e2e` y `pnpm test:e2e` en «Verificación» (R17). No toqué la tabla de fases: la fase 7 sigue abierta. |

## Trazabilidad

| R | Evidencia |
|---|---|
| R1 | `package.json` › `test:e2e`; `pnpm test:e2e` ejecuta `pnpm -r build` y luego `playwright test` (salida abajo). |
| R2 | `e2e/server.mjs` + `playwright.config.ts` › `webServer`; todos los specs navegan la SPA y llaman a `/api` en `http://127.0.0.1:3100`. |
| R3 | `e2e/server.mjs` (`mkdtempSync`); `e2e/tests/auth.setup.ts` › `registers the first user as admin` (la BD vacía hace admin al primer registro). Tras cada ejecución no queda ningún `/tmp/ikrive-e2e-*`. |
| R4 | `e2e/tests/auth.setup.ts` › `registers the first user as admin` |
| R5 | `e2e/tests/vehicles.spec.ts` › `creates a vehicle from the form` |
| R6 | `e2e/tests/maintenance.spec.ts` › `adds a maintenance record with an attachment` |
| R7 | `e2e/tests/fuel-stats.spec.ts` › `adds two full-tank fuel logs and shows the average consumption` |
| R8 | `e2e/tests/sale-report.spec.ts` › `downloads the sale report pdf` |
| R9 | `e2e/tests/data-portability.spec.ts` › `exports and re-imports the user data` (zip, empieza por `PK`) |
| R10 | `e2e/tests/data-portability.spec.ts` › `exports and re-imports the user data` (resumen visible, matrícula ×2 en `/vehicles`) |
| R11 | Fixtures (`uniquePlate`, `createVehicle`, IP por test); cada spec en solitario y `--repeat-each=3` en verde (abajo). |
| R12 | `e2e/no-fixed-waits.test.ts` › `e2e tests do not use fixed waits` (comprobado que falla con un `waitForTimeout` temporal: `forced-failure.spec.ts:7: await page.waitForTimeout(100);`). |
| R13 | `playwright.config.ts` (`trace`, `screenshot`, `outputDir`). Fallo forzado temporal → `e2e/test-results/forced-failure-forced-failure-chromium/{trace.zip,test-failed-1.png,error-context.md}`. |
| R14 | `e2e/vitest.config.ts` (`*.test.ts`); en `pnpm harness --full` el paquete `e2e` solo corre 1 test de Vitest. |
| R15, R16 | `.github/workflows/ci.yml` › job `e2e`. |
| R17 | `docs/verification.md`, `CONTRIBUTING.md`, `docs/PLAN.md`. |

## Verificación (T13, T16)

`pnpm test:e2e` (con build):

```
✓ 1 [setup] › tests/auth.setup.ts:5:1 › registers the first user as admin (1.4s)
✓ 4 [chromium] › tests/sale-report.spec.ts:4:1 › downloads the sale report pdf (1.8s)
✓ 3 [chromium] › tests/vehicles.spec.ts:3:1 › creates a vehicle from the form (2.0s)
✓ 5 [data-portability] › tests/data-portability.spec.ts:4:1 › exports and re-imports the user data (2.0s)
✓ 6 [chromium] › tests/maintenance.spec.ts:3:1 › adds a maintenance record with an attachment (2.1s)
✓ 2 [chromium] › tests/fuel-stats.spec.ts:8:1 › adds two full-tank fuel logs and shows the average consumption (2.2s)
6 passed (5.4s)
```

- Cada spec en solitario (`pnpm --filter @ikrive/e2e test:e2e tests/<f>.spec.ts`): vehicles, maintenance, fuel-stats, sale-report y data-portability → `2 passed` cada uno (setup + spec).
- `--repeat-each=3` (dos veces, la segunda con `--workers=4`): `16 passed` (el setup corre una vez, 5 specs × 3).
- Fallo forzado: deja `trace.zip` y la captura en `e2e/test-results/` (R13). El fichero temporal se borró.
- Docker (T2): `docker build -f docker/Dockerfile -t ikrive:dev .` OK, `node docker/smoke.mjs` → `smoke test passed`, `image-size` → 233,4 MB.

`pnpm harness --full`:

```
[OK]    46 features: 41 done, 4 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #41 e2e-playwright (in_progress)
[OK]    Rama actual: feat/e2e-playwright
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test      (e2e 1, shared 117, web 342, api 303)
[OK]    Arnés en verde.
```

## Desviaciones del spec

1. **Tercer proyecto `data-portability` con `workers: 1`** (el design solo tiene `setup` y `chromium`). El export trae todos los vehículos del admin compartido, así que dos copias del test que se ejecutan a la vez (`--repeat-each=3`, que pide T13) importan cada una el vehículo de la otra. Con los 3 en paralelo falló de forma reproducible: `toHaveCount: Expected 2, Received 4`. Con `workers: 1` en ese proyecto las copias van una detrás de otra y siguen en paralelo con el resto de specs. `chromium` lo ignora con `testIgnore`. Los otros tests no se ven afectados porque usan su vehículo por id; `vehicles.spec.ts` usa `.first()` en `/vehicles` porque un import en paralelo puede duplicar su matrícula.
2. **`gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 }` en `webServer`.** Por defecto Playwright mata el servidor con SIGKILL y `server.mjs` no llegaba a borrar el `DATA_DIR` (paso 4 del design): quedaban `/tmp/ikrive-e2e-*`. Con SIGTERM se borra.
3. **Implementación del fixture `clientIp`:** no es una fixture con nombre propio, sino un override de `extraHTTPHeaders` que calcula la IP (`nextClientIp`). Así evito el patrón vacío `({}, use)` que Biome rechaza (`noEmptyPattern`) sin desactivar la regla. El efecto es el mismo: cada test (y `page.request`) sale con su propio `x-forwarded-for`.
4. **R4 (rol):** compruebo que el selector de rol de la fila con el email (`adminUsers.roleLabel`) tiene el valor `admin`. Un `getByText('Administrador')` en la fila choca con el `<option>` del selector (modo estricto) y no quería usar selectores CSS.
5. **R6 (nombre del adjunto):** la fila del historial no muestra los adjuntos. El test comprueba el título en el historial y abre el botón de facturas de esa fila (`maintenance.attachments.open`), donde aparece `factura.png` (`maintenance.attachments.view`).
6. **R7 (valor):** el formato del consumo es `maximumFractionDigits: 2` sin mínimo, así que 30 L / 500 km se muestra `6 L/100 km` (no `6,0`). Compruebo esa cadena en la métrica «Consumo medio» y que ya no aparece el texto de pendiente.
7. **`tsconfig.json`** con `module: ESNext`/`moduleResolution: Bundler` además de lo que pide el design, igual que los demás paquetes.

## Notas

- La primera vez en local hay que instalar Chromium: `pnpm --filter @ikrive/e2e exec playwright install chromium` (en `docs/verification.md`).
- El `DATA_DIR` (`e2e DATA_DIR=<ruta>`) solo se ve con `DEBUG=pw:webserver`, porque Playwright no muestra el stdout del `webServer` por defecto.
- Sin capturas de revisión visual: la feature no cambia la UI.
