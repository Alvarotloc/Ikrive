# Tasks — vehicle-documents-api

## Modelo y CRUD

- [x] T1 — En `packages/shared/src/enums.ts`: `DOCUMENT_TYPES`, `DOCUMENT_STATUSES`, `document_expiring`/`document_expired` en `NOTIFICATION_TYPES` y `document` en `ATTACHMENT_ENTITY_TYPES`; exportar `warnDaysSchema` de `schemas/schedules.ts`; crear `packages/shared/src/schemas/documents.ts` (`createVehicleDocumentSchema`, `updateVehicleDocumentSchema`, `vehicleDocumentSchema`, `vehicleDocumentParamsSchema` y tipos) y exportarlo en `src/index.ts`. Cubre: R1, R6.
- [x] T2 — Tests en `packages/shared/src/schemas/documents.test.ts`: `defaults warnDays to 30 and expiryDate to null`, `rejects an unknown type, an empty or long title, a bad date, out of range warnDays and long notes` y `keeps a partial update partial`. Cubre: R1, R6.
- [x] T3 — `documentStatus` en `packages/shared/src/domain/documents.ts` (exportado en `src/index.ts`) y test `computes valid, expiring and expired at the boundaries` en `documents.test.ts` (sin fecha, `warnDays` 0, el mismo día del vencimiento y el siguiente). Cubre: R9.
- [x] T4 — Tabla `vehicleDocuments` en `packages/db/src/schema/documents.ts` (FK `onDelete: 'cascade'`, índice por `vehicle_id`), reexportarla en `schema/index.ts` y generar `0014_vehicle_documents` con `pnpm db:generate`; añadir `vehicle_documents` a `apps/web/src/lib/data-source/local/database.test.ts`. Cubre: R1, R10.
- [x] T5 — Módulo `apps/api/src/modules/documents/{repository,service,routes}.ts` (orden por vencimiento, `status` con `todayIn`, 404 `Vehicle not found` / `Document not found`, borrado de adjuntos en `remove`) y registro en `apps/api/src/app.ts`. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9.
- [x] T6 — Tests en `apps/api/test/documents.test.ts`: `creates, lists, reads, updates and deletes a document` (respuesta con `toEqual`, filas en BD y orden con y sin fecha), `computes the status in the user's time zone`, `renews a document by patching its expiry date`, `rejects invalid payloads without writing` y `hides other users' vehicles and documents` (todos los métodos y un documento de otro vehículo). Cubre: R1, R2, R3, R4, R6, R7, R8, R9.
- [x] T7 — Grupo `documents` en `apps/web/src/lib/data-source/types.ts` y `http.ts`; `apps/web/src/lib/data-source/local/documents.ts` y registro en `local/index.ts`; tests `creates, lists, edits and deletes documents like the API` y `rejects invalid and unknown documents without writing` en `local/local-data-source.test.ts`. Cubre: R25.

## Adjuntos

- [x] T8 — Generalizar `apps/api/src/modules/attachments/{service,routes,repository}.ts` con `AttachmentParent` y `entityType` en las opciones del plugin; `listByVehicle` con los adjuntos de documentos; params de documento en `packages/shared/src/schemas/attachments.ts`; registrar las rutas de `document` en `app.ts`; adaptar `maintenance/service.ts`. Cubre: R11, R12, R13, R14, R15, R16, R17, R18.
- [x] T9 — Borrado de vehículo con los adjuntos de documentos en `apps/api/src/modules/vehicles/{repository,service}.ts`. Cubre: R10.
- [x] T10 — Tests en `apps/api/test/documents.test.ts`: `uploads several files to a document`, `downloads and serves inline a document attachment with the user content policy`, `serves a WebP thumbnail for document images only`, `rejects unsupported and corrupt files with 415 and stores nothing`, `rejects files larger than MAX_UPLOAD_MB`, `deletes a document attachment and its file`, `deletes the attachments with their document`, `deletes documents and their files with the vehicle` y `hides attachments of other documents, records and users`. `apps/api/test/attachments.test.ts` pasa sin cambiar aserciones. Cubre: R5, R7, R8, R10, R11, R12, R13, R14, R15, R16, R17, R18.
- [x] T11 — Generalizar `apps/web/src/lib/data-source/local/attachments.ts` (`requireParent`, `deleteAttachmentsOf`, `localDocumentAttachments`), `localAttachmentUrl` y `parseLocalUrl` en `local/files.ts`, `local/files-get.ts`; grupo `documentAttachments` en `types.ts`, `http.ts` y `local/index.ts`; borrado de vehículo y de documento con sus adjuntos en `local/vehicles.ts` y `local/documents.ts`. Cubre: R10, R26.
- [x] T12 — Tests en `apps/web/src/lib/data-source/local/local-files.test.ts`: `uploads, lists, serves and deletes document attachments` (URL `local://…/documents/…`, miniatura), `rejects unsupported or oversized document attachments and writes nothing` y `hides attachments of other documents`; ampliar `archives and deletes a vehicle cascading its data` de `local-data-source.test.ts` con documentos y sus ficheros. Cubre: R10, R26.
- [x] T13 — Los tests existentes de adjuntos de mantenimiento locales (`local-files.test.ts`) pasan con la nueva forma de `LocalUrl`. Cubre: R18, R26.

## Avisos

- [x] T14 — `documentDedupeKey` y `documentReminderNotification` en `packages/shared/src/domain/documents.ts`; tests `builds an expiring and an expired reminder`, `returns no reminder for a valid or undated document` y `document dedupe key changes with status and expiry date` en `documents.test.ts`. Cubre: R19, R20, R22, R23.
- [x] T15 — `listForActiveVehicles` en `apps/api/src/modules/documents/repository.ts` (vehículo y usuario activos, `expiry_date IS NOT NULL`) y documentos en `runReminders` de `apps/api/src/jobs/reminders.job.ts`. Cubre: R19, R20, R21, R22, R23.
- [x] T16 — Etiquetas `document_expiring` y `document_expired` en `apps/api/src/modules/notification-channels/messages.ts` y test `labels document notifications in each locale` en `messages.test.ts`. Cubre: R21, R33.
- [x] T17 — Tests en `apps/api/test/reminders.test.ts`: `notifies expiring and expired documents once`, `sends document notifications through the owner's channels` (con `createTestDispatcher(db, fetch)`), `notifies again after renewing a document`, `skips valid documents, sold or archived vehicles and disabled owners` y `keeps the notifications of a deleted document`. Cubre: R19, R20, R21, R22, R23, R24.
- [x] T18 — `documentReminders` en `generateLocalReminders` de `apps/web/src/lib/data-source/local/notifications.ts`. Cubre: R27.
- [x] T19 — Test `stores document reminders with the shared drafts once` en `apps/web/src/lib/data-source/local/local-notifications.test.ts` (mismo borrador que `documentReminderNotification`, segunda llamada sin duplicar, nueva tras renovar). Cubre: R27.

## Export e import

- [x] T20 — `documentExportSchema`, `vehicleExportSchema.documents` con `.default([])` y `seen.documents` con la comprobación de adjuntos en `packages/shared/src/schemas/data-export.ts`; `DataExportDocumentRow`, `DataExportAttachmentRow.entityType` y `DataExportInputRows.documents` en `domain/data-export-builder.ts`; `documents` en `dataImportSummarySchema`. Cubre: R28, R29, R30, R31.
- [x] T21 — Tests `defaults documents to an empty array in a v1 document`, `rejects duplicate document ids` y `rejects an invalid document attachment path` en `packages/shared/src/schemas/data-export.test.ts`, y `groups documents and their files by vehicle` en `domain/data-export-builder.test.ts`. Cubre: R28, R30, R31.
- [x] T22 — Queries de documentos y de adjuntos de documentos en `apps/api/src/modules/data-export/repository.ts` y en `loadLocalExportRows` de `apps/web/src/lib/data-source/local/data-export.ts`. Cubre: R28.
- [x] T23 — Ampliar `exports every vehicle with its records` e `includes the attachment files` en `apps/api/test/data-export.test.ts` con un documento y su adjunto; añadir `exports documents and their files` en `apps/web/src/lib/data-source/local/local-export.test.ts`. Cubre: R28.
- [x] T24 — `referencedFiles` y `plan.documents` en `apps/api/src/modules/data-import/service.ts`; `ImportPlan.documents` en `repository.ts`. Cubre: R29, R30.
- [x] T25 — Tests en `apps/api/test/data-import.test.ts`: `imports the documents of an export with their files` (ids nuevos, `entityType: 'document'`, fichero en disco, `documents` y `attachments` en el resumen), `imports a v1 zip without documents` y `rejects duplicate document ids`. Cubre: R29, R30, R31.
- [x] T26 — `'documents'` en `SUMMARY_KEYS` de `apps/web/src/features/data-portability/data-section.tsx`; `dataPortability.summary.documents` y `notifications.types.document_expiring`/`document_expired` en `apps/web/src/i18n/locales/{es,en}.json`; actualizar la fixture `DataImportSummary`. Cubre: R32, R33.
- [x] T27 — Test `shows the imported documents` en `apps/web/src/features/data-portability/data-section.test.tsx`; `apps/web/src/i18n/locales.test.ts` sigue en verde. Cubre: R32, R33.

## Cierre

- [x] T28 — Ejecutar `pnpm harness --full` y documentar trazabilidad en `progress/impl_vehicle-documents-api.md`. Cubre: R1, R33.
