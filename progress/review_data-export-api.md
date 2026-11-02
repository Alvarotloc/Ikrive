# Review — #34 data-export-api

**Veredicto:** APPROVED (vuelta 2)

## Trazabilidad requirements ↔ tests

- R1: [x] `apps/api/test/data-export.test.ts:167` › `downloads a dated zip`: comprueba 200, `application/zip`, `attachment; filename="ikrive-export-<hoy Madrid>.zip"`, `no-store` y `nosniff`. Además, `:241` usa la zona del usuario (`America/New_York`).
- R2: [x] `:183` › `requires a session`: 401 y `application/problem+json`.
- R3: [x] `:244-245` › `exports every vehicle with its records`: `formatVersion: 1`, `appVersion === APP_VERSION` y `exportedAt` parseable (y `z.iso.datetime` vía `safeParse`).
- R4: [x] `:246`: los ajustes cambiados por `PATCH` aparecen con `toEqual` exacto.
- R5: [x] `:265-303`: vehículos activo, archivado y vendido en orden, con lecturas (3 fuentes), programación, mantenimiento y repostaje. `exports an empty account` cubre el caso vacío.
- R6: [x] `:305-316`: `odometerReadingId` y `scheduleId` resuelven a elementos del mismo vehículo con el valor esperado. En el esquema, `data-export.test.ts:183` cubre una referencia inexistente, una de otro vehículo y una lectura enlazada dos veces.
- R7: [x] `:333` › `includes the attachment files`: metadatos exactos (`toEqual`), `path` y el SHA-256 de los bytes del zip igual al del original (PDF y PNG).
- R8: [x] `:380` › `includes the vehicle photo`: `photoPath` y bytes idénticos a `GET …/photo`; `null` si no hay foto.
- R9: [x] `:255` (ntfy, `hasToken: false`) y `:541` (gotify/webhook con `hasToken: true` y `config` sin `token`). En el esquema, `strips a channel token`.
- R10: [x] `:401` › `zips only data.json and referenced files`: conjunto de entradas igual a `data.json` ∪ rutas, y mismo tamaño.
- R11: [x] `:423` › `never exports other users' data`: en ambos sentidos, sin ids, matrícula, modelo, título, nombre de adjunto, canal ni `userId` ajenos, y sin bytes del fichero ajeno.
- R12: [x] `:462` › `never exports secrets`: tokens de canal, hash de contraseña, token de sesión, cookie, `storageKey` y `photo` leídos de la BD, más las claves prohibidas.
- R13: [x] el mismo test: selector, hash y token del enlace y del feed, notificación insertada y las claves `reportShares`, `notifications` y `calendarFeed`.
- R14: [x] `packages/shared/src/schemas/data-export.test.ts:158` (`parse` ⇒ `toEqual`) y `safeParse` del documento real en `:240` y `:327`.
- R15: [x] `data-export.test.ts:166`: rechaza `2` y la versión ausente.
- R16: [x] `:172` (duplicados por colección y entre vehículos) y `:183` (referencias colgantes).
- R17: [x] `:197`: `../`, `/etc/passwd`, id ajeno, extensión que no casa con el mime e id con `../`, para foto y adjunto.
- R18: [x] `apps/api/test/data-export.test.ts:556` › `opens files lazily and one at a time`: `reads === 0` antes de consumir, `maxOpen === 1` contado hasta `close`, 4 lecturas.
- R19: [x] `:654` › `skips files missing on disk`: adjunto y foto omitidos, solo `data.json` en el zip y dos `warn` (nivel 40) con `attachmentId`/`vehicleId`. El error de lectura posterior a `exists` (design › Contrato HTTP/Riesgos) está cubierto en `:599` › `cuts the download short when a file cannot be read`: el stream se rechaza con `ENOENT`, `log.error` recibe `'export: file read failed'` y una descarga posterior da 3 entradas. El abort está cubierto en `:626` › `closes the open file when the download is aborted`: el fichero se cierra y la salida queda destruida.

## Tasks

- T1..T13: [x]. Desviaciones justificadas en `impl_data-export-api.md`: espera al `close`, tipo `NodeJS.ReadableStream`, 7 consultas y `readZip` local.

## Checkpoints

- C1: [x] `pnpm harness --full` sale con 0; una sola feature activa; rama `feat/data-export-api`.
- C2: [x] spec completo en EARS con la tabla de acceptance; tasks `[x]`; cada R tiene un test leído.
- C3: [x] el diff solo toca los archivos del design (más `progress/`).
- C4: [x] el módulo `{routes,service,repository}` está cableado en `app.ts`, la propiedad se aplica por `ownerId` y hay lógica pura en shared con tests. Un error de lectura a mitad del stream ya va por el camino del design: se registra, la conexión se corta y el proceso sigue vivo.
- C5: [x] sin `any` ni `@ts-ignore`, fechas `YYYY-MM-DD`, timestamps ISO y sin logs de depuración.
- C6: [x] arnés en verde (vuelta 2): shared 111, api 251 y web 289 tests. SQLite en memoria, sin mocks de BD. Sin UI.
- C7: [x] `impl_data-export-api.md` completo y `current.md` al día. PLAN sin cambios necesarios (la fase 7 sigue abierta).

## Hallazgos (vuelta 1)

1. **`apps/api/src/modules/data-export/service.ts:674-682` (R19, design › «Contrato HTTP» y «Riesgos»): un error de lectura de un fichero tumba el servidor.**
   - **Causa.** El `ReadStream` que devuelve `storage.read(key)` no tiene listener de `error`. `yazl` (`pumpFileDataReadStream`) solo hace `pipe`, que no propaga errores, y `routes.ts:451` escucha `error` en `zip.outputStream`, que nunca lo recibe. Un `ENOENT`/`EACCES`/`EIO` al abrir o leer el fichero se convierte en `Unhandled 'error' event` y el proceso termina; no hay handler de `uncaughtException` en `apps/api/src`.
   - **Reproducción.** La he hecho con el mismo patrón (`addReadStreamLazy` + `createReadStream` de un fichero inexistente + `once('close')`) en `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/6471f1ab-1a61-4399-bb94-19521042342e/scratchpad/race.mjs`: `exit code 1`, `throw er; // Unhandled 'error' event`.
   - **Escenarios realistas.**
     - Fichero borrado entre `exists` y `read`.
     - Más probable en self-hosted: un fichero del volumen `/data` con permisos o propietario incorrectos. `exists` usa `access(F_OK)`, que pasa, pero `open` falla con `EACCES`.
   - **Consecuencias.**
     - Cae el servidor de todos los usuarios, en lugar del comportamiento del design: «Fastify destruye la conexión y el cliente recibe un zip truncado; se registra el error».
     - Si se añadiera solo un listener que lo ignore, la respuesta se quedaría colgada: `yazl` no termina la entrada y `outputStream` nunca acaba.

## Avisos para el humano (no bloquean)

- **Descarga abortada por el cliente.** Si el cliente corta, Fastify destruye `outputStream`, pero `pipe` no propaga la destrucción al `ReadStream` en curso. El descriptor del fichero puede quedar abierto y la cadena `previousClosed` parada. Probablemente se resuelve con el mismo arreglo del hallazgo 1 (p. ej., `stream.pipeline`/`finished` o destruir el fichero cuando se cierra la salida). Conviene cubrirlo si se toca esa parte.
- `design.md` habla de «6 consultas» y son 7; el implementer ya lo documenta.
- **Para #35.** `dataExportSchema` es reutilizable: exporta el esquema con `superRefine`, los tipos `DataExport*`, `DATA_EXPORT_FORMAT_VERSION` y los helpers de ruta, y quita por defecto las claves desconocidas. Las cadenas no tienen límite de longitud (decisión del design). El import tendrá que acotar el tamaño de `data.json` y del zip por su cuenta (`yauzl` + `validateEntrySizes`).

## Cambios requeridos (vuelta 1)

1. Manejar el error del stream de cada fichero del zip en `service.ts` (o en `routes.ts` con un mecanismo que lo reciba de verdad):
   - El proceso no puede caer.
   - El error se registra.
   - `outputStream` se destruye con ese error, para que Fastify cierre la conexión como dice el design.
   - Añadir un test en `apps/api/test/data-export.test.ts` con un `storage.read` que devuelva un stream que falla (o con un fichero sin permisos de lectura), que compruebe que:
     - el stream de salida termina con error, sin colgarse;
     - se registra el error;
     - el proceso sigue vivo (p. ej., una petición posterior responde 200).

## Vuelta 2 — verificación

- **Hallazgo 1: resuelto.** En `service.ts:234-238` cada fichero tiene un `once('error')` que:
  - registra el error con `log.error({ err, path })`;
  - hace `stream.destroy(error)`, y `pipeline` propaga la destrucción a `zip.outputStream`;
  - resuelve la cadena `previousClosed`.

  `routes.ts:14` registra el error de la salida. Además, en `service.ts:213` se destruye el fichero en curso cuando se cierra la salida, y no se abre ninguno más si la salida ya está destruida (`:224`).
- **Reproducción contra la app real.** Servidor escuchando en un puerto y peticiones HTTP reales, no `inject`. Script: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/6471f1ab-1a61-4399-bb94-19521042342e/scratchpad/http-fail.mts`, con dos adjuntos, uno de ellos de 8 MiB.
  - **Sin fallos:** 200 y zip completo.
  - **`chmod 000` en los ficheros (`EACCES` tras `exists`):** la respuesta se aborta tras 957 bytes y se registra `export: file read failed` y `export: zip stream failed`. El proceso sigue vivo (no salta `uncaughtException`) y la siguiente descarga, con los permisos restaurados, es completa.
  - **Aborto del cliente a mitad del fichero grande:** tras el corte no queda ningún descriptor de `/proc/self/fd` abierto apuntando al directorio de datos.
  - **Fichero borrado antes de la petición:** se omite por `exists` (R19) y la descarga es completa.
- **Regresiones:** ninguna. El diff sigue limitado a los archivos del design. El tipo de `storage.read` pasa a `{ read(key): Readable }`, que `FileStorage` cumple. `pnpm harness --full` termina en verde (exit 0).
- **Sin cambios requeridos.** Los avisos de la vuelta 1 siguen siendo válidos, salvo el de la descarga abortada, que queda resuelto.
