# Exploración #87 vehicle-expenses-api — DataSource local, export/import y borrado en cascada

> Informe de un agente `Explore` (solo lectura), guardado por el leader.

Lo más importante para el spec:

- **Esquema único.** El modo local no tiene esquema propio. Usa las mismas tablas drizzle (`packages/db/src/schema/*`) y las mismas migraciones SQL (`packages/db/migrations/*`) que la API. Una tabla `expenses` nueva se crea una sola vez y vale para los dos lados.
- **El modo local no importa.** `dataPortability.import` responde 501 en local, y la web oculta el botón de importar (`!local &&` en `data-section.tsx:120`). Hoy solo hay import en la API.
- **Zips antiguos.** No hay ningún mecanismo de compatibilidad ni ningún precedente. El esquema de export salió en un único commit (`58b0da8`) que ya traía `fuelLogs`. `formatVersion` es `z.literal(1)` y `fuelLogs` es un array obligatorio. Si se añade `expenses: z.array(...)` sin `.default([])`, los zips v1 que ya existen dejan de importarse. Esto es una decisión de diseño que hay que tomar en el spec.

## 1. DataSource

**Interfaz y selección**
- `apps/web/src/lib/data-source/types.ts` define la interfaz `DataSource`, agrupada por dominio: `vehicles`, `odometer`, `fuelLogs`, `maintenance`, `schedules`, `stats`, `dataPortability`, etc. El bloque de fuel logs:
  ```ts
  fuelLogs: {
    list(vehicleId: string): Promise<FuelLog[]>;
    create(vehicleId: string, log: CreateFuelLogInput): Promise<FuelLog>;
    update(vehicleId: string, logId: string, changes: UpdateFuelLogInput): Promise<FuelLog>;
    remove(vehicleId: string, logId: string): Promise<void>;
  };
  ```
  Los tipos vienen de `@ikrive/shared`. Los errores se lanzan siempre como `ApiError` con un `Problem` RFC 7807, sea cual sea la implementación.
- `apps/web/src/lib/data-source/index.ts` contiene `dataSource()` y `setDataSource()`. Por defecto usa `httpDataSource`.
- `apps/web/src/lib/data-source/no-direct-api.test.ts` es un test que impide llamar a la API sin pasar por el DataSource.
- `apps/web/src/lib/data-source/data-source.test.tsx` comprueba que queries y mutations pasan por el DataSource activo.

**HTTP: `apps/web/src/lib/data-source/http.ts`**
```ts
fuelLogs: {
  list: (vehicleId) => api.get<FuelLog[]>(`/vehicles/${vehicleId}/fuel-logs`),
  create: (vehicleId, log) => api.post<FuelLog>(`/vehicles/${vehicleId}/fuel-logs`, log),
  update: (vehicleId, logId, changes) => api.patch<FuelLog>(`/vehicles/${vehicleId}/fuel-logs/${logId}`, changes),
  remove: (vehicleId, logId) => api.delete<void>(`/vehicles/${vehicleId}/fuel-logs/${logId}`),
},
dataPortability: {
  import: (file) => api.post<DataImportSummary>('/me/import', fileBody(file)),
  export: () => api.download('/me/export'),
},
```
En la API, cada módulo tiene `routes.ts`, `service.ts` y `repository.ts` (`apps/api/src/modules/fuel-logs/`):
- `service.ts` comprueba que el vehículo es del usuario y responde 404 si no lo es.
- Después llama a `validateOdometerWrite` con `todayIn(settings.timezone)` y a `toDto`, que quita `odometerReadingId` y convierte los timestamps a ISO.
- El repositorio crea el log y su lectura de odómetro `source: 'fuel'` en una sola transacción.

**Local: `apps/web/src/lib/data-source/local/`**
- **`index.ts`**: `createLocalDataSource(db, deps)`. Cada grupo pasa por `serialized(queue, …)`, una cola serie para que dos operaciones no intercalen sentencias.
  - Lo que necesita servidor rechaza con `reject` (501): canales, feed iCal, enlaces públicos, admin y `dataPortability.import`.
  - Una entidad nueva se registraría así: `expenses: serialized(queue, localExpenses(db))`.
- **`fuel-logs.ts`**: es el modelo a copiar. Repite la lógica del service de la API, pero en async sobre drizzle sqlite-proxy:
  - `parseInput(createFuelLogSchema, input)` (en `problems.ts`) devuelve un problem de validación.
  - `requireVehicle` está en `vehicles.ts`.
  - `validateOdometerWrite` / `odometerConflictMessage` lanzan `badRequest` / `conflict` (de `problems.ts`).
  - `localToday(db)` está en `settings.ts`.
  - `db.transaction(async (tx) => …)` inserta la lectura y el log juntos.
  - También exporta `listFuelLogs(db, vehicleId)`, que reutilizan `stats.ts` y `sale-report.ts`.
- **`database.ts`**: `openLocalDatabase(callback, migrations = BUNDLED_MIGRATIONS)` hace, en orden:
  - `drizzle(callback, batch, { schema, casing: 'snake_case' })` con `schema` de `@ikrive/db/schema`;
  - `PRAGMA foreign_keys = ON` (las cascadas dependen de esto);
  - `migrateLocal`;
  - el seed de `LOCAL_USER` y `userSettings`.
  - Todas las filas pertenecen a `LOCAL_USER_ID`, que se importa de `@ikrive/db`.
- **`migrations.ts`**: así se versionan las migraciones en local.
  - `import.meta.glob('../../../../../../packages/db/migrations/*.sql', { query: '?raw', eager: true })` más `packages/db/migrations/meta/_journal.json` producen `BUNDLED_MIGRATIONS` (tag, when, sql).
  - `migrateLocal` reproduce el migrador SQLite de drizzle. Usa la tabla `__drizzle_migrations` con el hash SHA-256 del fichero y `created_at = when`. Aplica las migraciones con `when` mayor que la última aplicada, todas en una transacción, partiendo cada fichero por `--> statement-breakpoint`.
  - Una tabla nueva solo necesita `pnpm db:generate` en `packages/db` (config en `packages/db/drizzle.config.ts`). Saldría `0013_<tag>.sql` más la entrada en el journal. Las tablas existentes llegan hasta `0012_data_imports`.
- **Motor real en el dispositivo**: `apps/web/src/lib/native-sqlite.ts`, sobre `@capacitor-community/sqlite`. Tiene dos limitaciones documentadas en ese fichero:
  - Las sentencias con `RETURNING` van por `query`, no por `run`.
  - En Android, toda columna agregada o calculada necesita alias (`.as('x')`): un nombre con `.` no se puede leer.
- **Esquema del ejemplo**: `packages/db/src/schema/fuel.ts` define la tabla `fuel_logs`:
  - `id` text UUID con `$defaultFn`;
  - `vehicleId` con `references(() => vehicles.id, { onDelete: 'cascade' })`;
  - `date` text `YYYY-MM-DD`; los importes son `real`;
  - `createdAt`/`updatedAt` como `integer({ mode: 'timestamp_ms' })`;
  - índice `(vehicle_id, date)`.
  - El SQL generado está en `packages/db/migrations/0009_fuel_logs.sql`. La API lo reexporta en `apps/api/src/db/schema.ts` (`export * from '@ikrive/db/schema'`).

**Reglas compartidas (`packages/shared/src`, se reexportan en `index.ts`)**
- `schemas/fuel-logs.ts`: `createFuelLogSchema`, `updateFuelLogSchema`, `fuelLogSchema` (DTO) y `fuelLogParamsSchema`, más los tipos `CreateFuelLogInput` / `UpdateFuelLogInput` / `FuelLog`.
- `domain/fuel.ts`: `resolveFuelPrices`, `editedFuelPrices`, `fuelQuantityUnit`.
- `domain/odometer-writes.ts`: `validateOdometerWrite`, `fuelReadingChange`, `maintenanceReadingChange`, `odometerConflictMessage`, `canDeleteOdometerReading`.
- `domain/stats.ts`: `computeVehicleStats`, que usan tanto la API como `local/stats.ts`. Si los gastos tienen que contar en las estadísticas o en el coste total, es aquí.
- `schemas/common.ts`: `moneySchema`, `odometerValueSchema`. `isoDateSchema` está en `schemas/vehicles.ts`. Los enums están en `enums.ts`.

**Tests del modo local**
- `apps/web/src/test/memory-sqlite.ts`: `createMemorySqlite()`, un callback sqlite-proxy sobre better-sqlite3 en memoria. Imita el plugin y también rechaza columnas con `.`.
- `local/database.test.ts`: comprueba que el esquema local es igual al del migrador de la API, que al reabrir solo aplica las pendientes, que los hashes coinciden y que el seed se hace una sola vez.
- `local/local-data-source.test.ts`: CRUD, validación sin escribir nada, 404, conflictos de odómetro, sincronía de la lectura de fuel (`'keeps the fuel reading in sync on create, edit and delete'`), stats, serialización y los 501.
- `local/local-export.test.ts`: el `data.json` cumple `dataExportSchema`, ficheros, streaming y sink.
- Otros: `local/local-csv-import.test.ts`, `local/local-sale-report.test.ts`, `local/local-files.test.ts`, `local/local-notifications.test.ts`.
- Specs de referencia: `specs/web-data-layer/`, `specs/mobile-local-core/`.

## 2. Export/import

**Formato y versión: `packages/shared/src/schemas/data-export.ts`**
```ts
export const DATA_EXPORT_FORMAT_VERSION = 1;
const dataExportObjectSchema = z.object({
  formatVersion: z.literal(DATA_EXPORT_FORMAT_VERSION),
  appVersion: z.string().min(1), exportedAt: timestampSchema,
  settings: userSettingsSchema,
  notificationChannels: z.array(notificationChannelExportSchema),
  vehicles: z.array(vehicleExportSchema),
});
export const dataExportSchema = dataExportObjectSchema.superRefine(checkIntegrity);
```
- Los hijos van anidados en el vehículo: `vehicleExportSchema` tiene `odometerReadings`, `maintenanceSchedules`, `maintenanceRecords` (con `attachments`) y `fuelLogs`. Todos son arrays obligatorios.
- `fuelLogExportSchema` incluye `id: exportIdSchema` (regex `^[A-Za-z0-9_-]{1,64}$`), `odometerReadingId` nullable, importes con `moneySchema` y timestamps ISO.
- El esquema no aplica los `max` de longitud de los formularios, a propósito (`specs/data-export-api/design.md:87`).
- `checkIntegrity` comprueba:
  - ids únicos por colección (objeto `seen`, al que habría que añadir `expenses`);
  - que las referencias se resuelven dentro del mismo vehículo;
  - que una lectura no está enlazada dos veces (`linkReading`);
  - que las rutas de ficheros coinciden con `attachmentExportPath` / `photoExportPath` (`domain/data-export.ts`).
- Estructura del zip: `data.json` en la raíz, más `attachments/<id>.<ext>` y `photos/<vehicleId>.webp`.

**Builder compartido: `packages/shared/src/domain/data-export-builder.ts`**
- Lo usan `GET /api/me/export` y el export local.
- Define tipos de fila estructurales (`DataExportFuelLogRow` y similares), porque shared no puede importar `@ikrive/db`.
- `DataExportInputRows` tiene una lista por tabla.
- `buildDataExport({rows, settings, appVersion, exportedAt, present})` agrupa con `groupBy(vehicleId)`, mapea los campos de forma explícita y termina con `dataExportSchema.parse(...)` como defensa en profundidad.
- Tests: `domain/data-export-builder.test.ts` y `schemas/data-export.test.ts`.

**Export en la API: `apps/api/src/modules/data-export/`**
- `repository.ts` → `load(userId)`: una query por tabla, con `innerJoin(vehicles)` y `eq(vehicles.ownerId, userId)`, ordenada por `date`, `createdAt` y `rowid`.
- `service.ts`: comprueba qué ficheros existen (`presentFiles`), llama a `buildDataExport` y genera el zip en streaming con yazl.
- `routes.ts`: `GET /api/me/export`.
- Test: `apps/api/test/data-export.test.ts`.

**Export local: `apps/web/src/lib/data-source/local/data-export.ts`**
- `loadLocalExportRows(db)` copia las queries de la API con `LOCAL_USER_ID` y devuelve `notificationChannels: []`. Habría que añadir la query de `expenses` con el mismo orden que en la API.
- `localDataPortability(db, {files, exportSink}, queue)`: solo las lecturas de BD pasan por la cola.
  - Los ficheros se leen a trozos de `EXPORT_READ_BYTES = 256 KiB` con `streamDataExportZip` (`packages/shared/src/data-export-zip.ts`, sobre fflate) y se escriben en el sink (`export-sink.ts`, `apps/web/src/lib/native-export.ts`) antes de leer el trozo siguiente.
  - `data.json` va al final: `zip.finish(document)`.
- Specs de referencia: `specs/mobile-local-export*`.

**Import en la API (`POST /api/me/import`): `apps/api/src/modules/data-import/`**
- **`service.ts`**, en este orden:
  1. abre el zip con límites;
  2. lee `data.json` y calcula `dataSha256 = sha256(bytes)`;
  3. `parseDocument`: JSON → `formatVersion` (400 «Unsupported export format version X (supported: 1)») → `dataExportSchema.safeParse` (400 con `errors[]`, máximo 20);
  4. `repo.hasImport` → 409 de import repetido;
  5. `checkSettings` → 409 si `currency`, `distanceUnit` o `volumeUnit` no coinciden;
  6. `referencedFiles` y `checkDeclaredSizes`;
  7. guarda los ficheros uno a uno, revalidando tipo, sha y tamaño;
  8. `buildPlan`: ids nuevos con `randomUUID()` y referencias traducidas por mapas viejo→nuevo (`readingOf` para `odometerReadingId`, `scheduleIds`);
  9. `repo.insert`.
  - Si algo falla, se borran los ficheros ya guardados (`written`).
  - El bucle `for (const fuelLog of vehicle.fuelLogs) plan.fuelLogs.push({...})` es la plantilla para `expenses`.
- **`repository.ts`**:
  - `ImportPlan` tiene una lista `Insert<typeof table>[]` por tabla, e `ImportCounts = { [K in keyof ImportPlan]: number }`.
  - `insertPlan` hace una transacción síncrona: primero `data_imports` y luego padres antes que hijos, por lotes de 500.
- **Resumen**: `packages/shared/src/schemas/data-import.ts`, `dataImportSummarySchema`, con un contador por entidad. Habría que añadir `expenses` aquí, en `data-section.tsx` (lista de claves, línea ~32) y en las claves i18n `dataPortability.summary.*` de `es.json` y `en.json`.
- **Web**: `apps/web/src/features/data-portability/import.ts` (`importErrorKey`) y `data-section.tsx`.
- **Tests**: `apps/api/test/data-import.test.ts` (por ejemplo `'rejects an unsupported formatVersion'`, línea 589).
- **Specs**: `specs/data-import-api/`, `specs/data-portability-web/`.

**Compatibilidad con zips antiguos**
- No existe ningún mecanismo ni precedente: el esquema nació completo y nunca se ha ampliado.
- La versión solo se comprueba por igualdad, y `specs/data-import-api/design.md:111` deja fuera de alcance «Formatos distintos de `formatVersion: 1`».
- Opciones para el spec:
  - (a) `expenses: z.array(...).default([])` dentro de `vehicleExportSchema`, manteniendo la v1. Es compatible hacia atrás. El builder siempre lo emitiría, y los exports nuevos con `expenses` serían rechazados por servidores antiguos.
  - (b) Subir a `formatVersion: 2` y aceptar 1 y 2 con un upgrade de v1 a v2. Habría que cambiar `parseDocument` y `z.literal`.
- La única nota de compatibilidad que hay es la de huellas en `specs/import-dedupe/design.md`: los imports anteriores a #44 no tienen huella y el primer reimport se acepta.

**Deduplicación (#44 import-dedupe)**: `specs/import-dedupe/{requirements,design,tasks}.md`
- La huella es el SHA-256 de los bytes de `data.json`, no del zip.
- Tabla `data_imports` (`packages/db/src/schema/data-imports.ts`, migración `0012_data_imports.sql`):
  - `UNIQUE (user_id, data_sha256)`;
  - `ON DELETE CASCADE` desde `user`;
  - no se exporta.
- `repo.hasImport` es solo un atajo. La garantía real es el índice único. Si `insertPlan` choca con `SQLITE_CONSTRAINT_UNIQUE` (`isUniqueViolation` recorre `cause`), lanza `duplicateImportError`: 409 con `type: DUPLICATE_IMPORT_PROBLEM_TYPE = 'urn:ikrive:problem:duplicate-import'` y detail «This export was already imported into your account on <ISO>».
- Precedencia: 400 de documento > 409 repetido > 409 de ajustes.
- El mismo zip se puede importar en otra cuenta.
- No deduplica registros sueltos ni fusiona nada. Solo avisa con `matchingVehicles`: `findMatchingVehicles` / `normalizeVehicleIdentifier` en `packages/shared/src/domain/vehicle-identifiers.ts` comparan la matrícula y el VIN normalizados con los vehículos que la cuenta ya tenía.
- Para `expenses` no hace falta tocar la deduplicación. Pero si un `data.json` cambia de contenido, por ejemplo con un `expenses: []` emitido por defecto, cambia su huella.

## 3. Borrado en cascada de un vehículo

En los dos lados las tablas hijas se apoyan en el FK `onDelete: 'cascade'` hacia `vehicles.id`: lecturas, fuel logs, mantenimientos y programaciones. Los adjuntos son polimórficos (`attachments.entityType`/`entityId`, `ATTACHMENT_ENTITY_TYPES = ['maintenance']` en `packages/shared/src/enums.ts:70`), no tienen FK y se borran a mano.

- **API**: `apps/api/src/modules/vehicles/repository.ts:66`, `delete(id)`.
  ```ts
  db.transaction((tx) => {
    const records = tx.select({ id: maintenanceRecords.id }).from(maintenanceRecords).where(eq(maintenanceRecords.vehicleId, id));
    tx.delete(attachments).where(and(eq(attachments.entityType, 'maintenance'), inArray(attachments.entityId, records))).run();
    tx.delete(vehicles).where(eq(vehicles.id, id)).run();
  });
  ```
  `apps/api/src/modules/vehicles/service.ts:88`, `remove`: lista las `storageKey` de los adjuntos con `attachments.listByVehicle(id)`, llama a `repo.delete` y después borra la foto y los ficheros con `storage.remove`. Test: `apps/api/test/vehicles.test.ts`.
- **Local**: `apps/web/src/lib/data-source/local/vehicles.ts:134`, `remove`. Es la misma transacción, pero con `.returning({ storageKey })` para obtener las claves, y luego `removeFiles(files, [...keys, vehicle.photo])`. Depende de `PRAGMA foreign_keys = ON` en `database.ts`. Test: `'archives and deletes a vehicle cascading its data'` en `local-data-source.test.ts:123`, que comprueba que las tablas hijas quedan vacías. Habría que añadir la aserción para `expenses`.
- Si `expenses` tiene `vehicleId ... { onDelete: 'cascade' }`, no hace falta código nuevo de borrado. Si tiene adjuntos (por ejemplo un ticket), habría que:
  - añadir `'expense'` a `ATTACHMENT_ENTITY_TYPES`;
  - ampliar los dos `delete` y `attachments.listByVehicle`;
  - ampliar el filtro `entityType: 'maintenance'` de las queries de export de la API y la local;
  - adaptar `attachmentExportSchema` e `ImportPlan.attachments` (`entityType`).
