# Review — #89 vehicle-documents-api

**Veredicto:** APPROVED

Revisado: `git diff main...HEAD` (solo spec y exploraciones), `git diff` (47 ficheros) y los 11 ficheros nuevos sin trackear, leídos enteros. `pnpm harness --full` ejecutado por el reviewer: verde (lint, typecheck, test: api 425, web 811, shared, db, mobile).

## Trazabilidad requirements ↔ tests
- R1: [x] `apps/api/test/documents.test.ts` › `creates, lists, reads, updates and deletes a document` (201, `toEqual` del DTO, `vehicleDocumentSchema.parse`, fila en BD, defaults `expiryDate: null`/`warnDays: 30`); `schemas/documents.test.ts` › `defaults warnDays to 30 and expiryDate to null`; `database.test.ts` (tabla `vehicle_documents` creada por la migración local).
- R2: [x] mismo test: orden exacto `[sooner, older, document, registration, undated]` con misma fecha desempatada por `createdAt` y sin fecha al final.
- R3: [x] mismo test: `GET` 200 y `toEqual(document)`.
- R4: [x] mismo test (PATCH parcial: solo `title`/`notes` cambian, BD conserva `expiryDate`, `warnDays`, `type`) + `renews a document by patching its expiry date` + `keeps a partial update partial`.
- R5: [x] `creates, lists…` (204 y fila borrada) y `deletes the attachments with their document` (filas de adjuntos y ficheros en disco: solo queda el del documento hermano).
- R6: [x] `rejects invalid payloads without writing` (los 9 casos del requirement en POST con 400 `problem+json`, BD vacía; 5 casos en PATCH y documento sin cambios) + test del esquema con los bordes 120/365/0.
- R7: [x] `hides other users' vehicles and documents` (los 5 métodos con «Vehicle not found») y `hides attachments of other documents, records and users` (los 6 endpoints de adjuntos con intruso y vehículo inexistente).
- R8: [x] mismos tests: documento de otro vehículo propio y de otro usuario → «Document not found» en GET/PATCH/DELETE y en los 6 endpoints de adjuntos.
- R9: [x] `domain/documents.test.ts` › `computes valid, expiring and expired at the boundaries` (sin fecha, `warnDays` 0, día del vencimiento y siguiente) + `computes the status in the user's time zone` (Etc/GMT+12 vs Kiritimati).
- R10: [x] `deletes documents and their files with the vehicle` (documentos, filas de adjuntos de documento y mantenimiento y ficheros; el otro vehículo intacto); local: `archives and deletes a vehicle cascading its data` ampliado (tablas y `store.keys()` vacíos).
- R11: [x] `uploads several files to a document` (201, `toEqual` con URL `/api/vehicles/:id/documents/:documentId/attachments/:id`); `entityType: 'document'` verificado además en local y en import.
- R12: [x] mismo test: orden `[first, second]`.
- R13: [x] `downloads and serves inline…` (tipo, `content-length`, `content-disposition` attachment/inline, `nosniff`, CSP PDF e imagen, `cache-control`, 400 con `inline=yes`) y `serves a WebP thumbnail for document images only` (WebP 320 px, 404 en PDF).
- R14: [x] `deletes a document attachment and its file` (204, fila y fichero borrados, 404 «Attachment not found» después).
- R15: [x] `rejects unsupported and corrupt files with 415 and stores nothing` (texto, GIF, PNG corrupto; sin filas ni ficheros).
- R16: [x] `rejects files larger than MAX_UPLOAD_MB` (413, sin filas ni ficheros).
- R17: [x] `hides attachments of other documents, records and users` (adjunto de documento hermano, adjunto de mantenimiento bajo ruta de documento y viceversa → «Attachment not found»).
- R18: [x] `apps/api/test/attachments.test.ts` sin ningún cambio (`git diff main` vacío) y en verde; `local-files.test.ts` solo tiene adiciones (helper y 3 tests nuevos), ninguna aserción de mantenimiento modificada; además el cruce documento→ruta de mantenimiento responde «Maintenance record not found».
- R19: [x] `reminders.test.ts` › `notifies expiring and expired documents once` (`toEqual` de las filas: tipo, título, cuerpo con nombre o marca+modelo, enlace, clave, `createdAt`).
- R20: [x] mismo test (segunda ejecución `created: 0`) + `sends document notifications through the owner's channels` (re-ejecución sin llamadas a `fetch`).
- R21: [x] `sends document notifications…` (webhook con «Documento a punto de caducar: Seguro» en es y «Document expired: ITV» en en) + `messages.test.ts` › `labels document notifications in each locale`.
- R22: [x] `notifies again after renewing a document` (editar título/`warnDays` no avisa; renovar avisa en el siguiente plazo, claves exactas) + test de `documentDedupeKey`.
- R23: [x] `skips valid documents, sold or archived vehicles and disabled owners` (`evaluated: 1`, `created: 0`, sin filas) + `returns no reminder for a valid or undated document`.
- R24: [x] `keeps the notifications of a deleted document` (documento borrado, notificación conservada con su clave).
- R25: [x] `local-data-source.test.ts` › `creates, lists, edits and deletes documents like the API` (DTO, orden, `status`) y `rejects invalid and unknown documents without writing` (400, 404 con mismos `detail`, `writes()` vacío).
- R26: [x] `local-files.test.ts` › `uploads, lists, serves and deletes document attachments` (URL `local://…/documents/…`, miniatura, `files.get`), `rejects unsupported or oversized…` (415/413 sin escrituras) y `hides attachments of other documents` (404 con los tres `detail`).
- R27: [x] `local-notifications.test.ts` › `stores document reminders with the shared drafts once` (filas iguales a `documentReminderNotification`, sin duplicar, nueva tras renovar, vehículo archivado y sin fecha excluidos).
- R28: [x] `data-export.test.ts` › `exports every vehicle with its records` (todos los campos sin `status`) e `includes the attachment files` (adjunto de documento y su fichero por sha256); `local-export.test.ts` › `exports documents and their files`; `data-export-builder.test.ts` › `groups documents and their files by vehicle`.
- R29: [x] `data-import.test.ts` › `imports the documents of an export with their files` (resumen `documents: 2`, `attachments: 3`, ids nuevos, `entityType: 'document'`, fichero en disco y servido por la API a B).
- R30: [x] `imports a v1 zip without documents` (sin clave `documents`, 201, `documents: 0`) + `defaults documents to an empty array in a v1 document`.
- R31: [x] `rejects duplicate document ids` y `rejects an invalid document attachment` (path y id repetido con un adjunto de mantenimiento; 400 con `errors` exactos y snapshot de BD/disco sin cambios) + tests del esquema.
- R32: [x] `data-section.test.tsx` › `shows the imported documents` (etiqueta «Documentos» tras «Gastos» y valor 37).
- R33: [x] `es.json`/`en.json` con `notifications.types.document_expiring/expired` y `dataPortability.summary.documents`; `messages.ts` en ambos idiomas con test; `locales.test.ts` en verde.

## Tasks
- T1..T28: [x] (desviaciones justificadas en `impl_*.md`: T8 sin tocar `maintenance/service.ts` porque solo usa `listByEntity('maintenance', …)`; T16 adelantada).

## Checkpoints
- C1: [x] harness 0, una sola feature activa (#89 `in_progress`), rama `feat/vehicle-documents-api`.
- C2: [x] spec completo y EARS, tabla de cobertura sobre los 6 `acceptance`, tasks `[x]`, cada `R<n>` con test leído.
- C3: [x] el diff se limita a los ficheros de la tabla de `design.md` (más `progress/` y `tasks.md`); sin cambios de otras features.
- C4: [x] módulo `documents/{routes,service,repository}.ts` cableado en `app.ts`, rutas con esquemas de `@ikrive/shared`, propiedad en el servicio con 404, `NotFoundError` (AppError), migración `0014` generada con snapshot y journal, textos en es/en, lógica pura (`documentStatus`, `documentDedupeKey`, `documentReminderNotification`) en `packages/shared` con tests. Sin UI nueva (#90).
- C5: [x] sin `any`/`@ts-ignore`/`console.log`/TODO nuevos; `expiryDate` `YYYY-MM-DD` validado con `isoDateSchema`; ficheros con clave aleatoria y servidos tras la cadena vehículo → documento → adjunto.
- C6: [x] `pnpm harness --full` verde (comprobado); tests sobre SQLite en memoria sin mocks de BD; sin capturas, justificado (solo un contador nuevo cubierto por test de componente, sin componentes nuevos).
- C7: [x] `impl_vehicle-documents-api.md` con archivos, mapa R→test y salida; `current.md` al día; `PLAN.md` no requiere cambio (la fase 9 sigue abierta con #90).

## Hallazgos
Ninguno bloqueante. Puntos verificados expresamente:
1. R18: `attachments.test.ts` intacto y en verde; `local-files.test.ts` sin cambios en aserciones existentes.
2. Aislamiento: `requireParent` comprueba vehículo propio y padre del mismo vehículo; `requireAttachment` filtra por `entityType` + `entityId` + `ownerId`. Cruces mantenimiento↔documento cubiertos en API y local.
3. Dedupe/rearmado: clave `document:<id>:<status>:<expiryDate>` con índice único existente; solo las filas nuevas pasan a `dispatch`.
4. Borrado de ficheros: documento (API: claves leídas antes, filas en transacción, ficheros después; local igual con `deleteAttachmentsOf`) y vehículo (`listByVehicle` y borrado de filas incluyen `document`).
5. Zips antiguos: `.default([])` en `vehicleExportSchema.documents`, `formatVersion` 1, probado en esquema y en import real.
6. Corrección colateral en `runReminders`: con documentos y sin reglas ya no se llama `addDays('')`; cubierto por los tests de documentos.

## Avisos para el humano (no bloquean)
- `documentReminderNotification` reimplementa `name ?? \`${make} ${model}\`` en vez de reutilizar el helper privado `vehicleName` de `domain/reminders.ts`; mismo comportamiento, pequeña duplicación.
- No hay test explícito de que un documento no avise antes de la hora de aviso del dueño; el filtro es el mismo helper `atReminderTime` que usan las reglas (cubiertas por los tests existentes).
- `documentExportSchema` no limita `title` (1–120) ni `warnDays` (≤365) al importar; es coherente con el resto de esquemas de export (p. ej. `title` de mantenimiento), pero un zip manipulado puede meter valores fuera de rango.
- Downgrade: un zip nuevo importado en un servidor anterior pierde documentos y adjuntos sin avisar; a las notas de la versión, como indica el design.
- `evaluated` del job cambia de significado (reglas + documentos con fecha); el disparador admin solo lo muestra.

## Cambios requeridos
Ninguno.

---

## Segunda vuelta (cambios de Gate 2)

**Veredicto:** APPROVED

Revisado: `git diff` de `packages/shared/src/domain/reminders.ts`, `packages/shared/src/domain/documents.ts` (sin trackear) y `apps/api/test/reminders.test.ts`; `git status --porcelain` con el mismo conjunto de ficheros que en la primera vuelta (47 modificados, 11 nuevos más `progress/`). `pnpm harness --full` ejecutado por el reviewer: verde (api 426 tests).

1. [x] **Reutilizar `vehicleName`**: `reminders.ts` solo cambia `const` → `export const` con JSDoc; `documents.ts` lo importa de `./reminders` y lo usa como `body: vehicleName(vehicle)`. Misma expresión, sin cambio de comportamiento; los tests existentes (vehículo con y sin nombre en `reminders.test.ts` y `domain/documents.test.ts`) siguen en verde. Se reexporta desde `@ikrive/shared` por `export * from './domain/reminders'`, sin colisiones (typecheck verde).
2. [x] **Test de la hora de aviso**: `reminders.test.ts:625` › `documents` › `waits for the owner's reminder hour in their time zone`. Dueño en `America/New_York` (EDT, UTC-4 el 2026-10-22) con `reminderHour: 9` y documento con vencimiento 2026-11-10 (en plazo). A las 12:59 UTC afirma `{ evaluated: 0, created: 0, failed: 0 }` y ninguna fila; a las 13:00 UTC afirma `{ evaluated: 1, created: 1, failed: 0 }` y una fila `document_expiring` del dueño. Afirma el resultado concreto en ambos lados del límite (R19/R20).
3. [x] **Alcance**: ningún otro cambio fuera de los dos pedidos; los límites de rango del esquema de export quedan fuera, como indica la nota del humano.

Checkpoints C1–C7 siguen como en la primera vuelta. Cambios requeridos: ninguno.
