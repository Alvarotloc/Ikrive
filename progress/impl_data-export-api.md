# Implementación — data-export-api (#34)

Rama `feat/data-export-api`. Tasks T1–T13 marcadas en `specs/data-export-api/tasks.md`. Sin commits.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `packages/shared/src/domain/data-export.ts` | **Nuevo.** `ATTACHMENT_EXTENSIONS`, `attachmentExportPath(id, mimeType)`, `photoExportPath(vehicleId)`. |
| `packages/shared/src/schemas/data-export.ts` | **Nuevo.** `DATA_EXPORT_FORMAT_VERSION = 1`, `dataExportSchema` (objeto + `superRefine(checkIntegrity)`), tipos `DataExport`, `DataExportVehicle`, `DataExportMaintenanceRecord`, `DataExportAttachment`, `DataExportNotificationChannel`. Ids con `^[A-Za-z0-9_-]{1,64}$`; sin los `max` de los formularios; canales con `config` sin `token` (strip). Integridad: ids únicos por colección en todo el documento, `scheduleId`/`odometerReadingId` del mismo vehículo, una lectura enlazada como mucho una vez, `path`/`photoPath` iguales a los generados. |
| `packages/shared/src/schemas/data-export.test.ts` | **Nuevo.** 6 tests del esquema. |
| `packages/shared/src/index.ts` | Re-exporta los dos módulos nuevos. |
| `apps/api/src/lib/storage.ts` | `exists(key): Promise<boolean>` (vía `fs.access`). |
| `apps/api/src/modules/data-export/repository.ts` | **Nuevo.** `load(userId)`: 7 consultas (vehículos, lecturas, programaciones, mantenimientos, repostajes, adjuntos, canales), hijos con `innerJoin` a `vehicles` filtrado por `ownerId`; adjuntos por `ownerId` **y** `entityId` ∈ mantenimientos del usuario (subconsulta); orden estable del design con `rowid` de desempate. |
| `apps/api/src/modules/data-export/service.ts` | **Nuevo.** `createDataExportService({ repo, settings, storage, log })` → `export(userId)` devuelve `{ fileName, document, stream }`. Comprueba `storage.exists` de cada adjunto/foto (los que faltan se omiten con `log.warn({ attachmentId \| vehicleId }, 'export: missing file')`), mapea sin `ownerId`/`userId`/`storageKey`/`photo`/`token`/`lastError`, pasa por `dataExportSchema.parse`, y crea el zip con `yazl` (`addBuffer` de `data.json`, `addReadStreamLazy` sin compresión por fichero). |
| `apps/api/src/modules/data-export/routes.ts` | **Nuevo.** `GET /me/export` con `preHandler: app.authenticate`; cabeceras `application/zip`, `contentDisposition(fileName)`, `cache-control: no-store`, `x-content-type-options: nosniff`; `reply.send(stream)`; error a mitad de stream registrado. |
| `apps/api/src/app.ts` | Cablea repo → service (`log: app.log`) → routes bajo `/api`. |
| `apps/api/package.json`, `pnpm-lock.yaml` | `yazl` (dep), `@types/yazl`, `yauzl`, `@types/yauzl` (dev). |
| `apps/api/test/data-export.test.ts` | **Nuevo.** 13 tests de integración + helper `readZip` (`yauzl.fromBuffer`). |

## Trazabilidad

| R | Test |
|---|---|
| R1 | `apps/api/test/data-export.test.ts` › `downloads a dated zip`; › `exports every vehicle with its records` (fecha en la zona del usuario, `America/New_York`) |
| R2 | `apps/api/test/data-export.test.ts` › `requires a session` |
| R3 | `apps/api/test/data-export.test.ts` › `exports every vehicle with its records` |
| R4 | `apps/api/test/data-export.test.ts` › `exports every vehicle with its records` |
| R5 | `apps/api/test/data-export.test.ts` › `exports every vehicle with its records`, `exports an empty account` |
| R6 | `apps/api/test/data-export.test.ts` › `exports every vehicle with its records`; `packages/shared/src/schemas/data-export.test.ts` › `rejects dangling scheduleId and odometerReadingId` |
| R7 | `apps/api/test/data-export.test.ts` › `includes the attachment files` |
| R8 | `apps/api/test/data-export.test.ts` › `includes the vehicle photo` |
| R9 | `apps/api/test/data-export.test.ts` › `exports every vehicle with its records`, `never exports secrets`; `packages/shared/src/schemas/data-export.test.ts` › `strips a channel token` |
| R10 | `apps/api/test/data-export.test.ts` › `zips only data.json and referenced files`, `exports an empty account` |
| R11 | `apps/api/test/data-export.test.ts` › `never exports other users' data` |
| R12 | `apps/api/test/data-export.test.ts` › `never exports secrets` |
| R13 | `apps/api/test/data-export.test.ts` › `never exports secrets` |
| R14 | `packages/shared/src/schemas/data-export.test.ts` › `accepts a complete document`; `apps/api/test/data-export.test.ts` › `exports every vehicle with its records`, `exports an empty account` |
| R15 | `packages/shared/src/schemas/data-export.test.ts` › `rejects an unsupported formatVersion` |
| R16 | `packages/shared/src/schemas/data-export.test.ts` › `rejects duplicate ids`, `rejects dangling scheduleId and odometerReadingId` |
| R17 | `packages/shared/src/schemas/data-export.test.ts` › `rejects unsafe or mismatched file paths` |
| R18 | `apps/api/test/data-export.test.ts` › `opens files lazily and one at a time` |
| R19 | `apps/api/test/data-export.test.ts` › `skips files missing on disk`; error de lectura tras `exists` (design › Contrato HTTP/Riesgos): › `cuts the download short when a file cannot be read`, › `closes the open file when the download is aborted` |

## Verificación

`pnpm harness --full`:

```
[OK]    pnpm lint        (biome check: 308 files, sin avisos)
[OK]    pnpm typecheck   (shared, api, web)
[OK]    pnpm test        shared 15 files / 111 tests · api 28 files / 251 tests · web 36 files / 289 tests
[OK]    Arnés en verde.
```

Docker (nueva dependencia): `docker build -f docker/Dockerfile -t ikrive:dev .` OK. Contra el contenedor: `/api/health` → `{"status":"ok"}`; `GET /api/me/export` sin sesión → 401; con sesión y un vehículo → 200 `application/zip`, `content-disposition: attachment; filename="ikrive-export-2026-11-02.zip"…`, zip con `data.json`.

Sin UI: no hay capturas.

## Desviaciones y notas

- **Un fichero abierto a la vez (R18):** `yazl` pide el siguiente stream en cuanto el anterior emite `end`, pero el descriptor se libera en `close`; el test lo detectó (2 abiertos a la vez). El servicio encadena cada `addReadStreamLazy` a una promesa que espera al `close` del fichero anterior. Es detalle de implementación del paso 4 del design, no cambia el contrato.
- **Tipo de `stream`:** tras la revisión el servicio devuelve un `PassThrough` (un `Readable`, como dice el design) unido a `zip.outputStream` con `stream.pipeline`; ya no hay desviación.
- **`readZip`** vive en `apps/api/test/data-export.test.ts` (no en `helpers.ts`) para no salir de los archivos del design; #35 puede moverlo a `helpers.ts`.
- **Consultas:** el design dice «6 consultas»; son 7 (una por tabla, incluidos los canales) más `settings.get`. Sigue sin N+1.

## Vuelta 1 — cambios pedidos en `review_data-export-api.md`

- **Hallazgo 1 (bloqueante), en `service.ts`.** Cada fichero que se lee para el zip tiene ahora un listener de `error`. Cuando salta:
  - registra el fallo con `log.error({ err, path }, 'export: file read failed')`;
  - destruye el stream de salida con ese error, así que la ruta lo registra y Fastify corta la conexión (zip truncado, como dice el design);
  - resuelve la cadena `previousClosed`.

  El proceso ya no cae. `log` del servicio pasa a `Pick<FastifyBaseLogger, 'warn' | 'error'>`.
- **Salida destruible.** El servicio devuelve un `PassThrough` unido con `pipeline(zip.outputStream, stream)`. Así destruir uno destruye también el otro, sin hacer cast del `NodeJS.ReadableStream` de `@types/yazl`.
- **Aviso no bloqueante: descarga abortada.** Si el cliente corta (Fastify destruye `stream`), en el evento `close` de la salida se destruye el fichero que se estaba copiando. Así no se queda un descriptor abierto. Si la salida ya está destruida, no se abre ningún fichero más.
- **Tipo de `storage.read` en las deps.** Pasa a ser `{ read(key): Readable }` en lugar de `Pick<FileStorage, 'read'>`, para que el test pueda inyectar un stream que nunca termina. `FileStorage` lo cumple.
- **Tests nuevos en `apps/api/test/data-export.test.ts`:**
  - `cuts the download short when a file cannot be read`: `exists` devuelve `true` y `read` devuelve un `createReadStream` de un fichero inexistente. Comprueba que el stream termina con `ENOENT` sin quedarse colgado, que `log.error` se llama con `'export: file read failed'` y que una descarga HTTP posterior responde 200 con las 3 entradas.
  - `closes the open file when the download is aborted`: un fichero que nunca termina y la salida destruida mientras se copia. Se cierra el fichero.
- **Prueba de mutación.** Quité el listener de `error` y el test nuevo falló con `Unhandled error ENOENT` y timeout. Quité la destrucción en `close` y el test de abortar falló con timeout. Después restauré el código.
- **«6 consultas» frente a 7.** Ya estaba documentado arriba. No he tocado el design.
