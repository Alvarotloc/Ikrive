# explore_sale-report-pdf_data

> Hallazgos del agente Explore (solo lectura), guardados por el leader.

## 1. Fuentes de datos y composition root
- `buildApp` en `apps/api/src/app.ts`: `create*Repository(db)` → `create*Service({...})` → `api.register(xRoutes, { service })` bajo `/api`. Ya existen ahí: `settingsService`, `vehiclesRepo`, `maintenanceRepo`, `attachmentsRepo`, `fuelLogsRepo`, `storage`.
- Patrón más cercano: `createStatsService({ vehicles: vehiclesRepo, fuelLogs: fuelLogsRepo, maintenance: maintenanceRepo })`. Un módulo `reports` necesitaría `{ vehicles, maintenance, fuelLogs (solo stats), settings }`; puede llamar a `computeVehicleStats` directamente o inyectar `statsService.forVehicle(userId, id)` (ya hace propiedad + 404). #30 añadirá `attachments` y `storage`.
- Vehículo: `vehiclesRepo.findOwned(ownerId, id)` → `VehicleRow | undefined`; patrón `if (!vehicle) throw new NotFoundError('Vehicle not found')` (`stats/service.ts`, `vehicles/service.ts:58`, `maintenance/service.ts` `requireVehicle`). Campos: `name` (nullable), `make`, `model`, `plate`, `vin`, `purchasePrice`, `soldAt`, `archivedAt`. DTO `Vehicle` en `packages/shared/src/schemas/vehicles.ts`.
- Nombre visible repetido sin helper compartido: `vehicle.name ?? \`${make} ${model}\`` (`calendar/service.ts:90`, `jobs/reminders.job.ts:97`, `jobs/odometer-nudge.job.ts:70`).
- Odómetro: `vehiclesRepo.listReadings(vehicleId)` → `OdometerReadingRow[]` (date desc, value desc); `latestReading(vehicleId)`.
- Mantenimiento: `maintenanceRepo.listByVehicle(vehicleId)` (date desc, createdAt desc) con `date`, `odometer?`, `category`, `title`, `cost` (nullable), `includeInReport` (`integer({ mode: 'boolean' }).notNull().default(true)`, `db/schema/maintenance.ts:61`). **Nada filtra hoy por `includeInReport`.** `toDto` en `maintenance/service.ts:32`. También `maintenanceRepo.sumCost(vehicleId)`.
- Adjuntos (#30): `attachmentsRepo.listByEntity('maintenance', recordId)` (orden de subida), `listByVehicle(vehicleId)` (join); bytes vía `storage` (`lib/storage.ts`).
- `contentDisposition(filename, 'attachment'|'inline')` exportado de `apps/api/src/modules/attachments/routes.ts:23`.
- Ajustes: `settingsService.get(userId)` (upsert con defaults) → `currency`, `distanceUnit`, `volumeUnit`, `locale` (`LOCALES = ['es','en']`), `timezone`, … (`packages/shared/src/schemas/settings.ts`).
- Tests de integración: `apps/api/test/*.test.ts` + `helpers.ts`; el más parecido es `stats.test.ts`.

## 2. Estadísticas de la fase 5
- `packages/shared/src/domain/stats.ts`: `computeVehicleStats({ purchasePrice, readings, fuelLogs, maintenance }): VehicleStats` (`distance`, `consumption`, `costPerDistance`, `spending { purchase, fuel, maintenance, total, byCategory }`, `series { distanceByMonth, … }`); sueltas `distanceDriven`, `distanceByMonth`, `spendingByCategory`, `spendingByMonth`, `costPerDistance`, `averageConsumption`, `consumptionSegments`, `roundMoney`. `StatsMaintenanceRecord = { date, category, cost: number|null }`. Esquema `vehicleStatsSchema` en `schemas/stats.ts`.
- `packages/shared/src/domain/odometer.ts`: `OdometerPoint`, `byDateThenValue`, `latestOdometerReading(readings)`, `averageDistancePerYear(readings)` (null con <2 lecturas o <30 días), `averageDistancePerMonth`, `findOdometerConflict`.
- API: `apps/api/src/modules/stats/service.ts` `forVehicle(userId, vehicleId)`; ruta `GET /api/vehicles/:id/stats`.
- Para el resumen: km actuales `latestOdometerReading(readings)?.value`; media anual `averageDistancePerYear`; nº y gasto de mantenimientos **sobre los incluidos** (`roundMoney` de la suma de costes no nulos); gráfico con las lecturas ordenadas o `distanceByMonth`. Ojo: las stats de fase 5 no filtran `includeInReport`.

## 3. i18n y formato en el servidor
- No hay librería i18n en la API. Diccionarios tipados `Record<Locale, …>`: `CALENDAR_EVENT_TEXTS` en `packages/shared/src/domain/calendar.ts` y `TEXTS` en `apps/api/src/modules/notification-channels/messages.ts` (falta de traducción = error de compilación).
- Idioma: `notification-channels/dispatcher.ts:49` (`settings.findByUserId(userId)?.locale ?? DEFAULT_USER_SETTINGS.locale`); calendar usa `settings.get(userId)`.
- Formato: solo `Intl.NumberFormat(locale, { maximumFractionDigits: 0 })` + `${n} ${distanceUnit}` en `scheduleCalendarEvent`. La web tiene `useFormat()` (`apps/web/src/lib/format.ts`, hook no compartible): número sin decimales, moneda `{ style: 'currency', currency }`, fecha `dateStyle: 'medium', timeZone: 'UTC'` sobre `${iso.slice(0,10)}T00:00:00Z`, distancia `${n} ${unit}`. Otros: `apps/web/src/features/stats/format.ts`, `apps/web/src/features/fuel/use-fuel-format.ts`.
- `apps/api/src/lib/dates.ts`: `todayIn(timeZone, now)` → `YYYY-MM-DD` (fallback UTC) — sirve para la fecha de emisión y el nombre de fichero. `addDays` en `domain/schedules.ts`.
- **No hay formateadores compartidos de moneda/distancia**: candidatos a crear en shared junto al modelo del informe.

## 4. Precedentes de constructores puros en shared
- `packages/shared/src/domain/calendar.ts`: input `ScheduleEventInput` (con `Pick<>` de DTOs, `vehicle: { id, name }` resuelto, `locale`, `distanceUnit`) → `scheduleCalendarEvent(input): CalendarEvent | null`; textos en el mismo archivo; el paquete no tiene tipos DOM ni Node (por eso usa regex `originOf` en vez de `URL`).
- Cada `domain/*.ts` tiene su `*.test.ts` al lado; `calendar.test.ts` usa una factoría `input(overrides)`.
- Exportaciones en `packages/shared/src/index.ts` (`export * from './domain/…'`, `./schemas/…`). Nuevos: `domain/sale-report.ts` (+ test) y `schemas/reports.ts` (query `hidePrices`/`hidePlate`/`hideVin`, default false). `idParamSchema` en `schemas/common.ts`.
