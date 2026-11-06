# Review — #43 truncated-upload-400

**Veredicto:** APPROVED

Feature `sdd: false`: se revisa contra los `acceptance` de `feature_list.json` (A1–A4), sin spec.

## Estado en disco (sesión reanudada)
Coherente: `feature_list.json` con #43 `in_progress` (único cambio), rama `feat/truncated-upload-400` sin commits propios sobre `main` y todo el trabajo sin commitear (7 modificados + `apps/api/src/lib/uploads.ts` y `progress/impl_truncated-upload-400.md` nuevos). `progress/current.md` refleja el corte y la reanudación. No quedan restos del stash que menciona el informe (`git status` limpio de otros ficheros, sin conflictos).

## Trazabilidad acceptance ↔ tests
- A1 (adjuntos): [x] `apps/api/test/attachments.test.ts` › `rejects a multipart body that never completes`: sin boundary de cierre (pequeño y 64 KiB, de una vez) y cortado en varios chunks → 400 `problem+json` con su `detail`; sin ficheros en `uploads/attachments`, sin filas en `attachments` y el listado vacío.
- A1 (foto): [x] `apps/api/test/vehicles.test.ts` › `rejects a photo upload that never completes`: los mismos tres casos → 400 `problem+json` + `detail`; `photoUrl` sigue `null` y no hay ficheros en `uploads/vehicles`.
- A2: [x] `apps/api/src/lib/uploads.ts` reúne `receiveToFile` (la antigua `receive` de import, sin cambios de lógica) y `receiveToBuffer` (misma comprobación previa del stream destruido). Sin regresión: `data-import.test.ts` › `rejects a multipart body that never completes` (mismos casos y aserciones, ahora con el helper compartido) y `answers 500 when the zip cannot be written to disk`; el 413 sigue cubierto por `attachments.test.ts` › `rejects files larger than MAX_UPLOAD_MB`.
- A3: [x] las dos primeras filas: ambos casos en las dos rutas.
- A4: [x] `pnpm harness --full` en verde, ejecutado por mí: api 305/305, web 342/342, shared 117/117, e2e 1/1.

## Puntos que pidió vigilar el líder
1. **¿`receiveToBuffer` disfraza de 400 errores que deberían ser otra cosa?** No, según el código de `@fastify/multipart@10.1.2`. `toBuffer()` solo hace `for await` sobre `this.file` y `Buffer.concat`. Los errores que puede lanzar son: `FST_REQ_FILE_TOO_LARGE`, que se deja pasar (413); los errores del stream de busboy («Part terminated early…»); y el cierre prematuro cuando `cleanup` destruye `currentFile` en una petición abortada o con error. Todos son fallos de la subida, así que el 400 es correcto. `FST_FILES_LIMIT`, `FST_PARTS_LIMIT` y `FST_FIELDS_LIMIT` (ver `onLimit`) y `PrototypeViolationError` se entregan por el iterador de partes (`request.file()`/`ch(err)`), no por `toBuffer()`, y `onLimit` mantiene el pipe (`keepParsing`). Por eso conservan su 413/400 de siempre. Un `Buffer.concat` desmesurado no puede darse con el límite `fileSize`. El criterio coincide con el de import: allí solo el lado del disco (sink) acaba en 500; en memoria no hay sink.
2. **Refactor de import:** el cuerpo de `receiveToFile` es idéntico al de la `receive` eliminada; el único cambio es que el `detail` se pasa como parámetro (`INCOMPLETE_UPLOAD` local, el mismo texto que antes). Los imports que ya no se usan se han quitado. No cambia el comportamiento.
3. **Cobertura:** sin boundary de cierre (de una vez, en tamaño pequeño y grande) y cortado en varios chunks (cabeceras, 1000 B y el resto, con pausas), en adjuntos y en foto; los dos tests comprueban que no quedan ficheros ni filas o estado.

## Checkpoints
- C1: [x] harness con código 0; una sola feature activa (#43); rama `feat/truncated-upload-400`.
- C2: [x] N/A en spec (`sdd: false`); los acceptance se cubren uno a uno con tests leídos (arriba).
- C3: [x] el diff solo toca las tres rutas de subida, el helper nuevo, sus tests y `helpers.ts`, más `feature_list.json` y `progress/`. Mover `receive` y su test de import a lo compartido es lo que pide A2.
- C4: [x] errores como `BadRequestError` (`AppError`, RFC 7807); el helper está en `src/lib`; sin cambios de BD ni de web.
- C5: [x] sin `any`, sin `@ts-ignore`, sin `console.log` ni código comentado.
- C6: [x] `pnpm harness --full` en verde; los tests afirman el estado, el content-type, el `detail` y la ausencia de efectos, con SQLite en memoria y sin mocks; sin UI.
- C7: [x] `progress/impl_truncated-upload-400.md` con archivos, mapa de trazabilidad y salida del harness; `progress/current.md` al día; `docs/PLAN.md` no necesita cambios.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- `receiveToBuffer` solo deja pasar `FST_REQ_FILE_TOO_LARGE` por su código. Si una versión futura de `@fastify/multipart` lanzara desde `toBuffer()` otro error con `statusCode` 4xx (p. ej. otro 413), se convertiría en 400. Hoy no ocurre. Dejar pasar cualquier error con `statusCode` < 500 lo haría más robusto ante actualizaciones.
- No he reproducido que los tests fallen sin el arreglo, porque el rol no permite tocar `apps/`. El informe dice que lo comprobó con un stash (`expected 500 to be 400`), y es coherente con el código: el error de busboy no lleva `statusCode`, así que el manejador lo convertía en 500.

## Cambios requeridos
Ninguno.

---

## Vuelta 1

**Veredicto:** APPROVED

Lo pidió el humano en Gate 2: aplicar el aviso 1. Sección «Vuelta 1» de `progress/impl_truncated-upload-400.md`.

### Trazabilidad (tests leídos)
- `receiveToBuffer` relanza tal cual los 4xx (413 `FST_REQ_FILE_TOO_LARGE`, 415 y 400): [x] `apps/api/test/uploads.test.ts` › `receiveToBuffer › lets through untouched an error that already has a 4xx status`. Usa `rejects.toBe(error)` y comprueba que es la misma instancia, no solo el código.
- Un error sin `statusCode`, o con 5xx, se convierte en 400 con el `detail` recibido: [x] `… › turns any other failure of the upload into a 400`. Comprueba `BadRequestError`, `status: 400` y el `detail` personalizado.
- Stream ya destruido → 400 sin quedarse colgado: [x] `… › answers 400 when the file stream was already destroyed`. El `toBuffer` falso no se resuelve nunca, así que el test prueba que la comprobación previa corta antes de llamarlo.
- `receiveToFile` relanza tal cual los 4xx de la subida: [x] `… › receiveToFile › lets through untouched an upload error that already has a 4xx status`.
- `receiveToFile`: cualquier otro fallo de la subida → 400: [x] `… › turns any other failure of the upload into a 400`.
- El fallo del disco se mantiene y llega como 500: [x] `… › rethrows a failure of the disk, which ends in a 500` (relanza el `ENOENT` original). Por integración, `data-import.test.ts` › `answers 500 when the zip cannot be written to disk` sigue en verde. En el código, `failed === 'sink'` se evalúa antes que `isClientError`, así que el error del disco no pasa por la nueva condición.
- Los tests de integración de la vuelta 0 (adjuntos, foto, import) siguen en verde sin cambios.

### Desviación declarada: un 5xx de la subida acaba en 400
**Es aceptable y no bloquea.**
- No incumple ninguna regla. Los `acceptance` de #43 solo exigen 400 para la subida incompleta, y ni `CONTRIBUTING.md` ni `docs/` dicen qué hacer con un error de la subida que traiga su propio 5xx.
- Es coherente con el criterio que ya se aprobó. Desde la vuelta 0, y desde #35 en import, cualquier fallo del lado de la subida que no se identifique (también los que no tienen `statusCode`, que igual podrían ser internos) se trata como subida incompleta: 400. La única excepción por «culpa del servidor» es el lado del disco, y se mantiene. La vuelta 1 solo añade una excepción concreta, los 4xx, que dicen algo más preciso que un 400 genérico. Es lo que proponía el aviso 1 («< 500»).
- Hoy no puede darse. En `@fastify/multipart@10.1.2` todos los errores con `statusCode` son 4xx (413, 406, 400…) y ninguno de ellos sale de `toBuffer()` ni del stream de la parte con un 5xx.
- Coste: si en el futuro apareciera un 5xx así, respondería 400 y no quedaría en el log (el manejador solo registra los ≥ 500). Va a avisos.

### Cambio de firma de `receiveToBuffer`
Correcto. El tipo pasa de `MultipartFile` a `{ file: Readable; toBuffer: () => Promise<Buffer> }`, que es exactamente lo que usa la función. `MultipartFile` lo cumple estructuralmente, y las dos rutas (`attachments/routes.ts` y `vehicles/routes.ts`) no cambian y pasan `typecheck`. Además ya no se importa `@fastify/multipart` en `lib/`. Los tests usan partes falsas sin casts ni `any`.

### Checkpoints
- C1: [x] el harness termina con código 0; una sola feature activa (#43), en la rama `feat/truncated-upload-400`.
- C2: [x] N/A en spec (`sdd: false`); cada fila nueva de la tabla tiene su test, abierto y leído.
- C3: [x] la vuelta solo toca `apps/api/src/lib/uploads.ts`, el nuevo `apps/api/test/uploads.test.ts` y `progress/`.
- C4: [x] los errores siguen siendo `BadRequestError` (`AppError`) o el error original con su estado.
- C5: [x] sin `any`, sin `@ts-ignore` y sin restos de depuración.
- C6: [x] `pnpm harness --full` en verde, ejecutado por mí: api 312/312, web 342/342, shared 117/117, e2e 1/1. Los tests unitarios usan streams reales (`PassThrough`) y un directorio temporal; no hay BD ni mocks de BD.
- C7: [x] el informe incluye la sección de la vuelta con archivos, trazabilidad, salida del harness y la desviación justificada.

### Avisos para el humano (no bloquean)
- Si prefieres que un error de la subida con un 5xx explícito llegue como 500 (y quede en el log) en vez de 400, en `isClientError` basta con cambiar la condición para relanzar cualquier error con `statusCode` numérico. Hoy no cambia nada observable.

### Cambios requeridos
Ninguno.
