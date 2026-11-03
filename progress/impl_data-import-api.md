# Implementación — data-import-api (#35)

Rama `feat/data-import-api`. Tasks T1–T16 marcadas en `specs/data-import-api/tasks.md`. Sin commits.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `packages/shared/src/schemas/data-import.ts` | **Nuevo.** `dataImportSummarySchema` y `DataImportSummary`: contadores por colección, `photos` y `skipped.notificationChannels`. |
| `packages/shared/src/index.ts` | Re-exporta `schemas/data-import`. |
| `apps/api/src/config.ts` | `IMPORT_MAX_MB`: entero > 0, por defecto `1024`. |
| `README.md`, `.env.example` | Documentan `IMPORT_MAX_MB`. |
| `apps/api/package.json`, `pnpm-lock.yaml` | `yauzl` pasa a `dependencies`; `@types/yauzl` sigue en dev. |
| `apps/api/src/lib/errors.ts` | `ProblemError`, `AppError` con `errors?` opcional (también en `BadRequestError`) y `PayloadTooLargeError` (413). |
| `apps/api/src/plugins/errors.ts` | Si el `AppError` trae `errors`, se incluyen en el problem. |
| `apps/api/src/lib/zip-reader.ts` | **Nuevo.** `openZip(path, { entries })` sobre `yauzl.open` (`lazyEntries`, `autoClose: false`, `strictFileNames`, `validateEntrySizes`). Indexa el directorio central en un `Map<nombre, Entry>`. Responde 400 si el fichero no es un zip, tiene más entradas que el límite, hay nombres duplicados, entradas cifradas o cualquier error de yauzl (nombres absolutos, con `..` o con `\`, o tamaños de entradas *stored* que no cuadran). `read(entry, maxBytes)` descomprime a un `Buffer`, corta si se pasa del tope y convierte cualquier error del stream (inflate, tamaño real ≠ declarado, I/O) en un 400 que nombra la entrada. `close()`. **Streams:** el `ZipFile` tiene un listener de `error` permanente, ya que yauzl también emite ahí los fallos al cerrar el fd. Cada stream de lectura tiene el suyo y se destruye si falla. |
| `apps/api/src/modules/data-import/repository.ts` | **Nuevo.** `ImportPlan`, `insert(userId, plan)`: una `db.transaction` con vehículos → lecturas → programaciones → mantenimientos → repostajes → adjuntos → canales, en lotes de 500 y en el orden del plan. Fija `ownerId`/`userId` y devuelve los contadores. |
| `apps/api/src/modules/data-import/service.ts` | **Nuevo.** `createDataImportService({ repo, settings, storage, tmpDir, limits, log })` → `{ limits, tempZipPath(), import(userId, zipPath) }`. Pasos 2–10 del design, en orden: <br>1. Índice y `data.json` (falta → 400, > `dataJsonBytes` → 413).<br>2. `JSON.parse` (400) y `formatVersion` (400, «Unsupported export format version X (supported: 1)», o `missing`).<br>3. `dataExportSchema.safeParse` (400 con `errors`, máximo 20).<br>4. `currency`/`distanceUnit`/`volumeUnit` (409 que nombra los distintos).<br>5. Referencias en el índice (400) y tamaños declarados por fichero y en total (413).<br>6. Ficheros uno a uno: tipo con `detectAttachmentType` + `assertDecodableImage` (415), `size`/`sha256` (400) y foto WebP decodificable (415). Se guardan en `written`.<br>7. `buildPlan` con `randomUUID` y mapas viejo → nuevo, y `sanitizeFileName`. Los canales con token o cuya `config` no valida contra `notificationChannelConfigSchema` → `skipped`.<br>8. `repo.insert`.<br>9. Si algo falla en 6–8, borra `written` (los errores de borrado van a `log.error`) y relanza.<br>10. `zip.close()` en `finally`.<br>No llama a notificaciones ni al dispatcher. |
| `apps/api/src/modules/data-import/routes.ts` | **Nuevo.** `POST /me/import`:<br>- `preHandler: app.authenticate`.<br>- `request.file({ limits: { fileSize: zipBytes, files: 1 } })`.<br>- Sin fichero en el campo `file` → 400.<br>- Volcado con `stream/promises.pipeline` a `DATA_DIR/tmp/import-<uuid>.zip`.<br>- `file.file.truncated` → 413.<br>- `rm` en `finally` **antes** de responder 201 con `dataImportSummarySchema`. |
| `apps/api/src/app.ts` | Cablea repo → service → routes. `limits`: `zipBytes = totalBytes = IMPORT_MAX_MB MiB`, `fileBytes = MAX_UPLOAD_MB MiB`, `dataJsonBytes = 32 MiB`, `entries = 50 000`. Añade `tmpPath(config) = DATA_DIR/tmp`. |
| `apps/api/test/data-import.test.ts` | **Nuevo.** 23 tests de integración.<br>- **Helpers:** `seedUser` (vehículos activo, archivado y vendido; lecturas de las tres fuentes; programación; mantenimiento con km y adjuntos PDF y PNG; foto; repostaje; canales `ntfy` y `gotify` con token), `download`, `readZip`, `upload`, `buildZip` (yazl), `rezip`, `patchZipEntry` (reescribe nombre o `uncompressedSize` en las cabeceras central y local), `snapshot` (filas por tabla más `uploads/` y `tmp/`), `normalize` (ids → ordinal, sin `exportedAt`).<br>- **Fuera de alcance de tests:** service directo para los límites `dataJsonBytes`, `totalBytes` y `entries`. |

## Trazabilidad

Todos los tests están en `apps/api/test/data-import.test.ts`.

| R | Test(s) |
|---|---|
| R1 | › `imports an export` (201, resumen exacto validado con `dataImportSummarySchema`) |
| R2 | › `requires a session` (401 problem+json, `snapshot` sin cambios) |
| R3 | › `rejects a request without a zip`: sin parte de fichero, cuerpo JSON (no multipart), fichero en otro campo y un PDF → 400; › `rejects a multipart body that never completes` (sin boundary de cierre: cuerpo pequeño y export entero en un chunk, y export en tres chunks espaciados → 400); › `answers 500 when the zip cannot be written to disk` (el fallo de escritura no se confunde con un 400) |
| R4 | › `rejects a zip without a valid data.json`: sin `data.json`, `data.json` en una subcarpeta y JSON roto |
| R5 | › `rejects an unsupported formatVersion` (`2` y ausente; `detail` exacto con ambas versiones) |
| R6 | › `rejects an invalid document` (`errors[].path` `vehicles.0.make`; `scheduleId` colgante → `errors` exacto) |
| R7 | › `rejects different currency or units` (`distanceUnit: 'mi'` → 409; `detail` con `distanceUnit` y sin los otros) |
| R8 | › `creates new ids and remaps references`; › `round-trips an export into another account` (documento igual salvo ids, `exportedAt` y el canal omitido, con timestamps y `archivedAt`) |
| R9 | › `creates new ids and remaps references` (`scheduleId`/`odometerReadingId` → programación y lecturas de B con los mismos datos y el mismo vehículo) |
| R10 | › `adds to existing data` (vehículo, lecturas, canal y ajustes previos de B idénticos; 4 vehículos) |
| R11 | › `creates new ids and remaps references` (`storageKey` nueva y distinta de las de A, bytes en disco con el SHA-256 y el tamaño, `originalName` `facturas/2025\taller/factura.pdf` → `factura.pdf`, `mimeType`) |
| R12 | › `rejects attachments whose type does not match` (PDF con bytes PNG, texto y PNG con firma válida y basura → 415) |
| R13 | › `rejects files that do not match size or sha256` (otro PDF → 400; mismo tamaño con un byte cambiado → 400) |
| R14 | › `rejects an invalid photo` (PNG, basura y WebP truncado → 415); › `round-trips…` (foto con los mismos bytes); › `creates new ids…` (clave `vehicles/<uuid>.webp` nueva) |
| R15 | › `rejects a missing referenced file` |
| R16 | › `ignores unreferenced entries` (`__MACOSX/x` y `extra.bin` con `uncompressedSize` falseado a 2 GiB → 201; solo 3 ficheros nuevos en `uploads/`) |
| R17 | › `imports without notifying` (canal `ntfy` creado, `enabled: true`); › `round-trips…` (canal igual tras normalizar) |
| R18 | › `imports an export` (`skipped.notificationChannels: 1`); › `round-trips…` (falta el `gotify`); › `skips channels whose config is no longer valid` (`hasToken: false` con webhook `file:`, webhook con credenciales, ntfy `gopher:`, topic `../x` y gotify con `token` colado → omitidos; webhook https con `token` colado → importado sin token; `skipped: 5` y una sola fila nueva) |
| R19 | › `rolls back when the database insert fails` (trigger `RAISE(ABORT)` en `fuel_logs` → 500, sin filas ni ficheros nuevos) |
| R20 | › `removes written files when a later file fails` (foto y PDF guardados, PNG con bytes PDF → 415, `uploads/` sin cambios); › `rolls back…` |
| R21 | › `deletes the temporary zip` (tras 201 y tras 400, `tmp/` vacío); › `rejects a multipart body that never completes` (`tmp/` vacío); `snapshot` incluye `tmp/` en todos los rechazos |
| R22 | › `rejects a zip over IMPORT_MAX_MB` (`IMPORT_MAX_MB: '1'` y zip de más de 2 MiB → 413) |
| R23 | › `rejects entries over the size limits`: `MAX_UPLOAD_MB: '1'` y adjunto de 2 MiB que comprimido ocupa menos de 1 MiB → 413 con la ruta; `dataJsonBytes` y `totalBytes` pequeños → 413 |
| R24 | › `rejects an entry whose real size lies` (entrada *deflated* con `uncompressedSize` rebajado → 400 al leer, con la ruta; entrada *stored* → 400 al indexar) |
| R25 | › `rejects unsafe entry names` (`../evil.pdf`, `/etc/x`, `a\b` → 400 con el nombre; duplicado → 400; entrada *deflated* con el bit de cifrado en ambas cabeceras → 400 «Encrypted zip entry: enc.pdf»; `entries: 2` → 400; sin `evil.pdf` fuera de `uploads/`) |
| R26 | › `imports without notifying` (`fetch` sin llamadas; `notifications` de B vacía) |
| R27 | › `round-trips an export into another account` |

## `pnpm harness --full`

```
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared test:  Tests  111 passed (111)
apps/web test:         Tests  289 passed (289)
apps/api test:         Test Files  29 passed (29) · Tests  276 passed (276)
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Verificación adicional

- **`docker build -f docker/Dockerfile -t ikrive:dev .`:** OK. En el contenedor:
  - `/api/health` → 200.
  - Alta → vehículo → `GET /api/me/export` → `POST /api/me/import` → 201 con el resumen.
  - `/data/tmp` queda vacío.
- **Streams (lección de #34), con un test temporal ya borrado sobre HTTP real (`app.listen`):**
  - Una subida cortada a mitad (socket destruido) no deja ningún zip en `tmp/` y el proceso sigue vivo: `/api/health` responde 200 después.
  - Una subida de 3 MiB con `IMPORT_MAX_MB=1` responde 413 «The zip is larger than 1 MiB».
  - La suite no registra ningún error no manejado.

## Desviaciones del spec

1. **El 413 del zip grande lo lanza la ruta, no `@fastify/multipart`.**
   - Al volcar con `pipeline`, el plugin no rechaza: trunca el stream y marca `file.file.truncated`.
   - La ruta lo comprueba y lanza `PayloadTooLargeError`. El resultado es el mismo que pide R22: 413 problem+json y nada importado.
2. **La ruta no recibe `tmpDir` directamente.**
   - El servicio recibe `tmpDir` y `limits`, como dice el design, y expone `tempZipPath()` (crea `tmp/` y devuelve `import-<uuid>.zip`) y `limits`.
   - La ruta los usa en lugar de recibir opciones propias.
3. **Firma de `zip-reader`.** `openZip` devuelve `{ entries, read(entry, maxBytes), close() }`: `readEntry` del design es el método `read` del lector abierto.
4. **Validación del campo del multipart.** La ruta exige que el fichero venga en el campo `file`, como dice R3. La subida normal de adjuntos acepta el primero que llegue.
5. **El `rm` del zip temporal va antes de la respuesta**, no en un `finally` que envuelva el `send`. Con `send` dentro del `try`, el 201 salía antes de borrar el fichero y el test de R21 lo detectó.

## Vuelta 1 — cambios pedidos en `progress/review_data-import-api.md`

1. **Multipart sin boundary de cierre (bloqueante).**
   - **Causa:** cuando busboy falla («Unexpected end of form») o la petición se cierra antes de tiempo, `@fastify/multipart` llama a `currentFile.destroy()` **sin error** y deja el error en su cola interna, que `request.file()` ya no lee. Con el cuerpo entero en un solo chunk eso ocurre antes de que el handler reanude tras `await request.file()`. `pipeline` sobre un stream que ya está cerrado (`destroyed`, sin `end`) no resuelve ni rechaza nunca, así que el `finally` no llegaba a ejecutarse. La ruta de adjuntos usa `toBuffer()`, cuyo `for await` sobre el stream destruido lanza `ERR_STREAM_PREMATURE_CLOSE`: de ahí su 500.
   - **Arreglo (`routes.ts`, `receive()`):** si el stream ya está destruido sin haber terminado → 400 «The upload ended before the zip was complete», sin llegar a abrir el fichero. Si se destruye durante el volcado (cliente que corta), `pipeline` rechaza con `ERR_STREAM_PREMATURE_CLOSE` (y cierra el `WriteStream`), que se traduce al mismo 400. El resto de errores se relanzaban. En ambos casos se ejecuta el `rm` del `finally`.
   - **Corrección (vuelta 2):** lo que decía esta vuelta sobre el cuerpo malformado en varios chunks era falso: respondía 500 (ver «Vuelta 2»).
   - **Test:** `rejects a multipart body that never completes` (cuerpo `abc` y export entero, sin boundary de cierre) → 400 y `snapshot`/`tmp/` sin cambios. He comprobado que sin el arreglo el test se queda colgado (falla por timeout).
   - **Servidor real:** el script del reviewer (`live.mts`) responde ahora 400 en «broken multipart», con `tmp=0`. Las subidas cortadas, el 413, el import válido y el cliente que se desconecta siguen igual, `/api/health` responde 200 y no hay errores no manejados.
2. **R18:** test `skips channels whose config is no longer valid` (ver trazabilidad).
3. **R25:** `patchZipEntry` acepta `encrypted: true` (bit 0 del general purpose flag en la cabecera central y en la local). `rejects unsafe entry names` comprueba el 400.
4. **Aviso no bloqueante, atendido:** un cuerpo que no es multipart respondía 406 (`@fastify/multipart`). La ruta comprueba `request.isMultipart()` y responde 400, como pide R3 al pie de la letra. Test añadido en `rejects a request without a zip`.

**Sin atender (fuera del design):**
- Un cliente que deja de enviar sin cerrar el socket mantiene la petición abierta, igual que en cualquier otra ruta: Fastify trae `requestTimeout: 0` por defecto. Ese cliente también mantiene su propio socket abierto. Poner un timeout global del servidor sería una decisión fuera de `design.md`; la dejo para el humano.
- El fichero parcial cuando `storage.save` falla con el disco lleno es comportamiento previo de `storage`.

## Vuelta 2 — cambios pedidos en `progress/review_data-import-api.md`

1. **Multipart sin boundary de cierre que llega en varios chunks → 500.**
   - **Causa:** si busboy ya está leyendo la parte cuando el cuerpo termina, no destruye `file.file` en silencio: emite en él `Error: Part terminated early due to unexpected end of multipart data`. `pipeline` rechazaba con ese error (no con `ERR_STREAM_PREMATURE_CLOSE`), `receive()` lo relanzaba y la respuesta era 500.
   - **Arreglo (`routes.ts`, `receive()`):** se crea el `WriteStream` aparte. Un listener `once('error')` en cada stream apunta cuál falla primero (`failed ??= 'source' | 'sink'`); `pipeline` destruye ambos con el primer error, así que el primero es la causa. Si el que falla es el disco (`sink`), se relanza (500). Cualquier otro rechazo (error del origen o cierre prematuro sin error) → 400 «The upload ended before the zip was complete». Se mantiene la comprobación previa del stream ya destruido y el `rm` del `finally`.
   - **Tests:**
     - `rejects a multipart body that never completes`: se añade el export sin boundary de cierre enviado con `app.inject` y un `Readable` que entrega tres chunks (cabecera de la parte, 1000 B y el resto) con 20 ms entre ellos. Afirma 400, el `detail`, `snapshot` sin cambios y `tmp/` vacío. Comprobado: con el `receive()` anterior este caso da 500 y el test falla. Sin las pausas, `inject` entrega el cuerpo de golpe y no reproduce el fallo.
     - `answers 500 when the zip cannot be written to disk` (nuevo): `tmp/` en solo lectura (`chmod 0o500`), así que abrir el `WriteStream` falla con `EACCES` → 500, `snapshot` sin cambios. Comprobado: si `receive()` tradujera todo a 400, este test falla. Nota: depende de los permisos del sistema de ficheros, así que no se cumpliría ejecutando los tests como root (CI usa el usuario `runner`).
   - **Servidor real (`live2.mts` del reviewer, ejecutado tras el arreglo):** «broken multipart, chunked (head, data, data)» y «broken multipart, big chunked 1.5MiB» → 400 «The upload ended before the zip was complete». El multipart roto en un chunk sigue dando 400. Los cortes del cliente, las subidas abortadas, el 413 y los imports válidos siguen igual. `tmp=0 fds=0` en los 24 casos, `/api/health` 200 y ningún error no manejado. El 500 de la ruta de adjuntos (baseline) sigue igual: queda fuera de esta feature.
2. **Informe:** corregida la descripción de la vuelta 1 (punto 1) y la fila R3 de la trazabilidad.

`pnpm harness --full` (vuelta 2): lint, typecheck y tests en verde. shared 111, web 289, api 277 (+1: el test del 500 por escritura).
