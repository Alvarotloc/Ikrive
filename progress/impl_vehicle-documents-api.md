# Implementación — vehicle-documents-api (#89)

Rama `feat/vehicle-documents-api`. Tasks T1–T28 marcadas en `specs/vehicle-documents-api/tasks.md`. Sin commits.

## Cambios por archivo

### packages/shared
- `src/enums.ts`: `DOCUMENT_TYPES`, `DOCUMENT_STATUSES` (tipos `VehicleDocumentType`, `DocumentStatus`), `document_expiring`/`document_expired` en `NOTIFICATION_TYPES`, `document` en `ATTACHMENT_ENTITY_TYPES`.
- `src/schemas/schedules.ts`: exporta `warnDaysSchema`.
- `src/schemas/documents.ts` (nuevo) + `.test.ts`: `createVehicleDocumentSchema` (defaults `expiryDate: null`, `warnDays: 30`), `updateVehicleDocumentSchema` (sin defaults), `vehicleDocumentSchema`, `vehicleDocumentParamsSchema` y tipos.
- `src/domain/documents.ts` (nuevo) + `.test.ts`: `documentStatus`, `documentDedupeKey`, `documentReminderNotification` (cuerpo con `vehicleName`, compartido con los recordatorios de mantenimiento).
- `src/domain/reminders.ts`: exporta `vehicleName` (Gate 2) para reutilizarlo en `documentReminderNotification`; sin cambio de comportamiento.
- `src/schemas/attachments.ts`: `documentAttachmentListParamsSchema`, `documentAttachmentParamsSchema`.
- `src/schemas/data-export.ts`: `documentExportSchema` (sin `status`), `vehicleExportSchema.documents` con `.default([])`, `seen.documents` y `checkAttachments` común (ids de adjunto únicos en todo el documento y `path` generado) para registros y documentos; tipo `DataExportDocument`.
- `src/domain/data-export-builder.ts`: `DataExportDocumentRow`, `DataExportAttachmentRow.entityType`, `DataExportInputRows.documents`; adjuntos agrupados por `entityType:entityId`.
- `src/schemas/data-import.ts`: `documents` en `dataImportSummarySchema`.
- `src/index.ts`: exporta los dos módulos nuevos.
- Tests: `schemas/data-export.test.ts` (fixture con documento + 3 tests), `domain/data-export-builder.test.ts` (fixture con documentos + test).

### packages/db
- `src/schema/documents.ts` (nuevo): tabla `vehicle_documents` (FK `onDelete: 'cascade'`, índice `vehicle_documents_vehicle_id_idx`); reexportada en `schema/index.ts`.
- `migrations/0014_vehicle_documents.sql`, `meta/0014_snapshot.json`, `meta/_journal.json`: generados con `pnpm db:generate --name vehicle_documents` (solo `CREATE TABLE` + índice).

### apps/api
- `src/modules/documents/{repository,service,routes}.ts` (nuevo): CRUD; orden `expiry_date IS NULL`, `expiryDate`, `createdAt`, `rowid`; `status` con `todayIn(settings.timezone)`; `remove` borra filas de adjuntos en transacción y ficheros después; `listForActiveVehicles` (vehículo y usuario activos, `expiry_date IS NOT NULL`).
- `src/modules/attachments/service.ts`: `AttachmentParent` y firmas `(userId, parent, …)`; `requireParent` con «Maintenance record not found» / «Document not found»; URL `/api/vehicles/:v/{maintenance|documents}/:entityId/attachments/:id`.
- `src/modules/attachments/routes.ts`: opción `entityType` del plugin; tabla `PARENTS` con ruta base y params de cada padre. Mismos handlers, cabeceras y CSP.
- `src/modules/attachments/repository.ts`: `listByVehicle` incluye adjuntos de documentos.
- `src/modules/vehicles/{repository,service}.ts`: el borrado del vehículo borra también las filas de adjuntos de sus documentos (los ficheros ya salían de `listByVehicle`).
- `src/app.ts`: repo/servicio/rutas de documentos; `attachmentsRoutes` registrado dos veces (`maintenance` y `document`); `documents` en las deps del servicio de adjuntos.
- `src/jobs/reminders.job.ts`: helper `atReminderTime` para reglas y documentos; borradores de `documentReminderNotification` en el mismo `createMany` + `dispatch`; `evaluated` = reglas + documentos con fecha. La ventana de lecturas solo se calcula si hay reglas.
- `src/modules/notification-channels/messages.ts` + `.test.ts`: etiquetas es/en.
- `src/modules/data-export/repository.ts`: query de documentos y adjuntos `maintenance` o `document` del dueño.
- `src/modules/data-import/{service,repository}.ts`: `referencedFiles` recorre `documents[].attachments`; `plan.documents` con ids nuevos; `addAttachments(entityType, …)` común; `ImportPlan.documents` insertado antes que los adjuntos.
- Tests: `test/documents.test.ts` (nuevo), `test/reminders.test.ts`, `test/data-export.test.ts`, `test/data-import.test.ts`.

### apps/web
- `src/lib/data-source/types.ts`, `http.ts`: grupos `documents` y `documentAttachments`.
- `src/lib/data-source/local/documents.ts` (nuevo): CRUD local (copia de `expenses.ts`), borrado en transacción con adjuntos y ficheros después.
- `src/lib/data-source/local/attachments.ts`: `AttachmentParent`, `requireParent`, `requireAttachment(db, parent, id)`, `deleteAttachmentsOf(tx, entityType, ids)`, `attachmentsOf(entityType)` → `localAttachments` y `localDocumentAttachments`.
- `src/lib/data-source/local/files.ts`: `localAttachmentUrl(vehicleId, entityType, entityId, attachmentId)`, `LocalUrl` con `entityType`/`entityId`, `parseLocalUrl` acepta `maintenance|documents`.
- `local/files-get.ts`, `local/maintenance.ts`, `local/vehicles.ts`, `local/index.ts`: adaptados; el borrado de vehículo local incluye adjuntos de documentos.
- `local/notifications.ts`: `documentReminders` dentro del mismo `isReminderTime`.
- `local/data-export.ts`: query de documentos y adjuntos de documentos.
- `features/data-portability/data-section.tsx`: `'documents'` tras `expenses` en `SUMMARY_KEYS`.
- `i18n/locales/{es,en}.json`: `notifications.types.document_expiring/expired` y `dataPortability.summary.documents`.
- Tests: `local/database.test.ts`, `local-data-source.test.ts`, `local-files.test.ts`, `local-notifications.test.ts`, `local-export.test.ts`, `data-section.test.tsx`.

## Trazabilidad

| R | Test(s) |
|---|---|
| R1 | `apps/api/test/documents.test.ts` › `creates, lists, reads, updates and deletes a document`; `packages/shared/src/schemas/documents.test.ts` › `defaults warnDays to 30 and expiryDate to null`; `apps/web/src/lib/data-source/local/database.test.ts` (crea `vehicle_documents`) |
| R2 | `documents.test.ts` › `creates, lists, reads, updates and deletes a document` (orden con fecha, misma fecha y sin fecha) |
| R3 | `documents.test.ts` › `creates, lists, reads, updates and deletes a document` |
| R4 | `documents.test.ts` › `creates, lists, reads, updates and deletes a document`, `renews a document by patching its expiry date`; `schemas/documents.test.ts` › `keeps a partial update partial` |
| R5 | `documents.test.ts` › `creates, lists, reads, updates and deletes a document`, `deletes the attachments with their document` |
| R6 | `documents.test.ts` › `rejects invalid payloads without writing`; `schemas/documents.test.ts` › `rejects an unknown type, an empty or long title, a bad date, out of range warnDays and long notes` |
| R7 | `documents.test.ts` › `hides other users' vehicles and documents`, `hides attachments of other documents, records and users` |
| R8 | `documents.test.ts` › `hides other users' vehicles and documents`, `hides attachments of other documents, records and users` |
| R9 | `packages/shared/src/domain/documents.test.ts` › `computes valid, expiring and expired at the boundaries`; `documents.test.ts` › `computes the status in the user's time zone`, `renews a document by patching its expiry date` |
| R10 | `documents.test.ts` › `deletes documents and their files with the vehicle`; `local-data-source.test.ts` › `archives and deletes a vehicle cascading its data` |
| R11 | `documents.test.ts` › `uploads several files to a document` |
| R12 | `documents.test.ts` › `uploads several files to a document` |
| R13 | `documents.test.ts` › `downloads and serves inline a document attachment with the user content policy`, `serves a WebP thumbnail for document images only` |
| R14 | `documents.test.ts` › `deletes a document attachment and its file` |
| R15 | `documents.test.ts` › `rejects unsupported and corrupt files with 415 and stores nothing` |
| R16 | `documents.test.ts` › `rejects files larger than MAX_UPLOAD_MB` |
| R17 | `documents.test.ts` › `hides attachments of other documents, records and users` |
| R18 | `apps/api/test/attachments.test.ts` (19 tests, sin cambios); `documents.test.ts` › `hides attachments of other documents, records and users` (rutas de mantenimiento) ; `local-files.test.ts` (tests de mantenimiento sin cambios de aserciones) |
| R19 | `apps/api/test/reminders.test.ts` › `notifies expiring and expired documents once`, `waits for the owner's reminder hour in their time zone`; `domain/documents.test.ts` › `builds an expiring and an expired reminder` |
| R20 | `reminders.test.ts` › `notifies expiring and expired documents once`, `sends document notifications through the owner's channels` |
| R21 | `reminders.test.ts` › `sends document notifications through the owner's channels`; `messages.test.ts` › `labels document notifications in each locale` |
| R22 | `reminders.test.ts` › `notifies again after renewing a document`; `domain/documents.test.ts` › `document dedupe key changes with status and expiry date` |
| R23 | `reminders.test.ts` › `skips valid documents, sold or archived vehicles and disabled owners`; `domain/documents.test.ts` › `returns no reminder for a valid or undated document` |
| R24 | `reminders.test.ts` › `keeps the notifications of a deleted document` |
| R25 | `local-data-source.test.ts` › `creates, lists, edits and deletes documents like the API`, `rejects invalid and unknown documents without writing` |
| R26 | `local-files.test.ts` › `uploads, lists, serves and deletes document attachments`, `rejects unsupported or oversized document attachments and writes nothing`, `hides attachments of other documents` |
| R27 | `local-notifications.test.ts` › `stores document reminders with the shared drafts once` |
| R28 | `data-export.test.ts` › `exports every vehicle with its records`, `includes the attachment files`; `local-export.test.ts` › `exports documents and their files`; `data-export-builder.test.ts` › `groups documents and their files by vehicle` |
| R29 | `data-import.test.ts` › `imports the documents of an export with their files` |
| R30 | `data-import.test.ts` › `imports a v1 zip without documents`; `schemas/data-export.test.ts` › `defaults documents to an empty array in a v1 document` |
| R31 | `data-import.test.ts` › `rejects duplicate document ids`, `rejects an invalid document attachment`; `schemas/data-export.test.ts` › `rejects duplicate document ids`, `rejects an invalid document attachment path` |
| R32 | `data-section.test.tsx` › `shows the imported documents`, `imports the zip and shows the summary` |
| R33 | `messages.test.ts` › `labels document notifications in each locale`; `apps/web/src/i18n/locales.test.ts` (en verde) |

## `pnpm harness --full`

```
[OK]    97 features: 92 done, 4 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #89 vehicle-documents-api (in_progress)
[OK]    Rama actual: feat/vehicle-documents-api
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test      (shared 324, db 3, api 426, web 811, mobile 31)
[OK]    Arnés en verde.
```

## Desviaciones y notas

- **`maintenance/service.ts` sin cambios** (T8 decía «adaptar»): solo usa el repositorio de adjuntos (`listByEntity('maintenance', …)`), cuya firma no cambia; no hacía falta tocarlo.
- **T16 adelantada**: `TEXTS.types` es `Record<NotificationType, string>`, así que la API no compilaba tras T1 sin las etiquetas. Se hizo junto a T5.
- **Fallo latente corregido en `runReminders`**: con documentos pero sin reglas, el cálculo de `earliestToday` partía de `''` y `addDays` lanzaba `RangeError`. Ahora la carga de lecturas solo se hace si hay reglas. Lo cubren los tests de documentos de `reminders.test.ts`.
- **Tipo `VehicleDocumentType`** (no `DocumentType`) para no ocultar la interfaz global `DocumentType` del DOM. El design no fijaba el nombre.
- **Test extra** `data-import.test.ts` › `rejects an invalid document attachment` (ruta y id duplicado con un adjunto de mantenimiento), para cubrir R31 de punta a punta en el import y no solo en el esquema.
- **`seedUser` de `data-import.test.ts` sin documentos**: añadirlos cambiaba los contadores y ficheros de muchos tests existentes; los tests de documentos los siembran ellos mismos. El resumen de `imports an export` gana `documents: 0` y `snapshot()` cuenta `vehicle_documents`.
- **Sin capturas**: el único cambio visible es un contador más («Documentos») en el resumen del import, sin componentes nuevos (la UI es #90). Lo cubre el test de componente `shows the imported documents`; no se arrancó `pnpm dev`.
- **Downgrade** (zip nuevo en servidor antiguo pierde documentos): sin cambio de código, como indica el design; queda para las notas de versión.

### Cambios de Gate 2

- `packages/shared/src/domain/reminders.ts`: `vehicleName` pasa a `export` (con JSDoc); `packages/shared/src/domain/documents.ts` lo importa y lo usa como `body` en vez de duplicar `name ?? `${make} ${model}``. Los tests existentes (`builds an expiring and an expired reminder`, `notifies expiring and expired documents once` con vehículo con y sin nombre) cubren que el comportamiento no cambia.
- `apps/api/test/reminders.test.ts` › `documents` › `waits for the owner's reminder hour in their time zone` (R19): dueño en `America/New_York` con `reminderHour: 9` y documento `expiring`; a las 08:59 locales (12:59 UTC) el job no evalúa ni crea nada, a las 09:00 (13:00 UTC) crea la notificación `document_expiring`.
- `pnpm harness --full` en verde: shared 324, db 3, api 426, web 811, mobile 31.
