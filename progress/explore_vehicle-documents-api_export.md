# Exploración: vehicle-documents-api — export/import y entidades por vehículo

Informe de un agente `Explore` (solo lectura). Rutas relativas a la raíz del repo.

## Resumen

- **Formato:** `data.json` en la raíz del zip, anidado por vehículo; ficheros sueltos en `attachments/<id>.<ext>` y `photos/<vehicleId>.webp`. Esquema compartido en `packages/shared`.
- **Cómo se añadieron los gastos:** cambio aditivo. `formatVersion` siguió en 1 y el array nuevo usa `.default([])`, así que los zips sin la clave se siguen importando.
- **Hueco principal:** los adjuntos están fijados a `entityType: 'maintenance'` en una docena de sitios (sección 3). Todos necesitan una rama `document`.
- **El modo local no importa zips** (responde 501): solo cambia el export local.

## 1. Formato del zip (esquema compartido)

- `packages/shared/src/schemas/data-export.ts`:
  - `DATA_EXPORT_FORMAT_VERSION = 1` (:16); el comentario dice que se sube en cambios incompatibles.
  - Nivel superior (:163-171): `formatVersion` (literal), `appVersion`, `exportedAt`, `settings`, `notificationChannels`, `vehicles`.
  - `vehicleExportSchema` (:108-135): `odometerReadings`, `maintenanceSchedules`, `maintenanceRecords`, `fuelLogs`, `expenses` y `photoPath`.
  - Los adjuntos van anidados en `maintenanceRecords[].attachments` con `attachmentExportSchema` (:50-61): id, originalName, mimeType, size, sha256, path, createdAt.
  - Gastos (:133-134): `expenses: z.array(expenseExportSchema).default([])`, comentado como «un documento sin la clave se lee como sin gastos».
- Sin cambio de versión. La decisión está en `specs/vehicle-expenses-api/design.md`:
  - :119 y :153, la decisión en sí.
  - :152 ya menciona #89 (documentos).
  - :170: un servidor antiguo descarta en silencio las claves desconocidas, así que un zip nuevo importado en un servidor antiguo pierde datos. Volver a una versión anterior no está soportado.
- `checkIntegrity` (:178-247):
  - un conjunto `seen` por colección (:179-187);
  - el de `attachments` es global, así que los adjuntos de documentos pueden compartirlo;
  - el `path` de cada adjunto tiene que ser igual a `attachmentExportPath(id, mime)` (:231), y los documentos necesitan la misma comprobación.
- Ubicaciones dentro del zip: `packages/shared/src/domain/data-export.ts` (`attachments/<id>.<ext>` :9-11, `photos/<vehicleId>.webp` :14-16).
- Builder compartido (lo usan la API y el modo local): `packages/shared/src/domain/data-export-builder.ts`.
  - Tipos de fila en :17-20 y :54-61. `DataExportAttachmentRow.entityId` está documentado como «id del registro de mantenimiento».
  - `DataExportInputRows` en :72-81.
  - Agrupa por vehículo (:135-143); los adjuntos solo se agrupan por `entityId`.
  - Mapeo en :205-243, `files.push` por adjunto en :145-157.
  - Valida el resultado con `dataExportSchema.parse` (:248).
- Escritores de zip:
  - local (fflate, en streaming): `packages/shared/src/data-export-zip.ts`, no depende del formato y no cambia;
  - API (yazl): `apps/api/src/modules/data-export/service.ts`, recorre `files` (:183) y solo necesita los `files` del builder.
- Resumen de importación: `packages/shared/src/schemas/data-import.ts` :283-300; hay que añadir un recuento de `documents`.
- Export en la API: `apps/api/src/modules/data-export/repository.ts`.
  - Una consulta por entidad; la de gastos está en :67-73.
  - La de adjuntos (:75-91) filtra `entityType 'maintenance'` y los ids de los registros del usuario; tiene que incluir también los adjuntos de documentos.
- Import en la API: `apps/api/src/modules/data-import/service.ts`.
  - `parseDocument` (:74-100) rechaza cualquier versión distinta de 1.
  - `buildPlan` (:107-257): el bucle de gastos está en :235-247 y los adjuntos van con `entityType: 'maintenance'` fijo en :206.
  - `referencedFiles` (:280-298) solo recorre `maintenanceRecords[].attachments`. Si no se añaden ahí los ficheros de documentos, la importación nunca los lee.
  - `storeFile` (:334-365) comprueba el tipo, el tamaño y el sha256.
  - `apps/api/src/modules/data-import/repository.ts`: `ImportPlan` en :468-478 (`ImportCounts` se deriva de él). `insertPlan` (:557-584) inserta primero los padres; los documentos van antes que los adjuntos.
- Tests de zips antiguos y de gastos:
  - `apps/api/test/data-import.test.ts`:
    - :801 `imports a v1 zip without expenses`, que quita la clave con `rezip(exported.entries, { document: old })`; es la plantilla para un test «sin documentos»;
    - :599-618, formatVersion no soportado o ausente;
    - :644, ids de gasto duplicados;
    - :251, datos de partida.
  - `packages/shared/src/schemas/data-export.test.ts`: :207 `defaults expenses to an empty array in a v1 document`, :197 ids duplicados, :180 versión no soportada.
  - `packages/shared/src/domain/data-export-builder.test.ts` :184 `groups expenses by vehicle`.
  - `apps/api/test/data-export.test.ts`: los gastos se añadieron en el PR de la API; el test de ficheros está hacia :405-424.

## 2. Export/import en modo local (y streaming en el móvil)

- Export: `apps/web/src/lib/data-source/local/data-export.ts`.
  - `loadLocalExportRows` (:50-128) replica el repositorio de la API; los gastos están en :92-98.
  - Su consulta de adjuntos también fija `'maintenance'` y los ids de los registros (:100-116); tiene que incluir las filas de documentos y sus adjuntos.
  - `writeZip` (:148-218) copia `rows.attachments` (:197-202) y las fotos, y después llama a `buildDataExport`.
  - Si los ficheros de documentos se guardan como filas normales de `attachments`, el bucle de copia actual ya los cubre. Si los documentos tienen su propia columna de fichero, hace falta otro bucle de copia y otro conjunto `present`.
- Streaming en el móvil: `apps/web/src/lib/native-export.ts` y `local/export-sink.ts` no dependen del contenido y no cambian.
- Import: no existe en modo local. `dataPortability.import` es `reject` en `apps/web/src/lib/data-source/local/index.ts` :77 y responde 501. El design de gastos (:180) también lo deja fuera de alcance.
- BD local:
  - es SQLite con el mismo esquema Drizzle y las mismas migraciones; no hay IndexedDB;
  - `local/migrations.ts` empaqueta `packages/db/migrations/*.sql` y `_journal.json`, así que una migración nueva `0014_*` (generada con `pnpm db:generate`) entra sola;
  - `local/database.test.ts` :63 comprueba `created('expenses')`; hay que añadir `documents`.
- Tests: `local/local-export.test.ts` :172 `exports expenses`; el documento esperado con `formatVersion: 1` está en :114.
- Interfaz del resumen de importación:
  - `apps/web/src/features/data-portability/data-section.tsx` :27-37 (`SUMMARY_KEYS`);
  - las claves i18n `dataPortability.summary.*` en `apps/web/src/i18n/locales/{en,es}.json` (hacia en.json:672).

## 3. Otros sitios que recorren las entidades de un vehículo o sus adjuntos

**Tipo de entidad de los adjuntos**
- `ATTACHMENT_ENTITY_TYPES = ['maintenance']` en `packages/shared/src/enums.ts` :74.
- La tabla `attachments` es polimórfica y sin FK (`packages/db/src/schema/attachments.ts` :10-38), así que al borrar el padre sus adjuntos se borran en código.

**Borrado de vehículo en la API**
- `apps/api/src/modules/vehicles/repository.ts` :66-77 borra solo los adjuntos de mantenimiento y deja el resto a la cascada de FK.
- `vehicles/service.ts` :88-94 saca las claves de fichero de `attachments.listByVehicle`.
- `apps/api/src/modules/attachments/repository.ts` :40-48: `listByVehicle` solo une con `maintenanceRecords`.

**Borrado de vehículo en local**
- `apps/web/src/lib/data-source/local/vehicles.ts` :130-149.
- Usa el helper `deleteMaintenanceAttachments` de `local/attachments.ts` :76-84.

**Patrón de borrado de entidad a copiar para documentos**
- `apps/api/src/modules/maintenance/service.ts` :140 y `maintenance/repository.ts` :132.

**Código de adjuntos con `'maintenance'` fijo**
- `apps/api/src/modules/attachments/service.ts` :85.
- `apps/web/src/lib/data-source/local/attachments.ts` :66, :95 y :120.

**URLs de ficheros en local**
- `local/files.ts` :80-95: `LocalUrl` solo tiene los tipos `photo` y `attachment|thumbnail`, y el de adjunto lleva `recordId`.
- `local/files-get.ts` resuelve la cadena vehículo → registro → adjunto.

**Borrado de usuario (admin)**
- `apps/api/src/modules/admin-users/repository.ts` :54-72.
- `fileKeys` toma las fotos más todos los adjuntos por `ownerId`, así que los ficheros guardados como filas de `attachments` ya quedan cubiertos. Una columna de fichero propia en documentos habría que añadirla ahí.
- Las filas caen por la cascada de FK desde `user`.
- Test: `apps/api/test/admin-users.test.ts` :340.

**Estadísticas de admin**
- Solo `vehicleCount` (`admin-users/repository.ts` :15); nada por entidad.

**CSV**
- No hay export CSV, solo import (`packages/shared/src/csv-import/*`, `apps/api/src/modules/csv-import/*`, `local/csv-import.ts`).
- Probablemente no aplica a documentos.

**Informe de venta (PDF)**
- API: `apps/api/src/modules/reports/service.ts` :52-82, que solo usa los registros de mantenimiento y `attachmentsOf` con `'maintenance'`.
- Local: `local/sale-report.ts` :33-60, también con `'maintenance'`.
- Renderizado compartido: `packages/shared/src/sale-report-pdf/` (`annexes.ts`, `generate.ts`).
- Solo cambia si los documentos tienen que salir en el informe.

**Interfaz DataSource**
- `apps/web/src/lib/data-source/types.ts`: grupos `expenses`, `attachments`, etc.; la firma de `attachments` lleva `recordId` (hacia :115-120).
- Implementación HTTP: `http.ts`.
- Cableado local: `local/index.ts` :55-81. Aquí va un grupo `documents` nuevo.

**BD y migraciones**
- `packages/db/src/schema/index.ts` más un `packages/db/src/schema/documents.ts` nuevo, copiando `expenses.ts` (FK `vehicleId` con `onDelete: 'cascade'`).
- Después `packages/db/migrations/0014_*.sql`, su snapshot y `_journal.json`.
- El módulo se registra en `apps/api/src/app.ts`.

**Lista completa de referencia**
- `git diff --stat 9a19b1d^1 9a19b1d` (PR de la API de gastos).
- El PR de gastos no tocó el borrado de vehículos porque los gastos no tienen adjuntos. Los documentos con fichero también necesitan:
  - los dos borrados de vehículo;
  - las consultas de adjuntos de los dos exports;
  - `ImportPlan.attachments`;
  - `referencedFiles`.
