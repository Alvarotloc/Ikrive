# Review — #18 admin-run-jobs

**Veredicto:** APPROVED

## Trazabilidad requirements ↔ tests
- R1: [x] `apps/api/test/admin-jobs.test.ts:84` › `runs the reminders job`: admin con regla vencida, comprueba el 200, el cuerpo exacto `{ job: 'reminders', evaluated: 1, created: 1, failed: 0 }` y la fila en `notifications`. Usa el reloj real (la ruta no recibe `now`).
- R2: [x] `apps/api/test/admin-jobs.test.ts:98` › `runs the odometer-nudge job`: comprueba el 200, el resumen exacto y la fila `odometer_nudge` del admin.
- R3: [x] `apps/api/test/admin-jobs.test.ts:115` › `reports failed sends`: un webhook caído y otro bien dan `failed: 1` y 2 llamadas a fetch. Además, `notification-channels-dispatch.test.ts` › `counts failed sends` / `counts no failed sends without channels`.
- R4: [x] `apps/api/test/admin-jobs.test.ts:134` › `returns 404 for an unknown job`: 404, `application/problem+json` y `detail: 'Unknown job: foo'`. Ningún job se ejecuta porque `isJobName` falla antes de llamar a `runJob`.
- R5: [x] `apps/api/test/admin-jobs.test.ts:144` › `returns 401 without a session`: 401 problem+json con `reminders` y `foo`, y `notifications` vacía aunque haya una regla vencida.
- R6: [x] `apps/api/test/admin-jobs.test.ts:154` › `returns 403 for a regular user`: 403 en ambos jobs y en `foo`, sin filas creadas aunque las dos cuentas tienen reglas vencidas.
- R7: [x] `apps/api/test/admin-jobs.test.ts:168` › `runs even when the scheduler is disabled`: con `REMINDERS_ENABLED: 'false'` responde 200, `created: 1` y crea 1 fila.
- R8: [x] `apps/api/test/job-cli.test.ts:66` › `runs a job against DATA_DIR`: BD real en un `DATA_DIR` temporal; comprueba el código 0, el JSON exacto con `\n` final, stderr vacío y la fila en BD.
- R9: [x] `apps/api/test/job-cli.test.ts:92` › `rejects an unknown or missing job`: con `['foo']` y `[]` comprueba el código 1, el mensaje de uso exacto en stderr, stdout vacío y que no se crea `ikrive.db`.
- R10: [x] Entrada `src/job.ts` en `tsup.config.ts`. El Dockerfile copia `dist/` entero (línea 38). La verificación Docker real está documentada en `progress/impl_admin-run-jobs.md`: `node dist/job.js reminders` devuelve JSON con código 0 y `foo` o sin nombre devuelve código 1. No es automatizable con Vitest; el spec (T14) lo prevé así.
- R11: [x] `README.md`: sección «Lanzar los jobs a mano» (Docker y curl), comando de desarrollo y fila `REMINDERS_ENABLED` actualizada.

## Tasks
- T1..T15: [x]. La desviación de T3 (el caso sin canales va en un test aparte) está justificada en el informe y cubre lo mismo.

## Checkpoints
- C1: [x] `pnpm harness` en verde; una sola feature activa (#18 `in_progress`); la rama es `feat/admin-run-jobs`.
- C2: [x] Los tres archivos existen; EARS correcto con la tabla de acceptance completa; tasks `[x]`; cada R tiene su test, abierto y leído.
- C3: [x] El diff coincide con la tabla de archivos de `design.md`. Los únicos cambios fuera de ella son de comentarios en los jobs («future admin trigger» → «admin trigger»), y vienen a cuento. Nada de otras features.
- C4: [x] El módulo `admin/routes.ts` va sin service ni repository, como justifica el design. Está cableado en `app.ts` con el dispatcher compartido. Params y respuesta se validan con zod (`jobRunSummarySchema` de shared). La autorización va en un `preHandler` dentro de un plugin encapsulado (sin `fp`), así que solo afecta a sus rutas y se resuelve antes del 404. Los errores son `NotFoundError`/`ForbiddenError`/`UnauthorizedError` (RFC 7807). No hay cambios de BD ni de web.
- C5: [x] No hay `any`, `@ts-ignore`, `console.log` ni TODOs. No aplica a fechas, km ni ficheros subidos.
- C6: [x] `pnpm harness --full` en verde (api 153, web 175). Los tests usan SQLite real (en memoria, o en un fichero temporal para el CLI) y afirman resultados concretos. No hay UI, así que no hay capturas.
- C7: [x] `impl_admin-run-jobs.md` completo; `current.md` está al día; `PLAN.md`: la feature no cierra fase ni cambia decisiones (el leader actualizará la tabla de estado al cerrar si procede).

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- `admin-jobs.test.ts › runs the odometer-nudge job` calcula el día de la semana en `createUser` con `new Date()` y lanza el job con el reloj real. Si la ejecución cruza la medianoche UTC entre ambos momentos, el test fallaría. La probabilidad es despreciable y el spec pide no falsear el reloj.
- `job-cli.test.ts` crea directorios en `tmpdir()` (`ikrive-cli-*`) y no los borra.
- Si `deliver` rechaza por un error de almacenamiento, sus mensajes no cuentan ni en `sent` ni en `failed` (`dispatcher.ts`, comentario en el bucle). Es un caso marginal y está documentado.

## Cambios requeridos
Ninguno.
