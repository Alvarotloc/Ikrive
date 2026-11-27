# Exploración: vehicle-documents-api — adjuntos y patrón CRUD

Informe de un agente `Explore` (solo lectura). Rutas relativas a la raíz del repo.

## 1. Subidas y adjuntos hoy

Solo hay dos tipos de fichero: **adjuntos de mantenimiento** y **fotos de vehículo**. Repostajes y gastos no tienen ficheros.

**Límite de tamaño (MAX_UPLOAD_MB)**
- `apps/api/src/config.ts:22`: `MAX_UPLOAD_MB`, 20 por defecto.
- `apps/api/src/app.ts:107`: un único ajuste global `multipart` con `limits: { fileSize: MAX_UPLOAD_MB*1024*1024, files: 1 }`. Un fichero por encima del límite devuelve 413 desde `@fastify/multipart`.
- El límite también se expone al cliente: `app.ts:207,229` y `packages/shared/src/schemas/common.ts:48` (`maxUploadMb`).
- `csv-import/routes.ts:55` tiene un límite propio, más pequeño.

**Recepción**
- `apps/api/src/lib/uploads.ts`: `receiveToBuffer(part)` lee el fichero entero a memoria antes de tocar disco. Los errores 4xx se propagan tal cual; una subida cortada se convierte en 400.
- Las rutas llaman a `request.file()` y lanzan 400 si falta (`attachments/routes.ts:66-69`, `vehicles/routes.ts:66-68`).

**Validación MIME (por contenido)**
- `packages/shared/src/domain/files.ts:57`: `detectAttachmentType(data)` mira los magic bytes y acepta PDF, JPEG, PNG y WebP.
- `packages/shared/src/enums.ts:70`: `ATTACHMENT_MIME_TYPES`.
- `packages/shared/src/enums.ts:74`: `ATTACHMENT_ENTITY_TYPES = ['maintenance']`.
- `apps/api/src/modules/attachments/service.ts:72-78`: un tipo desconocido da 415 (`UnsupportedMediaTypeError`). Las imágenes además tienen que decodificarse (`assertDecodableImage` en `lib/images.ts`).
- El nombre de fichero del cliente se limpia con `sanitizeFileName` (`service.ts:87`).
- Las fotos usan `detectPhotoFormat` y se recodifican a WebP (`toWebpPhoto`, `lib/images.ts:23`).

**Almacenamiento en disco**
- `apps/api/src/lib/storage.ts`: `createFileStorage(root)` ofrece `save(folder, buf, ext)` (devuelve la clave `<folder>/<uuid>.<ext>`), `read`, `exists` y `remove`. También bloquea claves que se salen de la raíz.
- Raíz: `${DATA_DIR}/uploads` (`app.ts:276` `uploadsPath`, `app.ts:113`).
- Carpetas: `attachments/<uuid>.<ext>` (`attachments/service.ts:24`) y `vehicles/<uuid>.webp` (`vehicles/service.ts:30`).

**Tabla de adjuntos**
- `packages/db/src/schema/attachments.ts`: polimórfica, `entityType` + `entityId` sin FK, así que la limpieza se hace en código.
- `ownerId` cae en cascada con el usuario. Otras columnas: `originalName`, `mimeType`, `size`, `sha256`, `storageKey` (única).
- Índice sobre `(entityType, entityId)`. Las filas son inmutables.
- Migración: `0003_attachments.sql`.

**Módulo de adjuntos**
- `apps/api/src/modules/attachments/{routes,service,repository}.ts`. Las rutas están fijadas a mantenimiento: `BASE = '/vehicles/:id/maintenance/:recordId/attachments'` (`routes.ts:16`), y el servicio fija `'maintenance'`, con las URLs construidas en `service.ts:31`.
- Endpoints: listar, POST de subida (201), GET del fichero (`?inline=1`), GET `/thumbnail` (WebP, solo imágenes) y DELETE (204).
- Cadena de propiedad vehículo → registro → adjunto, todo como 404 (`service.ts:45-57`).
- `repository.ts:40` `listByVehicle` solo une con `maintenance_records`.
- Zod compartido: `packages/shared/src/schemas/attachments.ts` (`attachmentSchema`, esquemas de params, `attachmentFileQuerySchema`).

**Servir ficheros**
- `attachments/routes.ts:78-95`: el tipo sale de la BD, más `content-length`, `contentDisposition` (`lib/http.ts`), caché inmutable, `nosniff` y la CSP de `userContentPolicy(mime)` (`routes.ts:36`).
- Foto: `vehicles/routes.ts:53-60`.

**Borrado de ficheros**
En todos los casos primero se borran las filas y después los ficheros.
- Adjunto suelto: `attachments/service.ts:116-120`.
- Registro de mantenimiento: `maintenance/service.ts:138-143` (`listByEntity('maintenance', id)` → borrado → `storage.remove`).
- Vehículo: `vehicles/service.ts:88-94`. Reúne `attachments.listByVehicle(id)` (solo el join de mantenimiento) y la foto, luego `repo.delete`, luego borra los ficheros. **Un tipo de entidad nuevo hay que añadirlo aquí.**
- Usuario: `admin-users/repository.ts:53-68` (`fileKeys` = fotos de vehículos + todos los adjuntos por `ownerId`) y `admin-users/service.ts:85-95` (borra cada fichero y registra los errores). Cualquier adjunto con `ownerId` queda cubierto automáticamente.

**Otros usos de adjuntos o de `entityType`**
- `data-export/repository.ts` y `data-export/service.ts:18-31`
- `data-import/service.ts:335-362` (`storage.save('attachments', …)`)
- `maintenance/repository.ts`, `vehicles/repository.ts`
- Modo local web: `apps/web/src/lib/data-source/local/{attachments,vehicles,data-export,sale-report}.ts`
- `packages/shared/src/domain/data-export-builder.ts`

Tests: `apps/api/test/attachments.test.ts`, `uploads.test.ts`, `file-type.test.ts`, `admin-users.test.ts:138-158,355`.

## 2. Último CRUD por vehículo: gastos

Hecho en dos PR: API en el merge `9a19b1d` (#92) y web en el merge `a1750c2` (#95).

- **Esquema:** `packages/db/src/schema/expenses.ts`. PK uuid de texto con `$defaultFn`, FK `vehicleId` con `onDelete: 'cascade'`, fecha como texto `YYYY-MM-DD`, columna enum de texto, `createdAt`/`updatedAt` como `timestamp_ms` e índice `expenses_vehicle_id_date_idx`. Se exporta desde `packages/db/src/schema/index.ts`.
- **Migraciones:** las genera drizzle-kit. Se ejecuta `pnpm db:generate` (`package.json:20` de la raíz → `drizzle-kit generate` en `packages/db`). Configuración en `packages/db/drizzle.config.ts` (sqlite, `casing: 'snake_case'`, salida `./migrations`).
  - Nombres `NNNN_snake_name.sql`, p. ej. `0013_expenses.sql`, con `meta/0013_snapshot.json` y una entrada en `meta/_journal.json`. La última es 0013, así que la siguiente es **0014**.
  - Se ejecutan al arrancar el servidor (copiadas a `dist/migrations`) y en la BD local web mediante `apps/web/src/lib/data-source/local/migrations.ts` (`import.meta.glob`). Ver `CONTRIBUTING.md:27-33`.
- **Rutas:** `apps/api/src/modules/expenses/routes.ts`. `app.addHook('preHandler', app.authenticate)`, rutas `/vehicles/:id/expenses[/:expenseId]`, GET/POST(201)/GET/PATCH/DELETE(204), con zod en params, body y respuesta.
- **Servicio:** `expenses/service.ts`. El control de propiedad es `requireVehicle`, que lanza `NotFoundError('Vehicle not found')` cuando `vehicles.findOwned(userId, vehicleId)` no encuentra nada; después `requireExpense` filtra con `repo.find(vehicleId, id)` (l.19-29). El mismo patrón está en `vehicles/service.ts:57-61`.
- **Repositorio:** `expenses/repository.ts`.
- **Cableado:** `apps/api/src/app.ts`, raíz de composición (imports, repo, servicio y `api.register(expensesRoutes, …)`).
- **Zod compartido:** `packages/shared/src/schemas/expenses.ts` (`create*`, `update*` = partial, `expenseSchema`, `expenseParamsSchema`). Usa `isoDateSchema` (de `schemas/vehicles`) y `optionalText` / `moneySchema` (de `schemas/common`). `idParamSchema` está en `common.ts:20`.
  - El enum `EXPENSE_CATEGORIES` está en `packages/shared/src/enums.ts`. El export se añade a `packages/shared/src/index.ts`. Test: `schemas/expenses.test.ts`.
- **Tests de la API:** directorio plano `apps/api/test/<recurso>.test.ts`, con `createTestApp` y `signUp` de `test/helpers.ts`. En `expenses.test.ts` las comprobaciones de 404 de otro usuario están en las líneas 164-202.

**Archivos que tocó el PR de la API de gastos**
- Módulo de la API y cableado:
  - `apps/api/src/app.ts`
  - `apps/api/src/modules/expenses/{repository,routes,service}.ts`
  - `apps/api/test/expenses.test.ts`
- Export/import de datos:
  - `apps/api/src/modules/data-export/repository.ts`
  - `apps/api/src/modules/data-import/{repository,service}.ts`
  - `apps/api/test/data-export.test.ts`, `apps/api/test/data-import.test.ts`
- Paquete de BD:
  - `packages/db/src/schema/{expenses,index}.ts`
  - `packages/db/migrations/0013_expenses.sql`, `meta/0013_snapshot.json`, `meta/_journal.json`
- Paquete compartido:
  - `packages/shared/src/{enums,index}.ts`
  - `packages/shared/src/schemas/{expenses,expenses.test}.ts`
  - `packages/shared/src/schemas/data-export.ts` (+ test), `packages/shared/src/schemas/data-import.ts`
  - `packages/shared/src/domain/data-export-builder.ts` (+ test)
- Data source web (modo local):
  - `apps/web/src/lib/data-source/{types,http}.ts`
  - `apps/web/src/lib/data-source/local/{expenses,index,data-export}.ts` y sus tests (`local-data-source.test.ts`, `local-export.test.ts`, `database.test.ts`)
  - `apps/web/src/features/data-portability/data-section.tsx`
- i18n: `apps/web/src/i18n/locales/{en,es}.json`
- Artefactos SDD:
  - `specs/<feature>/{requirements,design,tasks}.md`
  - `progress/*.md`
  - `feature_list.json`
- Propios de gastos, no necesarios para documentos: los archivos de csv-import y de estadísticas.

**Archivos que tocó el PR web de gastos**
- `apps/web/src/features/expenses/{expense-form,expenses-section,form,expenses,queries}.tsx/ts` y sus tests
- `apps/web/src/lib/query-keys.ts`
- `apps/web/src/routes/_app/vehicles/$vehicleId/index.tsx`
- `apps/web/src/features/mobile/local-mode.test.tsx`
- `apps/web/src/i18n/locales.test.ts`, `apps/web/src/i18n/locales/{en,es}.json`
- `e2e/tests/expenses.spec.ts`

**Archivos adicionales para documentos (según el código y los criterios de aceptación)**
- Adjuntos:
  - `ATTACHMENT_ENTITY_TYPES` en `enums.ts:74`
  - el módulo de adjuntos, que hoy fija mantenimiento
  - `attachments/repository.ts:40` `listByVehicle`
  - `vehicles/service.ts:88-94`
  - `local/attachments.ts` en la web
- Notificaciones:
  - `NOTIFICATION_TYPES` en `enums.ts:63`
  - `apps/api/src/jobs/reminders.job.ts`
  - `notifications.dedupeKey`, índice único (`packages/db/src/schema/notifications.ts:26,34`)
- Calendario: `apps/api/src/modules/calendar` (los criterios de la feature web piden «añadir al calendario»).

## 3. Nociones existentes de «documentos» y «caducidad»

- No existe todavía tabla, módulo ni esquema de documentos, ni directorio de spec (`specs/` no tiene ningún `vehicle-documents-*`).
- `docs/PLAN.md:250-258`, fase 9 «adopción y gastos reales». Línea 255: «**Documentos con caducidad:** póliza, permiso de circulación, ITV y otros, con adjunto, fecha de vencimiento y aviso por los canales existentes. Features: `vehicle-documents-api` y `vehicle-documents-web`.» Línea 257: el modo local tiene que soportar documentos, y las tablas nuevas entran en el zip de export/import.
- `feature_list.json:1498-1510`, `vehicle-documents-api`. Criterios de aceptación:
  - CRUD con adjunto validado por MIME y `MAX_UPLOAD_MB`; el documento de otro usuario devuelve 404
  - una única notificación in-app dentro del plazo de aviso, enviada por los canales del usuario
  - renovar la fecha de vencimiento permite un aviso nuevo
  - el modo local genera los mismos avisos con las mismas funciones puras
  - el zip de export/import conserva documentos y adjuntos, y los zips antiguos se siguen importando
  - `pnpm harness --full` en verde
- `feature_list.json:1515-1527`, `vehicle-documents-web`. Criterios: estado vigente / próximo a caducar / caducado, subida de adjunto también con la cámara, «añadir al calendario» e i18n en es y en.
- `feature_list.json:1617`: una nota de que #89 (vehicle-documents-api) añade una migración, a propósito del problema de caché de Vitest con `import.meta.glob` (ya arreglado, estado done).
- El código de «caducidad» que existe solo cubre los enlaces compartidos de informes y las sesiones de auth:
  - `packages/shared/src/domain/report-shares.ts:4-12` (estado a partir de `expiresAt`/`revokedAt`)
  - `REPORT_SHARE_STATUSES` en `enums.ts:78`
  - `packages/db/src/schema/report-shares.ts:28`
  - `packages/db/src/schema/auth.ts`
- «Vencimiento» solo aparece además en las reglas de mantenimiento (`PLAN.md:134,167`, la próxima fecha y las estimaciones por km del job de recordatorios). La ITV solo sale como ejemplo de mantenimiento (`PLAN.md:10`).
