# Design — data-import-api

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `packages/shared/src/schemas/data-import.ts` | **Nuevo.** `dataImportSummarySchema` y `DataImportSummary` (respuesta 201, la usará la web en #36). Re-export en `index.ts`. |
| api | `apps/api/src/config.ts` | `IMPORT_MAX_MB` (entero > 0, por defecto `1024`). |
| api | `apps/api/src/lib/errors.ts` | `PayloadTooLargeError` (413). `AppError` admite `errors?: { path; message }[]` opcional. |
| api | `apps/api/src/plugins/errors.ts` | Si un `AppError` trae `errors`, se incluyen en el problem (el campo ya existe en `problemSchema`). |
| api | `apps/api/src/lib/zip-reader.ts` | **Nuevo.** Envoltorio de `yauzl` con promesas: `openZip(path, limits)` indexa y valida entradas; `readEntry(entry, maxBytes)` → `Buffer`. |
| api | `apps/api/src/modules/data-import/service.ts` | **Nuevo.** Valida el documento, los ficheros y los límites; guarda ficheros; construye el plan con ids nuevos; limpia si falla. |
| api | `apps/api/src/modules/data-import/repository.ts` | **Nuevo.** `insert(userId, plan)` en **una** `db.transaction`. |
| api | `apps/api/src/modules/data-import/routes.ts` | **Nuevo.** `POST /me/import`. |
| api | `apps/api/src/app.ts` | Cablea repo → service → routes; `tmpDir = join(DATA_DIR, 'tmp')`. |
| api | `apps/api/package.json` | `yauzl` pasa de `devDependencies` a `dependencies` (`@types/yauzl` sigue en dev). |
| docs | `README.md`, `.env.example` | `IMPORT_MAX_MB`. |
| tests | `apps/api/test/data-import.test.ts` | **Nuevo.** |

Sin cambios de BD ni migración. Reutiliza `dataExportSchema`, `DATA_EXPORT_FORMAT_VERSION`, `notificationChannelConfigSchema`, `detectAttachmentType` (`lib/file-type.ts`), `assertDecodableImage` (`lib/images.ts`), `sanitizeFileName` (`modules/attachments/service.ts`), `storage.save/remove` y `settings.get`.

## Contrato HTTP

`POST /api/me/import` — `preHandler: app.authenticate`, `multipart/form-data` con el zip en `file`.

| Respuesta | Cuándo | R |
|---|---|---|
| 201 `DataImportSummary` | Import completo | R1 |
| 400 | Sin `file`; no es zip; entradas inseguras, duplicadas, cifradas o > 50 000; falta `data.json` o no es JSON; `formatVersion`; esquema (`errors[]`, máx. 20); fichero referenciado ausente; `size`/`sha256` distintos; tamaño real ≠ declarado | R3–R6, R13, R15, R24, R25 |
| 401 | Sin sesión | R2 |
| 409 | `currency`/`distanceUnit`/`volumeUnit` ≠ ajustes del usuario | R7 |
| 413 | Zip > `IMPORT_MAX_MB`; `data.json` > 32 MiB; fichero > `MAX_UPLOAD_MB`; suma > `IMPORT_MAX_MB` | R22, R23 |
| 415 | Adjunto de tipo no permitido / distinto de `mimeType` / imagen corrupta; foto que no es WebP decodificable | R12, R14 |

Todas en `application/problem+json`; el `detail` nombra la ruta del zip implicada (`attachments/<id>.pdf`).

```ts
// packages/shared/src/schemas/data-import.ts
const count = z.number().int().min(0);
export const dataImportSummarySchema = z.object({
  vehicles: count, odometerReadings: count, maintenanceSchedules: count, maintenanceRecords: count,
  fuelLogs: count, attachments: count, photos: count, notificationChannels: count,
  skipped: z.object({ notificationChannels: count }),
});
```

## Flujo

```ts
createDataImportService({ repo, settings, storage, tmpDir, limits, log }): {
  import(userId: string, zipPath: string): Promise<DataImportSummary>;
}
interface ImportLimits { zipBytes: number; totalBytes: number; fileBytes: number; dataJsonBytes: number; entries: number }
// app.ts: zipBytes = totalBytes = IMPORT_MAX_MB MiB; fileBytes = MAX_UPLOAD_MB MiB; dataJsonBytes = 32 MiB; entries = 50_000
```

1. **Ruta.** `request.file({ limits: { fileSize: limits.zipBytes, files: 1 } })` (sustituye al límite global de 20 MB solo aquí). Sin fichero → 400. Se vuelca con `pipeline` a `tmpDir/import-<uuid>.zip`; si se pasa del límite, `@fastify/multipart` lanza su 413 (R22). `try { service.import } finally { rm(zipPath, { force: true }) }` (R21).
2. **Índice del zip** (`openZip`): `yauzl.open(path, { lazyEntries: true, autoClose: false, strictFileNames: true, validateEntrySizes: true })`. `entryCount > entries` → 400. Se recorren las cabeceras del directorio central (no se descomprime nada) y se construye `Map<nombre, Entry>`; nombre repetido o `entry.isEncrypted()` → 400. Con `decodeStrings` (por defecto) yauzl rechaza rutas absolutas y con `..`, y `strictFileNames` las que tienen `\`: su error se traduce a 400 (R25). Cualquier otro error de yauzl (no es zip) → 400 (R3).
3. **Límites declarados** (R23): `data.json` > `dataJsonBytes` → 413. Tras validar el esquema, cada fichero referenciado > `fileBytes` → 413 y la suma de `uncompressedSize` de `data.json` + referenciados > `totalBytes` → 413. Todo antes de abrir ningún stream.
4. **Documento.** `readEntry(data.json)` → `JSON.parse` (400, R4). Antes del esquema: `formatVersion !== DATA_EXPORT_FORMAT_VERSION` → 400 «Unsupported export format version X (supported: 1)» (R5). `dataExportSchema.safeParse` → 400 con `errors` (R6). Ajustes: compara `currency`, `distanceUnit`, `volumeUnit` con `settings.get(userId)` → 409 (R7).
5. **Referencias.** Cada `path`/`photoPath` debe estar en el índice → si no, 400 (R15). Las demás entradas nunca se abren (R16).
6. **Ficheros, uno a uno** (memoria acotada a `fileBytes`, igual que la subida normal): `readEntry(entry, fileBytes)` cuenta los bytes y aborta si pasan del máximo; con `validateEntrySizes` yauzl emite error si los bytes reales ≠ declarados → 400 (R24, zip bomb con cabecera mentirosa). Luego:
   - Adjunto: `detectAttachmentType` ≠ `mimeType` o `null` → 415; imagen → `assertDecodableImage` o 415 (R12). `length ≠ size` o SHA-256 ≠ `sha256` → 400 (R13). `storage.save('attachments', buf, ext)`.
   - Foto: `detectAttachmentType` = `image/webp` + `assertDecodableImage`, si no 415; `storage.save('vehicles', buf, 'webp')` (R14).
   - Cada clave guardada se apunta en `written: string[]`.
7. **Plan** (función pura del servicio): ids nuevos con `randomUUID()` y mapas `viejo → nuevo` por colección; `scheduleId`/`odometerReadingId` se traducen con ellos (R9). Mantiene campos y timestamps del documento (R8), `ownerId`/`userId` = usuario, `entityType: 'maintenance'`, `entityId` = id nuevo del mantenimiento, `storageKey`/`photo` = claves del paso 6, `originalName = sanitizeFileName(originalName, ext)` (R11). Canales: `hasToken === false` y `notificationChannelConfigSchema.safeParse({ type, config })` ok → se crean; si no, `skipped++` (R17, R18).
8. **BD**: `repo.insert(userId, plan)` en una sola `db.transaction` síncrona (better-sqlite3): vehículos → lecturas → programaciones → mantenimientos → repostajes → adjuntos → canales, inserts multi-fila en lotes de 500 (límite de variables de SQLite), en el orden del documento para que el `rowid` conserve el desempate del export. Solo `INSERT`: nada existente se toca (R10). Devuelve los contadores.
9. **Fallo en 6–8** → `catch`: `for (key of written) await storage.remove(key)` (errores de borrado solo se registran con `log.error`) y se relanza (R20). La transacción ya hizo rollback (R19). Los ficheros se escriben **antes** que la BD: si algo falla, lo único a deshacer son ficheros con nombre aleatorio que ninguna fila referencia.
10. `zip.close()` siempre en `finally`.

## Decisiones sobre los puntos abiertos

1. **Límites y zip bombs.** Zip ≤ `IMPORT_MAX_MB` (1 GiB por defecto: un export guarda los adjuntos sin comprimir y cada uno puede llegar a `MAX_UPLOAD_MB`), `data.json` ≤ 32 MiB (≈ cientos de miles de registros; acota de paso las cadenas sin `max` del esquema, aviso del reviewer de #34), cada fichero ≤ `MAX_UPLOAD_MB` (como la subida normal), suma descomprimida ≤ `IMPORT_MAX_MB`, ≤ 50 000 entradas. Los límites se comprueban sobre los tamaños **declarados** antes de descomprimir y `validateEntrySizes` garantiza que el real coincide, así que no hace falta un ratio de compresión. **Path traversal:** los nombres de entrada nunca se usan para construir rutas en disco (las claves salen de `storage.save`, aleatorias); solo se buscan en el índice con las rutas que genera el esquema. Aun así, un zip con nombres inseguros se rechaza entero (R25).
2. **Tipo real de los ficheros**: mismo código que la subida (`detectAttachmentType` + `assertDecodableImage`, 415). Las fotos **no se recodifican** con `toWebpPhoto`: ya salieron recodificadas del export; recodificar cambiaría los bytes (rompe la ida y vuelta) y perdería calidad en cada migración. Se exige WebP decodificable.
3. **Atomicidad BD + disco**: ficheros primero, una única transacción después, borrado compensatorio de `written` si algo falla. Única ventana: que el proceso muera entre guardar ficheros y el commit → quedan ficheros huérfanos inaccesibles (riesgo aceptado).
4. **Ajustes no se importan.** La cuenta de destino ya tiene sus preferencias (idioma, zona, hora de aviso) y el import añade, no sobrescribe. Pero como km y dinero se guardan sin convertir en la unidad del usuario, importar datos en otra moneda o unidad los corrompería en silencio: se exige que `currency`, `distanceUnit` y `volumeUnit` coincidan (409 con las diferencias; el usuario cambia sus ajustes y reintenta). `locale`, `timezone`, `odometerReminderWeekday` y `reminderHour` se ignoran.
   **Canales con token → se omiten** y se cuentan en `skipped`. Justificación: sin su secreto no pueden enviar (Gotify lo exige y los ntfy/webhook protegidos fallarían); guardarlos sin token rompería el invariante de `notificationChannelConfigSchema` (Gotify con `token` obligatorio) y el `PATCH` «sin token conserva el guardado» dejaría un canal desactivado imposible de arreglar sin recrearlo. Recrearlo es un formulario; el resumen avisa. Los canales sin token se importan tal cual (`enabled` incluido), revalidados con el esquema estricto porque el del export solo exige `string` (evita colar una URL `file:` o con credenciales a la que el servidor haría POST).
5. **Jobs.** El import no crea notificaciones ni llama al dispatcher (R26). En la siguiente ejecución horaria, `reminders.job` avisará de las programaciones importadas que estén próximas o vencidas en vehículos activos (sus ids nuevos dan `dedupe_key` nuevas) y `odometer-nudge` incluirá los vehículos activos sin lectura reciente en su aviso semanal (como mucho uno por usuario y semana). Es lo mismo que pasaría si el usuario los diera de alta a mano y refleja un estado real; no se suprime.
6. **Ficheros sin referencia → se ignoran** (p. ej. `__MACOSX/` al recomprimir); **referencias sin fichero → 400** (el export ya omite del documento los ficheros perdidos, así que es un zip corrupto o manipulado).

## Alternativas descartadas

- **Leer el zip entero en memoria** (`toBuffer` + `yauzl.fromBuffer`): hasta 1 GiB de RAM por petición. El fichero temporal en `DATA_DIR/tmp` (mismo volumen que `uploads/`) permite el acceso aleatorio que necesita el directorio central sin memoria.
- **Insertar en BD primero y escribir ficheros después**: deshacer exigiría borrar filas ya confirmadas (o mantener la transacción abierta durante I/O asíncrona, imposible con la API síncrona de better-sqlite3).
- **Reutilizar los servicios de alta** (`vehiclesService.create`, `maintenanceService.create`…): cada uno abre su transacción, crea su propia lectura de odómetro y aplica `findOdometerConflict` y `lastDone`; no hay atomicidad global y duplicaría lecturas.
- **Importar los canales con token desactivados**: ver punto 4.
- **Sobrescribir los ajustes con los del documento**: contradice «añade, no sobrescribe» y cambiaría la unidad de los vehículos que ya tenía la cuenta.

## Impacto en UI

Ninguno (la web llega en #36 y consumirá `DataImportSummary` y los problem 400/409/413/415).

## Decisiones a validar (Gate 1)

1. **409 si moneda o unidades no coinciden** (en vez de importar igualmente o aplicar los ajustes del documento).
2. **Canales con token omitidos**, no importados desactivados.
3. **Fotos guardadas tal cual** (WebP validado), sin recodificar.
4. **`IMPORT_MAX_MB` = 1024** por defecto; `data.json` ≤ 32 MiB y ≤ 50 000 entradas fijos.
5. **Códigos**: 413 para cualquier límite de tamaño y 415 para tipos de fichero (como en la subida); el resto, 400.
6. **Sin revalidar reglas de negocio** (monotonía del odómetro, longitudes de los formularios): son los datos del propio usuario, el esquema garantiza la integridad referencial y `data.json` está acotado.

## Riesgos

- Proceso caído a mitad → ficheros huérfanos en `uploads/` y quizá un `tmp/import-*.zip`. Inofensivos (nombres aleatorios, sin filas). Una limpieza al arrancar queda fuera.
- Import grande: petición larga y transacción de escritura que bloquea otras escrituras unos segundos (lotes de 500 filas).
- Un documento manipulado puede meter lecturas no monótonas o textos largos en la cuenta de su propio usuario (decisión 6).

## Fuera de alcance

- UI de import (#36), import de un solo vehículo, «sustituir» en vez de añadir.
- Formatos distintos de `formatVersion: 1`, conversión de unidades o moneda.
- Limpieza de huérfanos al arrancar.
