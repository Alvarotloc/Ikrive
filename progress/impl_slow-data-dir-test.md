# Implementación: #95 slow-data-dir-test

Feature `"sdd": false`, sin spec: la guía son los `acceptance` de #95 en `feature_list.json`.

## Mediciones (antes)

Proceso lanzado igual que en el test (`node --import tsx src/server.ts`, `DATA_DIR` dentro de una carpeta `0o500`, entorno mínimo), en local, con Node v24.19.0:

| Qué se mide                                                         | Tiempo          |
|---------------------------------------------------------------------|-----------------|
| `node -e 0` (arranque de Node)                                      | 23–28 ms        |
| `node --import tsx -e 0` (arranque de tsx)                          | 55–78 ms        |
| `tsx` + `import('./src/lib/data-dir.ts')`                           | 57–108 ms       |
| `tsx` + `import('./src/config.ts')` + `loadConfig()` (zod)          | 127–161 ms      |
| `tsx` + `import('./src/app.ts')` (grafo de dependencias de la app)  | 1072–1393 ms    |
| `tsx src/server.ts` completo, caché de tsx caliente                 | 1121–1457 ms    |
| `tsx src/server.ts` completo, `TSX_DISABLE_CACHE=1` (transformar todo) | 2281–2938 ms |
| `node dist/server.js` (bundle de tsup, sin tsx)                     | 322–350 ms      |
| El test dentro de la suite completa de la API (`vitest --reporter=verbose`) | **2650 ms** |

Conclusión: el arranque de tsx (~40 ms sobre Node) y la transformación de `server.ts` en sí son despreciables. El tiempo se va en **cargar las dependencias**: `server.ts` importaba de forma estática `app.ts`, los jobs y el dispatcher (Fastify y sus plugins, Better Auth, Drizzle, better-sqlite3, react-pdf, pdf-lib, sharp…). Los imports ESM estáticos se evalúan todos antes de la primera línea del módulo, así que el proceso cargaba (y tsx transformaba, si la caché estaba fría) todo ese grafo antes de llegar a `ensureWritableDataDirOrExit`. Dentro de la suite el coste sube a ~2,6–3,6 s porque compite por la CPU con los demás workers, y `spawnSync` además bloqueaba el worker mientras tanto.

## Cambios

- `apps/api/src/server.ts`: solo `./config` y `./lib/data-dir` quedan como imports estáticos. Tras `loadConfig()` y `ensureWritableDataDirOrExit()`, el resto (`./app`, `./db/client`, los dos jobs y el dispatcher) se carga con `await Promise.all([import(...)])`. El orden de arranque no cambia: config → comprobación de `DATA_DIR` → `createDb` + `runMigrations` → `buildApp` → jobs → señales → `listen`. Ventaja también en producción: un volumen sin permisos falla en ~66 ms con el bundle, en vez de cargar la app entera antes del mensaje.
- `apps/api/test/data-dir.test.ts`: `spawnSync` → helper `runServer(env)` con `spawn` asíncrono (stdout ignorado, stderr acumulado, resuelve en `close` con el código de salida; `timeout` del hijo 9 s). El test es `async` y sigue afirmando lo mismo de extremo a extremo sobre el proceso real de `src/server.ts`: código 1, una sola línea en stderr con la ruta y `sudo chown -R 1000:1000 data`, y sin `SQLITE_CANTOPEN`. El timeout propio baja de 40 s a 10 s (margen para la caché de tsx fría en una CI cargada).

## Mediciones (después)

| Qué se mide                                                    | Antes          | Después       |
|----------------------------------------------------------------|----------------|---------------|
| `tsx src/server.ts`, caché caliente                            | 1121–1457 ms   | 161–167 ms    |
| `tsx src/server.ts`, `TSX_DISABLE_CACHE=1`                     | 2281–2938 ms   | 164–179 ms    |
| `node dist/server.js` con `DATA_DIR` sin permisos              | 322–350 ms     | 66 ms         |
| El test aislado (`vitest run test/data-dir.test.ts`, fichero entero) | —        | 276 ms (10 tests) |
| El test dentro de la suite completa de la API                  | 2650 ms        | 412–421 ms    |

Por debajo de 1 s en local y sin bloquear el worker.

## Trazabilidad (acceptance → evidencia)

| Acceptance | Evidencia |
|---|---|
| A1: medir y documentar en qué se va el tiempo | Este informe, «Mediciones (antes)» |
| A2: sigue siendo e2e (exit 1, una línea con ruta y arreglo, sin SQLITE_CANTOPEN) | `apps/api/test/data-dir.test.ts` › `ensureWritableDataDirOrExit` › `makes the server exit with 1 and a single clear line instead of SQLITE_CANTOPEN` |
| A3: < 1 s en local (y spawn asíncrono) | 412–421 ms en la suite completa; `runServer` usa `spawn` |
| A4: `pnpm harness --full` en verde | Salida más abajo |

## Verificación extra del bundle

`pnpm --filter @ikrive/api build` genera ahora un chunk `app-*.js` por el `import()` (tsup ya hacía code splitting). `node dist/server.js` con un `DATA_DIR` escribible arranca, responde `{"status":"ok"}` en `/api/health`, crea `ikrive.db` y sale con 0 con SIGTERM. Con un `DATA_DIR` sin permisos sale con 1 y la línea esperada. `test/build.test.ts` (externos del metafile) sigue en verde.

## `pnpm harness --full`

```
[OK]    95 features: 87 done, 7 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #95 slow-data-dir-test (in_progress)
[OK]    Rama actual: feat/slow-data-dir-test
[OK]    pnpm lint
[OK]    pnpm typecheck
e2e test:       Tests  6 passed (6)
packages/shared test:       Tests  292 passed (292)
packages/db test:       Tests  3 passed (3)
apps/web test:       Tests  759 passed (759)
apps/api test:       Tests  391 passed (391)
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones

- Se toca `apps/api/src/server.ts` además del test. La descripción de #95 solo habla del test, pero el cuello de botella eran los imports estáticos del propio servidor. Las alternativas que no lo tocan pierden el e2e (lanzar otro entry point) o no llegan a < 1 s (solo spawn asíncrono, ~2,6 s). El cambio no altera el comportamiento del servidor, solo cuándo se cargan los módulos.

## Cambios tras Gate 2

Lo pidió el humano: aplicar el aviso 1 de `progress/review_slow-data-dir-test.md`. Solo cambia `apps/api/test/data-dir.test.ts`. `server.ts` no se toca.

- `runServer` también devuelve `signal: NodeJS.Signals | null`, el segundo argumento de `close`. Así se sabe qué señal mató al hijo cuando salta el `timeout`.
- La aserción `expect(result.status, \`signal: ${result.signal}, stderr: ${result.stderr}\`).toBe(1)` añade un mensaje. Si el proceso no sale con 1 (por timeout o por otro código), el fallo muestra la señal y el stderr, y no solo `expected null to be 1`.
- Lo demás no cambia: el spawn sigue siendo asíncrono, las aserciones e2e son las mismas y los timeouts siguen en 9 s para el hijo y 10 s para el test.

Verificación: `pnpm harness --full` está en verde. Pasan lint, typecheck y test (api 391/391, web 759/759, db 3/3).
