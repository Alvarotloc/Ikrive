# Review — #95 slow-data-dir-test

**Veredicto:** APPROVED (segunda vuelta tras Gate 2)

Feature `"sdd": false`, sin spec: la referencia son `description` y `acceptance` de #95 en `feature_list.json`.

## Trazabilidad acceptance ↔ evidencia
- A1 (medir y documentar en qué se va el tiempo): [x] `progress/impl_slow-data-dir-test.md` › «Mediciones (antes)». Separa el arranque de Node, el de tsx, la transformación y la carga de dependencias, con y sin caché de tsx y con el bundle. La conclusión (el coste está en el grafo de imports estáticos de `app.ts`) cuadra con lo que medí después.
- A2 (sigue siendo e2e: exit 1, una línea con ruta y arreglo, sin SQLITE_CANTOPEN): [x] `apps/api/test/data-dir.test.ts` › `ensureWritableDataDirOrExit` › `makes the server exit with 1 and a single clear line instead of SQLITE_CANTOPEN`. Lanza el proceso real `node --import tsx src/server.ts` y comprueba `status === 1`, una sola línea en stderr con la ruta, `sudo chown -R 1000:1000 data` y la ausencia de `SQLITE_CANTOPEN`. Las afirmaciones son las mismas que antes.
- A3 (< 1 s en local y spawn asíncrono): [x] `runServer` usa `spawn` y resuelve en `close`. Lo medí yo: 146–156 ms con `TSX_DISABLE_CACHE=1` en 3 ejecuciones seguidas (antes ~2,6–3,6 s).
- A4 (`pnpm harness --full` en verde): [x] lo ejecuté yo: lint, typecheck y test en OK (api 391/391, web 759/759).

## Tasks
- No hay `tasks.md` (feature `"sdd": false`). El plan de `progress/current.md` está cumplido.

## Checkpoints
- C1: [x] harness en verde, una sola feature activa (#95 `in_progress`), rama `feat/slow-data-dir-test`.
- C2: [x] no aplica (`"sdd": false`). Los acceptance están cubiertos (ver arriba).
- C3: [x] el diff solo toca `apps/api/src/server.ts`, `apps/api/test/data-dir.test.ts`, `feature_list.json` (estado) y `progress/`. El cambio en `server.ts` sale de lo que dice la descripción literal, pero está justificado en «Desviaciones»: es la causa raíz y sin él no se llega a < 1 s sin perder el e2e. No hay refactors ajenos.
- C4: [x] no aplica (no hay dominio, BD ni web). El cableado sigue en `app.ts`.
- C5: [x] sin `any`, sin `@ts-ignore`, sin `console.log`, sin código comentado. Los comentarios explican el porqué.
- C6: [x] harness `--full` en verde. El test afirma resultados concretos. Sin UI.
- C7: [x] el informe tiene archivos tocados, mapa acceptance → evidencia y salida de la verificación. `progress/current.md` describe la sesión. `docs/PLAN.md` no necesita cambios.

## Verificación específica de `server.ts` (import dinámico)
- **Orden de arranque:** config → `ensureWritableDataDirOrExit` → `createDb` + `runMigrations` → `buildApp` → dispatcher y jobs → manejadores de señales → `listen`. Es el mismo orden que antes. La única diferencia es que los módulos de la app se evalúan después de `loadConfig()`. Ninguno lee configuración al importarse: `config.ts` no muta `process.env`, y `lib/version.ts` lee `IKRIVE_VERSION`, que no cambia. Así que no hay cambio observable.
- **Bundle tsup / Docker:** construí el bundle con `createBuildOptions(<scratchpad>)`. tsup genera chunks (`app-*.js`, `client-*.js`, `dispatcher-*.js`, los jobs) en la raíz de `dist/`, el mismo directorio que `server.js`. Por eso las rutas relativas a `import.meta.url` siguen resolviendo a `dist/`: `./migrations` en `db/client.ts` y `./fonts/` en `reports/pdf/fonts.ts`. El Dockerfile copia `dist` entero, y `CMD ["node", "dist/server.js"]` y `e2e/server.mjs` siguen apuntando a `dist/server.js`. `test/build.test.ts` (los externos del metafile recorren todas las salidas) está en verde.
- **Comportamiento en producción**, comprobado con el bundle:
  - Con `DATA_DIR` escribible: arranca, `/api/health` devuelve `{"status":"ok"}`, crea `ikrive.db`, y con SIGTERM registra «Received SIGTERM, shutting down» y sale con 0.
  - Con `DATA_DIR` sin permisos: sale con 1 y escribe la línea esperada, en 56 ms.
  - Con configuración inválida (`NODE_ENV=production` sin `AUTH_SECRET`): sale con 1 y traza, igual que antes.
  - Si falla un `import()` o `buildApp`, el top-level await rechaza y el proceso sale con 1 y traza, el mismo resultado que daba un import estático roto.
- **Señales:** los manejadores se registran en el mismo punto que antes, después de `buildApp`. Una señal durante la carga sigue con la acción por defecto, igual que pasaba durante la carga estática.
- **Flakiness en CI:** con la caché de tsx fría, el proceso tarda ~150–180 ms. Eso deja un margen amplio frente al `timeout` de 9 s del hijo y los 10 s del test. Si el hijo llegara a matarse por timeout, `close` resolvería con `status: null` y el test fallaría de forma determinista, sin colgarse. `spawn` ya no bloquea el worker.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- Si salta el `timeout` del hijo, el fallo se ve como `expected null to be 1`, sin el stderr ni la señal. Es poco probable con el margen actual, pero incluir `signal` en el resultado ayudaría a diagnosticarlo.
- Como antes, el test se salta cuando se ejecuta como root (`skipIf(isRoot)`). En una CI que corra como root, la comprobación e2e no se ejecuta. Esto ya pasaba antes de esta feature.
- Ahora el bundle de producción reparte la app en chunks. Es inocuo con el Dockerfile actual, pero cualquier cambio futuro que copie solo `dist/server.js` (en vez de `dist/` entero) se rompería.

## Cambios requeridos
Ninguno.

## Segunda vuelta (tras Gate 2)

**Veredicto:** APPROVED

El humano pidió aplicar el aviso 1 en Gate 2. Esto es lo que revisé:
- **Cambio:** solo está en `apps/api/test/data-dir.test.ts`. `runServer` ahora devuelve también `signal: NodeJS.Signals | null`, el segundo argumento de `close`. La aserción `expect(result.status, \`signal: ${result.signal}, stderr: ${result.stderr}\`).toBe(1)` saca la señal y el stderr si el hijo no sale con 1, así que el aviso 1 queda resuelto. Las aserciones e2e son las mismas (una línea, la ruta, `sudo chown -R 1000:1000 data` y que no aparezca `SQLITE_CANTOPEN`). Los timeouts siguen en 9 s para el hijo y 10 s para el test.
- **Nada más tocado:** `git status` muestra los mismos ficheros que en la primera vuelta. El diff de `apps/api/src/server.ts` coincide con lo que verifiqué entonces: solo `./config` y `./lib/data-dir` son estáticos y el resto se carga con `Promise.all([import(...)])`. Fuera de `progress/`, `feature_list.json` solo cambia en el estado de #95.
- **Verificación:** ejecuté `pnpm harness --full` y está en verde (api 391/391, web 759/759). `vitest run test/data-dir.test.ts` aislado pasa 10/10 en 249 ms.
- **Checkpoints C1–C7:** siguen como en la primera vuelta, todos [x].

Siguen vigentes los avisos 2 y 3, que no bloquean. Cambios requeridos: ninguno.
