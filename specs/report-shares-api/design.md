# Design — report-shares-api

Módulo nuevo `report-shares` que copia el esquema de token de `calendar` y delega la generación del PDF en `ReportsService.generate` (#29/#30). Sin UI (es #33).

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `packages/shared/src/schemas/report-shares.ts` (nuevo) | `reportShareOptionsSchema`, `createReportShareSchema`, `reportShareSchema`, `reportShareSecretSchema`, `reportShareParamsSchema`. |
| shared | `packages/shared/src/schemas/report-shares.test.ts` (nuevo) | Defaults, límites de `expiresInDays`, rechazo de flags en string. |
| shared | `packages/shared/src/domain/report-shares.ts` (+ `.test.ts`) | `reportShareStatus`. |
| shared | `packages/shared/src/enums.ts` | `REPORT_SHARE_STATUSES = ['active', 'expired', 'revoked']`. |
| shared | `packages/shared/src/index.ts` | Re-exportar los dos módulos nuevos. |
| api | `apps/api/src/db/schema/report-shares.ts` (nuevo) + `index.ts` | Tabla `report_shares`. |
| api | `apps/api/src/db/migrations/0010_*.sql` | `pnpm db:generate`. |
| api | `apps/api/src/modules/report-shares/repository.ts` | `listByVehicle`, `find(vehicleId, id)`, `findBySelector` (con `ownerId` del vehículo), `create`, `revoke`. |
| api | `apps/api/src/modules/report-shares/service.ts` | `create`, `list`, `revoke`, `render`. |
| api | `apps/api/src/modules/report-shares/routes.ts` | Dos plugins: `reportSharesRoutes` (con `app.authenticate`) y `publicReportRoutes` (sin hook). |
| api | `apps/api/src/app.ts` | Conectar el servicio (`repo`, `vehicles`, `reports: reportsService`, `baseUrl: config.BASE_URL`) y registrar los dos plugins bajo `/api`. |
| test | `apps/api/test/report-shares.test.ts` (nuevo) | Integración. |

`lib/tokens.ts` (`generateFeedToken`, `parseFeedToken`, `hashVerifier`, `verifierMatches`) se reutiliza sin cambios.

## Base de datos

```ts
export const reportShares = sqliteTable('report_shares', {
  id: id(),                                           // randomUUID
  vehicleId: text().notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  selector: text().notNull(),
  verifierHash: text().notNull(),                     // hex SHA-256
  hidePrices: integer({ mode: 'boolean' }).notNull().default(false),
  hidePlate: integer({ mode: 'boolean' }).notNull().default(false),
  hideVin: integer({ mode: 'boolean' }).notNull().default(false),
  includeInvoices: integer({ mode: 'boolean' }).notNull().default(false),
  expiresAt: integer({ mode: 'timestamp_ms' }).notNull(),
  revokedAt: integer({ mode: 'timestamp_ms' }),
  createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  uniqueIndex('report_shares_selector_idx').on(t.selector),
  index('report_shares_vehicle_id_idx').on(t.vehicleId),
]);
```

Sin `owner_id`: la propiedad sale de `vehicles.owner_id` (igual que el resto de tablas hijas). La cascada desde `vehicles` (y desde `user` a través de `vehicles`) borra los enlaces; `foreign_keys = ON` ya está activo en `db/client.ts`. `vehiclesRepository.delete` no necesita cambios.

## Esquemas (`packages/shared`)

```ts
/** Opciones guardadas en el enlace: booleanos JSON, no `z.stringbool` (el query de report.pdf sí los usa). */
export const reportShareOptionsSchema = z.object({
  hidePrices: z.boolean().default(false),
  hidePlate: z.boolean().default(false),
  hideVin: z.boolean().default(false),
  includeInvoices: z.boolean().default(false),
});
export const createReportShareSchema = reportShareOptionsSchema.extend({
  expiresInDays: z.number().int().min(1).max(90).default(30),
});
export const reportShareSchema = z.object({
  id: z.string(),
  hidePrices: z.boolean(), hidePlate: z.boolean(), hideVin: z.boolean(), includeInvoices: z.boolean(),
  expiresAt: z.string(), revokedAt: z.string().nullable(), createdAt: z.string(),
  status: z.enum(REPORT_SHARE_STATUSES),
});
export const reportShareSecretSchema = reportShareSchema.extend({ url: z.url() });  // solo en el 201
export const reportShareParamsSchema = z.object({ id: z.string().min(1), shareId: z.string().min(1) });
// tipos: CreateReportShare (z.input), ReportShare, ReportShareSecret, ReportShareStatus
```

`z.output<typeof reportShareOptionsSchema>` es estructuralmente igual a `SaleReportOptions`, así que las opciones de la fila se pasan tal cual a `generate`. El cuerpo es obligatorio como objeto JSON (`{}` toma todos los valores por defecto). `"true"` en string → 400 (R5).

```ts
// domain/report-shares.ts
export function reportShareStatus(
  share: { expiresAt: Date | string; revokedAt: Date | string | null }, now: Date,
): ReportShareStatus  // revoked > expired (now >= expiresAt) > active
```

Revocado tiene prioridad sobre caducado: si el usuario lo revocó, eso es lo que quiere ver aunque además haya caducado. La función vive en shared para que #33 la pueda reutilizar si la necesita, pero la API ya devuelve `status` calculado con el reloj del servidor.

## Servicio

```ts
interface ReportSharesServiceDeps {
  repo: ReportSharesRepository; vehicles: VehiclesRepository; reports: ReportsService; baseUrl: string;
}
create(userId, vehicleId, input: CreateReportShare, now = new Date()): ReportShareSecret
list(userId, vehicleId, now = new Date()): ReportShare[]
revoke(userId, vehicleId, shareId, now = new Date()): void
render(token: string, log: FastifyBaseLogger, now = new Date()): Promise<{ fileName: string; pdf: Buffer }>
```

- `requireVehicle` = `vehicles.findOwned` → `NotFoundError('Vehicle not found')` (R12). `revoke` además `repo.find(vehicleId, shareId)` → `NotFoundError('Report share not found')` (R13); si ya tiene `revokedAt`, no escribe (R11).
- `create`: `generateFeedToken()`, guarda `selector` + `hashVerifier(verifier)`, `expiresAt = new Date(now.getTime() + days * 86_400_000)`; `url = new URL(`/api/public/reports/${token}`, baseUrl).href`.
- `render` (R16, R17), un único error para todo:
  ```ts
  const parsed = parseFeedToken(token);
  const row = parsed && repo.findBySelector(parsed.selector);   // { share, ownerId }
  if (!parsed || !row || !verifierMatches(parsed.verifier, row.share.verifierHash)
      || reportShareStatus(row.share, now) !== 'active') throw new NotFoundError('Report not found');
  return reports.generate(row.ownerId, row.share.vehicleId, optionsOf(row.share), log);
  ```
  `generate` vuelve a comprobar `findOwned(ownerId, vehicleId)`, que siempre se cumple aquí.

## Contrato HTTP

| Método y ruta | Cuerpo | Éxito | Errores |
|---|---|---|---|
| `POST /api/vehicles/:id/report-shares` | `CreateReportShare` | 201 `ReportShareSecret` | 400 · 401 · 404 vehículo |
| `GET /api/vehicles/:id/report-shares` | — | 200 `ReportShare[]` (más reciente primero) | 401 · 404 vehículo |
| `DELETE /api/vehicles/:id/report-shares/:shareId` | — | 204 (idempotente) | 401 · 404 vehículo o enlace |
| `GET /api/public/reports/:token` | — | 200 `application/pdf` | 404 (detail `Report not found`, siempre igual) · 429 |

Ruta pública: `.type('application/pdf')`, `content-disposition: contentDisposition(fileName, 'inline')`, `cache-control: private, no-store`, `x-robots-tag: noindex`, `x-content-type-options: nosniff`; `config: { rateLimit: { max: 10, timeWindow: '1 minute' } }` (mismo límite que `report.pdf`: cada petición válida renderiza un PDF). El límite es por IP (`trustProxy: true`) y cuenta también las respuestas 404, lo que frena el sondeo de tokens. `:token` sin extensión `.pdf`: el nombre del fichero ya va en `Content-Disposition` y así no se repite el truco `:file` del calendario.

## Tests (`apps/api/test/report-shares.test.ts`)

`setup()` = `createTestApp()` + `signUp` → `{ app, db, cookie }`. La URL pública se pide con `new URL(url).pathname` sin cookie. Caducidad: se fuerza `expires_at` al pasado con `db.update(reportShares)` (no hace falta falsear el reloj). Texto del PDF con `extractText` de `unpdf`, como `reports.test.ts`. Rate limit con 10 tokens mal formados (404 rápidos) y un 11.º → 429.

## Impacto en UI

Ninguno (#33). La web obtendrá `ReportShare`/`ReportShareSecret` de `@ikrive/shared`.

## Alternativas descartadas

- **Guardar las opciones en una columna JSON:** más flexible, pero sin tipos en SQL y el acceptance pide las cuatro columnas.
- **Reutilizar `saleReportQuerySchema` para el cuerpo:** `z.stringbool` aceptaría `"true"`/`"1"` en JSON; un cuerpo JSON usa booleanos de verdad.
- **Borrar la fila al revocar:** el listado debe mostrar el estado `revoked` (acceptance) y #33 lo pinta.
- **Guardar `status` en BD:** el paso a `expired` depende del reloj; derivarlo al leer evita un job.
- **Cachear el PDF del enlace:** el acceptance quiere los datos actuales; el rate limit acota el coste.
- **Renombrar `generateFeedToken`/`parseFeedToken` a nombres genéricos:** cambio cosmético que toca el calendario; fuera de alcance.

## Decisiones a validar (Gate 1)

1. **Vehículos archivados o vendidos:** sus enlaces activos siguen sirviendo el PDF (R20) y se pueden crear enlaces nuevos (igual que `report.pdf`, que no mira `archivedAt`). Vender es justo el caso de uso; para cortar el acceso está la revocación. Borrar el vehículo sí los elimina (cascada).
2. **Cuerpo del POST:** booleanos JSON con `default(false)` y `expiresInDays` entero 1–90 (30 por defecto); el cuerpo debe ser un objeto (`{}` vale).
3. **Ruta pública:** `GET /api/public/reports/:token`, rate limit propio de **10/min por IP**.
4. **Estado:** derivado al leer; `revoked` > `expired` (`now >= expiresAt`) > `active`. La caducidad es `ahora + días × 24 h` exactos, sin redondear a medianoche de la zona del usuario.
5. **Revocar** es idempotente (204 también si ya estaba revocado, conservando la fecha) y se permite sobre enlaces caducados.
6. **Sin límite** de enlaces por vehículo ni purga de enlaces caducados/revocados.
7. `Cache-Control: private, no-store` (incluye `no-store`, coherente con `report.pdf`).
8. **R21 (no está en el acceptance):** el token no debe aparecer en los logs, como el del feed iCal. Ya lo cubre la redacción genérica de hex de `redactUrl`; solo se añade un test. No se añade un prefijo `/api/public/reports/` a `redactUrl`.

## Riesgos

- **CPU:** cada acceso público genera el PDF (con facturas, hasta `REPORT_MAX_ANNEX_MB`). Mitigado por el rate limit de 10/min por IP; varias IPs suman.
- **Fuga del enlace:** quien tenga la URL ve el informe hasta que caduque o se revoque; las facturas pueden mostrar datos ocultos (decisión de fase 6, el aviso es de #33).
- **Logs:** el token va en la URL. `redactUrl` (`lib/logging.ts`) ya sustituye cualquier racha de ≥ 32 dígitos hex por `***`, así que el token de 80 hex no llega a los logs sin tocar código; R21 lo fija con un test. Un token truncado (< 32 hex) se registraría, pero no sirve para nada.

## Fuera de alcance

UI (#33), `GET /api/config` con `BASE_URL` (#33), página pública en la SPA, purga de enlaces, contador de accesos, notificar al propietario de las visitas.
