# Design — vehicle-documents-api

## Idea

Una tabla `vehicle_documents` hija de `vehicles`, con el patrón de capas de `expenses`. Los ficheros van como filas de la tabla polimórfica `attachments` con un `entityType` nuevo, `document`. El módulo de adjuntos deja de estar fijado a mantenimiento y pasa a recibir un «padre» (`maintenance` | `document`). El estado de vigencia y el borrador de notificación son funciones puras de `packages/shared` que usan la API (DTO y job) y el modo local (DTO y `generateLocalReminders`). En el zip v1 los documentos son un array más de cada vehículo, con `.default([])`.

## Tamaño

Un solo spec, con tasks ordenadas: modelo y CRUD (T1–T7), adjuntos (T8–T13), avisos (T14–T19), export/import (T20–T27) y cierre (T28). Si en Gate 1 se prefiere partir, el corte limpio está en T19: export/import (R28–R32) puede ir en una feature aparte, porque mientras tanto el zip sigue siendo válido y simplemente no lleva documentos.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `src/enums.ts` | `DOCUMENT_TYPES = ['insurance','registration','inspection','other']`, `DOCUMENT_STATUSES = ['valid','expiring','expired']`, `NOTIFICATION_TYPES` + `document_expiring`, `document_expired`, `ATTACHMENT_ENTITY_TYPES = ['maintenance','document']` |
| shared | `src/schemas/schedules.ts` | exportar `warnDaysSchema` |
| shared | `src/schemas/documents.ts` (nuevo) + `.test.ts` | `createVehicleDocumentSchema`, `updateVehicleDocumentSchema`, `vehicleDocumentSchema`, `vehicleDocumentParamsSchema`, tipos; exportar en `src/index.ts` |
| shared | `src/schemas/attachments.ts` | `documentAttachmentListParamsSchema`, `documentAttachmentParamsSchema` |
| shared | `src/domain/documents.ts` (nuevo) + `.test.ts` | `documentStatus`, `documentDedupeKey`, `documentReminderNotification` |
| shared | `src/schemas/data-export.ts`, `src/domain/data-export-builder.ts`, `src/schemas/data-import.ts` | `documentExportSchema`, `vehicleExportSchema.documents`, `seen.documents`, `DataExportDocumentRow`, `DataExportAttachmentRow.entityType`, `documents` en el resumen |
| db | `src/schema/documents.ts` (nuevo), `schema/index.ts` | tabla `vehicle_documents`; `pnpm db:generate` → `migrations/0014_vehicle_documents.sql` + snapshot + journal |
| api | `src/modules/documents/{routes,service,repository}.ts` (nuevo), `src/app.ts` | CRUD |
| api | `src/modules/attachments/{routes,service,repository}.ts` | padre genérico; rutas registradas dos veces |
| api | `src/modules/vehicles/{service,repository}.ts` | borrar también los adjuntos de documentos |
| api | `src/jobs/reminders.job.ts`, `src/modules/notification-channels/messages.ts` | documentos en `runReminders`; etiquetas |
| api | `src/modules/data-export/repository.ts`, `src/modules/data-import/{service,repository}.ts` | documentos y sus adjuntos |
| web | `src/lib/data-source/{types,http}.ts`, `local/documents.ts` (nuevo), `local/{attachments,files,files-get,vehicles,notifications,data-export,index}.ts` | grupos `documents` y `documentAttachments`, URLs locales, avisos y export |
| web | `features/data-portability/data-section.tsx`, `i18n/locales/{es,en}.json` | contador y etiquetas (ver Web) |

Sin cambios: `admin-users` (los ficheros de documentos son filas de `attachments` con `ownerId`, ya cubiertos por `fileKeys`), informe de venta, feed iCal, zip writers y `native-export`.

## Base de datos

```ts
export const vehicleDocuments = sqliteTable('vehicle_documents', {
  id: id(),
  vehicleId: text().notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  type: text({ enum: DOCUMENT_TYPES }).notNull(),
  title: text().notNull(),
  expiryDate: text(),                 // YYYY-MM-DD, nullable
  warnDays: integer().notNull(),      // 0..365
  notes: text(),
  createdAt, updatedAt,               // como expenses
}, (t) => [index('vehicle_documents_vehicle_id_idx').on(t.vehicleId)]);
```

`attachments.entity_type` es texto sin `CHECK` (`0003_attachments.sql`): añadir `document` al enum no cambia el SQL. La migración `0014` solo crea la tabla; `migrateLocal` la aplica en el teléfono (`database.test.ts`).

Nombre `vehicle_documents` y no `documents` para no confundirla con el `document` (`data.json`) del import.

## Contrato HTTP

Todas bajo `authenticate`. Params: `idParamSchema`, `vehicleDocumentParamsSchema` (`{ id, documentId }`), `documentAttachmentParamsSchema` (`+ attachmentId`).

| Método y ruta | Cuerpo | Respuesta | Errores |
|---|---|---|---|
| `GET /api/vehicles/:id/documents` | — | 200 `VehicleDocument[]` | 404 Vehicle |
| `POST /api/vehicles/:id/documents` | `createVehicleDocumentSchema` | 201 | 400, 404 Vehicle |
| `GET /api/vehicles/:id/documents/:documentId` | — | 200 | 404 Vehicle / Document |
| `PATCH /api/vehicles/:id/documents/:documentId` | `updateVehicleDocumentSchema` | 200 | 400, 404 |
| `DELETE /api/vehicles/:id/documents/:documentId` | — | 204 | 404 |
| `GET …/documents/:documentId/attachments` | — | 200 `Attachment[]` | 404 Vehicle / Document |
| `POST …/documents/:documentId/attachments` | multipart `file` | 201 `Attachment` | 400 sin fichero, 413, 415, 404 |
| `GET …/attachments/:attachmentId[?inline=1]` | — | fichero | 400 `inline` inválido, 404 Vehicle / Document / Attachment |
| `GET …/attachments/:attachmentId/thumbnail` | — | WebP | 404 (también PDF) |
| `DELETE …/attachments/:attachmentId` | — | 204 | 404 |

Orden del listado: `expiryDate IS NULL`, `expiryDate` asc, `createdAt` asc, `rowid`.

## Tipos y firmas

```ts
// packages/shared/src/schemas/documents.ts
const fields = z.object({
  type: z.enum(DOCUMENT_TYPES),
  title: z.string().trim().min(1).max(120),
  expiryDate: isoDateSchema.nullable().default(null),
  warnDays: warnDaysSchema.default(30),
  notes: optionalText(2000),
});
export const createVehicleDocumentSchema = fields;
// Sin defaults: un PATCH parcial no reinicia warnDays ni borra expiryDate.
export const updateVehicleDocumentSchema = fields
  .extend({ expiryDate: isoDateSchema.nullable(), warnDays: warnDaysSchema }).partial();
export const vehicleDocumentSchema = z.object({ id, vehicleId, type, title, expiryDate: isoDateSchema.nullable(),
  warnDays: z.number().int(), notes: z.string().nullable(), status: z.enum(DOCUMENT_STATUSES),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() });
// tipos: CreateVehicleDocument(Input), UpdateVehicleDocument(Input), VehicleDocument

// packages/shared/src/domain/documents.ts
export function documentStatus(doc: { expiryDate: string | null; warnDays: number }, today: string): DocumentStatus;
//   expiryDate null → 'valid'; today > expiryDate → 'expired'; today >= addDays(expiryDate, -warnDays) → 'expiring'
export function documentDedupeKey(id: string, status: Exclude<DocumentStatus,'valid'>, expiryDate: string): string;
//   `document:${id}:${status}:${expiryDate}`
export function documentReminderNotification(
  doc: { id: string; title: string; expiryDate: string | null; warnDays: number },
  vehicle: { id: string; name: string | null; make: string; model: string },
  today: string,
): NotificationDraft | null;  // type `document_${status}`, body vehicleName, link `/vehicles/${id}`

// apps/api/src/modules/attachments/service.ts
export interface AttachmentParent { entityType: AttachmentEntityType; vehicleId: string; entityId: string }
list(userId, parent) / upload(userId, parent, file) / open(userId, parent, attachmentId)
thumbnail(userId, parent, attachmentId) / remove(userId, parent, attachmentId)
// requireParent: vehicles.findOwned → 'Vehicle not found'; maintenance.find → 'Maintenance record not found';
// documents.find → 'Document not found'. URL: /api/vehicles/:v/{maintenance|documents}/:entityId/attachments/:id

// apps/api/src/modules/attachments/routes.ts
attachmentsRoutes: FastifyPluginAsyncZod<{ service; entityType: AttachmentEntityType }>
// app.ts lo registra dos veces: { entityType: 'maintenance' } y { entityType: 'document' }

// apps/api/src/modules/attachments/repository.ts
listByVehicle(vehicleId)  // adjuntos de mantenimientos y de documentos del vehículo

// apps/web/src/lib/data-source/types.ts
documents: { list(vehicleId); create(vehicleId, input); update(vehicleId, documentId, changes); remove(vehicleId, documentId) };
documentAttachments: { list(vehicleId, documentId); upload(vehicleId, documentId, file: File); remove(vehicleId, documentId, attachmentId) };

// apps/web/src/lib/data-source/local/files.ts
localAttachmentUrl(vehicleId, entityType, entityId, attachmentId)
LocalUrl = { kind: 'photo'; vehicleId } | { kind: 'attachment' | 'thumbnail'; vehicleId; entityType; entityId; attachmentId }
```

`documentStatus` reutiliza `addDays` de `domain/schedules.ts`. El servicio calcula `status` con `todayIn(settings.get(userId).timezone)`; local, con la zona horaria de `settingsRow(db)`, como los mantenimientos programados.

`local/attachments.ts` se generaliza igual: `requireParent(db, entityType, vehicleId, entityId)`, `requireAttachment(db, parent, attachmentId)`, `localAttachments` (mantenimiento, sin cambio de contrato) y `localDocumentAttachments`, y `deleteMaintenanceAttachments` pasa a `deleteAttachmentsOf(tx, entityType, ids)`. `local/documents.ts` copia `local/expenses.ts` y borra en transacción documento + adjuntos, ficheros después.

## Avisos

- **Mismo job.** `runReminders` añade `documentsRepo.listForActiveVehicles()` (mismo join que `schedules.listForActiveVehicles`: vehículo activo, usuario activo, `timezone`/`reminderHour`), filtra con `isReminderTime`, construye borradores con `documentReminderNotification` y los inserta en el mismo `createMany` + `dispatch` que los de mantenimiento. El `return` temprano pasa a comprobar las dos listas; `evaluated` = reglas + documentos evaluados. Sin cron, CLI ni disparador admin nuevos.
- **Clave** `document:<id>:<status>:<expiryDate>`: un aviso `expiring` y otro `expired` por cada fecha de vencimiento. Cambiar `warnDays` o el título no vuelve a avisar; renovar (otra `expiryDate`) sí, en cuanto el documento vuelva a entrar en plazo. El índice único `notifications_dedupe_key_idx` + `onConflictDoNothing` garantizan la unicidad y solo se envían por canales las filas nuevas (ya es así).
- **Canales:** `TEXTS.types` de `messages.ts` es `Record<NotificationType, string>`, así que no compila sin las etiquetas: es «Documento a punto de caducar» / «Documento caducado», en «Document expiring soon» / «Document expired».
- **Local:** `generateLocalReminders` añade `documentReminders(db, today)` dentro del mismo `isReminderTime`, con la misma función pura. Las notificaciones nativas del dispositivo no cambian: siguen a la tabla `notifications`.
- **Documento borrado:** sus notificaciones se quedan (R24), igual que hoy con una regla de mantenimiento borrada; el enlace apunta al vehículo, que sigue existiendo, y borrar el vehículo las borra por FK.

## Export e import

- `documentExportSchema`: `id`, `type`, `title`, `expiryDate` (nullable), `warnDays`, `notes`, `createdAt`, `updatedAt`, `attachments: z.array(attachmentExportSchema)`. `status` no se exporta (se calcula).
- `vehicleExportSchema.documents: z.array(documentExportSchema).default([])`; `formatVersion` sigue en 1. `checkIntegrity` añade `seen.documents` y aplica a sus adjuntos el mismo `seen.attachments` global y la comprobación de `path`.
- Builder: `DataExportAttachmentRow` gana `entityType`; los adjuntos se agrupan por `(entityType, entityId)` y los de documento también se añaden a `files`. `DataExportInputRows.documents`.
- Export API y local: query de documentos (dueño, orden `createdAt`, `rowid`) y la de adjuntos pasa a `entityType = 'maintenance' AND entityId IN (registros del dueño) OR entityType = 'document' AND entityId IN (documentos del dueño)`. El bucle de copia de ficheros del export local no cambia.
- Import API: `referencedFiles` recorre también `documents[].attachments`; `buildPlan` añade `plan.documents` con ids nuevos y sus adjuntos a `plan.attachments` con `entityType: 'document'`; `ImportPlan.documents` (y por tanto `ImportCounts.documents`) se inserta antes que los adjuntos. `attachments` del resumen cuenta los de los dos tipos.
- Un `data.json` antiguo conserva sus bytes, así que `data_sha256` y la deduplicación de imports no cambian.

## Web (cambios mínimos)

- `data-section.tsx`: `'documents'` en `SUMMARY_KEYS`, después de `expenses`.
- i18n `es`/`en`: `notifications.types.document_expiring` / `document_expired` (mismos textos que los canales) y `dataPortability.summary.documents` («Documentos» / «Documents»).
- Fixtures tipadas que dejan de compilar (`DataImportSummary` de `data-section.test.tsx`, objetos `DataSource` de prueba, `LocalUrl` en `local-files.test.ts`) reciben los campos nuevos.
- Sin componentes nuevos: sección, formulario, estados de vigencia y «añadir al calendario» son #90.

## Alternativas descartadas

- **Columna de fichero propia en `vehicle_documents`** (`fileKey`, `mimeType`, `size`…). Duplicaría la detección de tipo, el hash, el servido con CSP y la miniatura, y obligaría a tocar `admin-users.fileKeys`, el bucle de copia del export local, `referencedFiles` con un `kind` nuevo y `files-get` con otra cadena. Con filas de `attachments`, todo eso sale de generalizar el padre.
- **Un solo adjunto por documento** (409 al subir el segundo, o reemplazo). Añade una regla que no existe en mantenimiento y complica renovar conservando la póliza anterior. Se permiten varios, como en mantenimiento; #90 decide cómo pintarlos.
- **Módulo de adjuntos de documentos aparte** (copiar `attachments/`). Dos copias de la política CSP y del servido; generalizar el padre es un cambio pequeño y los tests de mantenimiento (R18) protegen la regresión.
- **Job nuevo `documents.job.ts`.** Otro cron, otra entrada en `registry.ts`, CLI y disparador admin para la misma lógica de hora y zona horaria. Ampliar `runReminders` reutiliza todo.
- **Plazo de aviso global en ajustes.** El plazo de mantenimiento ya es por regla (`warnDays`); uno por documento permite, p. ej., 60 días para la ITV y 15 para el seguro sin una tabla de ajustes nueva.
- **Borrar las notificaciones del documento** (por prefijo de `dedupeKey` o con una FK `documentId` nueva en `notifications`). La FK es una migración sobre una tabla existente y el borrado por prefijo es inconsistente con las reglas de mantenimiento, cuyas notificaciones se conservan.
- **Subir `formatVersion` a 2.** Mismo motivo que en #87 (`specs/vehicle-expenses-api/design.md`): `.default([])` es aditivo y basta.
- **Feed iCal e informe de venta con documentos.** El acceptance no lo pide; #90 cubre «añadir al calendario» con el evento nativo/ICS del cliente.

## Decisiones a validar (Gate 1)

1. **Modelo:** `type`, `title` obligatorio (es el título de la notificación, que no se traduce), `expiryDate` opcional (el permiso de circulación no caduca; sin fecha es `valid` y nunca avisa), `warnDays` 0–365 con 30 por defecto, `notes` opcional. Sin emisor, número de póliza ni importe.
2. **Caducado el día siguiente:** `expiryDate` es el último día válido, así que `expired` empieza al día siguiente (los mantenimientos están `overdue` el mismo día). `expiring` desde `expiryDate − warnDays`, incluido.
3. **Dos avisos por vencimiento** (`expiring` y luego `expired`), como `due_soon`/`overdue`. Un documento creado ya caducado solo da `expired`.
4. **Varios adjuntos por documento** y sin límite de número.
5. **Las notificaciones de un documento borrado se conservan.**
6. **El listado ordena por vencimiento** (próximo primero, sin fecha al final), no por fecha de creación.
7. **Documentos de vehículos vendidos o archivados no avisan**, como las reglas.

## Riesgos

- **Refactor de adjuntos:** cambiar las firmas del servicio y de `local/attachments.ts` toca `maintenance/service.ts`, `vehicles/service.ts`, `files-get.ts` y sus tests. `attachments.test.ts` y `local-files.test.ts` deben pasar sin cambiar sus aserciones (R18).
- **Zip nuevo en un servidor antiguo:** perdería documentos y sus adjuntos sin avisar (y sus ficheros quedarían fuera de `referencedFiles`). Downgrade no soportado; a las notas de la v0.4.0, como en #87.
- **`evaluated` del job:** cambia de significado (reglas + documentos). Lo consumen los tests y el disparador admin, que solo lo muestra.
- **Documentos sin fecha:** nunca avisan; `listForActiveVehicles` y la query local los filtran con `expiry_date IS NOT NULL`, así que no cuentan en `evaluated`.

## Fuera de alcance

- Interfaz de documentos (sección, formulario, cámara, estados, «añadir al calendario»): #90.
- Documentos en el feed iCal y en el informe de venta.
- Import del zip en modo local (sigue en 501).
- Avisos recurrentes después de `expired` y documentos sin vehículo.
