# Explore: API contract for vehicle-stats-web

## 1. Endpoint
- `GET /api/vehicles/:id/stats`. Route: `apps/api/src/modules/stats/routes.ts:53-57`. Registered in `apps/api/src/app.ts:156` under the `/api` prefix. The service is built at `app.ts:114`.
- It needs a session (`app.authenticate`). Params use `idParamSchema`. There are **no query params**: no date-range filter (design: "Sin query string").
- Errors: 401 when there is no session. 404 problem+json `Vehicle not found` when the vehicle doesn't exist or belongs to another user (`apps/api/src/modules/stats/service.ts:17-18`).
- Service: `apps/api/src/modules/stats/service.ts:16-38`. It loads readings, fuel logs and maintenance records, then calls `computeVehicleStats`.

## Response schema: `packages/shared/src/schemas/stats.ts`
`vehicleStatsSchema` (lines 12-43) and `type VehicleStats` (line 44). Both are exported from `@ikrive/shared` (`packages/shared/src/index.ts:17`; the domain is exported at `:5`). `monthSchema` is `YYYY-MM` (line 6).

| Field | Type | Meaning / when there isn't enough data |
|---|---|---|
| `distance.driven` (l.15) | int \| null | Last reading minus the first. `null` with fewer than 2 readings. |
| `distance.perYear` (l.16) | int \| null | Comes from `averageDistancePerYear` (`domain/odometer.ts`). `null` when readings span less than 30 days, even with 2 readings. |
| `distance.perMonth` (l.17) | int \| null | Same 30-day threshold (rate per day × 365/12). |
| `consumption.average` (l.20) | number(2 dec) \| null | Quantity per 100 distance units, weighted by distance. `null` without at least one valid full-tank to full-tank segment. |
| `costPerDistance.fuel` / `.maintenance` (l.21) | number(3 dec) \| null | Total ÷ `driven`. `null` when `driven` is null or 0. |
| `spending.purchase` (l.23) | number \| null | `null` when the vehicle has no purchase price. |
| `spending.fuel` / `.maintenance` (l.24-25) | number (2 dec) | Never null; 0 when there is no data. Maintenance counts only records that have a cost, including those with `includeInReport:false`. |
| `spending.total` (l.27) | number | **TCO** = purchase(?? 0) + fuel + maintenance. |
| `spending.byCategory` (l.28) | `{category: MaintenanceCategory, total}[]` | Sorted highest total first. Records with a null cost are excluded; a cost of 0 is included. `[]` when there is none. |
| `series.distanceByMonth` (l.31) | `{month, distance:int}[]` | One point per month, from the first reading's month to the last's, no gaps. Values are linearly interpolated and sum exactly to `driven`. `[]` with fewer than 2 readings. |
| `series.consumptionBySegment` (l.32-40) | `{startDate, endDate (ISO date), distance:int, quantity(3 dec), consumption(2 dec)}[]` | One entry per valid full-tank to full-tank segment. Segments with a missed refuel or 0 distance are skipped. `[]` when there are none. |
| `series.spendingByMonth` (l.41) | `{month, fuel, maintenance}[]` | From the first to the last month with spending, with 0 for empty months in between. The purchase price is **not** included. The series does not run to "today". `[]` when there is no spending. |

- **Insufficient data is shown only by `null` scalars and empty `[]` arrays.** There are no flags. The money totals are always numbers (0 when empty).
- zod rejects NaN/Infinity, so the API never returns them (R17).
- Empty-vehicle example from the integration test: ratios null, spending 0, purchase = total = purchase price, empty series (`apps/api/test/stats.test.ts`, "returns empty stats for a vehicle without data").
- Logic: `packages/shared/src/domain/stats.ts:223-256` (`computeVehicleStats`). The helpers there are reusable on the web if needed.

## 2. Units and currency
- **Values are in stored units, with no conversion** (`schemas/stats.ts:8-10`, `domain/stats.ts:222`). R22 test "keeps the stored units": after a PATCH of settings to mi/gal/USD the response is identical.
- The response **does not include** a unit or currency. The design ("Impacto en UI") says the web should take `distanceUnit`, `volumeUnit` and `currency` from `GET /settings` (`packages/shared/src/schemas/settings.ts:5`, default `EUR` at l.21) and from the vehicle's fuel type.
- Format with `useFormat` and `fuelQuantityUnit(fuelType, volumeUnit)` (`packages/shared/src/domain/fuel.ts:7`). A similar existing pattern is `apps/web/src/features/fuel/use-fuel-format.ts:31`.
- Consumption is always quantity/100 distance units (L/100km, kWh/100km, gal/100mi). The API returns no MPG; showing MPG would be a web-only presentation choice.
- No currency conversion. Amounts are plain numbers rounded to cents.

## 3. Unused DAY_MS
- `packages/shared/src/domain/stats.ts:37`: `const DAY_MS = 86_400_000;` is declared and never used in that file. `distanceByMonth` uses raw `Date.parse` differences instead (l.108-110).
- The same constant exists, and is used, in `domain/odometer.ts:36`, `domain/schedules.ts:9` and `apps/api/src/lib/dates.ts:22`.

## 4. Notes from the progress and design files relevant to the web
- `progress/impl_vehicle-stats-api.md`: segment `quantity` is rounded to 3 decimals (not set in the design). `byDateThenValue` is now a public export of shared.
- `progress/review_vehicle-stats-api.md`: APPROVED, nothing blocking. R7 reading: `missedPrevious` on the opening full tank does not invalidate that segment.
- Design (`specs/vehicle-stats-api/design.md`):
  - Distance comes only from odometer readings; `purchaseOdometer` is excluded.
  - Cost per distance covers all spending divided by the distance between the first and last reading.
  - Sold or archived vehicles get the same stats, with no cut at `soldAt`.
  - Out of scope: date filters, caching, unit/currency conversion, separate fuel/electric consumption for PHEVs, spending by category per month.
  - The series are "ready for Recharts" (one point per month, no gaps).
  - `spending.maintenance` matches `GET /vehicles/:id/maintenance/spending` (R21), which the vehicle page still uses.
  - Performance: all rows are loaded per request, with no caching.
