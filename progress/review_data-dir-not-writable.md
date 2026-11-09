# Review — #57 data-dir-not-writable (`sdd: false`)

**Veredicto:** APPROVED

Sin spec: revisado contra los `acceptance` de `feature_list.json`.

## Trazabilidad acceptance ↔ tests
- A1 (comprobar antes de abrir la BD): [x] `apps/api/src/server.ts:11` llama a `ensureWritableDataDirOrExit` antes de `createDb`; `apps/api/test/data-dir.test.ts` › `makes the server exit with 1 and a single clear line instead of SQLITE_CANTOPEN` arranca `src/server.ts` de verdad y afirma exit 1, una sola línea y que no aparece `SQLITE_CANTOPEN`.
- A2 (exit ≠ 0 y un único log con ruta, uid/gid y fix): [x] `writes one line and exits with 1…` (Exit(1), 1 línea, regex con `sudo chown -R 1000:1000 data`); `dataDirErrorMessage › includes the path, the process ids…` (ruta, uid/gid, EACCES, sin `\n`).
- A3 (función con tests): [x] escribible → `accepts a writable folder and leaves no probe file behind`; inexistente creable → `creates a missing folder (and its parents)` (afirma `isDirectory`); sin permiso → `rejects a folder without write permission…` (tipo de error y contenido del mensaje) y `rejects a missing folder whose parent is not writable`.
- A4 (docs): [x] `docs/self-hosting.md`: `mkdir data`, uid 1000, `chown` y mensaje literal. El test `docs/self-hosting.md › shows the exact message…` comprueba que la guía contiene el mensaje que genera el código.
- A5 (smoke de Docker): [x] según `impl_`, ejecutado en local con los 7 checks OK y probado además el caso negativo con la imagen real. Lo cubre también el job `docker` de CI.
- A6 (harness): [x] ejecutado por el reviewer: `[OK] Arnés en verde.` (api: 368 tests; web: 403 tests).

## Tasks
- Sin `tasks.md` (`sdd: false`). Las casillas del plan en `progress/current.md` están todas `[x]`.

## Checkpoints
- C1: [x] harness verde, una feature activa, rama `feat/data-dir-not-writable`.
- C2: N/A (`sdd: false`); la trazabilidad se ha hecho contra los acceptance.
- C3: [x] solo toca `server.ts`, el nuevo `lib/data-dir.ts`, su test, `docs/self-hosting.md` y `progress/`.
- C4: [x] / N/A: no hay rutas, BD ni UI. El error es de arranque y no llega al cliente HTTP, así que no aplica `AppError`.
- C5: [x] sin `any` ni `@ts-ignore`, sin `console.log`. N/A fechas y ficheros subidos.
- C6: [x] harness verde. Los tests afirman resultados concretos con carpetas temporales reales y la BD no interviene.
- C7: [x] `impl_` completo; `current.md` al día; PLAN no requiere cambios.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- `jobs/cli.ts` y `db/migrate.ts` no llevan la guarda. Es coherente con el alcance «al arrancar la API», pero el job CLI seguiría fallando con `SQLITE_CANTOPEN` sobre un volumen mal configurado.
- Los tests de permisos usan `skipIf(isRoot)`. Si CI corre como root, solo se ejecutan los tests puros del mensaje y los de carpeta escribible o creable.
- Si `mkdirSync` crea `DATA_DIR` y luego falla la escritura de la sonda, la carpeta queda creada. Es inocuo.

## Cambios requeridos
Ninguno.
