# Design — data-export-api

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `packages/shared/src/schemas/data-export.ts` | **Nuevo.** `DATA_EXPORT_FORMAT_VERSION`, `dataExportSchema` y sub-esquemas, tipos `DataExport*`. |
| shared | `packages/shared/src/domain/data-export.ts` | **Nuevo.** `attachmentExportPath(id, mimeType)`, `photoExportPath(vehicleId)`, `ATTACHMENT_EXTENSIONS`. |
| shared | `packages/shared/src/index.ts` | Re-exporta ambos. |
| api | `apps/api/src/modules/data-export/repository.ts` | **Nuevo.** Lecturas por `ownerId` (6 consultas, sin N+1). |
| api | `apps/api/src/modules/data-export/service.ts` | **Nuevo.** Construye el documento y el zip. |
| api | `apps/api/src/modules/data-export/routes.ts` | **Nuevo.** `GET /me/export`. |
| api | `apps/api/src/lib/storage.ts` | Añade `exists(key): Promise<boolean>`. |
| api | `apps/api/src/app.ts` | Cablea repo → service → routes. |
| api | `apps/api/package.json` | `yazl` (dep), `@types/yazl`, `yauzl`, `@types/yauzl` (dev, para leer el zip en tests; #35 lo pasará a dep). |
| tests | `packages/shared/src/schemas/data-export.test.ts`, `apps/api/test/data-export.test.ts` | **Nuevos.** |

Sin cambios de BD ni migración.

## Qué entra y qué no (tabla por tabla)

| Tabla | ¿Entra? | Motivo |
|---|---|---|
| `user` | ❌ | El import añade a la cuenta de destino; nombre/email no se importan y son PII innecesaria. |
| `session`, `account`, `verification` | ❌ | Secretos de Better Auth (tokens, hash de contraseña, tokens OAuth). |
| `user_settings` | ✅ `settings` | Sin `userId`. |
| `vehicles` | ✅ `vehicles[]` | Todos los estados. Sin `ownerId`; `photo` (clave de disco) se sustituye por `photoPath`. |
| `odometer_readings` | ✅ `vehicles[].odometerReadings[]` | Todas las fuentes, para que las referencias de mantenimientos/repostajes resuelvan. |
| `maintenance_schedules` | ✅ `vehicles[].maintenanceSchedules[]` | |
| `maintenance_records` | ✅ `vehicles[].maintenanceRecords[]` | Con `scheduleId` y `odometerReadingId`. |
| `attachments` | ✅ `maintenanceRecords[].attachments[]` + fichero | Sin `ownerId`, `entityType`, `entityId` (implícitos por anidamiento) ni `storageKey`. |
| `fuel_logs` | ✅ `vehicles[].fuelLogs[]` | |
| `notification_channels` | ✅ `notificationChannels[]` | Sin `id`, `userId`, `lastError`; `config` sin `token` + `hasToken`. |
| `notifications` | ❌ | Derivadas de los jobs; su `dedupe_key` es único global y chocaría al importar. |
| `report_shares` | ❌ | Un enlace sin token es inútil y el token no se puede reconstruir. |
| `calendar_feeds` | ❌ | Solo contiene el selector y el hash del token. |

## Formato de `data.json` (v1)

```jsonc
{
  "formatVersion": 1,
  "appVersion": "0.1.0",
  "exportedAt": "2026-11-02T10:00:00.000Z",
  "settings": { "currency": "EUR", "distanceUnit": "km", "volumeUnit": "l", "locale": "es",
                "timezone": "Europe/Madrid", "odometerReminderWeekday": 0, "reminderHour": 8 },
  "notificationChannels": [
    { "type": "gotify", "enabled": true, "hasToken": true, "config": { "serverUrl": "https://…" },
      "createdAt": "…", "updatedAt": "…" }
  ],
  "vehicles": [{
    "id": "<uuid>", "name": null, "make": "Seat", "model": "Ibiza", "version": null, "year": 2018,
    "plate": "1234ABC", "vin": null, "type": "car", "fuelType": "gasoline",
    "purchaseDate": "2018-03-01", "purchasePrice": 12000, "purchaseOdometer": 0, "notes": null,
    "soldAt": null, "archivedAt": null, "createdAt": "…", "updatedAt": "…",
    "photoPath": "photos/<vehicleId>.webp",
    "odometerReadings": [{ "id": "…", "date": "2024-01-01", "value": 1000, "source": "manual", "createdAt": "…" }],
    "maintenanceSchedules": [{ "id": "…", "title": "…", "category": "oil_change", "intervalMonths": 12,
      "intervalDistance": 15000, "warnDays": 30, "warnDistance": 1000, "lastDoneDate": "…",
      "lastDoneOdometer": null, "createdAt": "…", "updatedAt": "…" }],
    "maintenanceRecords": [{ "id": "…", "date": "…", "odometer": 1200, "odometerReadingId": "…",
      "category": "oil_change", "title": "…", "description": null, "workshop": null, "cost": 89.9,
      "includeInReport": true, "scheduleId": "…", "createdAt": "…", "updatedAt": "…",
      "attachments": [{ "id": "…", "originalName": "factura.pdf", "mimeType": "application/pdf",
        "size": 1234, "sha256": "…", "path": "attachments/<id>.pdf", "createdAt": "…" }] }],
    "fuelLogs": [{ "id": "…", "date": "…", "odometer": 1500, "odometerReadingId": "…", "quantity": 40.5,
      "totalPrice": 60.75, "pricePerUnit": 1.5, "fullTank": true, "missedPrevious": false,
      "createdAt": "…", "updatedAt": "…" }]
  }]
}
```

- **Remapeo (#35):** los `id` son los UUID de la BD usados como referencias opacas locales al documento. El import crea filas nuevas y traduce `scheduleId`/`odometerReadingId` con un mapa `idViejo → idNuevo` por vehículo. La pertenencia (vehículo → hijos, mantenimiento → adjuntos) va por anidamiento, así que no hay `vehicleId`/`entityId` que remapear.
- **Fechas:** las de calendario siguen como `YYYY-MM-DD`; los timestamps (`createdAt`, `updatedAt`, `archivedAt`) en ISO 8601.
- **Orden estable** (para el test de ida y vuelta de #35): vehículos por `createdAt`; lecturas, mantenimientos y repostajes por `date` y `createdAt`; programaciones, adjuntos y canales por `createdAt` (con `rowid` como desempate).
- **Unidades:** valores tal cual, en las unidades de `settings` (decisión del PLAN: no se convierten).

## Esquema (`packages/shared/src/schemas/data-export.ts`)

```ts
export const DATA_EXPORT_FORMAT_VERSION = 1;
export const dataExportSchema: z.ZodType<DataExport>; // z.object({...}).superRefine(checkIntegrity)
export type DataExport = z.infer<typeof dataExportSchema>;
export type DataExportVehicle = DataExport['vehicles'][number];
```

- Campos con validadores estructurales ya existentes: `z.enum(...)` de `enums.ts`, `isoDateSchema`, `odometerValueSchema`, `moneySchema`, `userSettingsSchema`, `z.iso.datetime()`, enteros ≥ 0. **No** reaplica los `max` de longitud de los formularios: datos antiguos válidos en BD no deben romper el export.
- `formatVersion: z.literal(DATA_EXPORT_FORMAT_VERSION)` (R15).
- Canales: `z.discriminatedUnion('type', …)` con `config` sin `token` (`ntfy: {serverUrl, topic}`, `gotify: {serverUrl}`, `apprise: {serverUrl, key, tag?}`, `webhook: {url}`). Objetos en modo por defecto de zod (strip): si llegase un `token`, `parse` lo descarta.
- `superRefine` (R16, R17): ids únicos por colección (vehículos; lecturas, programaciones, mantenimientos, repostajes y adjuntos en todo el documento); `scheduleId`/`odometerReadingId` existen en el mismo vehículo; `odometerReadingId` no se repite entre mantenimientos y repostajes; `path === attachmentExportPath(id, mimeType)` y `photoPath === photoExportPath(vehicle.id)`. Las rutas se comparan con la generada, así que `../`, rutas absolutas o ids con `/` quedan rechazados por construcción; además `id` acepta solo `^[A-Za-z0-9_-]{1,64}$`.
- `domain/data-export.ts`: `ATTACHMENT_EXTENSIONS: Record<AttachmentMimeType, 'pdf'|'jpg'|'png'|'webp'>`.

## Servicio y zip

```ts
createDataExportService({ repo, settings, storage, log }): {
  /** Documento + stream del zip; no lee ningún fichero hasta que se consume el stream. */
  export(userId: string): Promise<{ fileName: string; document: DataExport; stream: Readable }>;
}
```

1. `repo.load(userId)` → filas; `settings.get(userId)`.
2. Comprueba con `storage.exists(key)` cada adjunto y foto; los que faltan se omiten (R19) con `log.warn({ attachmentId | vehicleId }, 'export: missing file')`.
3. Construye el documento y lo pasa por `dataExportSchema.parse` (defensa en profundidad: R14 y strip de claves desconocidas).
4. `new yazl.ZipFile()`: `addBuffer(JSON.stringify(document, null, 2), 'data.json')` (deflate) y, por cada fichero referenciado, `addReadStreamLazy(path, { compress: false }, (cb) => cb(null, storage.read(key)))`: los binarios (PDF/JPEG/PNG/WebP) ya van comprimidos. `end()`; se devuelve `zip.outputStream`.
5. `fileName = ikrive-export-${todayIn(settings.timezone)}.zip`.

`repo.load` filtra siempre por `vehicles.ownerId = userId` (con `innerJoin` para hijos) y `attachments.ownerId = userId` **y** `entityId` ∈ mantenimientos del usuario.

## Contrato HTTP

`GET /api/me/export` — `preHandler: app.authenticate`.

| Respuesta | Cuándo |
|---|---|
| 200 `application/zip`, `Content-Disposition: attachment; filename="ikrive-export-YYYY-MM-DD.zip"` (vía `contentDisposition`), `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`; cuerpo = stream (sin `Content-Length`) | Siempre con sesión |
| 401 problem+json | Sin sesión |

Si el stream falla a mitad (fichero borrado entre la comprobación y la lectura), las cabeceras ya se enviaron: Fastify destruye la conexión y el cliente recibe un zip truncado; se registra el error.

## Por qué `yazl`

- Escritura en streaming real con `addReadStreamLazy`: abre cada fichero cuando le toca, uno a la vez (R18), sin agotar descriptores con cientos de facturas.
- Una sola dependencia (`buffer-crc32`), JS puro: no toca el Dockerfile ni engorda la imagen (pendiente de reducir en fase 7). Tipos en `@types/yazl`.
- Pareja natural de `yauzl` para el import (#35): lectura perezosa por entrada, `validateEntrySizes` y rechazo de rutas absolutas o con `..` (zip bombs y path traversal).
- ZIP64 automático si se supera 4 GB.

## Alternativas descartadas

- **`archiver`:** muy usado, pero arrastra ~10 dependencias (`async`, `readable-stream`, `tar-stream`, `readdir-glob`, `lazystream`…) para funciones que no usamos (tar, globs). Peso de imagen.
- **`fflate`** (ya transitiva vía pdfkit): su `Zip` es push y síncrono por chunks; habría que gestionar a mano la contrapresión con los streams de Node. Sin pareja de lectura equivalente a `yauzl`.
- **Generar el zip en un fichero temporal y luego servirlo:** duplica el espacio en disco del volumen `/data` y retrasa el primer byte.
- **Formato plano por tablas** (`vehicles[]`, `maintenanceRecords[]` con `vehicleId`…): espeja la BD, pero obliga al import a remapear también `vehicleId`/`entityId` y permite referencias cruzadas entre vehículos; el anidado hace la pertenencia estructural.
- **Ids secuenciales propios del export** (`v1`, `r1`…): sin ventaja real frente a los UUID y añade un paso de traducción en el export.

## Impacto en UI

Ninguno (la web llega en #36).

## Decisiones a validar (Gate 1)

1. **Fotos de vehículos incluidas** en `photos/<vehicleId>.webp` (no las menciona el acceptance, pero son datos del usuario y el paso móvil → servidor las necesita).
2. **Canales sin token pero exportados**, con `hasToken`. El import (#35) tendrá que decidir qué hace con un `gotify` (token obligatorio): probablemente importarlo desactivado o saltarlo. `serverUrl`, `topic` y `key` sí se exportan (la API ya los devuelve; solo `token` se trata como secreto).
3. **Fichero perdido en disco → se omite** el adjunto (o la foto) con un aviso en el log, en vez de fallar todo el export: un backup parcial es mejor que ninguno.
4. **Sin datos de perfil** (`user.name`, `email`) ni notificaciones in-app.
5. Nombre `ikrive-export-YYYY-MM-DD.zip` con la fecha en la zona del usuario.

## Riesgos

- `dataExportSchema.parse` en el export puede fallar con datos raros heredados → 500 antes de las cabeceras. Mitigado no aplicando límites de longitud; el test de integración valida el documento generado.
- Error a mitad de stream → zip truncado sin señal HTTP. Ventana pequeña (comprobación previa con `exists`).
- Petición larga con muchos adjuntos: aplica el rate limit global (300/min); sin límite propio.

## Fuera de alcance

- Export de un solo vehículo (después de v0.1.0).
- Import (#35) y botones en Ajustes (#36).
- Cifrado del zip, exports programados o incrementales.
