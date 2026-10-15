# Implementación — maintenance-attachments-api

Rama `feat/maintenance-attachments-api`. Sin commits (los hace el leader tras Gate 2). Tasks T1–T17 marcadas en `specs/maintenance-attachments-api/tasks.md`. Sin cambios de UI, así que no hay capturas.

## Cambios por archivo

### `packages/shared`
- `src/enums.ts`: `ATTACHMENT_MIME_TYPES` (`application/pdf`, `image/jpeg`, `image/png`, `image/webp`) y `ATTACHMENT_ENTITY_TYPES` (`maintenance`), con sus tipos.
- `src/schemas/attachments.ts` (nuevo): `attachmentSchema` y el tipo `Attachment`, más `maintenanceAttachmentListParamsSchema` (alias de `maintenanceRecordParamsSchema`) y `maintenanceAttachmentParamsSchema` (añade `attachmentId`).
- `src/index.ts`: reexporta `schemas/attachments`.

### `apps/api` — BD
- `src/db/schema/attachments.ts` (nuevo): tabla `attachments` según el design (FK `ownerId` → `user` en cascada, `storageKey` único, índice `attachments_entity_idx (entity_type, entity_id)`, sin `updatedAt`).
- `src/db/schema/index.ts`: reexporta la tabla.
- `src/db/migrations/0003_attachments.sql` + `meta/0003_snapshot.json` + `meta/_journal.json`: generados con `pnpm db:generate --name attachments`.

### `apps/api` — lib
- `src/lib/file-type.ts` (nuevo): `detectAttachmentType(buffer)` por magic bytes (`%PDF-`, `FF D8 FF`, firma PNG de 8 bytes, `RIFF`…`WEBP`).
- `src/lib/images.ts`: `assertDecodableImage(buffer)` y `toWebpThumbnail(buffer, size = 320)` (`rotate()`, `fit: 'inside'`, sin agrandar, WebP q70).
- `src/lib/errors.ts`: `UnsupportedMediaTypeError` (415).

### `apps/api` — módulo `attachments` (nuevo)
- `repository.ts`: `listByEntity` (por `createdAt` asc y `rowid` para desempatar en el mismo ms), `find`, `create`, `delete`, `listByVehicle` (join con `maintenance_records`).
- `service.ts`: cadena de propiedad vehículo → mantenimiento → adjunto (404 en cada eslabón, y la fila también se comprueba con `ownerId`); subida (detección → 415, decodificación de imágenes → 415, sha256, `storage.save('attachments', …)`, el fichero se borra si falla el insert); nombre original saneado (`sanitizeFileName`: nombre base, 255 caracteres como máximo, `file.<ext>` si queda vacío); `open`, `thumbnail` (404 para PDF) y `remove` (primero la fila, después el fichero); DTO con `url` y `thumbnailUrl`.
- `routes.ts`: los cinco endpoints bajo `/vehicles/:id/maintenance/:recordId/attachments`; 400 si no hay fichero; la descarga lleva `Content-Type`, `Content-Length`, `Content-Disposition` (`contentDisposition()`: alternativa ASCII con `_` y `filename*=UTF-8''…` según RFC 5987, que codifica también `'()*`) y `Cache-Control: private, max-age=31536000, immutable`; la miniatura lleva `image/webp` y la misma caché.

### `apps/api` — cascadas y cableado
- `modules/maintenance/repository.ts`: `delete` borra en su transacción las filas de `attachments` del mantenimiento.
- `modules/maintenance/service.ts`: nuevas dependencias `attachments` y `storage`; `remove` pasa a ser `async`, lee las claves antes de borrar y elimina los ficheros después.
- `modules/maintenance/routes.ts`: hace `await service.remove(...)`.
- `modules/vehicles/repository.ts`: `delete` es ahora una transacción que borra primero los adjuntos de los mantenimientos del vehículo (subconsulta `inArray` sobre `maintenance_records`) y después el vehículo.
- `modules/vehicles/service.ts`: nueva dependencia `attachments`; `remove` lee `listByVehicle` antes de borrar y elimina los ficheros después.
- `app.ts`: crea `attachmentsRepo` y `maintenanceRepo` como variables y los inyecta en los servicios de vehículos, mantenimientos y adjuntos; registra `attachmentsRoutes`.

### Tests
- `apps/api/test/file-type.test.ts` (nuevo): 2 tests unitarios.
- `apps/api/test/attachments.test.ts` (nuevo): 13 tests de integración.

## Trazabilidad

| R | Archivo › test |
|---|---|
| R1 | `apps/api/test/attachments.test.ts` › `uploads several invoices to a maintenance record` (la migración se aplica en `createTestApp`), `deletes attachments with their maintenance record` (filas consultadas con `db`) |
| R2 | `attachments.test.ts` › `uploads several invoices to a maintenance record` |
| R3 | `attachments.test.ts` › `uploads several invoices to a maintenance record` |
| R4 | `attachments.test.ts` › `uploads several invoices to a maintenance record` |
| R5 | `file-type.test.ts` › `detects PDF, JPEG, PNG and WebP by their signature`; `attachments.test.ts` › `detects the type by content` |
| R6 | `file-type.test.ts` › `returns null for other contents`; `attachments.test.ts` › `rejects unsupported files` |
| R7 | `attachments.test.ts` › `rejects corrupt images` |
| R8 | `attachments.test.ts` › `rejects files larger than MAX_UPLOAD_MB` |
| R9 | `attachments.test.ts` › `requires a file` |
| R10 | `attachments.test.ts` › `stores files under uploads/attachments with a random name` |
| R11 | `attachments.test.ts` › `downloads the original with its name and mime` |
| R12 | `attachments.test.ts` › `serves a WebP thumbnail for images only` |
| R13 | `attachments.test.ts` › `serves a WebP thumbnail for images only` |
| R14 | `attachments.test.ts` › `uploads several invoices to a maintenance record`, `serves a WebP thumbnail for images only` |
| R15 | `attachments.test.ts` › `deletes an attachment and its file` |
| R16 | `attachments.test.ts` › `deletes attachments with their maintenance record` |
| R17 | `attachments.test.ts` › `deletes attachments with their vehicle` |
| R18 | `attachments.test.ts` › `hides other users' attachments` |
| R19 | `attachments.test.ts` › `hides other users' attachments` |
| R20 | `attachments.test.ts` › `hides other users' attachments` |

## `pnpm harness --full`

```
[OK]    8 features: 4 done, 3 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #5 maintenance-attachments-api (in_progress)
[OK]    Rama actual: feat/maintenance-attachments-api
[OK]    pnpm lint        (biome: 115 files, no fixes)
[OK]    pnpm typecheck   (shared, api, web)
[OK]    pnpm test        (shared 11/11, api 40/40 en 7 ficheros, web 15/15)
[OK]    Arnés en verde.
```

## Desviaciones del spec

1. **`assertDecodableImage` usa `sharp(...).stats()` en lugar de `.metadata()`.** `metadata()` solo lee la cabecera, así que una imagen con cabecera válida y datos corruptos lo pasaría y luego la miniatura daría 500, que es justo lo que el design quiere evitar («así la miniatura nunca da 500»). `stats()` decodifica la imagen entera. El contrato no cambia (415 si no decodifica). Coste: una decodificación completa por imagen subida.
2. **`listByEntity` desempata por `rowid`** además de `createdAt` asc, para que dos subidas en el mismo milisegundo salgan en orden de inserción. No cambia el contrato.
3. **`requireAttachment` comprueba `ownerId` en el servicio** (`row.ownerId !== userId` → 404) en vez de pasarlo como parámetro a `repo.find`, para respetar la firma `find(entityType, entityId, id)` del design. Es la defensa en profundidad que pide el design.
4. **Funciones auxiliares exportadas** que no aparecen en el design: `sanitizeFileName` (service) y `contentDisposition` (routes). Son detalles de implementación de reglas que el design sí describe.

Nada fuera del alcance de `design.md`: no se ha tocado la web, ni `lib/storage.ts`, ni las dependencias.
