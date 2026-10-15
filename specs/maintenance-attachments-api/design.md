# Design — maintenance-attachments-api

Solo API y `packages/shared`. Sin cambios en la web (la galería de facturas va con la feature 7, `maintenance-attachments-web`). Reutiliza el patrón de la foto del vehículo: `@fastify/multipart` ya registrado (`fileSize: MAX_UPLOAD_MB`, `files: 1`), `request.file()` + `toBuffer()`, `createFileStorage` y `sharp`.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `packages/shared/src/enums.ts` | `ATTACHMENT_MIME_TYPES = ['application/pdf','image/jpeg','image/png','image/webp']`, `ATTACHMENT_ENTITY_TYPES = ['maintenance']` + tipos. |
| shared | `packages/shared/src/schemas/attachments.ts` (nuevo) + `src/index.ts` | `attachmentSchema`, `maintenanceAttachmentParamsSchema`, tipo `Attachment`. |
| db | `apps/api/src/db/schema/attachments.ts` (nuevo) + `schema/index.ts` | Tabla `attachments`. |
| db | `apps/api/src/db/migrations/0003_*.sql` | `pnpm --filter api db:generate`. |
| lib | `apps/api/src/lib/file-type.ts` (nuevo) | `detectAttachmentType(buffer)` por magic bytes. |
| lib | `apps/api/src/lib/images.ts` | `assertDecodableImage(buffer)` y `toWebpThumbnail(buffer, size = 320)`. |
| lib | `apps/api/src/lib/errors.ts` | `UnsupportedMediaTypeError` (415). |
| api | `apps/api/src/modules/attachments/{repository,service,routes}.ts` (nuevos) | Subida, listado, descarga, miniatura y borrado. |
| api | `apps/api/src/modules/maintenance/{repository,service,routes}.ts` | El borrado de un mantenimiento borra sus adjuntos (filas en la tx, ficheros después). `remove` pasa a `async`. |
| api | `apps/api/src/modules/vehicles/{repository,service}.ts` | Ídem al borrar el vehículo. |
| api | `apps/api/src/app.ts` | Cablear `attachmentsRepo` en maintenance, vehicles y el nuevo service/routes. |
| test | `apps/api/test/file-type.test.ts`, `apps/api/test/attachments.test.ts` (nuevos) | Unitario de la detección e integración. |

## Base de datos

```ts
export const attachments = sqliteTable('attachments', {
  id: id(),
  ownerId: text().notNull().references(() => user.id, { onDelete: 'cascade' }),
  entityType: text({ enum: ATTACHMENT_ENTITY_TYPES }).notNull(),   // 'maintenance' por ahora
  entityId: text().notNull(),                                       // sin FK: polimórfico (PLAN)
  originalName: text().notNull(),
  mimeType: text({ enum: ATTACHMENT_MIME_TYPES }).notNull(),        // el detectado, no el declarado
  size: integer().notNull(),                                        // bytes
  sha256: text().notNull(),                                         // hex
  storageKey: text().notNull().unique(),                            // 'attachments/<uuid>.<ext>'
  createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => [index('attachments_entity_idx').on(t.entityType, t.entityId)]);
```

- Sin `updatedAt`: un adjunto es inmutable (se borra y se sube otro).
- `entity_id` no tiene FK (polimórfico, como pide `docs/PLAN.md`), así que **no hay cascada de BD**: el borrado de adjuntos al borrar un mantenimiento o un vehículo se hace en código (ver abajo). `ownerId` sí tiene FK a `user` con cascada (las filas caen con el usuario; los ficheros quedarían huérfanos, fuera de alcance).

## Contrato HTTP

Base `B = /api/vehicles/:id/maintenance/:recordId/attachments`. Todos con `app.authenticate`; errores RFC 7807.

| Método y ruta | Entrada | Éxito | Errores |
|---|---|---|---|
| `GET B` | — | 200 `Attachment[]` (`createdAt` asc) | 404 |
| `POST B` | multipart, campo `file` | 201 `Attachment` | 400 sin fichero · 413 tamaño · 415 tipo · 404 |
| `GET B/:attachmentId` | — | 200 bytes originales | 404 |
| `GET B/:attachmentId/thumbnail` | — | 200 `image/webp` | 404 (también si es PDF) |
| `DELETE B/:attachmentId` | — | 204 | 404 |

- **Descarga:** `Content-Type: <mimeType>`, `Content-Length: <size>`, `Content-Disposition: attachment; filename="<ascii con _>"; filename*=UTF-8''<encodeURIComponent>` (RFC 6266/5987, soporta «Factura taller ñ.pdf»), `Cache-Control: private, max-age=31536000, immutable` (el contenido de un id nunca cambia). Helmet ya pone `X-Content-Type-Options: nosniff`.
- **Miniatura:** generada al vuelo con `sharp` desde el original (`rotate()`, `fit: 'inside'` 320×320, sin agrandar, WebP q≈70), mismas cabeceras de caché.
- **413:** lo lanza `@fastify/multipart` (`FST_REQ_FILE_TOO_LARGE`) desde `file.toBuffer()`; el `errorsPlugin` ya lo serializa como problem+json (status < 500). Como se bufferiza **antes** de llamar a `storage.save`, no llega a escribirse nada.
- Mensajes: `NotFoundError('Vehicle not found' | 'Maintenance record not found' | 'Attachment not found' | 'Only images have a thumbnail')`, `BadRequestError('Expected a file in the "file" field')`, `UnsupportedMediaTypeError('Only PDF, JPEG, PNG and WebP files are allowed')`.

## Esquemas (`@ikrive/shared`)

```ts
export const attachmentSchema = z.object({
  id: z.string(), originalName: z.string(), mimeType: z.enum(ATTACHMENT_MIME_TYPES),
  size: z.number().int().nonnegative(), sha256: z.string().regex(/^[0-9a-f]{64}$/),
  url: z.string(), thumbnailUrl: z.string().nullable(), createdAt: z.string(),
});
export const maintenanceAttachmentParamsSchema = maintenanceRecordParamsSchema.extend({ attachmentId: z.string().min(1) });
export const maintenanceAttachmentListParamsSchema = maintenanceRecordParamsSchema; // alias para GET/POST B
```

`ownerId`, `entityType`, `entityId` y `storageKey` no se exponen.

## Detección de tipo: magic bytes propios (sin dependencia nueva)

`apps/api/src/lib/file-type.ts`:

```ts
export interface DetectedType { mimeType: AttachmentMimeType; extension: 'pdf' | 'jpg' | 'png' | 'webp' }
export function detectAttachmentType(data: Buffer): DetectedType | null
```

| Tipo | Firma |
|---|---|
| PDF | `25 50 44 46 2D` (`%PDF-`) en el offset 0 |
| JPEG | `FF D8 FF` |
| PNG | `89 50 4E 47 0D 0A 1A 0A` |
| WebP | `RIFF` (0–3) + `WEBP` (8–11) |

Además, si es imagen se llama a `assertDecodableImage` (`sharp(buf, { failOn: 'error' }).metadata()`) y, si falla, 415 (R7): así la miniatura nunca da 500 por un fichero con firma válida pero corrupto. El PDF no se parsea (no hay librería de PDF en la API hasta la fase 6).

**Descartado: `file-type`.** Detecta cientos de formatos y solo necesitamos 4 con firmas fijas y triviales; es ESM-only con varias dependencias transitivas (`strtok3`, `token-types`…), y añadirlo implica revisar el bundle de `tsup` y la imagen Docker. 15 líneas con tests unitarios por formato son más fáciles de auditar.

## Servicio y repositorio

```ts
createAttachmentsRepository(db) → {
  listByEntity(entityType, entityId), find(entityType, entityId, id),
  create(values): Row, delete(id),
  listByVehicle(vehicleId): Row[],   // join con maintenance_records (entity_type = 'maintenance')
}
createAttachmentsService({ repo, maintenance: MaintenanceRepository, vehicles: VehiclesRepository, storage })
  list(userId, vehicleId, recordId): Attachment[]
  upload(userId, vehicleId, recordId, file: { filename: string; data: Buffer }): Promise<Attachment>
  open(userId, vehicleId, recordId, attachmentId): { row, stream }
  thumbnail(userId, vehicleId, recordId, attachmentId): Promise<Buffer>
  remove(userId, vehicleId, recordId, attachmentId): Promise<void>
```

- **Propiedad:** `vehicles.findOwned(userId, id)` → `maintenance.find(vehicleId, recordId)` → `repo.find('maintenance', recordId, attachmentId)`; cada eslabón ausente es 404. La fila además se filtra por `ownerId = userId` (defensa en profundidad).
- **Subida:** comprobar propiedad → detectar tipo (415) → `sha256` con `node:crypto` → `storage.save('attachments', data, ext)` → `repo.create`. Si `repo.create` falla, se borra el fichero recién guardado.
- **Nombre original:** se toma de `file.filename`, se queda con el nombre base (quita rutas `/` y `\`), se recorta a 255 caracteres y, si queda vacío, `file.<ext>`. Solo se usa en `Content-Disposition`; nunca toca el disco.
- **Borrado del adjunto:** `repo.delete` y luego `storage.remove(storageKey)` (mismo orden que la foto del vehículo: si falla el `rm`, queda un huérfano en disco pero nunca una fila apuntando a nada).
- **Borrado del mantenimiento (R16):** el service lee las claves con `attachments.listByEntity('maintenance', record.id)`; `maintenanceRepo.delete(record)` borra en su transacción también las filas de `attachments`; después `storage.remove` de cada clave. `maintenanceService.remove` y su ruta pasan a `async`.
- **Borrado del vehículo (R17):** igual con `attachments.listByVehicle(id)`; `vehiclesRepo.delete(id)` pasa a ser una transacción que borra primero las filas de `attachments` de los mantenimientos del vehículo (subconsulta sobre `maintenance_records`) y luego el vehículo.

## Impacto en UI

Ninguno en esta feature. `url`/`thumbnailUrl` relativos, listos para `<img>`/`<a download>` en la feature 7 (mismo origen, cookie de sesión).

## Alternativas descartadas

- **`file-type`** para detectar el tipo (ver arriba).
- **Miniatura pregenerada al subir** (`thumbnailKey` + segundo fichero): obliga a una columna fuera del acceptance, a limpiar dos ficheros y a regenerar si cambia el tamaño. Al vuelo con caché `immutable` del navegador el coste es una decodificación por imagen y cliente; si se nota se cachea en disco más adelante.
- **FK `maintenance_record_id` en lugar de `entity_type`/`entity_id`**: daría cascada de BD, pero `docs/PLAN.md` fija el modelo polimórfico (repostajes y otros podrán tener adjuntos) y la cascada no borraría los ficheros de todos modos.
- **Validar con el `Content-Type` del multipart**: lo controla el cliente; el acceptance exige detección por contenido.

## Decisiones a validar (Gate 1)

1. Tipo no admitido o imagen corrupta → **415** (la foto del vehículo usa 400; aquí 415 deja al front distinguirlo del 400 de «falta el fichero»). Tamaño → **413** (el que ya emite `@fastify/multipart`).
2. Se añade **`GET B`** (listado), no citado literalmente en el acceptance, porque sin él no se puede consultar que un mantenimiento «admite varias» ni pintarlas en la feature 7.
3. Miniatura de un PDF → **404**, y `thumbnailUrl: null` en el DTO.
4. Borrar un **vehículo** también borra los adjuntos de sus mantenimientos (consecuencia del «borrar el mantenimiento borra sus adjuntos» al caer en cascada; sin esto quedarían filas y ficheros huérfanos).
5. Se guarda y se expone el **mime detectado**, no el declarado; el nombre original solo se usa para la descarga.
6. Descarga con `Content-Disposition: attachment` (no `inline`); ver el PDF en el navegador queda para la feature 7 si se pide.
7. Miniatura de 320 px de lado mayor, WebP.
8. Sin deduplicación por `sha256` ni límite de adjuntos por mantenimiento (no lo pide el acceptance).

## Riesgos

- **Huérfanos en disco** si `rm` falla tras borrar la fila, o al borrar un usuario (cascada de BD sin ficheros). Aceptado; un barrido de huérfanos encaja con el export/import de la fase 7.
- **EXIF de las fotos originales** (GPS): la descarga devuelve el original tal cual (lo pide el acceptance); la miniatura sí se recodifica sin metadatos.
- **Memoria:** el fichero se bufferiza entero (hasta `MAX_UPLOAD_MB`, 20 MB por defecto), igual que la foto del vehículo. Aceptable para uso self-hosted.
- **PDF con prefijo:** un PDF con basura antes de `%PDF-` (válido para algunos lectores) se rechaza con 415. Aceptado por simplicidad.

## Fuera de alcance

timeline de mantenimientos (feature 6), UI de facturas (feature 7), adjuntos en repostajes (fase 5), anexar facturas al informe (fase 6), export/import y limpieza de huérfanos (fase 7), visor `inline`.
