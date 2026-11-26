# Implementación: vitest-cache-new-migrations (#96)

Rama `feat/vitest-cache-new-migrations`, `sdd: false` (sin spec; guía: `acceptance` de `feature_list.json`). Sin commits.

## Causa

Es la **caché de transformación** de Vitest 5, no las deps optimizadas. El disparador es cómo se escribió el `import.meta.glob`.

- Vitest 5.0.4 trae `fsModuleCache` **activo por defecto** (`@default true`) en `node_modules/.vitest-cache` en la raíz del workspace. Guarda el código ya transformado de cada módulo bajo una clave que sale del **contenido fuente del propio módulo** y de la config del entorno (`FileSystemModuleCache.generateCachePath`, `vitest/dist/chunks/cli-api.*.js`).
- La salida de un módulo con `import.meta.glob` depende de qué ficheros casan con el patrón, no solo de su fuente. Vitest lo sabe y lo excluye de la caché, pero solo con una comprobación literal:
  ```js
  // bail out if file has import.meta.glob because it depends on other files
  if (fileContent.includes("import.meta.glob(")) { ... return null; }
  ```
  `fileContent` es la fuente sin transformar (`readFileContentToCache`).
- `apps/web/src/lib/data-source/local/migrations.ts` usa la forma tipada `import.meta.glob<string>(`, que **no contiene** `import.meta.glob(`. Por eso se cacheaba. Al añadir `00XX_*.sql` y su entrada en `_journal.json`, el JSON del journal (un módulo aparte, con contenido nuevo) se volvía a transformar, mientras que `migrations.ts` salía de la caché con la lista de imports `?raw` antigua. Resultado: `Missing migration file 00XX_….sql`.
- En CI no pasa porque `node_modules/.vitest-cache` parte vacía.

### Evidencia

1. Log de caché antes del arreglo (`DEBUG='vitest:cache:*' pnpm vitest run src/lib/data-source/local/database.test.ts`):
   ```
   vitest:cache:fs [read] …/apps/web/src/lib/data-source/local/migrations.ts is cached in …/node_modules/.vitest-cache/495712d2…
   ```
   El módulo se lee de la caché aunque usa `import.meta.glob`.
2. Script de reproducción (abajo) antes del arreglo: con la caché caliente, `Test Files 7 failed | 2 passed (9)` en `src/lib/data-source/local` y `Error: Missing migration file 9999_cache_probe.sql`.
3. Después del arreglo, el mismo log muestra:
   ```
   vitest:cache:memory [write] …/local/migrations.ts was bailed out by a custom generator
   ```
4. Contraprueba: con el arreglo y el plugin cambiado temporalmente a un no-op, el script vuelve a fallar con `Missing migration file 9999_cache_probe.sql` en los tests de `local/*`. Con el plugin activo: `Test Files 107 passed (107)`.

## Arreglo

- `apps/web/src/test/fs-module-cache.ts` (nuevo): `skipImportMetaGlob({ sourceCode })` devuelve `false` (excluir de la caché) si la fuente casa con `/import\.meta\.glob\s*[<(]/`, o sea `import.meta.glob(`, `import.meta.glob<T>(` y las variantes con espacios. En los demás casos devuelve `undefined`, que deja la clave por defecto de Vitest.
- `apps/web/vitest.config.ts`: plugin `ikrive:fs-module-cache-skip-glob` con `configureVitest: ({ defineCacheKeyGenerator }) => defineCacheKeyGenerator(skipImportMetaGlob)`, la API pública de Vitest para esto (`VitestPluginContext.defineCacheKeyGenerator`). Lleva un comentario que explica el motivo. Los dos proyectos (`unit`, `dom`) lo heredan por `extends: true`.
- `apps/web/src/test/fs-module-cache.test.ts` (nuevo, 3 tests): las formas con y sin tipo y la variante con espacio se excluyen; los módulos sin glob (`import.meta.url`, import de JSON) mantienen la clave por defecto; y el `migrations.ts` real (leído del disco) se excluye. Este último impide que un cambio futuro de `migrations.ts` o del predicado reabra el fallo.
- `apps/web/src/lib/data-source/local/database.test.ts`: `toHaveLength(14)` (dos veces) pasa a `toHaveLength(BUNDLED_MIGRATIONS.length)`. Ver «Desviaciones».

Se eligió el generador en lugar de quitar el `<string>` de `migrations.ts` porque protege cualquier glob tipado futuro sin imponer una convención de estilo, y no cambia código de la app.

Al añadir el plugin cambia el hash del entorno (incluye los nombres de plugins y el contenido de `configFileDependencies`). La caché de todos se invalida una sola vez en la primera ejecución tras el cambio, sin intervención manual.

## Cómo reproducirlo

Script (se ejecuta desde cualquier ruta). Respalda `_journal.json`, añade una migración temporal `9999_cache_probe.sql` y su entrada de journal, ejecuta la suite de `apps/web` con la caché caliente y lo restaura todo con `trap EXIT`:

```bash
#!/usr/bin/env bash
set -u
ROOT=/home/alvaro/dev/personal/ikrive          # ajustar
MIG=$ROOT/packages/db/migrations; J=$MIG/meta/_journal.json
BAK=$(mktemp); cp "$J" "$BAK"
cleanup() { cp "$BAK" "$J"; rm -f "$MIG/9999_cache_probe.sql" "$BAK"; }
trap cleanup EXIT
cd "$ROOT/apps/web"
echo "== warm cache run"; pnpm vitest run 2>&1 | grep -E "Test Files|Missing migration" | sort -u
printf 'CREATE TABLE `cache_probe` (`id` integer PRIMARY KEY);\n' > "$MIG/9999_cache_probe.sql"
node -e "const f=process.argv[1];const j=JSON.parse(require('fs').readFileSync(f));j.entries.push({idx:j.entries.length,version:'6',when:9999999999999,tag:'9999_cache_probe',breakpoints:true});require('fs').writeFileSync(f,JSON.stringify(j,null,2))" "$J"
echo "== run with new migration"; pnpm vitest run 2>&1 | grep -E "Test Files|Missing migration|FAIL" | sort -u
```

- Antes del arreglo: la segunda ejecución da `Missing migration file 9999_cache_probe.sql`.
- Después: `Test Files 107 passed (107)` en las dos ejecuciones.
- Tras ejecutarlo, `git status` no muestra cambios en `packages/` (comprobado). No queda ningún fichero de migración temporal en el repo.

## Tiempos (`apps/web`, `vitest run` con la caché caliente, campo `Duration`)

| Medición | Ejecuciones | Valores | Mediana |
|---|---|---|---|
| Antes (rama sin tocar, 106 ficheros) | 4 | 10.39, 10.39, 10.60, 10.27 s | 10.39 s |
| Después, plugin activo (107 ficheros), intercalado | 5 | 10.47, 11.10, 11.06, 11.07, 11.42 s | 11.07 s |
| Después, plugin en no-op (107 ficheros), intercalado | 5 | 11.02, 10.96, 11.14, 10.97, 11.13 s | 11.02 s |

La comparación válida es la intercalada, activo frente a no-op con los mismos ficheros y la misma carga de la máquina: 11.07 s frente a 11.02 s, dentro del ruido. Lo único que deja de cachearse es `migrations.ts`, un módulo pequeño (sus `.sql?raw` se siguen cacheando). La diferencia de unos 0,6 s con la medición «antes» se repite también con el plugin en no-op, así que viene de la deriva de carga de la máquina entre series y no del arreglo. El test nuevo tarda unos 200 ms aislado y sus 3 tests son triviales.

## Trazabilidad (acceptance → evidencia)

| Acceptance | Evidencia |
|---|---|
| Se identifica la causa | Sección «Causa»: `fsModuleCache` + comprobación literal `import.meta.glob(` frente a `import.meta.glob<string>(`. Log de depuración antes y después |
| Migración nueva → `pnpm test` de web pasa sin borrar cachés, con test o comprobación reproducible | `apps/web/src/test/fs-module-cache.test.ts` › `skipImportMetaGlob` › «leaves out of the cache the modules that use import.meta.glob, typed or not», «keeps the default cache key for the rest of the modules», «leaves out the bundled migrations, so a new migration file is picked up on the next run», más el script de «Cómo reproducirlo» (rojo antes, verde después, rojo con el plugin en no-op) |
| No ralentiza la suite | Tabla de tiempos: 11.07 s frente a 11.02 s, intercalado |
| `pnpm harness --full` en verde | Abajo |

## `pnpm harness --full`

```
[OK]    96 features: 89 done, 6 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #96 vitest-cache-new-migrations (in_progress)
[OK]    Rama actual: feat/vitest-cache-new-migrations
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test      (shared 313, db 3, api 401, web 768 tests)
[OK]    Arnés en verde.
```

## Desviaciones

- **`database.test.ts` › «applies only pending migrations on reopen»** tenía el número de migraciones fijo (`toHaveLength(14)`, dos veces). Con el arreglo de la caché, el script de reproducción ya no daba «Missing migration», pero este test fallaba igual («expected … to have a length of 14 but got 15»). Fallaría con cualquier migración nueva real, haya caché o no, y la acceptance pide que `pnpm test` pase tras añadir una. Ahora usa `BUNDLED_MIGRATIONS.length`. No se pierde cobertura: la línea siguiente ya compara los `created_at` aplicados con `BUNDLED_MIGRATIONS`, `migrationFile` lanza si falta un `.sql` del journal, y el test compara el esquema con el de la API (`apiSchema()`). Si el reviewer prefiere el número fijo como recordatorio explícito, basta con revertir esas dos líneas. Entonces el script de reproducción mostrará solo ese fallo esperado y ninguno de caché.
- No se ha tocado `packages/` ni el código de la app. La UI no cambia, así que no hay capturas.
