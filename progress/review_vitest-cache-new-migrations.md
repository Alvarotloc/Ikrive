# Review — #96 vitest-cache-new-migrations

**Veredicto:** APPROVED

Feature `sdd: false` (sin spec). Criterios: `description` y `acceptance` de `feature_list.json`, `CONTRIBUTING.md`, `docs/` y `CHECKPOINTS.md`. Diff revisado: `git diff main...HEAD` (vacío, sin commits) + `git diff` + no trackeados (`apps/web/src/test/fs-module-cache.ts`, `apps/web/src/test/fs-module-cache.test.ts`, `progress/impl_vitest-cache-new-migrations.md`).

## Trazabilidad acceptance ↔ evidencia

- A1 «Se identifica la causa»: [x] Comprobado en el código instalado de Vitest 5.0.4 (`node_modules/.pnpm/vitest@5.0.4_*/node_modules/vitest/dist/chunks/cli-api.Bx28WXzL.js:5708`): `generateCachePath` solo descarta de la caché si `fileContent.includes("import.meta.glob(")`. `apps/web/src/lib/data-source/local/migrations.ts:13` usa `import.meta.glob<string>(`, que no contiene ese literal, así que se cacheaba. La clave depende solo de la fuente del módulo y del hash del entorno, así que un `.sql` nuevo no la invalida. La causa del informe es correcta.
- A2 «Migración nueva → `pnpm test` de web pasa sin borrar cachés, de forma reproducible»: [x]
  - `apps/web/src/test/fs-module-cache.test.ts` › «leaves out of the cache the modules that use import.meta.glob, typed or not» (afirma `false` para la forma sin tipo, con tipo y con espacio), «keeps the default cache key for the rest of the modules» (afirma `undefined`) y «leaves out the bundled migrations…» (lee el `migrations.ts` real y afirma `false`, lo que protege frente a regresiones).
  - He repetido la reproducción en una copia del repo en el scratchpad, para no tocar `packages/`. Primera ejecución: caché caliente, 107/107. Después añado `9999_cache_probe.sql` y su entrada en el journal: 107/107 en verde. Contraprueba con el generador cambiado a `() => undefined`: `Error: Missing migration file 9999_cache_probe.sql`, 12 ficheros en rojo. La reproducción es repetible y discrimina. Al terminar, `git status --porcelain packages` está vacío en el repo real.
- A3 «No ralentiza la suite»: [x] Mis mediciones intercaladas en la copia, plugin frente a no-op: 10.46/11.15/11.19 s frente a 10.84/11.36/11.35 s. Es ruido. Solo deja de cachearse `migrations.ts`.
- A4 «`pnpm harness --full` en verde»: [x] Ejecutado: lint, typecheck y test en OK (web 768, api 401).

## Puntos concretos pedidos

- **API pública:** `configureVitest` + `defineCacheKeyGenerator` forman parte de `VitestPluginContext`, exportado desde `vitest/node` (`plugin.d.C8mmycim.d.ts:4572`). La variante `experimental_` es la que está deprecada, no esta. `CacheKeyIdGeneratorContext` es un tipo público de `vitest/node`. Devolver `false` excluye el módulo y devolver `undefined` mantiene la clave por defecto: coincide con `cli-api…js:5713-5725`. El hook se registra por proyecto (`cli-api…js:12400-12405`) y los dos proyectos lo heredan con `extends: true`. La contraprueba demuestra que funciona en `unit` y en `dom`.
- **Alcance de la exclusión:** en `apps/web/src` y `packages` solo `migrations.ts` casa con `/import\.meta\.glob\s*[<(]/`, además de los propios `fs-module-cache*.ts`, que lo mencionan en comentarios o strings. El test ya lo excluía Vitest por su literal. No se excluye nada relevante de más.
- **`database.test.ts` (14 → `BUNDLED_MIGRATIONS.length`):** es aceptable y no pierde cobertura real. Con 14 fijo, el test fallaría con cualquier migración nueva aunque no hubiera caché, y A2 pide que pase. El número real se sigue verificando por otras vías:
  - en el mismo test, `toEqual` de los `created_at` frente a `BUNDLED_MIGRATIONS` y `localSchema(again)` frente a `apiSchema()`, que lee los SQL del disco con el migrador de drizzle;
  - en «records the same migration hashes as the API migrator», que compara las filas con las del migrador de la API;
  - `migrationFile`, que lanza si falta un `.sql` del journal.

## Tasks

- No aplica (`sdd: false`, sin `tasks.md`). Los pasos del plan de `progress/current.md` están cubiertos.

## Checkpoints

- C1: [x] harness con código 0; una sola feature activa (#96 `in_progress`); rama `feat/vitest-cache-new-migrations`.
- C2: [x] N/A por `sdd: false`; los `acceptance` tienen evidencia concreta, leída y ejecutada.
- C3: [x] el diff solo toca la config de Vitest de web, el helper y su test, `database.test.ts`, el estado en `feature_list.json` y `progress/`. Nada de otras features ni de código de la app.
- C4: [x] N/A en API, BD y UI. Sin cambios de dominio.
- C5: [x] TS estricto sin `any` ni `@ts-ignore`, sin `console.log` ni TODOs.
- C6: [x] harness `--full` en verde; los tests nuevos afirman valores concretos. Sin UI, así que no hacen falta capturas.
- C7: [x] `impl_…md` con causa, evidencia, archivos, trazabilidad y salida del harness; `current.md` al día; `docs/PLAN.md` no cambia (no cierra fase ni cambia decisiones).

## Hallazgos

Ninguno bloqueante.

## Avisos para el humano (no bloquean)

- El regex también casa con `import.meta.glob` dentro de comentarios o strings. Solo afecta a un par de ficheros de test/helper y no tiene coste apreciable.
- El arreglo compensa una limitación de Vitest (hay un `TODO` en `generateCachePath`). Si una versión futura de Vitest corrige la comprobación literal, el plugin pasa a ser redundante pero inocuo. Se podría reportar upstream.
- El script de reproducción del informe modifica temporalmente `packages/db/migrations` (lo restaura con `trap`). Para el reviewer lo ejecuté en una copia del repo en el scratchpad; el script, tal como está, necesita `pnpm` operativo en la ruta original.
- Añadir el plugin cambia el hash del entorno de Vitest: la caché local se regenera una vez en la primera ejecución.

## Cambios requeridos

Ninguno.
