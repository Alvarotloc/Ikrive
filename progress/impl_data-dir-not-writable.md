# Implementación: #57 data-dir-not-writable (`sdd: false`)

## Cambios por archivo

- `apps/api/src/lib/data-dir.ts` (nuevo)
  - `ensureWritableDataDir(dir, ids?)`: resuelve la ruta absoluta, la crea con `mkdirSync({ recursive: true })` y escribe/borra un fichero de prueba (`.write-check-<pid>`). Así detecta propietario incorrecto, falta de permisos y montajes de solo lectura. Si falla, lanza `DataDirNotWritableError`.
  - `dataDirErrorMessage(path, ids, cause)`: genera el mensaje en una sola línea con la ruta, el uid/gid, el código de error (`EACCES`, `EROFS`…) y la solución (`sudo chown -R 1000:1000 data`, o `mkdir data` antes del primer arranque).
  - `ensureWritableDataDirOrExit(dir, deps?)`: la guarda de arranque. Escribe el mensaje en stderr y llama a `exit(1)`. Cualquier otro error se relanza. `stderr`, `exit` e `ids` se pueden inyectar para los tests.
- `apps/api/src/server.ts`: llama a `ensureWritableDataDirOrExit(config.DATA_DIR)` justo después de `loadConfig()` y antes de `createDb`.
- `apps/api/test/data-dir.test.ts` (nuevo): ver la tabla de abajo.
- `docs/self-hosting.md`: en «Instalación con docker compose», el paso 1 añade `mkdir data` y explica que la carpeta debe pertenecer al uid 1000 (con `sudo chown -R 1000:1000 data` si el usuario del host es otro). El paso 3 muestra la línea exacta que aparecerá en el log y cómo arreglarlo.
- `progress/current.md`: plan marcado y bitácora.

## Trazabilidad acceptance → test

| Acceptance | Archivo › test |
|---|---|
| Comprobar antes de abrir la BD | `server.ts` (la llamada va antes de `createDb`); `data-dir.test.ts › ensureWritableDataDirOrExit › makes the server exit with 1 and a single clear line instead of SQLITE_CANTOPEN` (arranca `src/server.ts` de verdad con tsx) |
| Exit ≠ 0 y un único log con la ruta, el uid/gid y la solución | `› writes one line and exits with 1 when the folder is not writable`; `› makes the server exit with 1 …`; `dataDirErrorMessage › includes the path, the process ids, the error code and the fix`; `› falls back to the error message and unknown ids` |
| Carpeta escribible → sigue | `ensureWritableDataDir › accepts a writable folder and leaves no probe file behind`; `ensureWritableDataDirOrExit › returns the path without writing anything when the folder is writable` |
| Carpeta inexistente creable → la crea | `ensureWritableDataDir › creates a missing folder (and its parents) when it can` |
| Carpeta sin permiso → error con el mensaje | `ensureWritableDataDir › rejects a folder without write permission with the path, ids and fix`; `› rejects a missing folder whose parent is not writable` |
| Documentación en docs/self-hosting.md | `docs/self-hosting.md › shows the exact message the container logs when /data is not writable` (comprueba que la guía contiene literalmente el mensaje que genera el código) |
| El smoke test de Docker sigue pasando | Ejecutado en local (ver abajo) |
| `pnpm harness --full` en verde | Ver abajo |

Los tests de permisos reales (`chmod 0o500`) usan `it.skipIf(isRoot)` porque root ignora los permisos. Como root, el mensaje sigue cubierto por los tests puros de `dataDirErrorMessage`, y los casos de carpeta escribible y de creación también se ejecutan.

## Verificación

- `pnpm harness --full` → `[OK] Arnés en verde.` (api: 38 archivos y 368 tests; web: 60 archivos y 403 tests; mobile: 20 pass).
- Smoke de Docker en local, con los mismos pasos que el job `docker` de CI: `docker build` → `docker run` → `node docker/smoke.mjs`. Pasaron los 7 checks (`smoke test passed`), `node dist/job.js reminders` devolvió OK y `id -u` dio 1000.
- Caso negativo con la imagen real: bind mount de una carpeta `root:root 755` en `/data`. El contenedor terminó con `exit=1` y una sola línea en el log:
  `DATA_DIR /data is not writable by the process (uid 1000, gid 1000): EACCES. Make the folder belong to that user; with Docker Compose, run \`sudo chown -R 1000:1000 data\` next to docker-compose.yml (or create it with \`mkdir data\` before the first start) and restart the container.`
- No hay UI, así que no hay capturas.

## Desviaciones / notas

- El mensaje se escribe como texto plano en stderr y no como JSON de pino, porque el logger de Fastify todavía no existe en ese punto. Es el mismo criterio que el `Invalid configuration` actual.
- Solo se protege el arranque del servidor (`server.ts`). `jobs/cli.ts` y `db/migrate.ts` no se han tocado, porque el alcance es «al arrancar la API».
- No he commiteado nada.
