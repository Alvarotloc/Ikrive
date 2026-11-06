# Implementación #43 truncated-upload-400

Feature `sdd: false`: sin spec, guiada por los `acceptance` de `feature_list.json` (A1–A4 en el orden en que aparecen).

## Cambios por archivo

- `apps/api/src/lib/uploads.ts` (nuevo): helper compartido para recibir subidas multipart.
  - `receiveToFile(source, path, detail)`: la antigua `receive` de la ruta de import, movida tal cual (stream destruido antes de leerlo → 400; fallo del lado de la subida → 400; fallo del disco → se relanza y acaba en 500).
  - `receiveToBuffer(part, detail)`: envuelve `part.toBuffer()` con la misma comprobación previa del stream destruido; deja pasar el 413 de `@fastify/multipart` (`FST_REQ_FILE_TOO_LARGE`) y traduce cualquier otro error a `BadRequestError` (en memoria no hay lado de disco, así que solo puede fallar la subida).
  - Detalle por defecto: `The upload ended before the file was complete`.
- `apps/api/src/modules/data-import/routes.ts`: quita la `receive` local y usa `receiveToFile` con su mensaje de siempre (`…before the zip was complete`). Sin cambio de comportamiento.
- `apps/api/src/modules/attachments/routes.ts`: `file.toBuffer()` → `receiveToBuffer(file)`.
- `apps/api/src/modules/vehicles/routes.ts` (PUT `/vehicles/:id/photo`): `file.toBuffer()` → `receiveToBuffer(file)`.
- `apps/api/test/helpers.ts`: `incompleteMultipart(payload)` devuelve `whole` (cuerpo sin boundary de cierre, de una vez) y `chunked()` (el mismo cuerpo en varios chunks, primero las cabeceras de la parte); lo usan los tres tests.
- `apps/api/test/attachments.test.ts`, `apps/api/test/vehicles.test.ts`: tests nuevos.
- `apps/api/test/data-import.test.ts`: el test que ya existía usa ahora el helper compartido; mismos casos y aserciones.

## Trazabilidad

| Acceptance | Archivo › test |
|---|---|
| A1 adjuntos: sin boundary (pequeño y 64 KiB) y en varios chunks → 400 problem+json, sin fichero ni fila | `apps/api/test/attachments.test.ts` › `maintenance attachments › rejects a multipart body that never completes` |
| A1 foto: los mismos casos → 400 problem+json, `photoUrl` sigue `null`, sin fichero | `apps/api/test/vehicles.test.ts` › `vehicles › rejects a photo upload that never completes` |
| A2 lógica compartida con import (sin regresión) | `apps/api/src/lib/uploads.ts`; `apps/api/test/data-import.test.ts` › `rejects a multipart body that never completes` y `answers 500 when the zip cannot be written to disk` |
| A2 el 413 se mantiene | `apps/api/test/attachments.test.ts` › `rejects files larger than MAX_UPLOAD_MB` |
| A3 tests de integración de los dos casos en las dos rutas | las dos primeras filas |
| A4 harness en verde | abajo |

Comprobé que los dos tests nuevos fallan sin el arreglo (`expected 500 to be 400`): quité temporalmente los cambios de las rutas con un stash y luego los restauré.

## `pnpm harness --full`

```
[OK]    47 features: 43 done, 3 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #43 truncated-upload-400 (in_progress)
[OK]    Rama actual: feat/truncated-upload-400
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test   (api 305/305, web 342/342, shared 117/117, e2e 1/1)
[OK]    Arnés en verde.
```

## Desviaciones

Ninguna. Decisión menor: el detalle del 400 en adjuntos y foto es genérico («…before the file was complete»). Import mantiene su mensaje sobre el zip.

## Vuelta 1

Pedido en Gate 2: aplicar el aviso 1 de `progress/review_truncated-upload-400.md`.

### Cambios

- `apps/api/src/lib/uploads.ts`:
  - Nuevo `isClientError(error)`: indica si el error es un `Error` con `statusCode` numérico en el rango 400–499.
  - `receiveToBuffer` relanza tal cual cualquier error con un 4xx, no solo `FST_REQ_FILE_TOO_LARGE`. El resto se convierte en 400 con `detail`. El parámetro pasa a tener el tipo estructural `{ file: Readable; toBuffer(): Promise<Buffer> }`. `MultipartFile` lo cumple, así que las rutas no cambian y el test puede usar una parte falsa sin casts.
  - `receiveToFile` sigue el mismo criterio para que los dos sean coherentes: un error del lado de la subida que ya traiga un 4xx se relanza tal cual. El lado del disco no cambia: se relanza y termina en 500.
- `apps/api/test/uploads.test.ts` (nuevo): tests unitarios del helper con streams y partes falsas. Por integración no se puede reproducir un 4xx distinto de 413 que salga de `toBuffer()`.

### Trazabilidad

| Requisito | Archivo › test |
|---|---|
| Un 4xx distinto de 413 (415, 400), y también el 413, pasa tal cual (`receiveToBuffer`) | `apps/api/test/uploads.test.ts` › `receiveToBuffer › lets through untouched an error that already has a 4xx status` |
| Un error sin `statusCode` (o con 5xx) → 400 con `detail` | `… › receiveToBuffer › turns any other failure of the upload into a 400` |
| Stream ya destruido → 400 | `… › receiveToBuffer › answers 400 when the file stream was already destroyed` |
| `receiveToFile`: un 4xx de la subida pasa tal cual | `… › receiveToFile › lets through untouched an upload error that already has a 4xx status` |
| `receiveToFile`: otro fallo de la subida → 400 | `… › receiveToFile › turns any other failure of the upload into a 400` |
| `receiveToFile`: un fallo del disco se relanza (500) | `… › receiveToFile › rethrows a failure of the disk, which ends in a 500` y, por integración, `data-import.test.ts` › `answers 500 when the zip cannot be written to disk` |

### `pnpm harness --full`

```
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test   (api 312/312, web 342/342, shared 117/117, e2e 1/1)
[OK]    Arnés en verde.
```

### Desviación (menor)

El pedido decía «convertir en 400 solo los que no tienen statusCode». Un error que venga de la subida con un `statusCode` 5xx también se convierte en 400, en vez de propagarse como 500. Motivo: un fallo de la subida no es culpa del servidor, y el aviso del reviewer proponía exactamente «< 500». Hoy `@fastify/multipart` no lanza ningún error así. Lo cubre el test `turns any other failure of the upload into a 400`. Si se prefiere que un 5xx llegue como 500, basta con cambiar una condición.
