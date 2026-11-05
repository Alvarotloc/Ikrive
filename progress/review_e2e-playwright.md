# Review — #41 e2e-playwright

**Veredicto:** APPROVED

## Trazabilidad requirements ↔ tests
- R1: [x] `package.json` › `test:e2e` = `pnpm build && pnpm --filter @ikrive/e2e test:e2e`. Lo ejecuté: hace el build de producción y después `playwright test`, 6 passed.
- R2: [x] `e2e/server.mjs:22-37` lanza `node apps/api/dist/server.js` con `NODE_ENV=production` y `WEB_DIST_DIR=<raíz>/apps/web/dist`. `playwright.config.ts:47-55` lo arranca por `webServer` sobre `/api/health`. Todos los specs navegan la SPA y llaman a `/api` desde el mismo origen (`127.0.0.1:3100`).
- R3: [x] `server.mjs:19` crea el directorio con `mkdtempSync(join(tmpdir(), 'ikrive-e2e-'))`. `auth.setup.ts` solo pasa sobre una BD vacía (el primer registro sale admin). Tras 4 ejecuciones no queda ningún `/tmp/ikrive-e2e-*`.
- R4: [x] `e2e/tests/auth.setup.ts:5` › `registers the first user as admin`. Comprueba `toHaveURL('/')`, que el enlace `nav.users` es visible y que, en `/admin/users`, el selector de rol de la fila con el email tiene el valor `admin`.
- R5: [x] `e2e/tests/vehicles.spec.ts:3` › `creates a vehicle from the form`. Comprueba la URL de la ficha, el h1 «Seat León» y la matrícula, y después la matrícula en `/vehicles`.
- R6: [x] `e2e/tests/maintenance.spec.ts:3` › `adds a maintenance record with an attachment`. Comprueba el título en el historial y `factura.png` en el diálogo de facturas de esa fila (desviación 5, aceptada: la fila no muestra adjuntos).
- R7: [x] `e2e/tests/fuel-stats.spec.ts:8` › `adds two full-tank fuel logs…`. Comprueba que el estado inicial está pendiente, que hay 2 botones de edición de repostaje, `6 L/100 km` en «Consumo medio» y que el texto de pendiente ya no aparece.
- R8: [x] `e2e/tests/sale-report.spec.ts:4` › `downloads the sale report pdf`. Comprueba el sufijo `.pdf` y que los 5 primeros bytes son `%PDF-`.
- R9: [x] `e2e/tests/data-portability.spec.ts:4` › `exports and re-imports the user data`. Comprueba el sufijo `.zip` y que empieza por `PK`.
- R10: [x] mismo test. Comprueba que se ve el heading `summaryTitle` y la matrícula `toHaveCount(2)` en `/vehicles`.
- R11: [x] `uniquePlate` (testId + repeatEachIndex + retry), `createVehicle` por API e IP por test. Lo verifiqué: `vehicles.spec.ts` en solitario → 2 passed; `--repeat-each=3` → 16 passed; `CI=true` (2 workers) → 6 passed.
- R12: [x] `e2e/no-fixed-waits.test.ts` › `e2e tests do not use fixed waits`. Recorre `tests/**/*.ts` de forma recursiva, exige al menos un fichero y espera que la lista de infractores esté vacía. Revisé los specs a mano: no hay esperas fijas, solo aserciones web-first y `waitForEvent('download')`.
- R13: [x] `playwright.config.ts:19,26-27` (`outputDir: 'test-results'`, `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`). El implementer documenta el fallo forzado con `trace.zip` y `test-failed-1.png`.
- R14: [x] `e2e/vitest.config.ts` (`include: ['*.test.ts']`). En `pnpm harness --full` el paquete e2e solo corre Vitest.
- R15: [x] `.github/workflows/ci.yml` › job `e2e` (`needs: check`, `playwright install --with-deps chromium`, `pnpm test:e2e`).
- R16: [x] mismo job: `upload-artifact@v4` con `if: failure()`, de `e2e/test-results/` y `e2e/playwright-report/`, 14 días.
- R17: [x] `docs/verification.md` (nivel 4 E2E y anti-patrón), `CONTRIBUTING.md` (estructura y cómo añadir un E2E), `docs/PLAN.md` (Calidad, CI/CD y Verificación).

## Tasks
- T1..T16: [x]

## Checkpoints
- C1: [x] `pnpm harness` en verde, una sola feature activa (#41) y rama `feat/e2e-playwright`.
- C2: [x] Spec completo, EARS y tabla de acceptance; tasks `[x]`; cada R tiene test o evidencia leída.
- C3: [x] El diff solo toca lo previsto en el design (`e2e/`, raíz, workspace, lockfile, Dockerfile, `.gitignore`, CI y docs). No hay cambios en `apps/` ni en `packages/`.
- C4: [x] No aplica a la API, la web ni la BD (sin cambios). El paquete `e2e/` sigue lo decidido en el design.
- C5: [x] TS estricto, sin `any` ni `@ts-ignore`. El único `console` es el log intencionado del `DATA_DIR` y el error de `dist/` en `server.mjs`. Fechas en `YYYY-MM-DD`.
- C6: [x] `pnpm harness --full` en verde (e2e 1, shared 117, web 342, api 303). `pnpm test:e2e` en verde. Sin cambios de UI, así que no hacen falta capturas.
- C7: [x] `impl_e2e-playwright.md` completo; `current.md` describe la sesión; `PLAN.md` actualizado (la fase 7 sigue abierta, correcto).

## Evaluación de las desviaciones declaradas
1. **Proyecto `data-portability` con `workers: 1` + `.first()` en `vehicles.spec.ts`: aceptada.** El design suponía que el import no afectaba a los demás tests. No es así: el export incluye todos los vehículos del admin compartido, así que dos copias en paralelo se duplican entre sí. La solución:
   - serializa solo ese test (`workers` por proyecto existe desde Playwright 1.52; aquí 1.64.1);
   - el resto sigue en paralelo;
   - `chromium` lo excluye con `testIgnore`, así que no se ejecuta dos veces.

   Ni `fuel-stats`, ni `maintenance`, ni `sale-report` se ven afectados, porque trabajan por id (las copias importadas tienen ids nuevos). `.first()` no debilita R5: sigue exigiendo que la matrícula se vea en `/vehicles`. Lo comprobé con `--repeat-each=3` en verde.
2. **`gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 }`: aceptada.** Sin ella, Playwright manda SIGKILL al grupo de procesos y `server.mjs` no llega a ejecutar el `rmSync` (paso 4 del design). Con ella, tras 4 ejecuciones no queda ningún `/tmp/ikrive-e2e-*`.
3. Las desviaciones 3–7 (override de `extraHTTPHeaders` en lugar de una fixture con nombre, R4 por el valor del selector, R6 en el diálogo de facturas, `6 L/100 km` y `tsconfig` con Bundler) son interpretaciones razonables. Cumplen el requirement.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- `e2e/package.json` solo declara `@playwright/test`. `vitest`, `typescript` y `@types/node` se resuelven desde la raíz del workspace (funciona, igual que en el resto del repo).
- `.dockerignore` excluye `test-results` y `playwright-report` solo en la raíz y no excluye `e2e/.auth/`. `COPY . .` mete en el contexto de la etapa `build` `e2e/test-results/`, `e2e/playwright-report/` y `e2e/.auth/admin.json` (una cookie de sesión de prueba). No llegan a la imagen final (el runtime solo copia `dist`), pero convendría añadir `**/test-results`, `**/playwright-report` y `e2e/.auth` en otro cambio.
- `fuel-stats.spec.ts:15` usa `.locator('..')` (un selector de padre) para acotar la métrica, y el literal `'6 L/100 km'` no sale de i18n. Es aceptable, pero se rompe si cambia el DOM de la tarjeta o el formato.
- `CONTRIBUTING.md` › Tests no avisa de que un import en paralelo duplica todos los vehículos del admin compartido. Quien añada un test que cuente filas en `/vehicles` debería saberlo (ahora solo lo explica el comentario de `playwright.config.ts`).

## Cambios requeridos
Ninguno.
