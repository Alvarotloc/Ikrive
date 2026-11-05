# Tasks — e2e-playwright

- [x] T1 — Paquete `e2e/`: `package.json` (`@ikrive/e2e`, scripts `test:e2e`, `typecheck`, `test`; devDep `@playwright/test`), `tsconfig.json`, `vitest.config.ts` (`include: ['*.test.ts']`); `e2e` en `pnpm-workspace.yaml`; `pnpm install` (lockfile); `e2e/.auth/` en `.gitignore`. Cubre: R14.
- [x] T2 — `COPY e2e/package.json e2e/` en la etapa `build` de `docker/Dockerfile` y comprobar `docker build -f docker/Dockerfile -t ikrive:dev .`. Cubre: R14.
- [x] T3 — `e2e/server.mjs`: `DATA_DIR` con `mkdtempSync` bajo `tmpdir()`, `spawn` de `apps/api/dist/server.js` con el entorno de producción del design, comprobación de `dist/`, reenvío de señales y borrado del directorio al salir. Cubre: R2, R3.
- [x] T4 — `e2e/playwright.config.ts` (proyectos `setup` y `chromium`, `webServer` con `node server.mjs` y `/api/health`, `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`, `outputDir: 'test-results'`, reporters) y script raíz `"test:e2e": "pnpm build && pnpm --filter @ikrive/e2e test:e2e"`. Cubre: R1, R2, R13.
- [x] T5 — `e2e/tests/fixtures.ts`: `t()` sobre `es.json`, fixture `clientIp` (`x-forwarded-for` por test), `uniquePlate()`, `createVehicle()` por API y `PNG_8x8`. Cubre: R11.
- [x] T6 — Test `registers the first user as admin` en `e2e/tests/auth.setup.ts` (guarda `e2e/.auth/admin.json`). Cubre: R3, R4.
- [x] T7 — Test `creates a vehicle from the form` en `e2e/tests/vehicles.spec.ts`. Cubre: R5, R11.
- [x] T8 — Test `adds a maintenance record with an attachment` en `e2e/tests/maintenance.spec.ts`. Cubre: R6, R11.
- [x] T9 — Test `adds two full-tank fuel logs and shows the average consumption` en `e2e/tests/fuel-stats.spec.ts`. Cubre: R7, R11.
- [x] T10 — Test `downloads the sale report pdf` en `e2e/tests/sale-report.spec.ts`. Cubre: R8, R11.
- [x] T11 — Test `exports and re-imports the user data` en `e2e/tests/data-portability.spec.ts`. Cubre: R9, R10, R11.
- [x] T12 — Test Vitest `e2e tests do not use fixed waits` en `e2e/no-fixed-waits.test.ts` (y comprobar que falla si se añade un `waitForTimeout` temporal). Cubre: R12.
- [x] T13 — Verificación local: `pnpm test:e2e` en verde; cada spec en solitario; la suite con `--repeat-each=3`; un fallo forzado deja `trace.zip` y la captura en `e2e/test-results/`; `pnpm test` no lanza Playwright. Anotar resultados. Cubre: R1, R11, R13, R14.
- [x] T14 — Job `e2e` en `.github/workflows/ci.yml` (`needs: check`, `playwright install --with-deps chromium`, `pnpm test:e2e`, `upload-artifact@v4` de `e2e/test-results/` y `e2e/playwright-report/` con `if: failure()`). Cubre: R15, R16.
- [x] T15 — Docs: nivel E2E en `docs/verification.md`, `e2e/` y cómo añadir un test en `CONTRIBUTING.md` › Tests, y `docs/PLAN.md` (Stack «Calidad», «CI/CD» y «Verificación»). Cubre: R17.
- [x] T16 — Ejecutar `pnpm harness --full` y documentar trazabilidad en `progress/impl_e2e-playwright.md`. Cubre: R1–R17.
