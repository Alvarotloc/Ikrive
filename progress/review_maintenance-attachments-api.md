# Review — #5 maintenance-attachments-api

**Veredicto:** APPROVED

Revisado sobre `feat/maintenance-attachments-api`: `git diff main...HEAD` (solo el spec y `feature_list.json`) + `git diff` + ficheros sin trackear (módulo `attachments`, `file-type.ts`, esquema, migración 0003, esquemas shared, dos ficheros de test). `pnpm harness --full` ejecutado por el reviewer: verde (shared 11/11, api 40/40, web 15/15).

## Trazabilidad requirements ↔ tests
- R1: [x] `apps/api/test/attachments.test.ts` › `uploads several invoices…` + `rejects unsupported files` / `deletes attachments with their maintenance record` (la migración 0003 corre en `createTestApp`; las filas de `attachments` se consultan vía `db`). Migración `0003_attachments.sql` con FK `owner_id` en cascada, `storage_key` único e índice `(entity_type, entity_id)`.
- R2: [x] `attachments.test.ts:99` › `uploads several invoices to a maintenance record` (201, `attachmentSchema.parse`, `originalName`, `mimeType`, `size` = longitud del buffer, `sha256` calculado en el test).
- R3: [x] mismo test: tras la segunda subida el listado contiene ambos ids.
- R4: [x] mismo test: `toEqual([firstBody.id, secondBody.id])` (orden de subida; `rowid` desempata).
- R5: [x] `file-type.test.ts:11` (firma de los 4 formatos) + `attachments.test.ts:150` › `detects the type by content` (PNG declarado `application/pdf`/`factura.pdf` → `image/png` y fichero `.png` en disco).
- R6: [x] `file-type.test.ts:21` (GIF, texto, vacío, `%PDF` sin guion, RIFF/WAVE → null) + `attachments.test.ts:158` (415 problem+json, 0 filas, 0 ficheros).
- R7: [x] `attachments.test.ts:171` › `rejects corrupt images` (firma PNG + basura → 415, 0 filas, 0 ficheros).
- R8: [x] `attachments.test.ts:185` (`MAX_UPLOAD_MB: '1'`, 1 MiB + 1 B → 413 problem+json, directorio vacío, 0 filas, listado vacío).
- R9: [x] `attachments.test.ts:180` › `requires a file` (multipart con solo un campo de texto → 400 problem+json).
- R10: [x] `attachments.test.ts:136` (ficheros en `<dataDir>/uploads/attachments`, patrón `<uuid>.(pdf|png)`, sin rastro del nombre original).
- R11: [x] `attachments.test.ts:196` (bytes idénticos, `content-type`, `content-length`, `content-disposition` exacto con fallback ASCII y `filename*=UTF-8''…%C3%B1.pdf`, `cache-control`).
- R12: [x] `attachments.test.ts:212` (PNG 1000×500 → 200 `image/webp`, `metadata.format === 'webp'`, lado mayor 320).
- R13: [x] mismo test: miniatura de PDF → 404 problem+json.
- R14: [x] `uploads several invoices…` (`url`, `thumbnailUrl` exacto para PNG y `null` para PDF) + `serves a WebP thumbnail…`.
- R15: [x] `attachments.test.ts:229` (204, fuera del listado, queda solo el `.pdf` en disco, descarga posterior 404).
- R16: [x] `attachments.test.ts:243` (borrar el mantenimiento deja en BD solo el adjunto del otro mantenimiento y 1 fichero en disco).
- R17: [x] `attachments.test.ts:267` (borrar el vehículo elimina los adjuntos de sus dos mantenimientos; se conserva el del otro vehículo, 1 fichero).
- R18: [x] `attachments.test.ts:293` (usuario ajeno → 404 problem+json en los cinco endpoints).
- R19: [x] mismo test: `recordId` de otro vehículo propio → 404 en los cinco endpoints.
- R20: [x] mismo test: `attachmentId` de otro mantenimiento del mismo vehículo → 404 en descarga, miniatura y borrado; el original sigue descargable e intacto.

## Tasks
- T1..T17: [x]

## Checkpoints
- C1: [x] `pnpm harness` OK; una sola feature activa (#5 `in_progress`); rama `feat/maintenance-attachments-api`.
- C2: [x] Spec completo, EARS con un `DEBE` por requirement y tabla acceptance → R; tasks `[x]`; cada R con test leído.
- C3: [x] El diff coincide con la tabla de archivos de `design.md` (shared, schema + migración, `lib/{file-type,images,errors}`, módulo `attachments`, cascadas en maintenance/vehicles, `app.ts`, tests). Sin web, sin dependencias nuevas, sin refactors ajenos.
- C4: [x] Módulo `attachments/{routes,service,repository}.ts` cableado en `app.ts`; rutas validan params con `maintenanceAttachment*ParamsSchema` de `@ikrive/shared`; propiedad vehículo → mantenimiento → adjunto (+ `ownerId`) con 404; errores `AppError` (`UnsupportedMediaTypeError` 415, `NotFoundError`, `BadRequestError`); migración generada con drizzle-kit (SQL + snapshot + journal). Web no aplica.
- C5: [x] Sin `any`/`@ts-ignore`/`console.log`; `createdAt` como ISO timestamp (no es fecha sin hora); ficheros con nombre `randomUUID()` vía `lib/storage.ts` y servidos solo tras la cadena de propiedad.
- C6: [x] `pnpm harness --full` en verde; tests con SQLite en memoria y fichero real en disco, afirman estado, cabeceras, cuerpo, filas y ficheros. Sin UI, sin capturas.
- C7: [x] `progress/impl_maintenance-attachments-api.md` con archivos, mapa R → test, salida de la verificación y desviaciones; `progress/current.md` actualizado.

## Hallazgos
Ninguno bloqueante. Puntos de seguridad pedidos, verificados:
- **Detección por contenido:** `detectAttachmentType` usa solo los bytes; el `Content-Type` y el nombre declarados se ignoran (test con PNG declarado como PDF). Las imágenes además se decodifican enteras (`sharp(...).stats()` con `failOn: 'error'`). He comprobado aparte que JPEG, PNG y WebP truncados al 60 % se rechazan en la subida, y que el mismo buffer también falla en `toWebpThumbnail`, así que el criterio de subida y el de la miniatura coinciden (no queda una imagen aceptada cuya miniatura dé 500 por truncamiento).
- **Nombres aleatorios:** la clave es `attachments/<uuid>.<ext detectada>`; el nombre original nunca toca el disco y `pathOf` impide salir de la raíz.
- **Content-Disposition:** el fallback sustituye todo lo que no es ASCII imprimible, `"` y `\` (no se puede inyectar CR/LF ni romper la cadena entre comillas); `filename*` usa `encodeURIComponent` más `'()*`. Siempre `attachment`. Helmet pone `nosniff`.
- **Autorización:** los cinco endpoints pasan por `app.authenticate` (hook `preHandler`) y por `requireRecord`/`requireAttachment`; `repo.find` filtra por `entityType` + `entityId` + `id` y el servicio vuelve a comprobar `ownerId`.
- **Nada en disco en los errores:** 415 (tipo y decodificación) y 404 se lanzan antes de `storage.save`; 413 salta en `file.toBuffer()` antes de llamar al servicio; si falla `repo.create`, se borra el fichero guardado. Los tests de 415 y 413 comprueban que el directorio está vacío.

## Avisos para el humano (no bloquean)
- `apps/api/src/modules/attachments/routes.ts:52` — `request.file()` acepta el primer fichero sea cual sea su campo, no solo `file`. Es el mismo comportamiento que la foto del vehículo (`vehicles/routes.ts:65`) y ningún requirement lo exige.
- `routes.ts:55` — la subida se bufferiza entera (hasta `MAX_UPLOAD_MB`) antes de la comprobación de propiedad, así que un usuario autenticado sin acceso al vehículo recibe el 404 después de enviar todo el fichero. Es aceptable en self-hosted (el design lo asume en Riesgos).
- `service.ts:112` / `routes.ts:75` — si la fila existe pero falta el fichero en disco (borrado a mano, restauración parcial), el stream falla en la descarga o en la miniatura y el cliente recibe un error 500 o una respuesta cortada, no un 404. Fuera del alcance del spec; tiene sentido revisarlo junto al barrido de huérfanos de la fase 7.
- `vehicles/service.ts:92-93` — si `storage.remove(vehicle.photo)` lanzara un error distinto de ENOENT, los ficheros de los adjuntos se quedarían sin borrar (las filas ya se han borrado). Es improbable (`rm` con `force: true`) y encaja con los huérfanos que el design ya acepta.
- `assertDecodableImage` usa `stats()` en lugar de `metadata()`. Es una desviación documentada en `impl_*.md` y hace la comprobación más estricta, sin cambiar el contrato.
- `docs/PLAN.md:40` sigue con la fase 3 como «Siguiente»; el leader debería ponerla en curso, aunque esta feature no la cierra.

## Cambios requeridos
Ninguno.
