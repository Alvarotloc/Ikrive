# Implementación — report-shares-api (#32)

Rama `feat/report-shares-api`. Tasks T1–T11 completadas y marcadas en `specs/report-shares-api/tasks.md`. Sin UI (es #33), así que no hay capturas.

## Cambios por archivo

### packages/shared
- `src/enums.ts`: `REPORT_SHARE_STATUSES = ['active', 'expired', 'revoked']` y tipo `ReportShareStatus`.
- `src/schemas/report-shares.ts` (nuevo): `reportShareOptionsSchema` (booleanos JSON, `default(false)`), `createReportShareSchema` (+ `expiresInDays` entero 1–90, 30 por defecto), `reportShareSchema`, `reportShareSecretSchema` (+ `url`), `reportShareParamsSchema`; tipos `CreateReportShare` (`z.input`), `ReportShare`, `ReportShareSecret`.
- `src/domain/report-shares.ts` (nuevo): `reportShareStatus(share, now)`, con `revoked` > `expired` (`now >= expiresAt`) > `active`.
- `src/schemas/report-shares.test.ts`, `src/domain/report-shares.test.ts` (nuevos): tests unitarios.
- `src/index.ts`: re-exporta los dos módulos.

### apps/api
- `src/db/schema/report-shares.ts` (nuevo) + `index.ts`: tabla `report_shares` según el design (FK `vehicle_id` con cascada, `uniqueIndex` en `selector`, índice en `vehicle_id`).
- `src/db/migrations/0010_report_shares.sql`, `meta/0010_snapshot.json`, `meta/_journal.json`: generados con `pnpm db:generate --name report_shares` (mismo convenio de nombres que `0009_fuel_logs`).
- `src/modules/report-shares/repository.ts` (nuevo): `listByVehicle` (`createdAt` desc, desempate por `rowid` desc), `find(vehicleId, id)`, `findBySelector` (join con `vehicles` → `{ share, ownerId }`), `create`, `revoke` (`UPDATE … WHERE revoked_at IS NULL`).
- `src/modules/report-shares/service.ts` (nuevo): `create`, `list`, `revoke`, `render`, tal cual el design; reutiliza `lib/tokens.ts` sin cambios y delega el PDF en `reports.generate(ownerId, vehicleId, options, log)`.
- `src/modules/report-shares/routes.ts` (nuevo): `reportSharesRoutes` (con `app.authenticate`; POST 201, GET, DELETE 204) y `publicReportRoutes` (`GET /public/reports/:token` sin hook de auth, `inline`, `cache-control: private, no-store`, `x-robots-tag: noindex`, `x-content-type-options: nosniff`, `rateLimit: { max: 10, timeWindow: '1 minute' }`).
- `src/app.ts`: crea `reportSharesService` (`repo`, `vehicles`, `reports: reportsService`, `baseUrl: config.BASE_URL`) y registra los dos plugins bajo `/api`.
- `test/report-shares.test.ts` (nuevo): 18 tests de integración.

## Trazabilidad

| R | Test |
|---|---|
| R1 | `apps/api/test/report-shares.test.ts` › `stores only the selector and the verifier hash` (la migración 0010 se aplica en `createTestApp`); `creates a share` |
| R2 | `apps/api/test/report-shares.test.ts` › `deletes the shares with the vehicle` |
| R3 | `apps/api/test/report-shares.test.ts` › `stores only the selector and the verifier hash` |
| R4 | `packages/shared/src/schemas/report-shares.test.ts` › `defaults every option to false and the expiry to 30 days`, `accepts 1 and 90 days`; `apps/api/test/report-shares.test.ts` › `creates a share` |
| R5 | `packages/shared/src/schemas/report-shares.test.ts` › `rejects 0, 91 and 1.5 days`, `rejects string flags`; `apps/api/test/report-shares.test.ts` › `rejects invalid shares` |
| R6 | `apps/api/test/report-shares.test.ts` › `creates a share` |
| R7 | `apps/api/test/report-shares.test.ts` › `lists the shares without the token` |
| R8 | `apps/api/test/report-shares.test.ts` › `lists the shares without the token` |
| R9 | `packages/shared/src/domain/report-shares.test.ts` › `is active before expiresAt`, `is expired at and after expiresAt`, `revoked wins over expired`; `apps/api/test/report-shares.test.ts` › `lists the shares without the token` |
| R10 | `apps/api/test/report-shares.test.ts` › `revokes a share` |
| R11 | `apps/api/test/report-shares.test.ts` › `revoking twice keeps the first date` |
| R12 | `apps/api/test/report-shares.test.ts` › `hides other users' vehicles` |
| R13 | `apps/api/test/report-shares.test.ts` › `returns 404 for a share of another vehicle` |
| R14 | `apps/api/test/report-shares.test.ts` › `requires a session` |
| R15 | `apps/api/test/report-shares.test.ts` › `serves the report without a session`, `applies the stored options`, `hides the prices`, `reflects the current data` |
| R16 | `apps/api/test/report-shares.test.ts` › `returns the same 404 for any invalid token` |
| R17 | `apps/api/test/report-shares.test.ts` › `compares the verifier in constant time` |
| R18 | `apps/api/test/report-shares.test.ts` › `serves the report without a session` |
| R19 | `apps/api/test/report-shares.test.ts` › `rate limits the public report` |
| R20 | `apps/api/test/report-shares.test.ts` › `keeps serving archived and sold vehicles` |
| R21 | `apps/api/test/report-shares.test.ts` › `never logs the share token` |

## `pnpm harness --full`

```
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared  Test Files 14 passed (14) · Tests 105 passed (105)
apps/web         Test Files 35 passed (35) · Tests 277 passed (277)
apps/api         Test Files 26 passed (26) · Tests 234 passed (234)
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones y notas

- **Desempate del listado:** `listByVehicle` ordena por `createdAt` desc como dice el design y, además, por `rowid` desc. Así dos enlaces creados en el mismo milisegundo salen siempre en orden (el test crea tres seguidos y sin ese desempate el resultado sería inestable). No cambia el contrato.
- **`create` vuelve a parsear el cuerpo:** el design tipa la entrada como `CreateReportShare` (`z.input`), así que el servicio aplica `createReportShareSchema.parse` para tener los valores por defecto aunque se le llame sin pasar por la ruta. En la ruta, el cuerpo ya llega validado y el segundo parse no cambia nada.
- **`createdAt` = `now`:** el servicio fija `createdAt` con el mismo `now` que usa para `expiresAt`, de modo que `expiresAt − createdAt` es exactamente `días × 24 h` (los tests lo comprueban con igualdad exacta).
- **Tests extra, dentro de los requisitos:** `revoking twice keeps the first date` también revoca un enlace caducado (decisión 5 de Gate 1), y `returns the same 404 for any invalid token` añade un token truncado (79 hex) a los casos de mal formado.
- Sin cambios en `lib/tokens.ts`, `lib/logging.ts` ni `vehiclesRepository`.

## Cambio tras Gate 2

- `apps/api/test/report-shares.test.ts` › `hides the prices`: un mantenimiento con coste `12.345,67` aparece en el PDF público de un enlace sin `hidePrices` y desaparece (junto con `€`) en uno con `hidePrices: true`, manteniendo el título. Sin cambios de código de producción: el test pasó a la primera.
- `pnpm harness --full`: verde (shared 105, web 277, api 234). Una primera ejecución falló con 19 timeouts de 5 s (primer test de cada archivo de la API) por carga de CPU; la repetición inmediata, sin cambios, pasó entera.
